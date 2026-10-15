/**
 * AMS — Maintenance control.
 *
 * The operational half of the system. Where the cost authority asks "may you
 * spend this?", this asks "may you fly this?", and the answer is enforced
 * rather than advised.
 *
 * The screen is built around one deliberate dead end: you are given a real
 * button to record a MEL deferral against an overdue Airworthiness
 * Directive, and it refuses, citing EASA CS-GEN-MMEL. A control the user
 * cannot talk past teaches more than a paragraph stating that they cannot.
 *
 * The refusal is written to the maintenance log, because an attempt to
 * defer a mandatory item is exactly what a regulator asks to see. An
 * operator with a clean log and a blocked gate is in a defensible position;
 * an operator with a clean log because nobody recorded anything is not.
 *
 * @module frontend/js/views-maint
 */

import { el, card, kpi, kpis, pill, table, int } from './format.js';
import { createMaintenance, MEL_RULE } from '../../shared/src/maintenance.js';
import { AIRCRAFT_STATE, DIRECTIVES } from './data.js';

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

/**
 * ONE maintenance instance for the session, created lazily.
 *
 * This is the third time this exact bug has appeared in this codebase: a view
 * builds its state, a handler mutates it, the handler triggers a re-render,
 * and the re-render constructs a NEW empty instance so the result vanishes.
 * The portal survives it because its state lives in the store; the tour
 * survives it for the same reason. Anything with real state must hold it
 * outside the render function.
 */
let SESSION = null;
function session() {
  if (!SESSION) {
    SESSION = createMaintenance({ aircraft: AIRCRAFT_STATE, directives: DIRECTIVES, nowMs: NOW });
  }
  return SESSION;
}

/**
 * @param {() => void} rerender
 * @returns {HTMLElement}
 */
export function maintenanceView(rerender) {
  const m = session();
  const frag = el('div', {});

  const state = { serial: null, outcome: null };

  const gate = () => m.gate();
  const selected = () => {
    const rows = gate();
    return rows.find((r) => r.serialNumber === state.serial) ?? rows.find((r) => !r.dispatchable) ?? rows[0];
  };

  /* ---- fleet state ---- */
  const blocked = gate().filter((r) => !r.dispatchable);
  const overdueTotal = gate().reduce((a, r) => a + r.overdueCount, 0);

  frag.append(card('Dispatch gate',
    'an aircraft with an overdue Airworthiness Directive does not fly',
    el('div', {},
      kpis(
        kpi('Airworthy', `${gate().filter((r) => r.dispatchable).length}/${gate().length}`,
          'dispatchable now', blocked.length === 0 ? 'good' : 'bad'),
        kpi('Overdue ADs', String(overdueTotal),
          'legally mandatory', overdueTotal > 0 ? 'bad' : 'good'),
        kpi('Refusals recorded', String(m.events.filter((e) => e.action.endsWith('REFUSED_AD')).length),
          'attempts to defer a mandatory item'),
      ),
      // Built with a loop, not a nested map inside el(): the closers are
      // unforgiving and this file has to stay readable.
      buildFleetList(m, state, () => { state.serial = selected().serialNumber; rerender(); }),
    )));

  /* ---- the rule, stated once, in the place it is enforced ---- */
  frag.append(card('The rule this screen enforces',
    'not advice — it is why the button below refuses',
    el('div', {},
      el('div', { class: 'rule-quote' },
        el('span', { class: 'rule-src' }, MEL_RULE.id),
        el('p', {}, `“${MEL_RULE.text}”`),
        el('span', { class: 'rule-note' }, MEL_RULE.source)),
    )));

  /* ---- work the selected airframe ---- */
  const ac = selected();
  if (ac) {
    frag.append(buildWorkOrder(m, ac, state, rerender));
  }

  /* ---- the log ---- */
  const logRows = [...m.events].reverse().map((e) => ({
    id: e.id,
    action: e.action.replace(/_/g, ' ').toLowerCase(),
    ref: e.itemRef ?? e.taskRef ?? '',
    detail: e.dispatchableAfter === undefined ? ''
      : `dispatch ${e.dispatchableBefore ? 'CLEAR' : 'BLOCKED'} → ${e.dispatchableAfter ? 'CLEAR' : 'BLOCKED'}`,
  }));

  frag.append(card('Maintenance log',
    'append-only. Refusals are recorded too — an attempt is evidence.',
    logRows.length
      ? table([
        { key: 'id', label: '#', cls: 'mono' },
        { key: 'action', label: 'Action' },
        { key: 'ref', label: 'Item', cls: 'mono' },
        { key: 'detail', label: 'Effect' },
      ], logRows, { scroll: false })
      : el('div', { class: 'empty' }, 'Nothing yet. Try the deferral button above.')));

  return frag;
}

/* ---- fleet list ------------------------------------------------------- */

function buildFleetList(m, state, onSelect) {
  const list = el('div', { class: 'fleet-list' });
  for (const row of m.gate()) {
    const btn = el('button', { class: 'fleet-row', type: 'button' },
      el('span', { class: 'mono' }, `${row.aircraftType} MSN ${row.serialNumber}`),
      pill(row.dispatchable ? 'CLEAR' : 'BLOCKED', row.dispatchable ? 'ok' : 'bad'),
      el('span', { class: 'fleet-meta' },
        row.dispatchable
          ? `${row.applicableCount} applicable`
          : `${row.overdueCount} overdue · ${row.applicableCount} applicable`));
    btn.addEventListener('click', () => { state.serial = row.serialNumber; onSelect(); });
    list.append(btn);
  }
  return list;
}

/* ---- work order ------------------------------------------------------- */

function buildWorkOrder(m, ac, state, rerender) {
  const body = el('div', {});
  const outcome = el('div', { class: 'notice-stack' });

  const overdue = ac.overdue ?? [];
  const mandatory = overdue.filter((o) => String(o.reference).includes('AD'));

  body.append(el('div', { class: 'wo-head' },
    el('div', { class: 'wo-title' }, `${ac.aircraftType} MSN ${ac.serialNumber}`),
    pill(ac.dispatchable ? 'DISPATCHABLE' : 'BLOCKED — DO NOT FLY', ac.dispatchable ? 'ok' : 'bad')));

  if (!mandatory.length) {
    body.append(el('div', { class: 'empty' },
      'No overdue Airworthiness Directive on this airframe. Nothing to defer, nothing to fix.'));
    body.append(outcome);
    return card('Work this airframe', 'pick an aircraft from the list above', body);
  }

  const target = mandatory[0];

  body.append(el('div', { class: 'wo-item' },
    el('span', { class: 'mono' }, String(target.reference)),
    el('span', {}, 'overdue, mandatory'),
    overdue.length > 1 ? pill(`${overdue.length} items overdue`, 'bad') : null));

  /* --- the button that refuses --- */
  const deferBtn = el('button', { class: 'btn btn-danger', type: 'button' },
    'Record a MEL deferral');
  deferBtn.addEventListener('click', () => {
    const res = m.attemptDeferral({
      actorId: 'p-tech',
      aircraftSerial: ac.serialNumber,
      itemRef: String(target.reference),
      itemKind: 'AD',
    });
    // The outcome is recorded as SESSION state, not written into a local
    // element, because `rerender()` immediately rebuilds this view and a
    // local node would be discarded before the user could read it.
    m.lastOutcome = {
      kind: res.ok ? 'ok' : 'bad',
      head: res.ok ? 'ACCEPTED' : res.code,
      body: res.message,
      citation: res.citation ?? null,
      foot: 'Recorded in the maintenance log.',
    };
    rerender();
  });

  /* --- the legal path, so the control is not theatre --- */
  const melBtn = el('button', { class: 'btn btn-ghost', type: 'button' },
    'Defer a legal (non-mandatory) item');
  melBtn.addEventListener('click', () => {
    const res = m.attemptDeferral({
      actorId: 'p-tech',
      aircraftSerial: ac.serialNumber,
      itemRef: 'MEL-32-11-01',
      itemKind: 'MEL',
      category: 'B',
    });
    outcome.replaceChildren();
    outcome.append(el('div', { class: 'notice notice-ok' },
      el('div', { class: 'notice-head' }, `ACCEPTED — ${res.deferral?.status ?? ''}`),
      el('div', { class: 'notice-body' },
        `MEL-32-11-01 recorded against MSN ${ac.serialNumber}.`),
      el('div', { class: 'notice-detail' },
        `Rectify by ${new Date(res.deferral?.rectifyByMs ?? 0).toISOString().slice(0, 10)} `
        + '— Category B, three calendar days excluding the day of discovery.')));
    rerender();
  });

  /* --- schedule, then complete --- */
  const schedBtn = el('button', { class: 'btn', type: 'button' },
    'Schedule the rectification');
  const completeBtn = el('button', { class: 'btn', type: 'button' },
    'Mark the work complete');

  let lastTaskId = null;

  schedBtn.addEventListener('click', () => {
    const res = m.scheduleTask({
      actorId: 'p-tech',
      aircraftSerial: ac.serialNumber,
      taskRef: String(target.reference),
      description: `Rectify ${target.reference}`,
      hoursRequired: 6,
    });
    lastTaskId = res.task.id;
    m.lastOutcome = {
      kind: 'warn',
      head: `${res.task.id} SCHEDULED`,
      body: 'A hangar slot is an intention, not work. The dispatch gate has NOT moved.',
      citation: null,
      foot: `gate ${res.before.dispatchable ? 'CLEAR' : 'BLOCKED'} → `
        + `${res.after.dispatchable ? 'CLEAR' : 'BLOCKED'}`,
    };
    rerender();
  });

  completeBtn.addEventListener('click', () => {
    const tasks = m.scheduled.get(ac.serialNumber) ?? [];
    const open = tasks.filter((t) => t.status === 'SCHEDULED');
    if (!open.length) {
      outcome.replaceChildren();
      outcome.append(el('div', { class: 'notice notice-warn' },
        el('div', { class: 'notice-head' }, 'NOTHING SCHEDULED'),
        el('div', { class: 'notice-body' }, 'Schedule the rectification first.')));
      return;
    }
    const res = m.completeTask({
      actorId: 'p-tech',
      aircraftSerial: ac.serialNumber,
      taskId: open[0].id,
      accomplishedAd: String(target.reference),
    });
    m.lastOutcome = {
      kind: 'ok',
      head: `${res.task.id} COMPLETE`,
      body: `${target.reference} accomplished. Dispatch restored.`,
      citation: null,
      foot: `gate ${res.before.dispatchable ? 'CLEAR' : 'BLOCKED'} → `
        + `${res.after.dispatchable ? 'CLEAR' : 'BLOCKED'}`,
    };
    void lastTaskId;
    rerender();
  });

  body.append(el('div', { class: 'form-actions' }, deferBtn, melBtn, schedBtn, completeBtn));

  // The outcome is RENDERED from session state, not written by the handler.
  // A view that reads its own state back is stable across a re-render; one
  // that a handler pokes into a DOM node is not.
  const o = m.lastOutcome;
  if (o) {
    outcome.replaceChildren();
    outcome.append(el('div', { class: `notice notice-${o.kind}` },
      el('div', { class: 'notice-head' }, o.head),
      el('div', { class: 'notice-body' }, o.body),
      o.citation ? el('div', { class: 'notice-detail' }, `${MEL_RULE.id}: “${o.citation}”`) : null,
      o.foot ? el('div', { class: 'notice-detail' }, o.foot) : null));
  }
  body.append(outcome);

  return card('Work this airframe',
    'the control is inside the transition, not in the list of choices',
    body);
}