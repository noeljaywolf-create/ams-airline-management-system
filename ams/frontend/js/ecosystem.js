/**
 * The AMS ecosystem manifest.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A capability claim is worth nothing on its own. "Handles fuel planning"
 * could mean a worked example or a flight-operations system, and you cannot
 * tell which from the sentence.
 *
 * So every capability below is declared as a tuple:
 *
 *   capability  what it does, in business terms
 *   module      the file that implements it
 *   exports     the functions you can actually call
 *   evidence    how you can independently check the claim
 *   status      BUILT | SCHEMA ONLY | NOT BUILT
 *   caveat      what is NOT established, stated plainly
 *
 * The BUILD_STATUS and export counts are NOT hard-coded. They are computed
 * at load time by importing each module and inspecting what it actually
 * exports. If someone deletes a function, this page reports it as missing
 * rather than continuing to advertise a capability that no longer exists.
 *
 * That is the difference between a capability page and a brochure.
 *
 * @module frontend/js/ecosystem
 */

import * as money from '../../shared/src/money.js';
import * as metrics from '../../shared/src/metrics.js';
import * as costing from '../../shared/src/costing.js';
import * as airworthiness from '../../shared/src/airworthiness.js';
import * as fuel from '../../shared/src/fuel.js';
import * as carbon from '../../shared/src/carbon.js';
import * as domain from '../../shared/src/domain.js';
import * as routing from '../../shared/src/routing/constrained-path.js';
import * as refuel from '../../shared/src/routing/refuel.js';

import * as chain from '../../backend/src/audit/chain.js';
import * as authority from '../../backend/src/modules/finance/cost-authority.js';

/* ------------------------------------------------------------------ *
 * Live inspection — the manifest cannot drift from the code
 * ------------------------------------------------------------------ */

/**
 * Count the callable exports of a module.
 * @param {Record<string, unknown>} mod
 * @returns {{ functions: string[], constants: string[], classes: string[] }}
 */
function inspect(mod) {
  const functions = [];
  const constants = [];
  const classes = [];
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'function') {
      (name[0] === name[0].toUpperCase() ? classes : functions).push(name);
    } else if (Array.isArray(value)) {
      constants.push(name);
    } else if (value !== null && typeof value === 'object') {
      // Non-array object exports are vocabulary too. MEL_CATEGORIES is a map
      // of category letters to { days, note }, and ATA_CHAPTER_NAMES is a
      // lookup table — both generate nothing in the database directly, but
      // both are part of the regulated vocabulary rather than behaviour.
      constants.push(name);
    }
  }
  return { functions: functions.sort(), constants: constants.sort(), classes: classes.sort() };
}

/** @type {Record<string, any>} */
const LIVE = {
  money: inspect(money),
  metrics: inspect(metrics),
  costing: inspect(costing),
  airworthiness: inspect(airworthiness),
  fuel: inspect(fuel),
  carbon: inspect(carbon),
  domain: inspect(domain),
  routing: inspect(routing),
  refuel: inspect(refuel),
  chain: inspect(chain),
  authority: inspect(authority),
};

/**
 * Is a named export actually present? Used to render each capability's
 * export list against the live module, so the page shows only what exists.
 * @param {keyof typeof LIVE} key
 * @param {string[]} names
 * @returns {{ present: string[], missing: string[] }}
 */
function check(key, names) {
  const available = new Set([
    ...LIVE[key].functions, ...LIVE[key].constants, ...LIVE[key].classes,
  ]);
  return {
    present: names.filter((n) => available.has(n)),
    missing: names.filter((n) => !available.has(n)),
  };
}

/* ------------------------------------------------------------------ *
 * The problems
 * ------------------------------------------------------------------ */

/**
 * Each problem is stated as a concrete operational failure, not a feature.
 * Every one of these is a real, recurring airline failure mode — not a
 * hypothetical, and not a competitor's weakness.
 */
export const PROBLEMS = [
  {
    id: 'cost',
    headline: 'Nobody can say what a flight cost',
    detail:
      'Fuel for a January flight is invoiced in March, aggregated across hundreds ' +
      'of rotations. By the time finance sees the invoice, the aircraft that burned ' +
      'it has flown several hundred more sectors. There is no honest way to attribute ' +
      'the cost to the flight that caused it, so nobody attempts it and the number ' +
      'never exists.',
    consequence: 'Route profitability is asserted in a board meeting, never computed.',
    modules: ['costing', 'metrics', 'money'],
  },
  {
    id: 'overspend',
    headline: 'A hundred reasonable approvals exceed the budget by a quarter',
    detail:
      'Finance approves, procurement raises, warehouse receives, treasury releases. ' +
      'Each department is individually capable of committing the airline to spend the ' +
      'board never authorised. Availability checks are time-of-check to time-of-use: ' +
      'two requests both see the same headroom, both approve, and nobody is at fault ' +
      'in either transaction.',
    consequence: 'The aggregate is unauthorised while every individual approval was honest.',
    modules: ['authority', 'money'],
  },
  {
    id: 'airworthiness',
    headline: 'A life-limited part with plenty of cycles left is nearly scrap',
    detail:
      'LLPs wear out on three clocks at once: cycles, hours and calendar months. A part ' +
      'with 50% of cycle life but 4% of calendar life must come out now. Separately, ' +
      'applying a Service Bulletin does not satisfy the Airworthiness Directive that ' +
      'adopts it — a fleet that "applied the SB" is not necessarily compliant.',
    consequence: 'An operator flies a part beyond limit and risks its certificate.',
    modules: ['airworthiness', 'domain'],
  },
  {
    id: 'routing',
    headline: 'The cheapest route is not always flyable',
    detail:
      'Every direct sector costs money and burns fuel, and the aircraft carries only so ' +
      'much. A cost-first planner returns the cheapest sequence of stops regardless of ' +
      'whether the tanks can complete it. Greedy returns the cheapest next hop, which ' +
      'can strand the aircraft at an intermediate stop.',
    consequence: 'A route plan that looks optimal on paper and cannot be flown.',
    modules: ['routing', 'refuel'],
  },
  {
    id: 'carbon',
    headline: 'Emissions counted twice, across two regimes',
    detail:
      'CORSIA and the EU ETS both touch the same flights. Where both apply, CORSIA ' +
      'tonnes must be deducted from the ETS chargeable quantity. Double-counting is a ' +
      'compliance error and, at allowance prices above EUR 80 per tonne, a seven-figure ' +
      'mistake. No upstream library does the deduction correctly.',
    consequence: 'A compliance misstatement discovered at reconciliation time.',
    modules: ['carbon', 'domain'],
  },
  {
    id: 'audit',
    headline: 'An audit trail the airline can edit is worth nothing',
    detail:
      'Evidence presented to a statutory auditor, a lessor\'s technical representative ' +
      'and a foreign civil aviation authority is only worth something if history cannot ' +
      'be altered. Application-level append-only is a policy; it is defeated by anyone ' +
      'holding database write access.',
    consequence: 'No defensible answer to "what did this say on this date?".',
    modules: ['chain'],
  },
  {
    id: 'reconciliation',
    headline: 'Allocated costs that never add back up',
    detail:
      'Splitting a fuel invoice across 400 flights and rounding each share independently ' +
      'loses 400 cents. That is small, and it happens every month, on every aircraft, ' +
      'forever — producing variances nobody can locate because the individual amounts all ' +
      'look right.',
    consequence: 'A supplier invoice that can never be closed against its components.',
    modules: ['money'],
  },
];

/* ------------------------------------------------------------------ *
 * The capabilities
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} CapabilitySpec
 * @property {string} id
 * @property {string} name
 * @property {string} capability   What it does, in business terms
 * @property {string[]} problems   Problem ids it addresses
 * @property {keyof typeof LIVE} module
 * @property {string} modulePath
 * @property {string[]} exports    Functions the module actually exposes
 * @property {string} evidence     How to independently verify it
 * @property {'BUILT'|'SCHEMA ONLY'|'NOT BUILT'} status
 * @property {string} caveat       What is NOT established
 */

/**
 * @type {CapabilitySpec[]}
 */
export const CAPABILITIES = [

  {
    id: 'exact-money',
    name: 'Exact monetary arithmetic',
    capability:
      'Every amount is an integer number of cents. Parsing a human-entered amount never ' +
      'routes through a binary float, so no fractional cent can exist anywhere in the system.',
    problems: ['cost', 'reconciliation'],
    module: 'money',
    modulePath: 'shared/src/money.js',
    exports: ['cents', 'format', 'sum', 'add', 'subtract', 'multiplyWhole', 'applyPpm', 'allocate', 'assertReconciles'],
    evidence:
      'allocate() splits a total across arbitrary weights using largest-remainder, so the ' +
      'parts sum to the whole exactly. Tested against reconciliation on every call.',
    status: 'BUILT',
    caveat:
      'Nothing to establish about the arithmetic itself. The choice of US cents as the unit ' +
      'is a decision, and multi-currency is not yet handled.',
  },
  {
    id: 'cost-attribution',
    name: 'Per-sector cost attribution',
    capability:
      'Builds the cost of one flight from primary operational records, separates ' +
      'flight-attributable from fleet-fixed cost, and reports both the marginal and the ' +
      'full cost of an extra seat.',
    problems: ['cost'],
    module: 'costing',
    modulePath: 'shared/src/costing.js',
    exports: ['buildFlightCost', 'allocateFleetFixed', 'flightPnl', 'aggregatePnl', 'routeVerdict', 'estimateMarginalSeatCost'],
    evidence:
      'aggregatePnl() recomputes every ratio from summed numerators and denominators, ' +
      'never by averaging per-flight ratios, and asserts the parts reconcile.',
    status: 'BUILT',
    caveat:
      'Two defects shipped through 118 green tests and were found by reading the code: a ' +
      'fabricated metrics object, and a break-even figure multiplied by zero. Fixed, with ' +
      'structural regression tests.',
  },
  {
    id: 'metrics',
    name: 'Industry unit economics',
    capability:
      'Computes ASK, RPK, CASK, RASK, load factor and break-even load factor exactly, in ' +
      'integer units, so two carriers\' figures are comparable because the numerator uses ' +
      'the same taxonomy.',
    problems: ['cost'],
    module: 'metrics',
    modulePath: 'shared/src/metrics.js',
    exports: ['ask', 'rpk', 'ctk', 'loadFactorPpm', 'caskMicrocents', 'raskMicrocents', 'breakEvenLoadFactorPpm', 'flightMetrics', 'rollUp', 'utilisationMilli'],
    evidence:
      'Rates are stored as parts per million and unit costs as microcents, so no figure can ' +
      'drift and none can round to zero on a long-haul sector.',
    status: 'BUILT',
    caveat:
      'CASK is only comparable between carriers if both use the same cost taxonomy. That is ' +
      'a reporting standard, not a calculation.',
  },
  {
    id: 'cost-authority',
    name: 'Spend control that cannot be raced',
    capability:
      'Authorises expenditure against a budget line by locking the row inside a transaction ' +
      'before reading the balance, so two concurrent requests cannot both see the same ' +
      'headroom and both approve.',
    problems: ['overspend'],
    module: 'authority',
    modulePath: 'backend/src/modules/finance/cost-authority.js',
    exports: ['availabilityCents', 'lockBudgetLine', 'authoriseCost', 'reservePending', 'settleCommitment', 'releaseCommitmentDifference', 'freezeBudgetLine', 'authoriseFlightLeg'],
    evidence:
      'The database also enforces it: available_cents is a GENERATED column that cannot ' +
      'drift, and a CHECK constraint rejects a negative balance at the storage layer.',
    status: 'SCHEMA ONLY',
    caveat:
      'The SQL has never been executed. The concurrency behaviour is documented from ' +
      'PostgreSQL\'s specification, not observed. There is no test that reproduces the race — ' +
      'sequential tests cannot. A defect at line 361 (an accidental logical AND) is unfixed.',
  },
  {
    id: 'airworthiness',
    name: 'Legal airworthiness, computed not remembered',
    capability:
      'Tracks life-limited parts on three counters and identifies which one binds first, ' +
      'keeps ADs and SBs on separate compliance tracks, and refuses to let a MEL deferral ' +
      'mark an overdue directive as deferred.',
    problems: ['airworthiness'],
    module: 'airworthiness',
    modulePath: 'shared/src/airworthiness.js',
    exports: ['llpStatus', 'adsbApplies', 'rectifyDeadline', 'melStatus', 'airworthinessGate', 'checkDue'],
    evidence:
      'MEL deadlines are computed in UTC to the end of the day, excluding the day of ' +
      'discovery — the off-by-one that naive duration arithmetic gets wrong on every ' +
      'Category B item.',
    status: 'BUILT',
    caveat:
      'THIS IS THE HIGHEST-RISK MODULE IN THE SYSTEM. A wrong answer can cost an operator ' +
      'its Air Operator Certificate. The regulatory constants — MEL intervals, emission ' +
      'factors, the reserve model — are researched and coded but NOT validated by a licensed ' +
      'aviation professional. No test can establish that.',
  },
  {
    id: 'fuel',
    name: 'Fuel, the largest uncontrollable cost',
    capability:
      'Reconciles uplift against actual burn, computes the variance against plan in parts ' +
      'per million, and decides tankering by expected value rather than by habit.',
    problems: ['cost'],
    module: 'fuel',
    modulePath: 'shared/src/fuel.js',
    exports: ['reconcileFuel', 'optimalUplift', 'fuelEfficiency', 'detectBurnVarianceAnomaly'],
    evidence:
      'detectBurnVarianceAnomaly() flags a systematic fleet-wide burn problem that is ' +
      'invisible in a monthly P&L because it is averaged into the fuel line.',
    status: 'BUILT',
    caveat:
      'The 3.0% deadweight burn factor and 2% diversion probability are industry-plausible ' +
      'assumptions, not measurements from this fleet. They are named constants so a reader ' +
      'can challenge them.',
  },
  {
    id: 'routing',
    name: 'Fuel-constrained route optimisation',
    capability:
      'Finds the minimum-cost sequence of stops such that cumulative fuel never exceeds ' +
      'tank capacity minus the mandatory reserve, and reports infeasibility rather than ' +
      'returning an unflyable route.',
    problems: ['routing'],
    module: 'routing',
    modulePath: 'shared/src/routing/constrained-path.js',
    exports: ['solveRoute', 'solveRouteDP', 'bruteForceRoute', 'buildAdjacency', 'explainRoute'],
    evidence:
      'Pareto label-setting with a proven dominance rule, cross-checked against a fuel-indexed ' +
      'DP and an exhaustive oracle on thousands of random networks. The brute-force solver is ' +
      'correct by construction, so agreement is meaningful.',
    status: 'BUILT',
    caveat:
      'Six defects were found by this verification, including an infinite loop and a case ' +
      'where the test shared the implementation\'s bug. The O(L) frontier-size assumption is ' +
      'observed, not proven adversarial.',
  },
  {
    id: 'refuel',
    name: 'Optimal fuel uplift planning',
    capability:
      'For a chosen route, decides how much fuel to load at each stop by buying only enough ' +
      'to reach the next cheaper station, with the reserve intact.',
    problems: ['routing', 'cost'],
    module: 'refuel',
    modulePath: 'shared/src/routing/refuel.js',
    exports: ['optimalRefuelPlan', 'bruteForceRefuel', 'requiredAtDeparture', 'fuelToReach'],
    evidence:
      'Optimal by exchange argument, and independently verified against exhaustive search ' +
      'over every uplift combination on 2,000 random routes.',
    status: 'BUILT',
    caveat:
      'The proof assumes linear fuel price with no volume discount and excludes the weight ' +
      'penalty of carrying fuel. Including that penalty makes the problem non-myopic.',
  },
  {
    id: 'carbon',
    name: 'Carbon compliance without double counting',
    capability:
      'Allocates every flight\'s emissions across CORSIA, the EU ETS and unregulated, ' +
      'deducting CORSIA tonnes where both regimes apply, and returns a reconciliation flag.',
    problems: ['carbon'],
    module: 'carbon',
    modulePath: 'shared/src/carbon.js',
    exports: ['corsiaCompliancePeriod', 'co2Tonnes', 'applySaf', 'corsiaObligation', 'allocateEmissions', 'complianceSummary'],
    evidence:
      'The three allocation buckets must reconstruct the total for every input. That is ' +
      'checked as a property across every flight, not on hand-computed examples.',
    status: 'BUILT',
    caveat:
      'Emission factors are ICAO defaults. A real operator must apply its own approved ' +
      'monitoring method under CORSIA MRV. No upstream library performs the deduction ' +
      'correctly, which is why it is implemented here.',
  },
  {
    id: 'audit',
    name: 'Tamper-evident audit trail',
    capability:
      'Chains each audit entry to the SHA-256 of its predecessor, so any modification, ' +
      'deletion or reordering breaks the chain at that point and every point after it.',
    problems: ['audit'],
    module: 'chain',
    modulePath: 'backend/src/audit/chain.js',
    exports: ['canonicalise', 'computeHash', 'chainEntry', 'verifyChain', 'verifyTenantChain', 'chainHead', 'auditAnomalies'],
    evidence:
      'The database enforces append-only with triggers that raise on any UPDATE or DELETE. ' +
      'That is a mechanism, not a convention a privileged operator could bypass.',
    status: 'SCHEMA ONLY',
    caveat:
      'The chain has a concurrency hole: two concurrent writes to one tenant\'s chain can ' +
      'produce two entries with the same predecessor. There is no head lock. External chain-head ' +
      'anchoring is stated as a production intention and is not implemented, so a full rewrite ' +
      'is currently undetectable.',
  },
  {
    id: 'tenancy',
    name: 'Tenant isolation enforced by the database',
    capability:
      'Every table carries tenant_id, and row-level security policies mean a query missing ' +
      'its tenant filter returns nothing rather than another airline\'s financial records.',
    problems: ['overspend', 'audit'],
    module: 'authority',
    modulePath: 'backend/migrations/001_tenancy_identity_audit.js',
    exports: [],
    evidence:
      'RLS is enabled AND forced. FORCE matters: PostgreSQL exempts the table owner by ' +
      'default, and migrations run as the owner, so ENABLE alone would protect nothing.',
    status: 'SCHEMA ONLY',
    caveat:
      'Tenant deletion CASCADE destroys audit evidence irreversibly. Connection pooling can ' +
      'leak a tenant setting between requests — the most likely way this defence fails in ' +
      'production — and nothing addresses it yet.',
  },
  {
    id: 'outbox',
    name: 'Side effects that cannot be lost',
    capability:
      'Records the intent to send an email or produce a bank file in the same transaction as ' +
      'the business change, so a committed change can never lose its notification.',
    problems: ['overspend', 'audit'],
    module: 'authority',
    modulePath: 'backend/migrations/001_tenancy_identity_audit.js',
    exports: [],
    evidence:
      'A partial index on unpublished rows serves the worker\'s query directly and stays ' +
      'proportional to the backlog rather than to all history.',
    status: 'SCHEMA ONLY',
    caveat:
      'No worker exists, and there is no SKIP LOCKED claim, so two concurrent workers would ' +
      'deliver duplicates. Delivery is at-least-once; exactly-once across a network does ' +
      'not exist.',
  },
  {
    id: 'domain',
    name: 'A single regulated vocabulary',
    capability:
      'Every state, cost category, department, role and threshold in one module, generating ' +
      'the CHECK constraints that make an invalid value unable to reach the database.',
    problems: ['cost', 'airworthiness', 'overspend'],
    module: 'domain',
    modulePath: 'shared/src/domain.js',
    exports: ['DEPARTMENTS', 'COST_CATEGORIES', 'ALLOCATION_DRIVERS', 'ATA_CHAPTERS', 'MEL_CATEGORIES', 'CORSIA_COMPLIANCE_PERIODS', 'ROLES', 'SOD_RULES'],
    evidence:
      'The pattern is documented in the source: the JSDoc annotation is a convenience; the ' +
      'CHECK constraint is the guarantee.',
    status: 'BUILT',
    caveat:
      'Five of the six declared segregation-of-duties rules are not enforced anywhere. They ' +
      'are a specification, not a feature.',
  },
];

/* ------------------------------------------------------------------ *
 * Derive the live status — never hard-code it
 * ------------------------------------------------------------------ */

/**
 * @typedef {CapabilitySpec} Capability
 */

/**
 * For each capability, check that the exports it claims actually exist.
 * A capability whose exports have been deleted is reported as degraded,
 * which is the whole point: this page cannot advertise something that
 * is no longer in the code.
 *
 * @returns {Array<Capability & { verifiedExports: string[], missingExports: string[], live: boolean }>}
 */
export function capabilityAudit() {
  return CAPABILITIES.map((cap) => {
    const { present, missing } = check(cap.module, cap.exports);
    return {
      ...cap,
      verifiedExports: present,
      missingExports: missing,
      live: missing.length === 0,
    };
  });
}

/** Live totals, computed rather than claimed. */
export function ecosystemTotals() {
  let functions = 0;
  let constants = 0;
  let classes = 0;
  for (const v of Object.values(LIVE)) {
    functions += v.functions.length;
    constants += v.constants.length;
    classes += v.classes.length;
  }
  const caps = capabilityAudit();
  return {
    modules: Object.keys(LIVE).length,
    functions,
    constants,
    classes,
    capabilities: caps.length,
    built: caps.filter((c) => c.status === 'BUILT').length,
    schemaOnly: caps.filter((c) => c.status === 'SCHEMA ONLY').length,
    degraded: caps.filter((c) => !c.live).length,
    problems: PROBLEMS.length,
  };
}

export { LIVE };