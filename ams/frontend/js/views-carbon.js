/**
 * AMS — Carbon compliance, with procurement.
 *
 * The screen where the operational side of the system commits the financial
 * side. Compliance has a legal obligation attached to it, and closing that
 * obligation means buying something, which means a budget line, a
 * segregation-of-duties check and an audit entry.
 *
 * Until now carbon was a number on a dashboard. This is the version where
 * you can act on it.
 *
 * @module frontend/js/views-carbon
 */

import { el, card, kpi, kpis, pill, table, money, moneyShort, pct, int } from './format.js';
import { quoteObligation, retireUnits, attributeRetirement } from '../../shared/src/offsets.js';
import { EUA_PRICE_CENTS_PER_TONNE } from './data.js';

/**
 * @param {any} model
 * @param {ReturnType<import('./portal/store.js').createStore>} store
 * @returns {HTMLElement}
 */
export function carbonOpsView(model, store) {
  const frag = el('div', {});
  const c = model.carbon;
  const me = store.persona();

  const obligationTonnes = Math.round(c.corsiaTonnes);
  const purchased = store.ledger.state.lines.find((l) => l.id === 'bl-carbon');
  const obligation = {
    regime: /** @type {'CORSIA'} */ ('CORSIA'),
    obligationTonnes,
    alreadyRetiredTonnes: 0,
    outstandingTonnes: obligationTonnes,
    deadlineYear: 2027,
  };

  const quote = quoteObligation(obligation, {
    regime: 'CORSIA', centsPerTonne: EUA_PRICE_CENTS_PER_TONNE, vintage: 2026,
  });

  /* ---- the obligation ---- */
  frag.append(card('CORSIA obligation',
    `${pct(Math.floor((c.corsiaTonnes / Math.max(1, c.totalTonnes)) * 1e6), 0)} of emissions, to be retired by 31 December 2027`,
    kpis(
      kpi('Outstanding', `${int(obligationTonnes)} t`,
        'must be surrendered, not reported', 'warn'),
      kpi('Cheapest compliant route', moneyShort(quote.options.find((o) => o.id === quote.cheapestId).cents),
        quote.options.find((o) => o.id === quote.cheapestId).label.toLowerCase()),
      kpi('Penalty for inaction', moneyShort(quote.options.find((o) => o.id === 'PAY_PENALTY').cents),
        `${(quote.options.find((o) => o.id === 'PAY_PENALTY').cents / quote.options.find((o) => o.id === quote.cheapestId).cents).toFixed(0)}x more than complying`,
        'bad'),
      kpi('Unit price assumption', `${EUA_PRICE_CENTS_PER_TONNE.toLocaleString('en-US')} c/t`,
        'vintage 2026 — operator assumption, not a market quote', 'neutral'),
    )));

  /* ---- the three ways out ---- */
  const rows = quote.options.map((o) => ({
    id: o.id,
    label: o.label,
    cents: o.cents,
    tonnesSettled: o.tonnesSettled,
    note: o.note,
    verdict: o.id === quote.cheapestId ? pill('CHEAPEST COMPLIANT', 'ok')
      : o.id === 'PAY_PENALTY' ? pill('NOT COMPLIANT', 'bad')
        : pill('compliant', 'neutral'),
  }));

  frag.append(card('Three ways to close it',
    'the penalty is shown so the comparison cannot quietly select non-compliance',
    table([
      { key: 'verdict', label: '' },
      { key: 'label', label: 'Option', cls: 'strong' },
      { key: 'cents', label: 'Cost', num: true, render: (v2) => money(v2) },
      { key: 'tonnesSettled', label: 'Settles', num: true, render: (v2, r) => `${int(v2)} t` },
      { key: 'note', label: 'Basis' },
    ], rows)));

  /* ---- the SAF reality check ---- */
  const annualFuelKg = model.fuelAgg.burnKg;
  const safSharePpm = Math.floor((quote.safFuelKg / annualFuelKg) * 1_000_000);
  frag.append(el('div', { class: 'banner warn' },
    el('strong', {}, 'You cannot close a CORSIA obligation with SAF. '),
    `Retiring ${int(obligationTonnes)} t through sustainable fuel would mean buying `,
    el('strong', {}, `${(quote.safFuelKg / 1e6).toFixed(1)}M kg`),
    ` — ${pct(safSharePpm, 0)} of the ${(annualFuelKg / 1e6).toFixed(1)}M kg this airline burns in a year. `,
    'The arithmetic is available because someone will ask. The answer is to buy units, ',
    'and to treat SAF as a mandate-driven reduction rather than an offset substitute.'));

  /* ---- procurement: the operations-to-finance bridge ---- */
  const buyUnits = quote.options.find((o) => o.id === quote.cheapestId);
  const outcome = el('div', { class: 'notice-stack' });
  const target = buyUnits;

  const amountInput = el('input', { class: 'input', type: 'number', value: '50000', min: '1' });
  const purposeInput = el('input', { class: 'input', type: 'text', value: 'CORSIA obligation — phase 1 retirement' });

  const raiseBtn = el('button', { class: 'btn', type: 'button' },
    `Raise ${int(buyUnits.tonnesSettled)} t commitment`);

  raiseBtn.addEventListener('click', async () => {
    const tonnes = Number(amountInput.value);
    if (!Number.isFinite(tonnes) || tonnes <= 0) {
      store.pushNotice({ tone: 'bad', title: 'Invalid quantity', body: 'Enter a positive number of tonnes.' });
      await store.act(async () => {});
      return;
    }
    // Price is computed, never typed. An operator who enters the cost of a
    // compliance obligation is the whole failure mode this screen exists to
    // prevent.
    const cents = Math.round(tonnes * EUA_PRICE_CENTS_PER_TONNE);

    const res = await store.ledger.raise({
      actorId: me.id,
      lineId: 'bl-carbon',
      amountCents: cents,
      description: `${purposeInput.value || 'CORSIA units'} — ${int(tonnes)} t @ ${EUA_PRICE_CENTS_PER_TONNE} c/t`,
    });

    if (res.ok) {
      store.pushNotice({
        tone: res.replayed ? 'warn' : 'ok',
        title: res.replayed ? 'Replayed — original returned' : `${res.commitment.reference} raised`,
        body: res.replayed
          ? 'This idempotency key was already used. The budget was NOT decremented twice.'
          : `${int(tonnes)} t for ${money(cents)} is awaiting approval. Price was computed from the `
            + 'tonnage, not entered.',
      });
    } else {
      store.pushNotice({ tone: 'bad', title: res.error.code, body: res.error.message });
    }
    await store.act(async () => {});
  });

  frag.append(card('Buy the units',
    'operations drives finance: this raises a real commitment against a real budget line',
    el('div', {},
      el('div', { class: 'form-grid' },
        el('label', {}, 'Tonnes to retire', amountInput),
        el('label', {}, 'Reference', purposeInput)),
      el('div', { class: 'form-actions' },
        raiseBtn,
        el('span', { class: 'picker-note' },
          `You are ${me.name}, ${me.title}.`)),
      budgetSummary(store),
      outcome,
      store.state.notices.length ? noticeStack(store.state.notices) : null)));

  /* ---- retirement controls ---- */
  const retireBtn = el('button', { class: 'btn', type: 'button' }, 'Retire against the obligation');
  retireBtn.addEventListener('click', () => {
    const tonnes = Number(amountInput.value);
    const pending = store.ledger.state.commitments.find((c) => c.status === 'PENDING');
    const res = retireUnits(obligation, tonnes, {
      actorId: me.id,
      purchaseRef: pending?.reference ?? 'PO-00000',
      vintage: 2026,
    });
    outcome.replaceChildren();
    if (!res.ok) {
      outcome.append(el('div', { class: 'notice notice-bad' },
        el('div', { class: 'notice-head' }, res.code),
        el('div', { class: 'notice-body' }, res.message)));
      return;
    }
    const attr = attributeRetirement(tonnes, [{ id: 'FLEET', tonnes: obligationTonnes }]);
    outcome.append(el('div', { class: 'notice notice-ok' },
      el('div', { class: 'notice-head' }, `${int(res.retiredTonnes)} t RETIRED`),
      el('div', { class: 'notice-body' },
        `Against ${res.reference}, vintage ${res.vintage}. Outstanding obligation is now `,
        `${int(res.outstandingTonnes)} t.`),
      el('div', { class: 'notice-detail' },
        `Attributed to the fleet: ${int(attr[0].attributedTonnes)} t.`)));
  });

  frag.append(card('Retire the units',
    'a retirement must reference the purchase it settles',
    el('div', {},
      el('div', { class: 'form-actions' }, retireBtn),
      el('div', { class: 'hint' },
        'Over-retiring is refused: units surrendered beyond the obligation create no surplus value. ',
        'So is retiring without a purchase reference — a unit retired that was never bought is a '
        + 'compliance statement the operator cannot support.'),
      outcome)));

  void target;
  return frag;
}

function budgetSummary(store) {
  const line = store.ledger.state.lines.find((l) => l.id === 'bl-carbon');
  if (!line) return el('div', { class: 'empty' }, 'No carbon budget line configured.');
  const avail = store.ledger.available(line);
  const usedPct = Math.round(((line.committedCents ?? 0) / line.allocatedCents) * 100);
  return el('div', { class: 'budget-row' },
    el('div', { class: 'budget-head' },
      el('span', { class: 'budget-label' }, 'Carbon compliance budget'),
      el('span', { class: 'budget-avail' }, `${money(avail)} left`)),
    el('div', { class: 'budget-track' },
      el('div', { class: `budget-fill ${usedPct > 90 ? 'hot' : ''}`, style: `width:${Math.min(100, usedPct)}%` })),
    el('div', { class: 'budget-meta' },
      `${money(line.committedCents ?? 0)} committed of ${money(line.allocatedCents)} · ${usedPct}%`));
}

function noticeStack(notices) {
  const box = el('div', { class: 'notice-stack' });
  for (const n of notices) {
    box.append(el('div', { class: `notice notice-${n.tone}` },
      el('div', { class: 'notice-head' }, n.title),
      el('div', { class: 'notice-body' }, n.body),
      n.detail ? el('div', { class: 'notice-detail' }, n.detail) : null));
  }
  return box;
}