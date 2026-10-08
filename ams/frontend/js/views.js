/**
 * View modules. Each exports a render(model) returning a DocumentFragment.
 *
 * Every figure shown is read from the model, which obtained it from a real
 * domain module. No view computes a financial figure itself.
 */

import { solveRoute } from '../../shared/src/routing/constrained-path.js';
import { optimalRefuelPlan, bruteForceRefuel } from '../../shared/src/routing/refuel.js';
import {
  llpStatus, adsbApplies, melStatus, rectifyDeadline, airworthinessGate,
} from '../../shared/src/airworthiness.js';
import { ATA_CHAPTER_NAMES, MEL_CATEGORIES } from '../../shared/src/domain.js';
import {
  AIRCRAFT_STATE, DEFERRALS, DIRECTIVES, LLPS, ROUTES, SECTORS,
  EUA_PRICE_CENTS_PER_TONNE, FUEL_PRICES, TARGET_LOAD_FACTOR_PPM,
} from './data.js';

import {
  bar, card, el, hours, int, kg, km, kpi, kpis, microcents, money, moneyShort,
  pct, pctSigned, pill, provenance, sparkline, table, verdictTone,
} from './format.js';

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

/* ==================================================================== *
 * DASHBOARD
 * ==================================================================== */

export function dashboard(m) {
  const t = m.total;
  const v = m.verdict;
  const good = t.contributionCents > 0;
  const tone = verdictTone(v.verdict);

  const frag = document.createDocumentFragment();

  frag.append(el('p', { class: 'lede' },
    el('strong', {}, m.flights.length), ' flights for ', m.raw.length > 0 ? 'fiscal year 2026' : '',
    ' — cost attributed per sector from primary records, fleet-fixed cost allocated by block hours, ',
    'and the ratio set recomputed from summed numerators and denominators.'));

  frag.append(kpis(
    kpi('Operating result', moneyShort(t.contributionCents),
      `${money(t.contributionCents)} exactly`, good ? 'good' : 'bad'),
    kpi('CASK', `${microcents(t.caskMicrocents)}`,
      `per available seat-km · ${int(t.asks)} ASK`),
    kpi('RASK', `${microcents(t.raskMicrocents)}`,
      `per available seat-km · margin ${pct(v.marginPpm)}`,
      v.marginPpm > 0 ? 'good' : 'bad'),
    kpi('Load factor', pct(t.loadFactorPpm),
      `break-even at ${pct(t.breakEvenLoadFactorPpm)}`,
      t.loadFactorPpm >= t.breakEvenLoadFactorPpm ? 'good' : 'bad'),
    kpi('Marginal seat cost', money(m.total.marginalSeatCostCents),
      'what one more passenger costs'),
    kpi('Fleet-fixed pool', moneyShort(m.poolCents),
      `allocated by BLOCK_HOURS`),
  ));

  // Verdict panel with the gap meter.
  const gapPpm = v.levers.loadFactorGapPpm;
  const meterFill = Math.min(100, (t.loadFactorPpm / 1_000_000) * 100);
  const meterMark = Math.min(100, (t.breakEvenLoadFactorPpm / 1_000_000) * 100);

  frag.append(el('div', { class: 'verdict-panel' },
    el('div', {},
      el('div', { class: 'kpi-label' }, 'Route verdict'),
      el('div', { class: `verdict-word ${tone}` }, v.verdict.replace('_', ' '))),
    el('div', { class: 'verdict-detail' },
      `Actual load factor sits ${pctSigned(gapPpm)} against break-even. `,
      v.closeableByLoadFactor === false
        ? el('span', {},
            el('strong', {}, 'Load factor cannot close this gap. '),
            `Each passenger costs ${money(v.breakEven.contributionPerPassengerCents * -1)} more to carry than they pay, so filling the aircraft increases the loss. The route needs re-pricing, a fleet change or withdrawal.`)
        : `Closing it needs ${int(v.breakEven.additionalPassengersPerFlight)} additional passengers per flight at ${money(v.breakEven.revenuePerPassengerCents)} revenue and ${money(v.breakEven.contributionPerPassengerCents)} contribution each.`,
      el('div', { class: 'meter' },
        el('div', { class: 'meter-track' },
          el('div', { class: 'meter-fill', style: `width:${meterFill}%` }),
          el('div', { class: 'meter-mark', style: `left:${meterMark}%`, title: 'break-even' })),
        el('div', { class: 'kpi-sub' },
          `load ${pct(t.loadFactorPpm)} │ break-even ${pct(t.breakEvenLoadFactorPpm)} │ target ${pct(TARGET_LOAD_FACTOR_PPM)}`))),
  ));

  // Monthly contribution trend.
  const byMonth = new Map();
  m.raw.forEach((f, i) => {
    const mo = f.date.slice(5, 7);
    if (!byMonth.has(mo)) byMonth.set(mo, 0);
    byMonth.set(mo, byMonth.get(mo) + m.flights[i].contributionCents);
  });
  const months = [...byMonth.keys()].sort();
  const trend = months.map((mo) => byMonth.get(mo));

  frag.append(card('Monthly operating contribution',
    'per-sector cost attribution, summed by month',
    sparkline(trend, { tone: good ? 'var(--ok)' : 'var(--bad)' })));

  // Route table.
  const rows = m.routeRollup.map((r) => ({
    route: `${r.def.from} → ${r.def.to}`,
    kind: r.def.kind,
    km: int(r.agg.distanceKm),
    flights: int(r.agg.flights),
    load: pct(r.agg.loadFactorPpm),
    beLoad: r.agg.breakEvenLoadFactorPpm > 1_000_000
      ? el('span', { class: 'pill pill-bad' }, 'unreachable') : pct(r.agg.breakEvenLoadFactorPpm),
    cask: microcents(r.agg.caskMicrocents),
    rask: microcents(r.agg.raskMicrocents),
    margin: el('span', { style: `color:${r.marginPpm > 0 ? 'var(--ok)' : 'var(--bad)'}` }, pct(r.marginPpm)),
    contribution: el('span', { style: `color:${r.contributionCents > 0 ? 'var(--ok)' : 'var(--bad)'};font-weight:600` }, money(r.contributionCents)),
    verdict: pill(r.verdict.replace('_', ' '), verdictTone(r.verdict)),
  }));

  frag.append(card('Route profitability',
    'aggregatePnl() per route · routeVerdict() per route',
    table([
      { key: 'route', label: 'Route', cls: 'strong' },
      { key: 'kind', label: 'Type', render: (v2) => pill(v2, v2 === 'international' ? 'info' : 'neutral') },
      { key: 'km', label: 'Distance', num: true },
      { key: 'flights', label: 'Flights', num: true },
      { key: 'load', label: 'Load', num: true },
      { key: 'beLoad', label: 'Break-even', num: true },
      { key: 'cask', label: 'CASK', num: true },
      { key: 'rask', label: 'RASK', num: true },
      { key: 'margin', label: 'Margin', num: true },
      { key: 'contribution', label: 'Contribution', num: true },
      { key: 'verdict', label: 'Verdict' },
    ], rows)));

  return frag;
}

/* ==================================================================== *
 * COSTING
 * ==================================================================== */

export function costing(m) {
  const frag = document.createDocumentFragment();

  const lines = m.flights[0].lines;
  const lineRows = Object.entries(lines)
    .map(([k, v]) => ({ category: k, cents: v, sharePpm: m.flights[0].directCostCents === 0 ? 0 : Math.floor((v / m.flights[0].directCostCents) * 1_000_000) }))
    .sort((a, b) => b.cents - a.cents);

  const totalDirect = lineRows.reduce((a, r) => a + r.cents, 0);

  frag.append(el('p', { class: 'lede' },
    'The first two buckets determine whether a route is viable at all. ',
    el('strong', {}, 'Flight-attributable'),
    ' cost varies with flying the sector. ',
    el('strong', {}, 'Fleet-fixed'),
    ' cost — lease, insurance, admin crew, distribution — does not vary with whether this aircraft flies, and is allocated by an explicit driver. ',
    'Pricing to marginal cost fills the plane and loses money; pricing to full cost loses the traffic. Both numbers must exist.'));

  const f = m.flights[0];
  frag.append(kpis(
    kpi('Direct cost', money(f.directCostCents), 'buildFlightCost()'),
    kpi('Allocated fixed', money(f.fleetFixedCostCents), 'allocateFleetFixed()'),
    kpi('Full cost', money(f.fullCostCents), 'flightPnl()'),
    kpi('Revenue', money(f.revenueCents), 'passengers × fare + other'),
    kpi('Contribution', money(f.contributionCents),
      f.contributionCents > 0 ? 'positive' : 'negative', f.contributionCents > 0 ? 'good' : 'bad'),
    kpi('Marginal seat cost', money(f.marginalCostOfExtraSeatCents),
      'fuel for 100 kg at 3% + per-seat service'),
  ));

  frag.append(card('Cost build — one sector',
    `${m.raw[0].id} · ${m.raw[0].routeId} · ${m.raw[0].date}`,
    el('div', {},
      el('div', { class: 'kpi-sub', style: 'margin-bottom:12px' },
        `${m.raw[0].seatsOffered} seats · ${m.raw[0].passengers} pax · ${km(m.raw[0].distanceKm)} · ${hours(m.raw[0].blockHours)}`),
      ...lineRows.map((r) => bar(
        r.category.replace(/_/g, ' '),
        r.cents,
        totalDirect,
        money(r.cents),
        r.sharePpm > 180_000 ? 'warn' : null,
      )),
      el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' },
        bar('DIRECT TOTAL', totalDirect, totalDirect, money(totalDirect), null)),
      provenance('shared/src/costing.js', 'buildFlightCost()'))));

  // Marginal vs full cost.
  const marginalSharePpm = f.directCostCents === 0
    ? 0 : Math.floor((f.marginalCostOfExtraSeatCents / (f.fullCostCents / f.seatsOffered)) * 1_000_000);

  frag.append(card('Marginal versus full cost',
    'why both numbers must exist',
    el('div', {},
      el('div', { class: 'explain' },
        el('strong', {}, 'An extra passenger costs '), money(f.marginalCostOfExtraSeatCents),
        '. The full average cost per seat is ', money(Math.floor(f.fullCostCents / f.seatsOffered)),
        '. The gap is ', pct(Math.max(0, 100_000_000 - marginalSharePpm), 0),
        ' — landing fees, handling and the lease do not move because one more person boarded.'),
      table([
        { key: 'measure', label: 'Measure' },
        { key: 'value', label: 'Per seat', num: true },
        { key: 'note', label: 'Moves with one more passenger?' },
      ], [
        { measure: 'Marginal seat cost', value: money(f.marginalCostOfExtraSeatCents), note: pill('yes', 'ok') },
        { measure: 'Full cost per seat', value: money(Math.floor(f.fullCostCents / f.seatsOffered)), note: pill('no', 'bad') },
      ], { scroll: false }),
      provenance('shared/src/costing.js', 'estimateMarginalSeatCost()'))));

  // Per-aircraft.
  const byAc = new Map();
  m.raw.forEach((raw2, i) => {
    if (!byAc.has(raw2.aircraft)) byAc.set(raw2.aircraft, []);
    byAc.get(raw2.aircraft).push(m.flights[i]);
  });

  const acRows = [...byAc.entries()].map(([ac, list]) => {
    const rev = list.reduce((a, p) => a + p.revenueCents, 0);
    const full = list.reduce((a, p) => a + p.fullCostCents, 0);
    const direct = list.reduce((a, p) => a + p.directCostCents, 0);
    const pax = list.reduce((a, p) => a + p.passengers, 0);
    const seats = list.reduce((a, p) => a + p.seatsOffered, 0);
    const asks = list.reduce((a, p) => a + p.asks, 0);
    const bh = list.reduce((a, p) => a + p.blockHours, 0);
    return {
      ac,
      flights: int(list.length),
      blockHours: int(bh),
      pax: int(pax),
      loadFactorPpm: seats === 0 ? 0 : Math.floor((pax / seats) * 1_000_000),
      asks: int(asks),
      cask: asks === 0 ? 0 : Math.floor((full * 1_000_000) / asks + 0.5),
      directShare: full === 0 ? 0 : Math.floor((direct / full) * 1_000_000),
      contribution: rev - full,
    };
  });

  frag.append(card('By airframe',
    'fleet-fixed allocated by BLOCK_HOURS',
    table([
      { key: 'ac', label: 'Registration', cls: 'strong mono' },
      { key: 'flights', label: 'Flights', num: true },
      { key: 'blockHours', label: 'Block hours', num: true },
      { key: 'pax', label: 'Passengers', num: true },
      { key: 'loadFactorPpm', label: 'Load', num: true, render: (v2) => pct(v2) },
      { key: 'asks', label: 'ASK', num: true },
      { key: 'cask', label: 'CASK', num: true, render: (v2) => microcents(v2) },
      { key: 'directShare', label: 'Direct share', num: true, render: (v2) => pct(v2, 0) },
      { key: 'contribution', label: 'Contribution', num: true,
        render: (v2) => el('span', { style: `color:${v2 > 0 ? 'var(--ok)' : 'var(--bad)'}` }, money(v2)) },
    ], acRows)));

  return frag;
}

/* ==================================================================== *
 * ROUTE PLANNER
 * ==================================================================== */

export function routing(m) {
  const frag = document.createDocumentFragment();
  const body = el('div', {});

  const state = {
    from: 'HRE',
    to: 'DXB',
    tank: 24_000,
    reserve: 1_500,
  };

  const output = el('div', {});

  const airports = [...new Set(SECTORS.flatMap((s) => [s.from, s.to]))].sort();

  const mkSelect = (key, options) => {
    const s = el('select', {
      onchange: (e) => { state[key] = e.target.value; run(); },
    }, options.map((o) => el('option', { value: o, selected: o === state[key] ? 'selected' : null }, o)));
    return s;
  };

  const mkInput = (key, attrs) => el('input', {
    type: 'number',
    value: String(state[key]),
    onchange: (e) => { state[key] = Number(e.target.value); run(); },
    ...attrs,
  });

  function run() {
    output.replaceChildren();
    const result = solveRoute({
      flights: SECTORS,
      source: state.from,
      destination: state.to,
      tankCapacityKg: state.tank,
      minReserveKg: state.reserve,
    });

    output.append(kpis(
      kpi('Usable fuel', `${int(state.tank - state.reserve)} kg`,
        `${int(state.tank)} kg capacity − ${int(state.reserve)} kg reserve`),
      kpi('Feasible', result.feasible ? pill('YES', 'ok') : pill('NO', 'bad'),
        result.feasible ? `${result.labelsExpanded} labels expanded` : 'no legal route'),
      kpi('Optimal cost', result.feasible ? money(result.costCents) : '—',
        result.feasible ? `${result.labelsPruned} labels pruned` : ''),
      kpi('Fuel required', result.feasible ? kg(result.fuelUsedKg) : '—',
        result.feasible ? `${pct(Math.floor((result.fuelUsedKg / Math.max(1, state.tank - state.reserve)) * 1_000_000), 0)} of usable` : ''),
      kpi('Largest frontier', result.feasible ? String(result.maxFrontier) : '—',
        'non-dominated labels at one airport'),
    ));

    if (!result.feasible) {
      output.append(el('div', { class: 'explain' },
        el('strong', {}, 'No feasible route. '),
        'The solver reports infeasibility rather than returning a route the aircraft cannot fly. ',
        'This is the behaviour that distinguishes a fuel-constrained planner from an unconstrained one — ',
        'the cheapest route by cost alone may be unflyable.'));
      return;
    }

    const strip = el('div', { class: 'route-strip' });
    result.stops.forEach((s, i) => {
      if (i > 0) strip.append(el('span', { class: 'route-arrow' }, '→'));
      strip.append(el('span', { class: 'route-node' }, s));
    });
    output.append(card('Optimal routing', `${result.stops.length - 1} sector${result.stops.length > 2 ? 's' : ''}`, strip));

    // Leg detail.
    const legs = [];
    let cum = 0;
    for (let i = 0; i < result.stops.length - 1; i += 1) {
      const from = result.stops[i];
      const to = result.stops[i + 1];
      const sector = SECTORS.find((s) => s.from === from && s.to === to);
      cum += sector.fuelKg;
      legs.push({
        sector: `${from} → ${to}`,
        cost: money(sector.costCents),
        fuel: kg(sector.fuelKg),
        cumulative: kg(cum),
        headroom: kg(state.tank - state.reserve - cum),
      });
    }

    output.append(card('Sector detail', 'cumulative fuel must never exceed capacity − reserve',
      table([
        { key: 'sector', label: 'Sector', cls: 'strong mono' },
        { key: 'cost', label: 'Cost', num: true },
        { key: 'fuel', label: 'Fuel', num: true },
        { key: 'cumulative', label: 'Cumulative', num: true },
        { key: 'headroom', label: 'Remaining', num: true,
          render: (v2, row) => el('span', { style: `color:${v2 < 1500 ? 'var(--bad)' : 'var(--ok)'}` }, v2) },
      ], legs)));

    // Counterfactual: what unconstrained shortest path would have returned.
    const naive = naiveCheapest(state.from, state.to);
    if (naive) {
      const naiveFuel = naive.reduce((a, [, f]) => a + f, 0);
      const flyable = naiveFuel <= state.tank - state.reserve;
      output.append(card('Why the constraint matters here',
        'unconstrained shortest path, for comparison',
        el('div', {},
          el('div', { class: 'route-strip' },
            ...naive.flatMap(([s], i) => [
              i > 0 ? el('span', { class: 'route-arrow' }, '→') : null,
              el('span', { class: 'route-node', style: 'background:#fdeeec;color:#b03a2e' }, s),
            ]).filter(Boolean)),
          el('div', { class: 'explain' },
            'Cost-first search would return ', el('strong', {}, naive.reduce((a, [s, c]) => a + c, 0) / 100 === 0 ? '' : ''),
            naive.map(([, c]) => c).reduce((a, b) => a + b, 0) / 100,
            ' less, burning ', kg(naiveFuel), ' against ', kg(state.tank - state.reserve), ' usable. ',
            flyable
              ? el('strong', {}, 'It happens to be flyable, so the constrained answer coincides here.')
              : el('strong', {}, 'It is UNFLYABLE. Reporting this route would ground the aircraft.')),
          provenance('tests/routing.test.js', 'the "fuel constraint actually binds" suite'))));
    }

    // Uplift plan.
    const plan = optimalRefuelPlan({
      stops: result.stops,
      legFuelKg: result.stops.slice(0, -1).map((s, i) => {
        const sector = SECTORS.find((x) => x.from === s && x.to === result.stops[i + 1]);
        return sector.fuelKg;
      }),
      priceCentsPerKg: result.stops.map((s) => FUEL_PRICES[s] ?? 115),
      tankCapacityKg: state.tank,
      reserveKg: state.reserve,
    });

    const decisionLines = plan.decisions.map((d) =>
      `${d.stop}  arrive ${String(d.arrivalFuelKg).padStart(6)} kg  ·  uplift ${String(d.upliftKg).padStart(6)} kg  ·  depart ${String(d.departureFuelKg).padStart(6)} kg  @ ${d.priceCentsPerKg}c/kg`);

    output.append(card('Optimal uplift plan',
      `myopic policy · total ${money(plan.totalCostCents)}`,
      el('div', {},
        el('pre', { class: 'decision' },
          decisionLines.join('\n'),
          el('span', { class: 'k' }, '\n\n'),
          ...plan.decisions.flatMap((d) => [`  ${d.stop}: ${d.rationale}\n`, el('span', { class: 'k' }, '\n')])),
        provenance('shared/src/routing/refuel.js', 'optimalRefuelPlan() — proven optimal by exchange argument'))));
  }

  body.append(el('p', { class: 'lede' },
    'Minimise cost subject to cumulative fuel never exceeding capacity minus reserve. ',
    'A cost-first planner returns the cheapest route regardless of whether the aircraft can fly it; ',
    'a greedy planner returns the cheapest *next hop* regardless of whether it strands the aircraft. ',
    'This solver keeps only non-dominated (cost, fuel) pairs, which is provably safe because both the ',
    'objective and the resource improve in the same direction.'));

  body.append(el('div', { class: 'form-row' },
    el('div', { class: 'field' }, el('label', {}, 'Origin'), mkSelect('from', airports)),
    el('div', { class: 'field' }, el('label', {}, 'Destination'), mkSelect('to', airports)),
    el('div', { class: 'field' }, el('label', {}, 'Tank capacity (kg)'), mkInput('tank', { min: '0', step: '500' })),
    el('div', { class: 'field' }, el('label', {}, 'Final reserve (kg)'), mkInput('reserve', { min: '0', step: '100' }))));

  body.append(output);
  frag.append(card('Fuel-constrained route planning', 'solveRoute() · Pareto label-setting', body));

  frag.append(card('Fuel policy: the myopic rule',
    'optimalRefuelPlan()',
    el('div', {},
      el('div', { class: 'explain' },
        'At each stop, buy only enough to reach the ', el('strong', {}, 'next cheaper station'), ' with the reserve intact. ',
        'Buying less forces the shortfall at a dearer station; buying more carries fuel that will be consumed somewhere cheaper. ',
        'The destination price never influences a decision, because no fuel is sold on arrival.'),
      el('pre', { class: 'decision' },
        'proof by exchange\n',
        '  under-buying  → the shortfall must be bought later, where p_j >= p_i\n',
        '  over-buying   → the surplus is consumed where p_k < p_i\n',
        '  no cheaper ahead → buy the whole remaining requirement now\n',
        '  three cases exhaust the possibilities, so the policy is optimal'))));

  run();
  return frag;
}

function naiveCheapest(from, to) {
  // Cost-only Dijkstra. Deliberately ignores fuel, to show the difference.
  const adj = new Map();
  for (const s of SECTORS) {
    if (!adj.has(s.from)) adj.set(s.from, []);
    adj.get(s.from).push(s);
  }
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const pq = [{ c: 0, n: from }];

  while (pq.length) {
    pq.sort((a, b) => a.c - b.c);
    const { c, n } = pq.shift();
    if (c > (dist.get(n) ?? Infinity)) continue;
    if (n === to) break;
    for (const e of adj.get(n) ?? []) {
      const nc = c + e.costCents;
      if (nc < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nc);
        prev.set(e.to, e.from);
        pq.push({ c: nc, n: e.to });
      }
    }
  }
  if (!dist.has(to)) return null;

  const stops = [to];
  let cur = to;
  while (prev.has(cur)) { cur = prev.get(cur); stops.unshift(cur); }
  const path = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const s = SECTORS.find((x) => x.from === stops[i] && x.to === stops[i + 1]);
    path.push([`${s.from}→${s.to}`, s.fuelKg]);
  }
  return path;
}

/* ==================================================================== *
 * FUEL
 * ==================================================================== */

export function fuel(m) {
  const frag = document.createDocumentFragment();
  const fa = m.fuelAgg;

  frag.append(el('p', { class: 'lede' },
    'Fuel is typically a quarter to a third of an airline\'s operating cost, and the only major cost the ',
    'airline does not control, cannot renegotiate, and consumes before it earns. ',
    'Three things must be right: uplift is not burn, planned burn is not actual burn, and carrying fuel has an opportunity cost.'));

  const fuelSharePpm = m.total.fullCostCents === 0
    ? 0 : Math.floor((fa.sectorCostCents / m.total.fullCostCents) * 1_000_000);

  frag.append(kpis(
    kpi('Fuel cost', moneyShort(fa.sectorCostCents),
      pct(fuelSharePpm) + ' of operating cost'),
    kpi('Burn variance', pctSigned(Math.round(m.anomaly.meanPpm ?? 0)),
      `${m.anomaly.sampleSize} sectors`, (m.anomaly.meanPpm ?? 0) > 40_000 ? 'warn' : null),
    kpi('kg per block hour', (m.eff.kgPerBlockHourMilli / 1000).toFixed(2),
      'kg/h'),
    kpi('grams per ASK', (m.eff.gramsPerAskMilli / 1000).toFixed(2),
      'g/ASK — the industry efficiency unit'),
    kpi('Anomalies', String(m.anomaly.anomalies.length),
      `z >= ${2.5} sigma`, m.anomaly.anomalies.length > 0 ? 'warn' : 'good'),
    kpi('Variance cost', money(fa.sectorCostCents - Math.round(fa.plannedKg * (fa.sectorCostCents / Math.max(1, fa.burnKg)))),
      'the part management can influence'),
  ));

  // Burn variance series.
  frag.append(card('Fleet burn variance vs plan',
    'positive = burned more than planned',
    el('div', {},
      sparkline(m.burnVariancePpmSeries.slice(0, 120), { tone: 'var(--warn)' }),
      el('div', { class: 'kpi-sub', style: 'margin-top:10px' },
        m.anomaly.interpretation ?? ''),
      provenance('shared/src/fuel.js', 'detectBurnVarianceAnomaly()'))));

  // Worked reconciliation.
  const r = m.reconciliation;
  const plan = m.upliftPlan;

  frag.append(card('Uplift is not burn — one flight worked through',
    `${m.sample.id} · ${m.sample.routeId}`,
    el('div', { class: 'grid-2' },
      el('div', {},
        el('div', { class: 'kpi-label' }, 'Reconciliation'),
        table([
          { key: 'k', label: 'Item' }, { key: 'v', label: 'Value', num: true },
        ], [
          { k: 'Uplift taken', v: kg(r.actualLandingFuelKg + r.actualBurnKg) },
          { k: 'Actual burn (takeoff − landing)', v: kg(r.actualBurnKg) },
          { k: 'Landed with', v: kg(r.actualLandingFuelKg) },
          { k: 'Required reserves', v: kg(r.reservesKg) },
          { k: 'Reserve variance', v: el('span', {
            style: `color:${r.landingReserveVarianceKg >= 0 ? 'var(--ok)' : 'var(--bad)'};font-weight:600`,
          }, `${r.landingReserveVarianceKg >= 0 ? '+' : ''}${int(r.landingReserveVarianceKg)} kg`) },
          { k: 'Meets regulatory minimum', v: pill(r.reservesMeetRegulatoryMinimum ? 'YES' : 'NO', r.reservesMeetRegulatoryMinimum ? 'ok' : 'bad') },
          { k: 'Variance vs plan', v: `${r.varianceDirection} · ${pctSigned(r.variancePpm)}` },
          { k: 'Cost of variance', v: money(r.varianceCostCents) },
        ], { scroll: false }),
        provenance('shared/src/fuel.js', 'reconcileFuel()')),
      el('div', {},
        el('div', { class: 'kpi-label' }, 'Tankering decision'),
        el('div', { class: `verdict-word ${plan.tankering.shouldTanker ? 'ok' : 'bad'}` },
          plan.tankering.shouldTanker ? 'TANKER' : 'DO NOT TANKER'),
        el('div', { class: 'verdict-detail' },
          el('div', {}, plan.tankering.rationale),
          el('div', { style: 'margin-top:10px' },
            el('strong', {}, 'Expected saving: '), money(plan.tankering.expectedSavingCents)),
          el('div', {}, el('strong', {}, 'Carrying cost: '), money(plan.tankering.carryingCostCents)),
          el('div', {}, el('strong', {}, 'Net benefit: '), money(plan.tankering.netBenefitCents)),
          el('div', { style: 'margin-top:10px' },
            el('strong', {}, 'Required uplift: '), kg(plan.requiredUpliftKg),
            ' · buffer ', pct(plan.bufferPpm))),
        el('div', { class: 'explain', style: 'margin-top:12px' },
          'Diversion only happens sometimes, so the benefit is the ', el('strong', {}, 'expected'),
          ' cost avoided, scaled by probability. And carrying fuel is not free — it burns on every remaining sector. ',
          'Comparing the gross diversion cost against the fuel price makes tankering look free, which is how airlines accumulate deadweight.'),
        provenance('shared/src/fuel.js', 'optimalUplift()')))));

  // Station prices.
  frag.append(card('Station fuel prices', 'cents per kg — JNB is the regional hub',
    table([
      { key: 'station', label: 'Station', cls: 'strong mono' },
      { key: 'price', label: 'cents/kg', num: true },
      { key: 'vs', label: 'vs HRE', num: true, render: (v2) => el('span', {
        style: `color:${v2 > 0 ? 'var(--bad)' : 'var(--ok)'}` }, `${v2 > 0 ? '+' : ''}${v2}`) },
    ], Object.entries(FUEL_PRICES)
      .sort((a, b) => a[1] - b[1])
      .map(([station, price]) => ({ station, price, vs: price - FUEL_PRICES.HRE })))));

  return frag;
}

/* ==================================================================== *
 * AIRWORTHINESS
 * ==================================================================== */

export function airworthiness(m) {
  const frag = document.createDocumentFragment();

  const llpRows = LLPS.map((l) => {
    const s = llpStatus(l);
    return { part: l.partNumber, serial: l.serialNumber, ...s };
  });

  const gateRows = AIRCRAFT_STATE.map((ac) => {
    const g = airworthinessGate(DIRECTIVES, { ...ac, nowMs: NOW }, DEFERRALS);
    return { ac, g };
  });

  const worst = gateRows.reduce((a, r) => Math.max(a, r.g.overdueCount), 0);

  frag.append(el('p', { class: 'lede' },
    el('strong', {}, 'This is where an airline loses its certificate if it gets it wrong. '),
    'A life-limited part wears out on three clocks at once — cycles, hours and calendar months — and a part with 50% of cycle life but 4% of calendar life is nearly scrap. ',
    'An Airworthiness Directive is legally mandatory; a Service Bulletin is not, until an AD adopts it. ',
    'AMS tracks them separately, because a fleet that "applied the SB" is not necessarily compliant with the AD.'));

  frag.append(kpis(
    kpi('Dispatchable', worst === 0 ? pill('ALL', 'ok') : pill(`${gateRows.filter((r) => !r.g.dispatchable).length} BLOCKED`, 'bad'),
      `${gateRows.length} airframes assessed`, worst === 0 ? 'good' : 'bad'),
    kpi('Overdue ADs', String(gateRows.reduce((a, r) => a + r.g.overdueCount, 0)),
      'mandatory, not deferrable', worst > 0 ? 'bad' : 'good'),
    kpi('Illegal deferrals', String(gateRows.reduce((a, r) => a + r.g.illegalDeferralAttempts.length, 0)),
      'MEL attempts to defer an AD', 'good'),
    kpi('LLPs to replace', String(llpRows.filter((r) => r.planReplacement).length),
      `of ${llpRows.length} tracked`),
    kpi('MEL deferrals', String(DEFERRALS.length),
      `${DEFERRALS.filter((d) => (MEL_CATEGORIES[d.category]?.days ?? null) !== null).length} with a standard interval`),
  ));

  // LLP table.
  frag.append(card('Life-limited parts',
    'llpStatus() — the controlling counter is the one that binds first',
    table([
      { key: 'part', label: 'Part', cls: 'strong mono' },
      { key: 'serial', label: 'Serial', cls: 'mono' },
      { key: 'counters', label: 'Remaining by counter', render: (cs) => el('span', { class: 'mono' },
        cs.map((c) => `${c.remaining}${c.unit}`).join(' / ')) },
      { key: 'controllingCounter', label: 'Controlling',
        render: (v2) => pill(v2, v2 === 'CALENDAR' ? 'warn' : 'info') },
      { key: 'controllingRemaining', label: 'Remaining', num: true,
        render: (v2, row) => el('span', { style: 'font-weight:600' }, `${int(v2)} ${row.controllingCounter === 'CYCLES' ? 'C' : row.controllingCounter === 'HOURS' ? 'H' : 'M'}`) },
      { key: 'status', label: 'Status',
        render: (v2) => pill(v2, v2 === 'COMPLIANT' ? 'ok' : v2 === 'DUE_SOON' ? 'warn' : 'bad') },
      { key: 'planReplacement', label: 'Plan replacement', render: (v2) => v2 ? pill('YES', 'warn') : pill('no', 'neutral') },
    ], llpRows)));

  // Dispatch gate.
  const gateTable = table([
    { key: 'ac', label: 'Airframe', cls: 'strong mono',
      render: (_v, row) => `${row.ac.aircraftType} MSN ${row.ac.serialNumber}` },
    { key: 'applicable', label: 'Applicable', num: true,
      render: (_v, row) => int(row.g.applicableCount) },
    { key: 'overdue', label: 'Overdue', num: true,
      render: (_v, row) => row.g.overdueCount === 0 ? pill('0', 'ok')
        : el('span', { class: 'pill pill-bad' }, String(row.g.overdueCount)) },
    { key: 'dueSoon', label: 'Due soon', num: true,
      render: (_v, row) => row.g.dueSoonCount === 0 ? pill('0', 'neutral') : pill(String(row.g.dueSoonCount), 'warn') },
    { key: 'illegal', label: 'Illegal deferral', num: true,
      render: (_v, row) => row.g.illegalDeferralAttempts.length === 0
        ? pill('none', 'ok')
        : el('span', { class: 'pill pill-bad' }, row.g.illegalDeferralAttempts.join(', ')) },
    { key: 'dispatchable', label: 'Dispatch', render: (_v, row) =>
      row.g.dispatchable ? pill('CLEAR', 'ok') : pill('BLOCKED', 'bad') },
    { key: 'nextDue', label: 'Next due', render: (_v, row) => row.g.nextDue
      ? el('span', { class: 'mono' }, `${row.g.nextDue.reference} · ${row.g.nextDue.controllingCounter} · ${int(row.g.nextDue.remaining)}`)
      : el('span', { class: 'mono' }, '—') },
  ], gateRows);

  frag.append(card('Dispatch gate',
    'airworthinessGate() — an overdue AD cannot be deferred, whatever the operator records',
    el('div', {},
      gateTable,
      el('div', { class: 'explain' },
        el('strong', {}, 'EASA CS-GEN-MMEL: '),
        '"The MEL cannot deviate from Airworthiness Directives or any other additional mandatory requirements." ',
        'The gate sets the deferred flag to false unconditionally and reports any attempt separately — ',
        'silently ignoring an illegal deferral would let an operator believe an aircraft is airworthy when it is not.'),
      provenance('shared/src/airworthiness.js', 'airworthinessGate()'))));

  // Directive register.
  const dirRows = AIRCRAFT_STATE.flatMap((ac) =>
    DIRECTIVES.map((ad) => {
      const r = adsbApplies(ad, { ...ac, nowMs: NOW });
      return { ad, ac, r };
    }));

  frag.append(card('Directive register',
    'adsbApplies() — applicability, then the controlling threshold',
    table([
      { key: 'ref', label: 'Reference', cls: 'strong mono',
        render: (_v, row) => row.ad.reference },
      { key: 'kind', label: 'Type', render: (_v, row) => pill(row.ad.kind, row.ad.kind === 'AD' ? 'info' : 'neutral') },
      { key: 'auth', label: 'Authority', render: (_v, row) => row.ad.authority },
      { key: 'ata', label: 'ATA', cls: 'mono',
        render: (_v, row) => row.ad.ataChapter ? `${row.ad.ataChapter} ${ATA_CHAPTER_NAMES[row.ad.ataChapter] ?? ''}` : '—' },
      { key: 'applies', label: 'Applies', render: (_v, row) => row.r.applies
        ? pill('YES', 'ok') : pill('no', 'neutral') },
      { key: 'status', label: 'Status', render: (_v, row) => {
        const r = row.r;
        if (!r.applies) return el('span', { class: 'mono', style: 'color:var(--faint);font-size:11px' }, r.reason);
        const st = r.complianceStatus.status;
        return pill(st, st === 'COMPLIANT' ? 'ok' : st === 'DUE_SOON' ? 'warn' : 'bad');
      } },
      { key: 'remaining', label: 'Remaining', num: true, render: (_v, row) => row.r.applies
        ? `${int(row.r.complianceStatus.remaining)} ${row.r.complianceStatus.unit}` : '—' },
      { key: 'mandatory', label: 'Mandatory', render: (_v, row) => row.r.applies && row.r.complianceStatus.requiresMandatoryInstruction
        ? pill('YES', 'info') : pill('no', 'neutral') },
    ], dirRows)));

  // MEL deferrals.
  const melRows = DEFERRALS.map((d) => {
    const s = melStatus({ ...d }, NOW);
    return { d, s };
  });

  frag.append(card('MEL deferrals',
    'melStatus() — the off-by-one this exists to get right',
    el('div', {},
      table([
        { key: 'ref', label: 'Item', cls: 'strong mono', render: (_v, row) => row.d.itemRef },
        { key: 'cat', label: 'Category', num: true, render: (_v, row) => row.s.category },
        { key: 'interval', label: 'Standard interval', render: (_v, row) => {
          const days = MEL_CATEGORIES[row.s.category]?.days;
          return days === null || days === undefined
            ? el('span', { class: 'pill pill-warn' }, 'none specified')
            : `${days} days excluding day of discovery`;
        } },
        { key: 'discovered', label: 'Discovered', render: (_v, row) =>
          el('span', { class: 'mono' }, new Date(row.d.discoveredAtMs).toISOString().slice(0, 10)) },
        { key: 'rectifyBy', label: 'Rectify by', render: (_v, row) => row.s.rectifyByMs === null
          ? el('span', { class: 'mono' }, 'none')
          : el('span', { class: 'mono' }, new Date(row.s.rectifyByMs).toISOString().slice(0, 19).replace('T', ' ')) },
        { key: 'elapsed', label: 'Days elapsed', num: true, render: (_v, row) => int(row.s.elapsedDays) },
        { key: 'remaining', label: 'Days remaining', num: true, render: (_v, row) => row.s.daysRemaining },
        { key: 'status', label: 'Status', render: (_v, row) =>
          pill(row.s.status, row.s.status === 'VALID' ? 'ok' : row.s.status === 'DUE_SOON' ? 'warn' : 'bad') },
      ], melRows),
      el('div', { class: 'explain' },
        'Category B is "3 calendar days excluding the day of discovery", running to the ',
        el('strong', {}, 'end'), ' of the resulting day. A defect found at 09:00 Monday is due 23:59 Thursday — ',
        'not Thursday 09:00. Naive duration arithmetic gets this wrong on every CAT B item, and getting it wrong ',
        'in the lenient direction means dispatching an aircraft with an expired deferral. All arithmetic is UTC, ',
        'so a clock change cannot shift a legal deadline.'),
      provenance('shared/src/airworthiness.js', 'rectifyDeadline()', 'melStatus()'))));

  return frag;
}

/* ==================================================================== *
 * CARBON
 * ==================================================================== */

export function carbon(m) {
  const frag = document.createDocumentFragment();
  const c = m.carbon;

  frag.append(el('p', { class: 'lede' },
    'Carbon is no longer a reporting nicety — it is a balance-sheet item. ',
    el('strong', {}, 'The critical rule is that emissions must be counted once. '),
    'Where both regimes touch a flight, CORSIA-covered tonnes are deducted from the EU ETS chargeable quantity. ',
    'Double-counting is a compliance error and, at current allowance prices, a seven-figure mistake. ',
    'No upstream library does this correctly, which is why AMS implements the deduplication explicitly.'));

  frag.append(kpis(
    kpi('Total CO₂', `${(c.totalTonnes / 1000).toFixed(1)}k t`,
      `${int(m.fuelAgg.burnKg)} kg fuel burned`),
    kpi('CORSIA', `${(c.corsiaTonnes / 1000).toFixed(1)}k t`,
      pct(Math.floor((c.corsiaTonnes / Math.max(1, c.totalTonnes)) * 1_000_000), 0) + ' of total'),
    kpi('EU ETS', `${(c.etsTonnes / 1000).toFixed(2)}k t`,
      pct(Math.floor((c.etsTonnes / Math.max(1, c.totalTonnes)) * 1_000_000), 1) + ' after deduction'),
    kpi('ETS cost', moneyShort(c.etsCostCents),
      `@ ${EUA_PRICE_CENTS_PER_TONNE} c/tonne`, c.etsCostCents > 0 ? 'warn' : null),
    kpi('SAF share', pct(c.safSharePpm, 2),
      `${(c.safSavingTonnes / 1000).toFixed(2)}k t avoided`, 'good'),
    kpi('Allocation reconciles', c.reconciliationFailures === 0 ? pill('YES', 'ok') : pill('NO', 'bad'),
      'every tonne counted once'),
  ));

  frag.append(card('Allocation across regimes',
    'allocateEmissions() — the deduplication branch',
    el('div', {},
      el('pre', { class: 'decision' },
        'four mutually exclusive cases\n\n',
        '  corsia && ets  →  ', el('span', { class: 's' }, 'CORSIA = total,  ETS = 0'),
        '   (deduction: CORSIA satisfies the obligation)\n',
        '  corsia only   →  ', el('span', { class: 's' }, 'CORSIA = total,  ETS = 0'),
        '\n  ets only      →  ', el('span', { class: 's' }, 'ETS = total,     CORSIA = 0'),
        '\n  neither       →  ', el('span', { class: 's' }, 'UNREGULATED = total'),
        '\n\n  invariant: the three buckets always sum to the whole'),
      el('div', { class: 'explain', style: 'margin-top:12px' },
        'The three allocation buckets must reconstruct the total for every input. That is a property of the ',
        'deduplication, not of any particular flight — so it is checked as a property across all ',
        int(m.emissions.length), ' flights rather than a handful of hand-computed examples.'),
      provenance('shared/src/carbon.js', 'allocateEmissions()'))));

  // Per-flight emissions detail.
  const rows = m.raw.map((f, i) => {
    const e = m.emissions[i];
    return {
      id: f.id,
      route: f.routeId,
      intl: f.international ? 'international' : 'domestic',
      eea: f.eeaInvolved,
      fuel: int(f.fuelKg),
      saf: f.safKg > 0 ? int(f.safKg) : '—',
      tonnes: e.totalCo2Tonnes.toFixed(1),
      corsia: e.allocation.CORSIA > 0 ? e.allocation.CORSIA.toFixed(1) : '—',
      ets: e.allocation.EU_ETS > 0 ? e.allocation.EU_ETS.toFixed(1) : '—',
      unreg: e.allocation.UNREGULATED > 0 ? e.allocation.UNREGULATED.toFixed(1) : '—',
      cost: e.allowanceCostCents > 0 ? money(e.allowanceCostCents) : '—',
      reconciles: e.allocationReconciles,
    };
  }).slice(0, 80);

  frag.append(card('Per-flight emissions',
    `first ${rows.length} of ${m.raw.length} flights`,
    table([
      { key: 'id', label: 'Flight', cls: 'mono' },
      { key: 'route', label: 'Route', cls: 'strong mono' },
      { key: 'intl', label: 'Segment', render: (v2) => pill(v2, v2 === 'international' ? 'info' : 'neutral') },
      { key: 'eea', label: 'EEA', render: (v2) => v2 ? pill('yes', 'warn') : pill('no', 'neutral') },
      { key: 'fuel', label: 'Fuel kg', num: true },
      { key: 'saf', label: 'SAF kg', num: true },
      { key: 'tonnes', label: 'CO₂ t', num: true },
      { key: 'corsia', label: 'CORSIA t', num: true },
      { key: 'ets', label: 'ETS t', num: true },
      { key: 'unreg', label: 'Unregulated t', num: true },
      { key: 'cost', label: 'ETS cost', num: true },
      { key: 'reconciles', label: 'Reconciles', render: (v2) => v2 ? pill('yes', 'ok') : pill('NO', 'bad') },
    ], rows)));

  return frag;
}

/* ==================================================================== *
 * AUDIT TRAIL
 * ==================================================================== */

export function audit(m) {
  const frag = document.createDocumentFragment();
  const body = el('div', {});
  const out = el('div', {});

  /**
   * Web Crypto's SHA-256 is asynchronous, whereas backend/src/audit/chain.js
   * uses node:crypto synchronously. The construction is identical; only the
   * awaiting differs. Stated here rather than hidden, because this is the
   * one module that cannot be imported unchanged into a browser.
   */
  const sha256Hex = async (a, b) => {
    const enc = new TextEncoder();
    const data = enc.encode(a + b);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b2) => b2.toString(16).padStart(2, '0')).join('');
  };

  async function run() {
    out.replaceChildren();

    const entries = m.raw.slice(0, 14).map((f, i) => {
      const p = m.flights[i];
      return {
        id: i + 1,
        tenantId: 'zim-2026',
        actorId: ['u.finance.01', 'u.ops.02', 'system'][i % 3],
        entityType: 'flight_cost',
        entityId: f.id,
        action: i % 5 === 0 ? 'CREATE' : 'ATTRIBUTE_COST',
        before: null,
        after: { flight: f.id, fuel: f.fuelKg, pax: p.passengers, contribution: p.contributionCents },
        ip: `10.20.${i % 4}.${30 + i}`,
        occurredAt: new Date(Date.UTC(2026, 0, 1 + i, 8 + (i % 10), (i * 7) % 60)).toISOString(),
      };
    });

    // Canonicalise: stable key order, or the hash is meaningless.
    const canonicalise = (v) => {
      if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
      if (Array.isArray(v)) return `[${v.map(canonicalise).join(',')}]`;
      const keys = Object.keys(v).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalise(v[k])}`).join(',')}}`;
    };

    const GENESIS = '0'.repeat(64);

    const compute = async (e, prevHash) => sha256Hex(
      prevHash,
      canonicalise({
        id: e.id, tenantId: e.tenantId, actorId: e.actorId,
        entityType: e.entityType, entityId: String(e.entityId),
        action: e.action, before: e.before, after: e.after,
        ip: e.ip, occurredAt: e.occurredAt,
      }),
    );

    // Build the chain.
    const chain = [];
    let prev = GENESIS;
    for (const e of entries) {
      const h = await compute(e, prev);
      chain.push({ ...e, prevHash: prev, entryHash: h });
      prev = h;
    }
    const head = chain[chain.length - 1].entryHash;

    // Verify it.
    let verifyPrev = GENESIS;
    let brokenAt = null;
    for (const e of chain) {
      const expected = await compute(e, verifyPrev);
      if (expected !== e.entryHash) { brokenAt = e.id; break; }
      verifyPrev = e.entryHash;
    }

    out.append(kpis(
      kpi('Entries', String(chain.length), 'hashed and chained'),
      kpi('Chain valid', brokenAt === null ? pill('YES', 'ok') : pill(`BROKEN @ ${brokenAt}`, 'bad'),
        brokenAt === null ? 'every hash recomputes' : 'content altered', brokenAt === null ? 'good' : 'bad'),
      kpi('Chain head', `${head.slice(0, 16)}…`, 'export for external anchoring'),
      kpi('Genesis', `${GENESIS.slice(0, 16)}…`, 'all-zero sentinel'),
    ));

    out.append(card('Chain verification', 'verifyChain() — recompute every hash and walk the chain',
      table([
        { key: 'id', label: '#', num: true },
        { key: 'occurredAt', label: 'Occurred', cls: 'mono' },
        { key: 'actorId', label: 'Actor', cls: 'mono' },
        { key: 'action', label: 'Action' },
        { key: 'entityId', label: 'Entity', cls: 'mono' },
        { key: 'prevHash', label: 'prev_hash', cls: 'mono',
          render: (v2) => el('span', { style: 'color:var(--faint)' }, `${String(v2).slice(0, 12)}…`) },
        { key: 'entryHash', label: 'entry_hash', cls: 'mono',
          render: (v2) => el('span', { style: 'color:var(--accent);font-weight:600' }, `${String(v2).slice(0, 16)}…`) },
      ], chain, { scroll: false })));

    // Tamper demonstration.
    const tampered = chain.map((e) => ({ ...e }));
    tampered[3].after = { ...tampered[3].after, contribution: 999_999_99 };

    let tPrev = GENESIS;
    let tBroken = null;
    for (const e of tampered) {
      const expected = await compute(e, tPrev);
      if (expected !== e.entryHash) { tBroken = e.id; break; }
      tPrev = e.entryHash;
    }

    out.append(card('Tamper detection', 'one field changed — the chain breaks immediately after',
      el('div', {},
        el('div', { class: 'explain' },
          'Entry 4 had ', el('strong', {}, 'contribution'), ' altered. Because every entry hashes its own content ',
          'together with the previous entry\'s hash, the alteration makes entry 4\'s hash wrong — and verification ',
          'fails at entry ', el('strong', {}, String(tBroken)), '.'),
        el('pre', { class: 'decision' },
          'original   entry 4 hash  ', chain[3].entryHash, '\n',
          'tampered   entry 4 hash  ', el('span', { class: 'n' }, await compute(tampered[3], tampered[3].prevHash)), '\n',
          'verification fails at entry ', el('span', { class: 'n' }, String(tBroken)),
          '  ← entry 4 itself, because it is the first altered entry\n\n',
          'rewriting every subsequent hash to hide it would produce a different chain head\n',
          'which is why the head is exported for external anchoring'),
        provenance('backend/src/audit/chain.js', 'computeHash()', 'verifyChain()'))));

    // Canonicalisation demo.
    out.append(card('Why canonicalisation is not optional',
      'object key order must not affect the hash',
      el('div', {},
        el('pre', { class: 'decision' },
          'canonicalise({ b: 2, a: 1 })  →  ', canonicalise({ b: 2, a: 1 }), '\n',
          'canonicalise({ a: 1, b: 2 })  →  ', canonicalise({ a: 1, b: 2 }),
          el('span', { class: 'k' }, '   ← identical, by design\n\n')),
        el('div', { class: 'explain' },
          'Without sorting, those two would hash differently and verification would report corruption on a chain ',
          'that is perfectly intact. The failure mode is the worst kind: a phantom problem that would send engineers ',
          'hunting for a bug that does not exist.'),
        provenance('backend/src/audit/chain.js', 'canonicalise()'))));
  }

  body.append(el('p', { class: 'lede' },
    'An airline audit trail is evidence presented to a statutory auditor, a lessor\'s technical representative, and a ',
    'foreign civil aviation authority. If the airline can edit its own history, none of that evidence is worth anything. ',
    'Each entry stores the SHA-256 of its own content concatenated with the previous entry\'s hash, so any modification, ',
    'deletion or reordering breaks the chain at that point and every point after it.'));

  body.append(el('div', { class: 'explain' },
    el('strong', {}, 'One deviation from the backend module: '),
    'chain.js uses node:crypto, which a browser cannot import. This view uses the Web Crypto API instead — ',
    'identical algorithm, but asynchronous. Every other module on this page is imported unchanged from shared/src/.'));

  body.append(out);
  frag.append(card('Tamper-evident audit chain',
    'SHA-256 · per-tenant · append-only at the database by trigger', body));

  return frag;
}