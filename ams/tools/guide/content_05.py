"""
Part VII (airworthiness) and Part VIII (algorithms).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART VII =================
    story += H1('Part VII — Airworthiness and legal safety')

    story += LEAD(
        'This is the part of AMS where a software error can cost an airline its '
        'operating certificate. The code is written with a different level of '
        'caution, and it should be reviewed with more scepticism than the rest '
        'of the system.')

    story += CODE(
        '''/**
 * AMS — Airworthiness: life-limited parts and AD/SB compliance.
 *
 * THIS IS WHERE AN AIRLINE LOSES ITS CERTIFICATE IF IT GETS IT WRONG.
 *
 * A life-limited part (LLP) — an engine C-rib, a main landing gear,
 * a flight control component — has a hard life limit measured in
 * flight cycles, flight hours, or calendar months, set by its certifying
 * authority and never extended. Exceed it and the part must be
 * destroyed. Operate with an LLP beyond limit and the operator's Air
 * Operator Certificate is at risk, aircraft are grounded, and the
 * liability is personal as well as corporate.
 *
 * An Airworthiness Directive (AD) is a mandatory instruction issued by a
 * regulator, often after a fleet-wide safety finding. A Service Bulletin
 * (SB) is the manufacturer's version — often technically equivalent but
 * not, by itself, legally mandatory until adopted by an AD. Conflating
 * them is a common and expensive error: a fleet that "applied the SB" is
 * not necessarily compliant with the AD.
 *
 * AMS therefore tracks ADs and SBs as SEPARATE compliance tracks. An
 * SB applied does not close an AD. Only the AD does.
 *
 * @module airworthiness
 */''',
        'shared/src/airworthiness.js — note the opening line. The author is '
        'stating the stakes before writing any code.')

    story += H2('Life-limited parts and three counters')

    story += CODE(
        '''export function llpStatus(llp) {
  const cycles = remaining(llp.cyclesTotalLimit, llp.cyclesSinceNew);
  const hours = remaining(llp.hoursTotalLimit, llp.hoursSinceNew);
  const months = remaining(llp.monthsTotalLimit, llp.monthsSinceNew);

  /** @type {{counter: string, remaining: number | null, unit: string}[]} */
  const counters = [];
  if (cycles !== null) counters.push({ counter: 'CYCLES', remaining: cycles, unit: 'C' });
  if (hours !== null) counters.push({ counter: 'HOURS', remaining: hours, unit: 'H' });
  if (months !== null) counters.push({ counter: 'CALENDAR', remaining: months, unit: 'M' });

  if (counters.length === 0) {
    throw new TypeError('LLP must declare at least one life limit');
  }''')

    story += P(
        'A life-limited part wears out on three independent clocks at once. '
        'Cycle life counts landings and takeoffs. Hour life counts flying time. '
        'Calendar life counts months since the part was new. A part must be '
        'removed when *any* clock runs out.')

    story += TABLE(
        ['Counter', 'What it measures', 'Typical limit'],
        [
            ['Cycles', 'Takeoffs and landings', '20,000–45,000'],
            ['Hours', 'Actual flying time', '40,000–80,000'],
            ['Calendar', 'Months since new, regardless of use', '120–192 months'],
        ],
        widths=[18, 47, 35])

    story += CALLOUT(
        'good', 'The example in the AMS README makes the point exactly',
        'A part with 50% of its cycle life left but 4% of its calendar life '
        'remaining is nearly scrap. A planner who looks only at cycles will fly '
        'it into the ground. This is not a subtle edge case — it is one of the '
        'most common real errors in life-limited part planning.')

    story += H2('Finding the limit that binds first')

    story += CODE(
        '''  // Controlling limit = least remaining life, normalised to a percentage
  // of each counter's own total so the comparison is meaningful.
  const normalised = counters
    .map((c) => {
      const total =
        c.counter === 'CYCLES' ? llp.cyclesTotalLimit
        : c.counter === 'HOURS' ? llp.hoursTotalLimit
        : llp.monthsTotalLimit;
      return { ...c, remainingPpm: Math.floor((c.remaining / total) * 1_000_000) };
    })
    .sort((a, b) => a.remainingPpm - b.remainingPpm);

  const controlling = normalised[0];
  const status = statusFromRemainingPpm(controlling.remainingPpm);

  return {
    partNumber: llp.partNumber,
    serialNumber: llp.serialNumber,
    counters,
    controllingCounter: controlling.counter,
    controllingRemaining: controlling.remaining,
    controllingRemainingPpm: controlling.remainingPpm,
    status,
    mustRemove: status === 'OVERDUE',
    /** An LLP inside the warning band is a planning item, not a surprise. */
    planReplacement: status !== 'COMPLIANT',
  };''')

    story += P(
        'You cannot compare "5 cycles remaining" against "5 months remaining" '
        'directly. The code therefore normalises each counter to a percentage '
        'of its own limit, then takes the smallest. This is where Part III\'s '
        'technique of storing rates as integers appears again.')

    story += CODE(
        '''llpStatus({ partNumber: 'P/N-4471', cyclesTotalLimit: 10000, cyclesSinceNew: 5000,
            monthsTotalLimit: 120, monthsSinceNew: 115 });
// → { controllingCounter: 'CALENDAR', controllingRemaining: 5, mustRemove: false }''')

    story += H2('Directives and bulletins are not the same')

    story += CODE(
        '''export const ATA_CHAPTERS = [
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32',
  '33', '34', '35', '36', '38', '45', '46', '47', '48', '49', '51', '52',
  '53', '54', '55', '56', '77',
];

/**
 * ATA chapter codes.
 *
 * Airworthiness Directives are published under an ATA chapter, and
 * technical and compliance staff search by ATA chapter — "what is
 * outstanding on landing gear?" — not by AD reference number. Without
 * this field every such query becomes a full-text scan.
 *
 * Source: structure observed directly in 14 CFR Part 39 ADs published
 * in the Federal Register (79 FR 19848; 87 FR 67354) and in live EASA
 * directives AD 2026-0125-E, AD 2023-0167R1 and AD 2024-0213.
 */''',
        'shared/src/domain.js — and note that the source citations are '
        'recorded in the code.')

    story += CALLOUT(
        'note', 'What to notice about that comment',
        'The data structure was derived from documents the author claims to '
        'have examined directly, and the citations are specific: two Federal '
        'Register page references and three named EASA directives. That is a '
        'different standard from asserting a regulatory fact without a source, '
        'and it is what allows a reviewer to check the claim rather than take '
        'it on trust.')

    story += CODE(
        '''export function adsbApplies(ad, aircraft) {
  if (ad.superseded) {
    return { applies: false, reason: 'Superseded by a later directive', complianceStatus: null };
  }
  if (ad.aircraftType !== aircraft.aircraftType) {
    return { applies: false, reason: `Not applicable to ${aircraft.aircraftType}`, complianceStatus: null };
  }
  const [from, to] = ad.serialRange;
  if (aircraft.serialNumber < from || aircraft.serialNumber > to) {
    return {
      applies: false,
      reason: `Serial ${aircraft.serialNumber} outside affected range ${from}-${to}`,
      complianceStatus: null,
    };
  }
  // ... thresholds, controlling counter, status ...
}''',
        'shared/src/airworthiness.js — applicability is decided before any '
        'threshold arithmetic.')

    story += P(
        'Real applicability is not a single test. An airworthiness directive '
        'names a serial range, applies to a specific aircraft type, and may be '
        'superseded by a later directive. All three must be checked, and each '
        'returns a *reason* so an engineer can see why it was excluded rather '
        'than just seeing a blank.')

    story += CODE(
        '''      /**
       * An SB applied does NOT satisfy an AD. This flag is the reason
       * AMS keeps the two tracks separate.
       */
      requiresMandatoryInstruction: ad.kind === 'AD',''')

    story += H2('Deferral deadlines and the off-by-one')

    story += CODE(
        '''export const MEL_CATEGORIES = {
  A: { days: null, note: 'No standard interval specified; starts at deferral' },
  B: { days: 3, note: '3 calendar days excluding the day of discovery' },
  C: { days: 10, note: '10 calendar days excluding the day of discovery' },
  D: { days: 120, note: '120 calendar days excluding the day of discovery' },
};

/**
 * Source: EASA CS-GEN-MMEL Issue 2, Annex II to ED Decision 2020/012/R.
 */''')

    story += CODE(
        '''export function rectifyDeadline(category, discoveredAtMs) {
  const spec = MEL_CATEGORIES[category];
  if (!spec) throw new TypeError(`Unknown MEL category "${category}"`);
  if (spec.days === null) return null; // Category A: no standard interval

  const discovery = new Date(discoveredAtMs);
  const due = new Date(discovery.getTime());
  // The day of discovery is excluded, so counting starts at day 1 = the
  // following calendar day.
  due.setUTCDate(due.getUTCDate() + spec.days);
  due.setUTCHours(23, 59, 59, 999); // valid to the END of that day
  return due.getTime();
}''')

    story += P(
        'This function is a worked example of why domain detail matters more '
        'than arithmetic elegance. Three separate things are being got right.')

    story += NUMLIST([
        '**The day of discovery does not count.** A Category B defect found on '
        'Monday is not due on Thursday — it is due on the *end* of Thursday.',
        '**It runs to the end of the day, not the same time of day.** '
        '`setUTCHours(23, 59, 59, 999)` is what makes it 23:59 on Thursday '
        'rather than 09:00.',
        '**Everything is UTC.** `setUTCDate`, not `setDate`. The operator\'s '
        'local timezone must not shift a legal deadline.',
    ])

    story += CODE(
        '''// Category B defect discovered 09:00 Monday 6 July 2026
rectifyDeadline('B', ms)   // → end of Thursday 9 July 2026

// A flight operating Friday 10 July must be dispatched as EXPIRED.''')

    story += CALLOUT(
        'bug', 'Why this specific off-by-one is dangerous',
        'Getting it wrong in the *lenient* direction means an aircraft flies '
        'with an expired deferral. Getting it wrong in the strict direction '
        'grounds a perfectly airworthy aircraft unnecessarily. Both are '
        'expensive; only one is a safety breach. The code comments state the '
        'source document so the arithmetic can be re-checked against the '
        'regulation by someone qualified to read it.')

    story += H2('Why a deferral cannot cancel a directive')

    story += CODE(
        '''/**
 * Aggregate every compliance item on one aircraft into a single
 * airworthiness gate, enforcing the subordination of the MEL.
 *
 * CRITICAL: EASA CS-GEN-MMEL states plainly that
 *   "The MEL cannot deviate from Airworthiness Directives or any other
 *    additional mandatory requirements."
 *
 * A MEL deferral is therefore legally INCAPABLE of curing an
 * outstanding AD. This function never marks an AD as deferred, and it
 * separately reports any attempt to do so — because silently ignoring
 * an illegal deferral would let an operator believe an aircraft is
 * airworthy when it is not.
 *
 * @param {ADSB[]} registry
 * @param {{ aircraftType: string, serialNumber: number, cycles: number, hours: number, nowMs: number }} aircraft
 * @param {Array<{ itemRef: string }>} [melDeferrals]
 */
export function airworthinessGate(registry, aircraft, melDeferrals = []) {
  const applicable = registry
    .map((ad) => adsbApplies(ad, aircraft))
    .filter((r) => r.applies);

  const deferredRefs = new Set(melDeferrals.map((d) => d.itemRef));

  const overdue = [];
  const dueSoon = [];
  /** @type {string[]} */
  const illegalDeferralAttempts = [];

  for (const r of applicable) {
    const cs = r.complianceStatus;
    // An AD may never be recorded as deferred, whatever the operator
    // believes. Only a matching Service Bulletin is deferrable.
    const attempt = deferredRefs.has(cs.reference);
    cs.deferred = false;
    cs.deferralAttempted = attempt;

    if (cs.status === 'OVERDUE') {
      overdue.push(cs);
      if (attempt) illegalDeferralAttempts.push(cs.reference);
    } else if (cs.status === 'DUE_SOON') {
      dueSoon.push(cs);
    }
  }

  return {
    dispatchable: overdue.length === 0,
    applicableCount: applicable.length,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    overdue,
    dueSoon,
    illegalDeferralAttempts,
    nextDue: [...overdue, ...dueSoon].sort((a, b) => a.remainingPpm - b.remainingPpm)[0] ?? null,
  };
}''')

    story += CALLOUT(
        'bug', 'This is the most important design decision in the codebase',
        'Note that `cs.deferred = false` is assigned *unconditionally*. The '
        'system does not merely refuse to mark an overdue directive as '
        'deferred — it sets the flag to false regardless of what the operator '
        'requested. And when someone *has* attempted it, the reference is '
        'collected into `illegalDeferralAttempts` rather than being silently '
        'dropped.')

    story += P(
        'There is a meaningful difference here between a system that blocks an '
        'illegal action and a system that quietly ignores one. If the '
        'engineering team records a deferral against an overdue airworthiness '
        'directive, that is a signal that someone believes the aircraft is '
        'airworthy when it is not — or that someone is trying to record '
        'something that is not permitted. Both warrant investigation. Silently '
        'discarding the attempt would hide the first and enable the second.')

    story += H2('The dispatch gate')

    story += CODE(
        '''export function checkDue({ intervalHours, intervalCycles, hoursAtLastCheck,
    cyclesAtLastCheck, currentHours, currentCycles, utilisationHoursPerDay = 10 }) {
  const hoursUsed = currentHours - hoursAtLastCheck;
  const cyclesUsed = currentCycles - cyclesAtLastCheck;

  const hoursRemaining = intervalHours - hoursUsed;
  const cyclesRemaining = intervalCycles - cyclesUsed;

  // Which runs out first, expressed as calendar days at current rate?
  const daysToHoursLimit = utilisationHoursPerDay > 0
    ? Math.floor(hoursRemaining / utilisationHoursPerDay) : Number.MAX_SAFE_INTEGER;
  // ~1.4 average sectors per block hour on a narrowbody mainline.
  const sectorsPerHour = 1.4;
  const daysToCyclesLimit = sectorsPerHour > 0
    ? Math.floor(cyclesRemaining / (utilisationHoursPerDay * sectorsPerHour)) : Number.MAX_SAFE_INTEGER;

  const controlling = daysToHoursLimit <= daysToCyclesLimit ? 'HOURS' : 'CYCLES';
  const daysRemaining = Math.max(0, Math.min(daysToHoursLimit, daysToCyclesLimit));

  return {
    hoursRemaining, cyclesRemaining, daysRemaining, controllingCounter: controlling,
    status: daysRemaining <= 3 ? 'OVERDUE_OR_IMMINENT' : daysRemaining <= 21 ? 'DUE_SOON' : 'SCHEDULED',
  };
}''',
        'shared/src/airworthiness.js — converting two running counters into a '
        'planning date.')

    story += P(
        'The step worth understanding is the conversion from "hours remaining" '
        'to "days remaining". A check due in 90 block hours sounds distant; at '
        '10 hours a day it is 9 days away, which is a maintenance planning '
        'item right now. The comment attributes the 1.4 sectors-per-block-hour '
        'figure to narrowbody mainline operations — an assumption a reader can '
        'therefore challenge.')

    story += RULEHR()

    # ================= PART VIII =================
    story += H1('Part VIII — Routing and fuel planning (the algorithms)')

    story += LEAD(
        'This part covers the newest module in AMS, and the one with the '
        'strongest verification. It is also the longest, because route planning '
        'under a fuel constraint is genuinely hard.')

    story += H2('The problem, stated precisely')

    story += P(
        'An airline must decide which intermediate stops to use on a route. '
        'Every direct sector has a cost (crew, handling, overflight fees) and a '
        'fuel requirement. The aircraft can only carry a fixed amount of fuel, '
        'and must land with at least a mandatory reserve.')

    story += CODE(
        '''export function solveRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
  if (!Number.isSafeInteger(tankCapacityKg) || tankCapacityKg < 0) {
    throw new RoutingError('tankCapacityKg must be a non-negative integer', 'ROUTE_BAD_CAPACITY');
  }
  if (!Number.isSafeInteger(minReserveKg) || minReserveKg < 0) {
    throw new RoutingError('minReserveKg must be a non-negative integer', 'ROUTE_BAD_RESERVE');
  }

  const usableFuelKg = tankCapacityKg - minReserveKg;
  if (usableFuelKg < 0) {
    throw new RoutingError(
      `Tank capacity ${tankCapacityKg}kg cannot hold the ${minReserveKg}kg mandatory reserve. ` +
        'The aircraft can never complete any sector.',
      'ROUTE_CAPACITY_BELOW_RESERVE',
    );
  }''')

    story += P('In one sentence: **find the cheapest sequence of stops such that the fuel burned so far never exceeds capacity minus reserve.**')

    story += CODE(
        '''// A concrete case the planner must get right
JFK → YUL   38,000c   3,200 kg
YUL → GRU   74,000c   8,600 kg
JFK → GRU   61,000c  12,100 kg
JFK → DUB   22,000c   3,300 kg
DUB → GRU   89,000c  10,400 kg

Tank 24,000 kg, reserve 1,500 kg → 22,500 kg usable.''')

    story += TABLE(
        ['Route', 'Cost', 'Fuel', 'Fits in 22,500 kg?'],
        [
            ['JFK → GRU (direct)', '61,000c', '12,100 kg', 'Yes'],
            ['JFK → YUL → GRU', '112,000c', '11,800 kg', 'Yes'],
            ['JFK → DUB → GRU', '111,000c', '13,700 kg', 'Yes'],
        ],
        widths=[32, 16, 18, 34])

    story += P(
        'With that tank, the direct route wins on cost. Now tighten the tank to '
        '13,300 kg, giving 11,800 kg usable. The direct sector no longer fits, '
        'and the planner must take the *more expensive* two-stop route because '
        'the cheap one cannot be flown.')

    story += CODE(
        '''const tight = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU',
  tankCapacityKg: 13_300, minReserveKg: 1_500 });
tight.costCents   // 112000  — more expensive, but it is the only legal answer
tight.stops       // ['JFK', 'YUL', 'GRU']

const impossible = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU',
  tankCapacityKg: 13_299, minReserveKg: 1_500 });
impossible.feasible   // false — one kilogram less and nothing is legal''')

    story += H2('The naive approaches and why they fail')

    story += CODE(
        '''// Approach 1: find the cheapest route, ignore fuel
const unconstrained = unconstrainedCheapest(inst);   // 61,000c
// WRONG when the tank is tight. The aircraft cannot fly it.

// Approach 2: greedy — always take the cheapest next hop
// ALSO WRONG, and dangerously so. This counterexample is a test case
const inst = {
  flights: [
    { from: 'A', to: 'B', costCents: 10, fuelKg: 90 },
    { from: 'B', to: 'D', costCents: 10, fuelKg: 90 },
    { from: 'A', to: 'C', costCents: 11, fuelKg: 50 },
    { from: 'C', to: 'D', costCents: 11, fuelKg: 50 },
  ],
  source: 'A', destination: 'D',
  tankCapacityKg: 100, minReserveKg: 0,
};
const result = solveRoute(inst);
result.costCents   // 22
result.stops       // ['A', 'C', 'D']
// Greedy picks A-B-D at cost 20 — but that burns 180kg in a 100kg tank.
// A planner that returns that route grounds the aircraft.''')

    story += CALLOUT(
        'bug', 'Why the greedy failure is so instructive',
        'The greedy answer is *cheaper*. It is also impossible to fly. A '
        'planner that reported the greedy result would look better on every '
        'metric and would be catastrophically wrong. This is the shape of bug '
        'that no amount of dashboard review catches — the number looks right, '
        'because the question was never asked.')

    story += H2('Keeping only useful possibilities')

    story += CODE(
        '''/**
 * DOMINANCE
 *
 * The algorithm keeps a SET of non-dominated labels at each airport.
 * A label is a pair (cost, fuelUsed) meaning "I can reach this airport
 * having spent this much money and this much fuel".
 *
 * Label L1 dominates L2 if:
 *     cost1 <= cost2   AND   fuel1 <= fuel2
 * and they are not identical.
 *
 * Intuition: if L1 is cheaper AND uses no more fuel, then L2 can never
 * lead to a better answer. Wherever L2 could go from here, L1 can go
 * too, more cheaply, and with at least as much fuel in the tanks.
 */''')

    story += CODE(
        '''    while (heap.size > 0) {
      const label = /** @type {Label} */ (heap.pop());
      labelsExpanded += 1;

      // Skip if this label was pruned after being queued.
      const live = labelsAt(label.node);
      if (!live.includes(label)) { labelsPruned += 1; continue; }

      if (label.node === destination) {
        // The heap is ordered by cost, so the first label popped at the
        // destination is the cheapest surviving one — and by the theorem,
        // the optimum.
        return {
          feasible: true,
          costCents: label.costCents,
          fuelUsedKg: label.fuelUsedKg,
          stops: reconstructStops(label),
          labelsExpanded, labelsPruned, maxFrontier,
        };
      }

      const outgoing = adjacency.get(label.node) ?? [];
      for (const edge of outgoing) {
        const fuelUsedKg = label.fuelUsedKg + edge.fuelKg;
        if (fuelUsedKg > usableFuelKg) continue; // infeasible prefix — never expand

        const costCents = label.costCents + edge.costCents;
        const target = labelsAt(edge.to);

        let dominated = false;
        for (const other of target) {
          if (dominates(other.costCents, other.fuelUsedKg, costCents, fuelUsedKg)) {
            dominated = true; break;
          }
          if (other.costCents === costCents && other.fuelUsedKg === fuelUsedKg) {
            dominated = true; break;
          }
        }
        if (dominated) { labelsPruned += 1; continue; }

        // Is it dominating something already there? Remove those.
        for (let i = target.length - 1; i >= 0; i -= 1) {
          if (dominates(costCents, fuelUsedKg, target[i].costCents, target[i].fuelUsedKg)) {
            target.splice(i, 1);
          }
        }

        const next = { costCents, fuelUsedKg, node: edge.to, prev: label };
        target.push(next);
        if (target.length > maxFrontier) maxFrontier = target.length;
        heap.push(next);
      }
    }''',
        'shared/src/routing/constrained-path.js — the whole search loop.')

    story += H3('The data structures')

    story += CODE(
        '''class MinHeap {
  constructor() { /** @type {Array<{label: Label, seq: number}>} */ (this.a = []); this.seq = 0; }

  /** @param {Label} label */
  push(label) {
    const a = /** @type {any} */ (this.a);
    a.push({ label, seq: this.seq++ });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].label.costCents <= a[i].label.costCents) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = /** @type {any} */ (this.a);
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l].label.costCents < a[s].label.costCents) s = l;
        if (r < a.length && a[r].label.costCents < a[s].label.costCents) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top.label;
  }

  get size() { return /** @type {any} */ (this).a.length; }
}''',
        'A priority queue written from scratch rather than imported — twenty '
        'lines, no dependency, and it is the only structure the algorithm needs.')

    story += P(
        'A "heap" is a list arranged so the cheapest item is always at the top. '
        'The two arithmetic details worth recognising: `(i - 1) >> 1` finds the '
        'parent of position `i` in a binary tree stored in an array, and '
        '`2 * i + 1` finds its left child. That is the entire trick.')

    story += H2('The dominance rule and why it is sound')

    story += CODE(
        '''/**
 * Invariant I1 (reachability): every label in the frontier at v
 *   corresponds to an actual feasible path from the source to v.
 *
 * Invariant I2 (pruning soundness): if L1 dominates L2 at v, then for
 *   every feasible completion C of L2 to any destination, C composed
 *   with L1 is also feasible and no more expensive.
 *
 * Theorem: the algorithm returns the minimum-cost feasible path.
 *   Proof: Take an optimal feasible path P. Walk it from the source.
 *   Each prefix label is either in the frontier, or was pruned. If
 *   pruned, it was dominated by some retained L' which by I2 can replace
 *   that prefix with no increase in cost or fuel. Following I2
 *   inductively, a path of cost <= OPT(P) survives to the destination.
 *   By I1 every surviving label is feasible, so its cost >= OPT(P).
 *   Therefore the minimum-cost surviving label has cost exactly OPT(P).
 */''')

    story += LEAD(
        'Translated out of notation: because both the objective (cost) and '
        'the constraint (fuel) improve in the same direction, a worse label '
        'can never rescue a better one. That is what makes discarding labels '
        'safe, and it is the entire reason the algorithm is exact rather than a '
        'heuristic.')

    story += CALLOUT(
        'note', 'Why this is worth reading even if you never write it',
        'This is the standard of proof the module claims for itself, and it is '
        'written down rather than left implicit. When a qualified engineer '
        'reviews this code, this comment is what they check first: does the '
        'argument hold, and does the code match the argument? That question can '
        'only be asked if the argument was ever written down.')

    story += H2('A second solver to check the first')

    story += CODE(
        '''/**
 * EXACT reference solver by fuel-indexed dynamic programming.
 *
 * Independent of the Pareto algorithm, so agreement between the two is
 * strong evidence of correctness. DP requires integer fuel values and
 * bounded capacity, which is fine for verification and small networks
 * but not for a whole airline's route network — hence the two exist.
 */''')

    story += CODE(
        '''  /** @type {Map<string, Map<number, {costCents: number, prevNode: string | null, prevFuel: number | null}>>} */
  const best = new Map();

  /** @type {Array<Array<{node: string, ...}> | undefined>} */
  const buckets = [];
  buckets[0] = [{ node: source, costCents: 0, prevNode: null, prevFuel: null }];

  for (let f = 0; f <= usable; f += 1) {
    const bucket = buckets[f];
    if (!bucket) continue;
    for (const state of bucket) {
      for (const edge of adjacency.get(state.node) ?? []) {
        const nf = f + edge.fuelKg;
        if (nf > usable) continue;
        const nc = state.costCents + edge.costCents;
        // ...
      }
    }
  }''')

    story += P(
        'The idea is simpler: work through every possible amount of fuel that '
        'could have been burned, from zero upwards. Because fuel never '
        'decreases along a route, this is a valid order to process things in. '
        'For each fuel level, record the cheapest way to reach each airport.')

    story += CALLOUT(
        'bug', 'The bug this solver had, and why two solvers are worth having',
        'The DP originally recorded, for each state, the airport it had '
        '*departed* from rather than the one it had *arrived* at. Every '
        'subsequent step therefore re-expanded the wrong airport\'s outgoing '
        'flights. The consequence was that the DP reported routes as infeasible '
        'that the primary solver had found — and nobody noticed, because '
        'nothing compared the two.')

    story += P(
        'This is the strongest argument in this guide for how AMS tests '
        'algorithms, and it is worth stating plainly: **a second '
        'implementation is only useful if something forces them to agree.** '
        'Two solvers that disagree and are never compared provide no more '
        'assurance than one.')

    story += H2('Brute force as an oracle')

    story += CODE(
        '''/**
 * Exhaustive enumerator over every simple path. Exponential, used ONLY
 * to validate the fast algorithms on small instances.
 */''')

    story += CODE(
        '''export function bruteForceRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
  const adjacency = buildAdjacency(flights);
  let bestCost = Infinity;
  let bestStops = /** @type {string[] | null} */ (null);
  let explored = 0;

  const walk = (node, fuel, cost, path) => {
    explored += 1;
    if (cost >= bestCost) return;                     // cannot improve
    if (fuel > usable) return;                        // already infeasible
    if (node === destination) {
      bestCost = cost; bestStops = [...path, node]; return;
    }
    for (const e of adjacency.get(node) ?? []) {
      if (path.includes(e.to)) continue;              // simple paths only
      walk(e.to, fuel + e.fuelKg, cost + e.costCents, [...path, node]);
    }
  };

  walk(source, 0, 0, [source]);
  return { feasible: bestStops !== null, costCents: bestCost === Infinity ? 0 : bestCost,
    stops: bestStops, pathsExplored: explored };
}''')

    story += P(
        'This solver tries every possible route, which is astronomically '
        'expensive on a real network and completely reliable on a small one. '
        'It is correct by construction — there is no cleverness in it to be '
        'wrong. That makes it an *oracle*: if the fast algorithm agrees with '
        'brute force on thousands of random networks, and brute force is '
        'obviously right, the fast algorithm is right.')

    story += CODE(
        '''describe('constrained shortest path — three independent solvers agree', () => {
  it('agrees with the exhaustive oracle on 3000 random instances', () => {
    let compared = 0;
    let feasible = 0;
    for (let seed = 1; seed <= 3000; seed += 1) {
      const rand = mulberry32(seed * 2654435761);
      const inst = randomInstance(rand, int(rand, 2, 6));
      if (inst.flights.length === 0) continue;

      const pareto = solveRoute(inst);
      const oracle = bruteForceRoute(inst);

      compared += 1;
      if (oracle.feasible) feasible += 1;

      expect(pareto.feasible, `seed ${seed}: feasibility must match oracle`).toBe(oracle.feasible);
      if (oracle.feasible) {
        expect(pareto.costCents, `seed ${seed}: optimal cost must match oracle`).toBe(oracle.costCents);
        const { cost } = assertRouteLegal(inst, pareto.stops);
        expect(cost, `seed ${seed}: reported cost must equal the sum of its own legs`).toBe(pareto.costCents);
      }
    }
    expect(compared).toBeGreaterThan(2500);
    // The test is worthless if every instance was trivially infeasible.
    expect(feasible / compared).toBeGreaterThan(0.3);
  });
});''',
        'tests/routing.test.js — the test that would have caught the DP bug '
        'and, in its current form, catches much else.')

    story += H3('Making random tests reproducible')

    story += CODE(
        '''function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}''',
        'tests/routing.test.js — a small pseudo-random number generator so '
        'that "seed 3" always produces the same test case.')

    story += CALLOUT(
        'note', 'Why reproducibility is a requirement',
        'Without a seeded generator, a random test failure is unreproducible '
        'and therefore nearly useless. With one, "seed 3 fails" is a permanent, '
        'shareable, permanent regression case. Every random test in AMS names '
        'the seed in its failure message.')

    story += H3('Guarding against a vacuous test')

    story += CODE(
        '''      compared += 1;
      if (oracle.feasible) feasible += 1;
      // ...
    }
    expect(compared).toBeGreaterThan(2500);
    // The test is worthless if every instance was trivially infeasible.
    expect(feasible / compared).toBeGreaterThan(0.3);''')

    story += P(
        'That last assertion is subtle and important. If a change to the '
        'instance generator produced only infeasible networks, every comparison '
        'would trivially pass — because both solvers would correctly report '
        '"no route" — and the test would prove nothing while reporting green. '
        'The assertion forces the test to confirm it is actually exercising '
        'interesting cases.')

    story += CODE(
        '''describe('the fuel constraint actually binds', () => {
  it('finds many instances where the unconstrained shortest path is INFEASIBLE', () => {
    let disagreements = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      // ...
      if (constrained.feasible && constrained.costCents > unconstrained) disagreements += 1;
    }
    // A naive Dijkstra would be wrong this often. Proof the constraint matters.
    expect(disagreements).toBeGreaterThan(50);
  });
});''',
        'tests/routing.test.js — a test whose job is to prove the *other* tests '
        'are meaningful.')

    story += CALLOUT(
        'good', 'This is the shape of a mature test suite',
        'It includes a test that verifies its own test data is interesting. '
        'Most suites omit this and can silently become decoration. The comment '
        'in the file says exactly that: if these ever stop finding instances, '
        'the suite has silently become vacuous, and a regression that dropped '
        'the fuel constraint would pass every other test in the file.')

    story += H2('Optimal uplift planning')

    story += CODE(
        '''/**
 * THE THEOREM
 *
 * For a fixed route with LINEAR price per kg, capacity T and reserve R
 * required at every landing, the cost-optimal uplift policy is:
 *
 *   At stop i, let k = the first stop after i whose price is strictly
 *   cheaper than the price at i.
 *
 *     - If such a k exists: uplift only enough to reach k with the
 *       reserve intact. Buying more is waste, because p_k < p_i.
 *       Buying less is strictly more expensive.
 *
 *     - If no such k exists (every remaining stop is dearer, or we can
 *       reach the destination in one tank): buy as much as is still
 *       needed, filling the tank only if the remainder of the route
 *       does not fit.
 *
 * PROOF BY EXCHANGE
 * ...
 * This is verified independently against exhaustive search in
 * the test suite.
 */''',
        'shared/src/routing/refuel.js')

    story += P('A worked example. Route JFK → YUL → GRU, with MAN-style prices:')

    story += CODE(
        '''// JFK sells at 95c/kg, MAN at 70c/kg, and GRU is the destination.
const plan = optimalRefuelPlan({
  stops: ['JFK', 'MAN', 'GRU'],
  legFuelKg: [3200, 8600],
  priceCentsPerKg: [95, 70, 88],
  tankCapacityKg: 24_000,
  reserveKg: 1_500,
});
plan.upliftsKg          // [4700, 8600]
plan.totalCostCents    // 4700*95 + 8600*70 = 1_048_500''')

    story += TABLE(
        ['Stop', 'Price', 'Arriving with', 'Buy', 'Why'],
        [
            ['JFK', '95c', '0 kg', '4,700 kg',
             'MAN at 70c is cheaper — buy only enough to reach it '
             '(3,200 leg + 1,500 reserve)'],
            ['MAN', '70c', '1,500 kg', '8,600 kg',
             'Nothing cheaper ahead — buy what the rest of the route needs'],
            ['GRU', '—', '1,500 kg', '—', 'Arrival'],
        ],
        widths=[11, 10, 16, 13, 50])

    story += P(
        'If JFK had loaded all 13,300 kg for the whole journey, the cost would '
        'be 1,263,500 cents instead of 1,048,500 — 17% more, for no benefit. '
        'The planner correctly refuses to tanker past the cheap station.')

    story += H3('The destination price trap')

    story += CODE(
        '''// GRU has the LOWEST price of the three nodes — but you cannot buy
// fuel on arrival, so its price must not influence any decision.
const plan = optimalRefuelPlan({
  stops: ['JFK', 'YUL', 'GRU'],
  legFuelKg: [3200, 8600],
  priceCentsPerKg: [95, 110, 88],
  tankCapacityKg: 24_000,
  reserveKg: 1_500,
});
plan.upliftsKg   // [13_300, 0]  — all loaded at JFK, the cheaper station''')

    story += CALLOUT(
        'bug', 'A test that encodes a subtle modelling decision',
        'The destination price is in the array, is the lowest value, and is '
        'deliberately ignored. The code comment says why: "the destination '
        'entry is ignored". A test originally asserted the planner would stop '
        'at GRU because it looked cheap — which was wrong, and the test was '
        'the thing that had to change, not the code. This is a small example of '
        'a recurring theme: a plausible-looking expectation is not the same '
        'thing as a correct one.')

    story += H2('Proving the uplift policy is optimal')

    story += CODE(
        ''' * PROOF BY EXCHANGE
 * -----------------
 * Fix a stop i and suppose k = next cheaper stop exists.
 *
 *   Under-buying: if the policy departs i with less fuel than needed to
 *   reach k, the shortfall must be bought at some stop j with i < j <= k
 *   (feasibility forbids running dry). Every such j has p_j >= p_i, since
 *   k is the FIRST stop cheaper than i. Moving that purchase from j back
 *   to i cannot raise cost. It also cannot breach capacity: the shifted
 *   amount is exactly the shortfall, and the aircraft was already
 *   carrying more than the shortfall at i by hypothesis. Hence
 *   under-buying is never optimal.
 *
 *   Over-buying: if the policy carries past i more fuel than needed to
 *   reach k, that surplus is consumed at a stop with p_k < p_i.
 *   Buying it at k instead is strictly cheaper. Capacity at i is not
 *   violated because we are removing, not adding. Hence over-buying is
 *   never optimal.
 *
 *   No cheaper stop ahead: then p_j >= p_i for all j > i. Every kilogram
 *   bought later can be bought at i for no greater price, subject to
 *   capacity. So buy the whole remaining requirement now; fill the tank
 *   only when the remainder does not fit.
 *
 * The three cases exhaust the possibilities, so the myopic policy is
 * optimal.''')

    story += LEAD(
        'Read plainly: if you buy too little at a stop, you will have to buy '
        'the shortfall somewhere more expensive later, so you should have '
        'bought it here. If you buy too much, you are carrying fuel that will '
        'be consumed somewhere cheaper, so you should have bought it there. '
        'The only defensible quantity is the minimum needed to reach the next '
        'cheaper station. There is nothing subtle here, which is why it is '
        'worth understanding.')

    story += CODE(
        '''describe('refuel — myopic policy versus exhaustive search', () => {
  it('matches the oracle on 2000 random routes', () => {
    let compared = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const rand = mulberry32(seed * 48271 + 31);
      const legs = int(rand, 1, 3);
      const args = {
        stops: Array.from({ length: legs + 1 }, (_, i) => `S${i}`),
        legFuelKg: Array.from({ length: legs }, () => int(rand, 1, 9)),
        priceCentsPerKg: Array.from({ length: legs + 1 }, () => int(rand, 1, 4) * 25),
        reserveKg: int(rand, 0, 2),
        tankCapacityKg: /* ... */,
      };
      const mine = optimalRefuelPlan(args);
      const oracle = bruteForceRefuel(args);
      expect(mine.totalCostCents).toBe(oracle.totalCostCents);
    }
  });
});''',
        'tests/routing.test.js — 2,000 random routes, each checked against '
        'exhaustive search over every possible uplift combination.')

    story += H2('The five real bugs these tests caught')

    story += CODE(
        '''// The infinite loop, found because the test suite hung:
      //
      // The duplicate check is not cosmetic. A zero-cost, zero-fuel cycle
      // produces a label identical to one already present. Identical
      // labels do not strictly dominate one another, so without this the
      // planner re-queues the same (cost, fuel) pair forever and never
      // terminates.''')

    story += P('Part XIII covers all of these in detail. The list here is so '
               'that the reader of this part knows the module was hard to get '
               'right.')

    story += TABLE(
        ['#', 'Defect', 'How it was found'],
        [
            ['1', 'Infinite loop on zero-cost, zero-fuel cycles',
             'Test suite hung; timeout after 5 minutes'],
            ['2', 'Reference solver recorded the departure airport instead of '
             'the arrival airport', 'Cross-check against the primary solver'],
            ['3', '`requiredAtDeparture` under-fuelled the first departure',
             'Cross-check against exhaustive search'],
            ['4', 'The feasibility check demanded the whole route fit in the '
             'tanks', 'Cross-check against exhaustive search'],
            ['5', 'A test expectation encoded the same bug as the code',
             'The code was corrected and the test corrected with it'],
        ],
        widths=[6, 47, 47])

    story += CALLOUT(
        'good', 'The honest lesson from defect 5',
        'In one case the implementation and its test were wrong in exactly the '
        'same way, so the test passed and confirmed the bug. This is not a rare '
        'edge case — it is the normal failure mode of testing something against '
        'your own model of how it should behave. It is why AMS tests algorithms '
        'against *independent implementations* and *exhaustive search* rather '
        'than against expected values written by the same person who wrote the '
        'code.')

    story += H3('Scale')

    story += CODE(
        '''it('plans a 400-airport network with 6,000 sectors in well under a second', () => {
    const N = 400;
    const flights = [];
    for (let i = 0; i < N; i += 1) {
      const degree = int(rand, 3, 18);
      for (let d = 0; d < degree; d += 1) {
        const to = int(rand, 0, N - 1);
        if (to === i) continue;
        flights.push({
          from: nodes[i], to: nodes[to],
          costCents: int(rand, 1_000, 900_000),
          // Fuel is uncorrelated with cost, so cost/fuel trade-offs are real.
          fuelKg: int(rand, 500, 12_000),
        });
      }
    }

    const t0 = performance.now();
    const result = solveRoute({
      flights, source: nodes[0], destination: nodes[N - 1],
      tankCapacityKg: 45_000, minReserveKg: 1_500,
    });
    const elapsed = performance.now() - t0;

    expect(result.feasible).toBe(true);
    expect(elapsed).toBeLessThan(1000);
});''')

    story += P(
        'The comment on fuel being uncorrelated with cost is deliberate. If '
        'fuel happened to correlate with cost in the generated data, the '
        'dominance rule would rarely need to keep more than one label per '
        'airport, and the interesting behaviour would never be exercised. Test '
        'data has to be built to be adversarial to the algorithm\'s shortcuts.')

    story += RULEHR()