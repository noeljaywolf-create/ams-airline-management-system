/**
 * AMS — First run.
 *
 * THE DEMO TEACHES BY BEING USED
 * ------------------------------
 * The previous version explained itself with paragraphs, which made it a
 * web document with buttons. Paragraphs are removed. What replaces them is
 * this: a first run that hands the user a real control and asks them to push
 * it, then reacts to what the system actually did.
 *
 * The journey deliberately goes to the LEAST OBVIOUS function first. The
 * obvious functions — cost, routes, fuel, emissions — look like every other
 * airline dashboard, and a user who has seen one has seen them all. The
 * function nobody expects is the one that separates this from a calculator:
 *
 *     You cannot approve your own purchase.
 *
 * That refusal is real, it is enforced inside the transition, and it cannot
 * be talked past. Demonstrating it is worth more than any paragraph, and it
 * is exactly the thing a CFO needs to see before believing anything else on
 * the screen.
 *
 * Then it teaches the second thing: the numbers are not authored. Drag a
 * fuel price and watch break-even move.
 *
 * The tour runs ONCE. It records completion in localStorage and never
 * interrupts again — a guided tour that reappears is an admission that the
 * product did not teach itself.
 *
 * @module frontend/js/tour
 */

import { el, card, kpi, kpis, pill, money, pct } from './format.js?v=916b8a70583e';

const STORAGE_KEY = 'ams.tour.completed';
const STEP_KEY = 'ams.tour.step';

export function tourCompleted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function markComplete() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
    localStorage.removeItem(STEP_KEY);
  } catch { /* private mode: the tour simply shows again */ }
}

function saveStep(n) {
  try { localStorage.setItem(STEP_KEY, String(n)); } catch { /* ignore */ }
}

function loadStep() {
  try { return Number(localStorage.getItem(STEP_KEY) ?? '0') || 0; } catch { return 0; }
}

/**
 * The first-run view. It is a normal view, not a modal: the user can leave
 * it and come back, and every step is a real control on a real store.
 *
 * @param {ReturnType<import('./portal/store.js?v=916b8a70583e').createStore>} store
 * @param {() => void} navigateToPortal
 * @param {(name: string) => void} select
 * @returns {HTMLElement}
 */
export function firstRunView(store, navigateToPortal, select) {
  const frag = el('div', {});
  const step = loadStep();

  /* ---------- header ---------- */
  const head = el('div', { class: 'tour-head' });
  head.append(el('div', { class: 'tour-title' }, 'First run'));
  head.append(el('div', { class: 'tour-sub' },
    'Three things worth knowing. Each one you do, not read.'));
  frag.append(head);

  /* ---------- step 1: the refusal ---------- */
  frag.append(tourStep(1, step >= 1, 'The one thing you cannot do',
    'You are the CFO. Raise a purchase, then try to approve it yourself.',
    (done) => {
      const body = el('div', {});
      // The tour is self-contained and deterministic. It always raises as the
      // CFO and always hands off to the CEO, because a tour that depends on
      // whichever role the user happened to be in beforehand is a tour that
      // sometimes demonstrates nothing — if you are already the CEO, then
      // "hand it to the CEO" is still self-approval and stays blocked.
      const me = { id: 'p-cfo', roles: ['approver', 'budget_owner'] };
      if (store.state.personaId !== 'p-cfo') store.state.personaId = 'p-cfo';

      const lineSel = el('select', { class: 'input' });
      for (const l of store.ledger.state.lines) {
        lineSel.append(el('option', { value: l.id },
          `${l.label} — ${(store.ledger.available(l) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} left`));
      }
      const amount = el('input', { class: 'input', type: 'number', value: '250000', min: '1' });
      const purpose = el('input', { class: 'input', type: 'text', value: 'Avionics spare line unit' });
      // Outcomes go into the STORE, not into a local DOM node. A handler that
      // writes to local state has its work erased by the re-render that the
      // same handler triggers — the first version of this tour showed the
      // refusal for one frame and then showed nothing.
      const paint = () => {
        status.replaceChildren();
        for (const n of store.state.notices) {
          status.append(el('div', { class: 'notice notice-' + n.tone },
            el('div', { class: 'notice-head' }, n.title),
            el('div', { class: 'notice-body' }, n.body),
            n.detail ? el('div', { class: 'notice-detail' }, n.detail) : null));
        }
      };
      const status = el('div', { class: 'tour-status' });

      const raise = el('button', { class: 'btn', type: 'button' }, 'Raise it');
      const approve = el('button', { class: 'btn', type: 'button' }, 'Approve it');
      approve.disabled = true;

      raise.addEventListener('click', async () => {
        store.clearNotices();
        const cents = Math.round(Number(amount.value) * 100);
        if (!Number.isFinite(cents) || cents <= 0) {
          store.pushNotice({ tone: 'bad', title: 'Enter a positive amount.', body: '' });
          await store.act(async () => {});
          return;
        }
        await store.ledger.raise({
          actorId: me.id, lineId: lineSel.value, amountCents: cents,
          description: purpose.value || 'no description',
        });
        store.pushNotice({ tone: 'warn', title: 'Raised', body: 'Now try to approve your own request.' });
        await store.act(async () => {});
      });

      approve.addEventListener('click', async () => {
        const pending = store.ledger.state.commitments.find((c) => c.status === 'PENDING');
        if (!pending) {
          store.pushNotice({ tone: 'bad', title: 'Nothing pending.', body: '' });
          await store.act(async () => {});
          return;
        }
        const res = await store.ledger.decide({
          actorId: me.id, roles: me.roles, commitmentId: pending.id, decision: 'APPROVED',
        });
        if (res.ok) {
          store.pushNotice({
            tone: 'bad',
            title: 'Approved — which should not have been possible.',
            body: 'Segregation of duties failed to block the author from approving their own request.',
          });
        } else if (res.sod) {
          store.pushNotice({
            tone: 'bad',
            title: res.sod[0].code,
            body: res.sod[0].reason,
            detail: 'The refusal was written to the audit chain. So was the attempt.',
          });
          // The hand-off is offered as store state so it survives re-render.
          store.state.handoffPending = pending.id;
        } else if (res.error) {
          store.pushNotice({ tone: 'bad', title: res.error.code, body: res.error.message });
        }
        await store.act(async () => {});
      });

      body.append(el('div', { class: 'form-grid' },
        el('label', {}, 'Budget line', lineSel),
        el('label', {}, 'Amount (USD)', amount),
        el('label', {}, 'Purpose', purpose)));
      body.append(el('div', { class: 'form-actions' }, raise, approve));
      body.append(status);
      paint();

      // The hand-off only exists while a refusal is outstanding, and it is
      // rebuilt from store state on every render.
      if (store.state.handoffPending) {
        const next = el('button', { class: 'btn', type: 'button' }, 'Hand it to the CEO');
        next.addEventListener('click', async () => {
          const id = store.state.handoffPending;
          store.state.handoffPending = null;
          store.setPersona('p-ceo');
          const again = await store.ledger.decide({
            actorId: 'p-ceo', roles: ['ceo', 'approver'], commitmentId: id, decision: 'APPROVED',
          });
          if (again.ok) {
            store.pushNotice({
              tone: 'ok',
              title: 'Approved by the CEO',
              body: `${money(again.commitment.amountCents)} committed. `
                + `${money(again.commitment.availableAfterCents)} remains on the line.`,
              detail: 'Same request, same money, different person. The system did not care who asked, only who was allowed to.',
            });
            if (!done()) markComplete();
          }
          await store.act(async () => {});
        });
        status.append(next);
      }

      return body;
    }));

  /* ---------- step 2: numbers move ---------- */
  frag.append(tourStep(2, step >= 2, 'The numbers are not typed in',
    'Move fuel price. Everything downstream recomputes.',
    () => {
      const body = el('div', {});
      const out = el('div', {});

      const paint = () => {
        out.replaceChildren();
        const adj = store.applyScenario(store.state.model);
        if (adj === store.state.model) {
          out.append(el('div', { class: 'tour-status' }, 'Move the slider.'));
          return;
        }
        const base = store.state.model.total;
        const d = adj.total.contributionCents - base.contributionCents;
        out.append(kpis(
          kpi('Result', money(adj.total.contributionCents),
            `${d >= 0 ? '+' : ''}${money(d)} vs baseline`, d >= 0 ? 'good' : 'bad'),
          kpi('Break-even load factor', pct(adj.total.breakEvenLoadFactorPpm),
            `baseline ${pct(base.breakEvenLoadFactorPpm)}`),
          kpi('CASK', (adj.total.caskMicrocents / 1e6).toFixed(4),
            `baseline ${(base.caskMicrocents / 1e6).toFixed(4)}`),
          kpi('RASK', (adj.total.raskMicrocents / 1e6).toFixed(4),
            'unchanged — revenue per seat-km cannot move with fuel'),
        ));
      };

      const slider = el('input', {
        type: 'range', min: '70', max: '200', step: '5',
        value: String(store.state.scenario.fuelPriceIndexPct), class: 'slider',
      });
      const label = el('span', { class: 'slider-out' },
        `${store.state.scenario.fuelPriceIndexPct}% of baseline`);
      slider.addEventListener('input', () => {
        label.textContent = `${slider.value}% of baseline`;
        store.state.scenario = { ...store.state.scenario, fuelPriceIndexPct: Number(slider.value) };
        paint();
      });

      body.append(el('label', { class: 'slider-row' },
        el('span', { class: 'slider-label' }, 'Jet fuel price'), slider, label));
      body.append(out);
      paint();
      return body;
    }));

  /* ---------- step 3: the books agree ---------- */
  frag.append(tourStep(3, step >= 3, 'The accounts cannot disagree with the board',
    'The same model that produced those figures is what the ledger posts.',
    (done) => {
      const body = el('div', {});
      const open = el('div', {});
      const go = el('button', { class: 'btn', type: 'button' }, 'Open the Accounts tab');
      go.addEventListener('click', () => {
        if (!done()) markComplete();
        select('accounts');
      });
      const openLedger = el('button', { class: 'btn btn-ghost', type: 'button' }, 'See every approval');
      openLedger.addEventListener('click', () => select('portal'));

      body.append(el('div', { class: 'tour-status' },
        'Trial balance, profit and loss, and a purchase-to-pay cycle with a '
        + 'deliberately over-billed invoice that the three-way match blocks.'));
      body.append(el('div', { class: 'form-actions' }, go, openLedger));
      open.append(el('div', { class: 'kpi-inline' },
        el('span', { class: 'kpi-inline-l' }, 'approvals recorded '),
        el('strong', {}, String(store.ledger.state.entries.length)),
        pill('hash-chained', 'ok')));
      body.append(open);
      return body;
    }));

  /* ---------- done ---------- */
  const finish = el('div', { class: 'tour-done' });
  const doneBtn = el('button', { class: 'btn', type: 'button' }, 'Start using it');
  doneBtn.addEventListener('click', () => { markComplete(); select('executive'); });
  finish.append(doneBtn);
  finish.append(el('span', { class: 'tour-sub' }, 'This will not appear again.'));
  frag.append(finish);

  return frag;
}

function tourStep(n, done, title, blurb, build) {
  const wrap = el('section', { class: `tour-step${done ? ' done' : ''}` });
  wrap.append(el('div', { class: 'tour-step-head' },
    el('span', { class: 'tour-num' }, done ? '✓' : String(n)),
    el('div', {},
      el('div', { class: 'tour-step-title' }, title),
      el('div', { class: 'tour-step-blurb' }, blurb))));
  wrap.append(build(() => { saveStep(n); wrap.classList.add('done'); }));
  return wrap;
}
