/**
 * Home and Executive Brief.
 *
 * THE DESIGN PROBLEM THIS SOLVES
 * -----------------------------
 * One system has to serve two audiences who want opposite things from it.
 * A minister wants five numbers, plain language and a decision to make. An
 * engineer wants the solver, the constraints and the evidence. Building two
 * demos means they drift apart, and a stakeholder who sees both learns that
 * neither can be trusted.
 *
 * So: ONE model, ONE set of numbers, TWO presentations. Everything on the
 * Executive Brief is derived from the same computed model the engineering
 * views read — nothing here is hand-written text about performance, because
 * hand-written performance claims are exactly the thing that goes stale.
 *
 * THE RULE OBSERVED HERE
 * ----------------------
 * Every "decision required" is DERIVED, not authored. If the model says a
 * route is loss-making, the brief says so and quantifies it. If no route is
 * loss-making, the brief says there is nothing to decide. A brief that can
 * never say "nothing is wrong" is marketing, not reporting.
 */

import {
  PROBLEMS, capabilityAudit, ecosystemTotals,
} from './ecosystem.js';

import {
  bar, card, el, int, kpi, kpis, money, moneyShort, pct, pill, provenance, table,
} from './format.js';

/* ==================================================================== *
 * Shared derivation — the single source of truth for every audience
 * ==================================================================== */

/**
 * Derive the decisions a decision-maker actually faces.
 *
 * Each item states the fact, the size of it, and the options — never a
 * recommendation, because the trade-off between filling a plane and
 * profiting from it is a management judgement, not a computed one.
 *
 * @param {ReturnType<import('./model.js').buildModel>} m
 */
export function deriveDecisions(m) {
  const out = [];

  // 1. Routes losing money, worst first.
  const losers = m.routeRollup
    .filter((r) => r.contributionCents < 0)
    .sort((a, b) => a.contributionCents - b.contributionCents);

  for (const r of losers) {
    out.push({
      severity: 'HIGH',
      owner: 'Commercial',
      title: `${r.def.from}–${r.def.to} is losing money`,
      fact: `Revenue per available seat-kilometre is ${(r.agg.raskMicrocents / 1e8).toFixed(4)} `
          + `against a cost of ${(r.agg.caskMicrocents / 1e8).toFixed(4)}. `
          + `Across ${int(r.agg.flights)} sectors the shortfall is ${money(Math.abs(r.contributionCents))}.`,
      size: money(Math.abs(r.contributionCents)),
      options: [
        'Re-price — the fare is below the cost of the seat',
        'Re-fleet — a different aircraft type may serve this sector profitably',
        'Reduce frequency — fixed cost is spread over fewer sectors',
        'Withdraw — if the gap cannot be closed structurally',
      ],
      engineTab: 'costing',
      closable: r.breakEven.closeableByLoadFactor,
      note: r.breakEven.closeableByLoadFactor
        ? `Load factor could close it: ${int(r.breakEven.additionalPassengersPerFlight)} more passengers per flight at current fares.`
        : 'Load factor CANNOT close it: each extra passenger costs more to carry than they pay, so filling the aircraft increases the loss.',
    });
  }

  // 2. Airworthiness blockers.
  const blocked = m.airworthiness?.blocked ?? [];
  for (const b of blocked) {
    out.push({
      severity: 'HIGH',
      owner: 'Technical',
      title: `Aircraft ${b.serial} cannot be dispatched`,
      fact: `${b.overdue.length} mandatory directive${b.overdue.length === 1 ? '' : 's'} overdue: `
          + b.overdue.map((o) => `${o.reference} (${o.controllingCounter})`).join(', ')
          + '.',
      size: `${b.overdue.length} overdue`,
      options: [
        'Rectify before the next sector',
        'Ground the aircraft until rectified',
        'Substitute another airframe if the schedule allows',
      ],
      engineTab: 'airworthiness',
      note: 'An overdue Airworthiness Directive is a legal matter. A MEL deferral cannot cure one.',
    });
  }

  // 3. Budget control breaches.
  const breaches = m.budget.filter((b) => b.availableCents < 0);
  for (const b of breaches) {
    out.push({
      severity: 'HIGH',
      owner: 'Finance',
      title: `${b.label} is over-committed`,
      fact: `Approved budget leaves ${money(b.budgetedCents)} but commitments, pending requisitions `
          + `and expenditure already total more. Availability is ${money(b.availableCents)}.`,
      size: money(Math.abs(b.availableCents)),
      options: [
        'Freeze the line pending review',
        'Release commitments that will not proceed',
        'Revise the budget through the board',
      ],
      engineTab: 'ecosystem',
      note: 'This is a control breach, not a rounding artefact. The system raises it rather than hiding it.',
    });
  }

  // 4. Carbon cost exposure.
  if (m.carbon.etsCostCents > 0) {
    out.push({
      severity: 'MEDIUM',
      owner: 'Sustainability',
      title: 'Emissions allowance cost is material',
      fact: `${int(Math.round(m.carbon.etsTonnes))} chargeable tonnes of CO2 at the current allowance price.`,
      size: money(m.carbon.etsCostCents),
      options: [
        'Procure sustainable aviation fuel — under the EU ETS it carries a zero emissions factor',
        'Acquire allowances in the market',
        'Reduce flying on the affected sectors',
      ],
      engineTab: 'carbon',
      note: m.carbon.safSharePpm === 0
        ? 'No sustainable fuel is currently modelled. That is the largest single lever available.'
        : `Sustainable fuel is ${pct(m.carbon.safSharePpm, 2)} of fuel burned.`,
    });
  }

  // 5. Fleet utilisation — the strongest driver of unit cost.
  const utilPerDay = m.total.blockHoursMilli / 1000 / Math.max(1, m.aircraft.length * 300);
  if (utilPerDay < 8) {
    out.push({
      severity: 'MEDIUM',
      owner: 'Operations',
      title: 'Aircraft utilisation is below plan',
      fact: `Averaging ${utilPerDay.toFixed(1)} block hours per aircraft per day across `
          + `${m.aircraft.length} airframes and ${int(m.total.flights)} sectors.`,
      size: `${utilPerDay.toFixed(1)} h/day`,
      options: [
        'Re-time rotations to raise daily utilisation',
        'Reduce fleet size to match actual flying',
        'Review aircraft assignment across sectors',
      ],
      engineTab: 'dashboard',
      note: 'An aircraft on the ground earns nothing and still incurs lease and insurance.',
    });
  }

  return out.sort((a, b) => (a.severity === 'HIGH' ? -1 : 1));
}

/* ==================================================================== *
 * HOME
 * ==================================================================== */

export function home(m) {
  const frag = document.createDocumentFragment();
  const t = ecosystemTotals();
  const decisions = deriveDecisions(m);

  frag.append(el('p', { class: 'hero-lede' },
    'AMS is an airline management platform for finance, fleet and procurement. ',
    'It answers three questions an airline normally cannot: what a flight actually cost, ',
    'whether a purchase was authorised, and whether an aircraft is legally airworthy.'));

  frag.append(kpis(
    kpi('Sectors costed', int(m.raw.length), 'from primary records, not invoices', 'good'),
    kpi('Every cent reconciles', m.carbon.reconciliationFailures === 0 ? pill('EXACT', 'ok') : pill('CHECK', 'warn'),
      'no rounding leakage'),
    kpi('Decisions outstanding', String(decisions.length),
      decisions.length === 0 ? 'nothing requires a decision' : 'derived from the model',
      decisions.filter((d) => d.severity === 'HIGH').length ? 'warn' : 'good'),
    kpi('Verified in code', `${t.capabilities} capabilities`, `${t.built} built, ${t.schemaOnly} schema only`),
  ));

  // Three questions -> three answers
  const answers = [
    ['What did that flight cost?',
      `Cost is attributed to the sector at the moment it flies, from the fuel uplift note, the crew duty report and the landing fee. `
      + `Across ${int(m.raw.length)} sectors, full cost is ${(m.total.caskMicrocents / 1e8).toFixed(4)} per available seat-kilometre.`,
      'dashboard'],
    ['Can we afford this purchase?',
      `Authorisation takes a lock on the budget line before reading the balance, so two simultaneous requests `
      + `cannot both see the same headroom and both approve. Availability is computed by the database, so it cannot drift from its components.`,
      'ecosystem'],
    ['Will this part be legal next month?',
      'Life-limited parts are tracked on three counters at once, and the controlling one is identified. '
      + 'An overdue Airworthiness Directive cannot be deferred by any means.',
      'airworthiness'],
  ];

  frag.append(el('div', { class: 'answer-grid' },
    ...answers.map(([q, a, tab]) => el('div', {
      class: 'answer-card', onclick: `location.hash='${tab}'`,
    },
      el('div', { class: 'answer-q' }, q),
      el('div', { class: 'answer-a' }, a),
      el('div', { class: 'answer-go' }, 'open →')))));

  // Problems addressed
  frag.append(card('Operational failures this addresses',
    'each is a real, recurring failure mode — not a competitor weakness',
    el('div', {},
      ...PROBLEMS.map((p) => el('div', { class: 'problem-row' },
        el('div', { class: 'problem-h' }, p.headline),
        el('div', { class: 'problem-d' }, p.consequence))))));

  return frag;
}

/* ==================================================================== *
 * EXECUTIVE BRIEF
 * ==================================================================== */

export function executive(m) {
  const frag = document.createDocumentFragment();
  const decisions = deriveDecisions(m);
  const t = m.total;
  const high = decisions.filter((d) => d.severity === 'HIGH');

  frag.append(el('div', { class: 'brief-head' },
    el('div', {},
      el('div', { class: 'brief-kicker' }, 'Executive brief'),
      el('h2', { class: 'brief-title' },
        t.contributionCents >= 0 ? 'The operation is profitable' : 'The operation is loss-making')),
    el('div', { class: 'brief-meta' },
      `FY2026 · ${int(m.raw.length)} sectors · ${m.aircraft.length} airframes · USD`)));

  frag.append(kpis(
    kpi('Operating result',
      `${t.contributionCents >= 0 ? '+' : '−'}${moneyShort(Math.abs(t.contributionCents))}`,
      'revenue less full cost, all sectors',
      t.contributionCents >= 0 ? 'good' : 'bad'),
    kpi('Margin', pct(m.verdict.marginPpm),
      'per dollar of revenue',
      m.verdict.marginPpm >= 0 ? 'good' : 'bad'),
    kpi('Cost per seat-kilometre', (t.caskMicrocents / 1e8).toFixed(4),
      'against revenue of ' + (t.raskMicrocents / 1e8).toFixed(4),
      t.raskMicrocents >= t.caskMicrocents ? 'good' : 'bad'),
    kpi('Load factor', pct(t.loadFactorPpm),
      `break-even at ${pct(t.breakEvenLoadFactorPpm)}`,
      t.loadFactorPpm >= t.breakEvenLoadFactorPpm ? 'good' : 'warn'),
  ));

  /* ---- the whole point of the brief ---- */
  if (decisions.length === 0) {
    frag.append(el('div', { class: 'clear' },
      el('div', { class: 'clear-title' }, 'No decisions outstanding'),
      el('div', {},
        'Every budget line is within authority, no aircraft is blocked by an overdue directive, ',
        'and no route is loss-making on the current cost and revenue allocation.')));
  } else {
    frag.append(card(`Decisions required (${decisions.length})`,
      `${high.length} high priority · each derived from the computed model, not authored`,
      el('div', {},
        ...decisions.map((d) => el('div', { class: 'decision' },
          el('div', { class: 'decision-top' },
            pill(d.severity, d.severity === 'HIGH' ? 'bad' : 'warn'),
            el('span', { class: 'decision-owner' }, d.owner),
            el('button', {
              class: 'btn-ghost',
              onclick: `location.hash='${d.engineTab}'`,
            }, 'technical detail')),
          el('div', { class: 'decision-title' }, d.title),
          el('div', { class: 'decision-fact' }, d.fact),
          d.note ? el('div', { class: 'decision-note' }, d.note) : null,
          el('div', { class: 'decision-options' },
            el('div', { class: 'options-label' }, 'Options — a management judgement, not a computation'),
            ...d.options.map((o) => el('div', { class: 'option' }, o))),
          el('div', { class: 'decision-size' }, 'At stake: ', el('strong', {}, d.size)))))));
  }

  /* ---- performance by route, in plain language ---- */
  const rows = m.routeRollup.map((r) => ({
    route: `${r.def.from} – ${r.def.to}`,
    type: r.def.kind === 'international' ? 'International' : 'Regional',
    sectors: int(r.agg.flights),
    revenue: money(r.agg.revenueCents),
    cost: money(r.agg.fullCostCents),
    result: money(r.contributionCents),
    tone: r.contributionCents >= 0 ? 'good' : 'bad',
    verdict: r.verdict.replace('_', ' ').toLowerCase(),
    tab: r.def,
  }));

  frag.append(card('Where the money is made and lost',
    'every figure reconciles to the sector level — no allocation is unexplained',
    table([
      { key: 'route', label: 'Route', cls: 'strong' },
      { key: 'type', label: 'Type' },
      { key: 'sectors', label: 'Sectors', num: true },
      { key: 'revenue', label: 'Revenue', num: true },
      { key: 'cost', label: 'Full cost', num: true },
      { key: 'result', label: 'Result', num: true,
        render: (v2, row) => el('span', {
          style: `color:var(--${row.tone});font-weight:650`,
        }, v2) },
      { key: 'verdict', label: 'Assessment',
        render: (v2, row) => pill(v2, row.tone === 'good' ? 'ok' : 'bad') },
    ], rows)));

  /* ---- the two cost buckets, explained ---- */
  const direct = t.directCostCents;
  const fixed = t.fleetFixedCostCents;
  frag.append(card('Why the cost is what it is',
    'the distinction determines whether a route is viable at all',
    el('div', {},
      el('div', { class: 'explain' },
        el('strong', {}, 'Flight-attributable cost '), money(direct),
        ' varies with flying the sector — fuel, crew, landing fees, catering. Known on the day of flight.\n',
        el('strong', {}, 'Fleet-fixed cost '), money(fixed),
        ' — lease, insurance, spares, admin crew, distribution — does not vary with whether this aircraft flies, ',
        'and is allocated across sectors by an explicit rule rather than by accident.'),
      ...[
        ['Flight-attributable', direct, 'ok'],
        ['Fleet-fixed (allocated)', fixed, 'warn'],
      ].map(([label, value, tone]) => bar(label, value, t.fullCostCents,
        `${pct(Math.floor((value / t.fullCostCents) * 1_000_000), 0)} · ${moneyShort(value)}`, tone)),
      el('div', { class: 'explain', style: 'margin-top:12px' },
        'An extra passenger costs ', el('strong', {}, money(m.flights[0].marginalCostOfExtraSeatCents)),
        ' — fuel for their weight and a tray. The full average cost per seat is ',
        el('strong', {}, money(Math.round(m.flights[0].fullCostCents / m.flights[0].seatsOffered))),
        '. The gap is the lease, the insurance and the landing fee, none of which move because one more person boarded. ',
        'Both numbers must exist: pricing to marginal cost fills the aircraft and loses money, ',
        'pricing to full cost loses the market.'),
      provenance('shared/src/costing.js', 'flightPnl()', 'allocateFleetFixed()'))));

  /* ---- what is not yet built ---- */
  const caps = capabilityAudit();
  frag.append(card('What this system cannot yet do',
    'stated here so the brief is not read as a claim of completeness',
    el('div', {},
      ...caps.filter((c) => c.status === 'SCHEMA ONLY').map((c) => el('div', { class: 'gap-row' },
        el('span', { class: 'gap-dot' }),
        el('div', {},
          el('strong', {}, c.name), ' — designed and written, never executed against a real database.',
          el('div', { class: 'gap-c' }, c.caveat)))),
      el('div', { class: 'gap-row' },
        el('span', { class: 'gap-dot' }),
        el('div', {},
          el('strong', {}, 'No authentication and no API'),
          el('div', { class: 'gap-c' },
            'There is no server. Nothing here is connected to a live system or a real ledger.'))),
      el('div', { class: 'gap-row' },
        el('span', { class: 'gap-dot' }),
        el('div', {},
          el('strong', {}, 'Regulatory constants are unvalidated'),
          el('div', { class: 'gap-c' },
            'MEL intervals, emission factors and burn coefficients are researched and coded but not signed off by a licensed aviation professional.'))))));

  return frag;
}
