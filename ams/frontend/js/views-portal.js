/**
 * AMS — The management layer.
 *
 * Everything up to now was read-only: a calculator with a document around
 * it. This view is the part that makes it an operating system — you pick who
 * you are, you raise a commitment, you try to approve your own work and the
 * system refuses, you switch to someone who can approve it, the budget
 * moves, and every one of those actions lands in a tamper-evident chain.
 *
 * The controls are not decoration. Each one calls a transition that:
 *   - evaluates segregation of duties (plan step 1.8),
 *   - checks and decrements the budget atomically,
 *   - appends a SHA-256 hash-chained audit entry,
 * and refuses with a stated reason when it cannot proceed.
 *
 * @module frontend/js/views-portal
 */

import {
  el, card, kpi, kpis, table, pill, money, moneyShort, int, pct,
} from './format.js';
import { PORTALS, PERSONAS, accountableManagerRegister } from './portal/registry.js';
import { centsToDisplay } from './portal/ledger.js';
import { verifyChain, chainHead } from '../../backend/src/audit/chain.js';

/**
 * @param {ReturnType<import('./portal/store.js').createStore>} store
 * @returns {HTMLElement}
 */
export function portalView(store) {
  const frag = el('div', {});
  const me = store.persona();

  frag.append(card(
    'You are signed in as',
    'a select element, not authentication — see the banner below',
    el('div', {},
      el('div', { class: 'who' },
        el('div', { class: 'who-name' }, me.name),
        el('div', { class: 'who-title' }, me.title),
        me.post
          ? pill(`${me.post.replace(/_/g, ' ')} — ${me.authority}`, me.approved ? 'ok' : 'bad')
          : pill('not a mandated post', 'neutral')),
      el('div', { class: 'banner warn' },
        el('strong', {}, 'Identity is not verified here. '),
        'Anyone can select any role. What IS real: the segregation-of-duties '
        + 'rules run on every transition below, the budget arithmetic is integer '
        + 'cents, and every accepted action is hash-chained. Those do not depend '
        + 'on proving who you are — they depend on knowing who you are, which is '
        + 'the property a real deployment gets from step 1.5.')),
  ));

  frag.append(personaPicker(store, me));

  const notices = store.state.notices;
  if (notices.length) frag.append(noticeList(store, notices));

  frag.append(costAuthority(store, me));
  frag.append(budgetLines(store));
  frag.append(auditTrail(store));
  frag.append(portalRegister());

  return frag;
}

/* ---- persona picker ---------------------------------------------------- */

function personaPicker(store, current) {
  const sel = el('select', { class: 'persona-select', 'aria-label': 'Act as' });
  for (const p of PERSONAS) {
    sel.append(el('option', { value: p.id, ...(p.id === current.id ? { selected: 'selected' } : {}) },
      `${p.name} — ${p.title}`));
  }
  sel.addEventListener('change', () => store.setPersona(sel.value));

  const reg = accountableManagerRegister();
  const gaps = reg.filter((r) => r.finding);

  return card('Act as',
    'switching role changes what you can do, not just what you see',
    el('div', {},
      el('div', { class: 'picker-row' }, sel),
      el('div', { class: 'picker-note' },
        'Every one of these people can be selected by anyone in this demo. '
        + 'That is the limitation. The approvals below are still genuinely '
        + 'blocked when the actor conflicts with the author.'),
      gaps.length
        ? el('div', { class: 'register' },
          el('div', { class: 'register-head' },
            'Accountable-manager register — a live AOC question, not a formality'),
          ...reg.map((r) => el('div', { class: 'register-row' + (r.finding ? ' gap' : '') },
            el('span', { class: 'mono' }, r.post.replace(/_/g, ' ')),
            r.holder
              ? el('span', {}, `${r.holder.name}, ${r.holder.title}`)
              : el('span', { class: 'faint' }, 'unfilled'),
            r.finding
              ? pill(r.finding, 'bad')
              : pill(`approved by ${r.holder.authority}`, 'ok'))))
        : null));
}

/* ---- notices ----------------------------------------------------------- */

function noticeList(store, notices) {
  return el('div', { class: 'notices' },
    ...notices.map((n) => el('div', { class: `notice notice-${n.tone}` },
      el('div', { class: 'notice-head' }, n.title),
      el('div', { class: 'notice-body' }, n.body),
      n.detail ? el('div', { class: 'notice-detail' }, n.detail) : null)));
}

/* ---- cost authority ----------------------------------------------------- */

function costAuthority(store, me) {
  const { ledger } = store;
  const pending = ledger.state.commitments.filter((c) => c.status === 'PENDING');
  const decided = ledger.state.commitments.filter((c) => c.status !== 'PENDING');

  /* --- raise a request --- */
  const lineSel = el('select', { class: 'input', 'aria-label': 'Budget line' });
  for (const l of ledger.state.lines) {
    lineSel.append(el('option', { value: l.id },
      `${l.label} — ${centsToDisplay(ledger.available(l))} available`));
  }
  const amount = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: '250000' });
  const desc = el('input', { class: 'input', type: 'text', placeholder: 'What is this for?', value: 'Avionics spare line unit' });

  const raiseBtn = el('button', { class: 'btn', type: 'button' }, 'Raise request');
  raiseBtn.addEventListener('click', async () => {
    const dollars = Number(amount.value);
    // Dollars in the field, integer cents internally. The conversion happens
    // once, here, and is checked — never round a float into a ledger.
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      store.pushNotice({ tone: 'bad', title: 'Amount rejected', body: 'Enter a positive whole amount.' });
      await store.act(async () => {});
      return;
    }
    const res = await ledger.raise({
      actorId: me.id, lineId: lineSel.value, amountCents: cents, description: desc.value || 'no description',
    });
    if (res.ok) {
      store.pushNotice({
        tone: res.replayed ? 'warn' : 'ok',
        title: res.replayed ? 'Replayed — original returned' : 'Request raised',
        body: res.replayed
          ? `${res.commitment.reference} was already raised with this idempotency key. `
            + 'The budget was NOT decremented a second time.'
          : `${res.commitment.reference} for ${centsToDisplay(cents)} is awaiting approval.`,
      });
    } else {
      store.pushNotice({ tone: 'bad', title: 'Request rejected', body: res.error.message });
    }
    await store.act(async () => {});
  });

  const overspendBtn = el('button', { class: 'btn btn-danger', type: 'button' }, 'Raise one cent over the limit');
  overspendBtn.addEventListener('click', async () => {
    const res = await ledger.raiseOverspendRequest(me.id, lineSel.value);
    if (res.ok) {
      store.pushNotice({
        tone: 'warn',
        title: 'Deliberate over-commit raised',
        body: `${res.commitment.reference} asks for ${centsToDisplay(res.commitment.amountCents)} — `
          + 'one cent more than the line holds. Approve it to watch the ceiling hold.',
      });
    }
    await store.act(async () => {});
  });

  /* --- queue rows --- */
  const rows = [];
  for (const c of pending) {
    const line = ledger.findLine(c.lineId);
    const isAuthor = c.authorId === me.id;
    const approve = el('button', { class: 'btn btn-sm', type: 'button' }, 'Approve');
    const reject = el('button', { class: 'btn btn-sm btn-danger', type: 'button' }, 'Reject');
    approve.addEventListener('click', () => decide(store, me, c.id, 'APPROVED'));
    reject.addEventListener('click', () => decide(store, me, c.id, 'REJECTED'));

    rows.push(el('div', { class: 'queue-row' },
      el('div', { class: 'queue-main' },
        el('div', { class: 'queue-ref' },
          el('span', { class: 'mono' }, c.reference),
          isAuthor ? pill('you raised this', 'warn') : null),
        el('div', { class: 'queue-desc' }, c.description),
        el('div', { class: 'queue-meta' },
          `${line?.label ?? c.lineId} · raised by ${nameOf(c.authorId)} · ${centsToDisplay(c.amountCents)}`)),
      el('div', { class: 'queue-actions' }, approve, reject)));
  }

  const decidedRows = decided.map((c) => el('div', { class: 'queue-row decided' },
    el('div', { class: 'queue-main' },
      el('div', { class: 'queue-ref' },
        el('span', { class: 'mono' }, c.reference),
        pill(c.status, c.status === 'APPROVED' ? 'ok' : 'bad')),
      el('div', { class: 'queue-desc' }, c.description),
      el('div', { class: 'queue-meta' },
        `${centsToDisplay(c.amountCents)} · ${c.status === 'APPROVED'
          ? `approved by ${nameOf(c.approverId)}`
          : `rejected by ${nameOf(c.rejectedBy)}`}${c.reason ? ` — ${c.reason}` : ''}`))));

  return card('Cost authority queue',
    'the control that stops the airline spending money the board did not authorise',
    el('div', {},
      el('div', { class: 'form-grid' },
        el('label', {}, 'Budget line', lineSel),
        el('label', {}, 'Amount (USD)', amount),
        el('label', {}, 'Purpose', desc)),
      el('div', { class: 'form-actions' }, raiseBtn, overspendBtn),
      el('div', { class: 'hint' },
        'A pending request has NOT consumed the budget. Funds are committed only '
        + 'on approval, and only if the line still has room. Try approving your own '
        + 'request first — that is blocked, and the refusal is written to the chain.'),
      el('div', { class: 'queue' },
        ...(rows.length ? rows : [el('div', { class: 'empty' }, 'Nothing awaiting approval. Raise a request above.')])),
      decidedRows.length
        ? el('div', { class: 'queue decided-queue' },
          el('div', { class: 'sub-head' }, `Decided (${decidedRows.length})`),
          ...decidedRows)
        : null));
}

async function decide(store, me, commitmentId, decision) {
  const { ledger } = store;
  const res = await ledger.decide({
    actorId: me.id, roles: me.roles, commitmentId, decision,
    reason: decision === 'REJECTED' ? 'not required this period' : undefined,
  });

  if (res.ok) {
    store.pushNotice({
      tone: decision === 'APPROVED' ? 'ok' : 'warn',
      title: decision === 'APPROVED' ? 'Cost authorised' : 'Request rejected',
      body: decision === 'APPROVED'
        ? `${res.commitment.reference} committed ${centsToDisplay(res.commitment.amountCents)}. `
          + `${centsToDisplay(res.commitment.availableAfterCents)} remains on the line.`
        : `${res.commitment.reference} rejected. No funds committed.`,
    });
  } else if (res.sod) {
    store.pushNotice({
      tone: 'bad',
      title: `Blocked by ${res.sod[0].code}`,
      body: res.sod[0].reason,
      detail: res.sod.length > 1 ? `also: ${res.sod.slice(1).map((f) => f.code).join(', ')}` : null,
    });
  } else if (res.error) {
    store.pushNotice({ tone: 'bad', title: res.error.code, body: res.error.message });
  }
  await store.act(async () => {});
}

/* ---- budget lines ------------------------------------------------------- */

function budgetLines(store) {
  const { ledger } = store;
  const body = el('div', {});
  for (const l of ledger.state.lines) {
    const avail = ledger.available(l);
    const usedPct = Math.round(((l.committedCents ?? 0) / l.allocatedCents) * 100);
    body.append(el('div', { class: 'budget-row' },
      el('div', { class: 'budget-head' },
        el('span', { class: 'budget-label' }, l.label),
        el('span', { class: 'mono faint' }, l.account),
        el('span', { class: 'budget-avail' }, `${centsToDisplay(avail)} left`)),
      el('div', { class: 'budget-track' },
        el('div', { class: `budget-fill ${usedPct > 90 ? 'hot' : ''}`, style: `width:${Math.min(100, usedPct)}%` })),
      el('div', { class: 'budget-meta' },
        `${centsToDisplay(l.committedCents ?? 0)} committed of ${centsToDisplay(l.allocatedCents)}`
        + ` · ${usedPct}%`)));
  }
  return card('Budget lines',
    `${kpiInline('Allocated', centsToDisplay(ledger.allocatedCents))} `
    + `${kpiInline('Committed', centsToDisplay(ledger.committedCents))} `
    + `${kpiInline('Uncommitted', centsToDisplay(ledger.allocatedCents - ledger.committedCents))}`,
    body);
}

function kpiInline(label, value) {
  return el('span', { class: 'kpi-inline' },
    el('span', { class: 'kpi-inline-l' }, `${label} `),
    el('strong', {}, value));
}

/* ---- audit trail -------------------------------------------------------- */

function auditTrail(store) {
  const entries = store.ledger.state.entries;
  const body = el('div', {});

  const verifyBtn = el('button', { class: 'btn', type: 'button' }, 'Verify the chain');
  const result = el('div', { class: 'verify-result' });

  verifyBtn.addEventListener('click', async () => {
    // The real verifier: recompute every hash from the genesis sentinel.
    const v = await verifyChain(entries);
    result.textContent = '';
    if (v.valid) {
      result.append(el('div', { class: 'notice notice-ok' },
        el('div', { class: 'notice-head' },
          `Chain valid — ${v.entriesChecked} entries, none altered`)));
    } else {
      result.append(el('div', { class: 'notice notice-bad' },
        el('div', { class: 'notice-head' }, `Chain BROKEN at entry ${v.brokenAt}`),
        el('div', { class: 'notice-body' }, v.reason ?? '')));
    }
  });

  body.append(el('div', { class: 'form-actions' }, verifyBtn, result));
  body.append(el('div', { class: 'hint' },
    'Each entry is hashed together with the previous one, so editing any earlier '
    + 'row changes every hash after it. Blocked attempts are recorded too: a '
    + 'refusal is exactly what an auditor asks to see.'));

  const rows = entries.slice().reverse().map((e) => el('tr', {},
    el('td', { class: 'mono' }, String(e.id)),
    el('td', {}, e.action.replace(/_/g, ' ').toLowerCase()),
    el('td', {}, nameOf(e.actorId)),
    el('td', { class: 'mono' }, `${e.entryHash.slice(0, 10)}…`)));

  body.append(table([
    { key: 'id', label: '#', cls: 'mono' },
    { key: 'action', label: 'Action' },
    { key: 'actor', label: 'Actor' },
    { key: 'hash', label: 'Hash' },
  ], entries.slice().reverse().map((e) => ({
    id: e.id,
    action: e.action.replace(/_/g, ' ').toLowerCase(),
    actor: nameOf(e.actorId),
    hash: e.entryHash.slice(0, 10),
  }))));

  if (!entries.length) {
    body.append(el('div', { class: 'empty' },
      'No entries yet. Raise and approve a request above — each transition is chained.'));
  }

  return card('Audit trail',
    `head ${chainHead(entries) ? `${chainHead(entries).slice(0, 12)}…` : 'genesis sentinel'} · every mutation, including refusals`,
    body);
}

function nameOf(id) {
  const p = PERSONAS.find((x) => x.id === id);
  return p ? p.name : id;
}

/* ---- portal register ---------------------------------------------------- */

function portalRegister() {
  const body = el('div', {});
  for (const p of PORTALS) {
    const done = p.screens.filter((s) => s.implemented).length;
    body.append(el('div', { class: 'portal-row' },
      el('div', { class: 'portal-name' },
        p.name,
        pill(`${done}/${p.screens.length}`, done === p.screens.length ? 'ok' : 'warn')),
      el('div', { class: 'portal-blurb' }, p.blurb),
      el('div', { class: 'portal-screens' },
        ...p.screens.map((s) => pill(s.name, s.implemented ? 'ok' : 'neutral')))));
  }
  return card('Portal coverage',
    'plan step 1.15 — five functional portals, each honest about what is built',
    body);
}

/** Scenario controls live on their own view but share the store. */
export function scenarioView(store) {
  const frag = el('div', {});
  const s = store.state.scenario;
  const base = store.state.model;

  const slider = (label, key, min, max, step, suffix) => {
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step),
      value: String(s[key]), class: 'slider',
    });
    const out = el('span', { class: 'slider-out' }, `${s[key]}${suffix}`);
    input.addEventListener('input', () => {
      out.textContent = `${input.value}${suffix}`;
      store.setScenario(key, Number(input.value));
    });
    return el('label', { class: 'slider-row' },
      el('span', { class: 'slider-label' }, label),
      input,
      out);
  };

  const reset = el('button', { class: 'btn', type: 'button' }, 'Reset to baseline');
  reset.addEventListener('click', () => store.resetScenario());

  frag.append(card('What-if inputs',
    'move a lever and every figure on every screen recomputes from the same model',
    el('div', {},
      slider('Jet fuel price', 'fuelPriceIndexPct', 60, 200, 5, '% of baseline'),
      slider('Load factor', 'loadFactorPct', 55, 100, 0.5, '%'),
      slider('USD index', 'fxUsdIndexPct', 90, 130, 1, '%'),
      slider('SAF share of uplift', 'safSharePct', 0, 30, 1, '%'),
      el('div', { class: 'form-actions' }, reset),
      el('div', { class: 'hint' },
        'These are not multipliers applied to a printed result. Fuel is treated as '
        + 'a share of cost, revenue moves with load factor, and the ratios are '
        + 'recomputed from the adjusted sums — so break-even load factor moves '
        + 'the way it actually does, which is the only reason to trust a tool '
        + 'like this.'))));

  if (base) {
    const adj = store.applyScenario(base);
    if (adj !== base) {
      const delta = adj.total.contributionCents - base.total.contributionCents;
      frag.append(card('Effect on this year',
        'the whole point of the inputs above',
        kpis(
          kpi('Result', centsToDisplay(adj.total.contributionCents),
            `baseline ${centsToDisplay(base.total.contributionCents)}`,
            delta >= 0 ? 'good' : 'bad'),
          kpi('CASK', (adj.total.caskMicrocents / 1e6).toFixed(4),
            `baseline ${(base.total.caskMicrocents / 1e6).toFixed(4)}`),
          kpi('RASK', (adj.total.raskMicrocents / 1e6).toFixed(4),
            `baseline ${(base.total.raskMicrocents / 1e6).toFixed(4)}`),
          kpi('Break-even LF', pct(adj.total.breakEvenLoadFactorPpm),
            `baseline ${pct(base.total.breakEvenLoadFactorPpm)}`),
        )));
    }
  }

  return frag;
}
