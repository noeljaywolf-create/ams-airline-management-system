"""
Part V (costing engine) and Part VI (fuel).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART V =================
    story += H1('Part V — The costing engine')

    story += LEAD(
        'This is the module the whole platform hangs off. It answers the '
        'question an airline most needs answered and least often can: what '
        'did this flight actually cost?')

    story += H2('Two kinds of cost')

    story += CODE(
        ''' * Cost falls into two structural buckets:
 *
 *   FLIGHT-ATTRIBUTABLE  varies directly with flying this sector:
 *                       fuel, duty crew, landing fees, handling, catering.
 *                       Known on the day of flight.
 *
 *   FLEET-FIXED         fixed for the period regardless of whether a
 *                       particular aircraft flies:
 *                       lease, insurance, spares holding, admin crew,
 *                       distribution. Allocated to flights by an
 *                       explicit driver — never by accident.
 *
 * The distinction is not accounting pedantry. It determines whether a
 * route is viable at all. A long-haul sector might have a marginal
 * fuel cost of $4,800 and a full cost of $19,000; pricing to marginal
 * cost fills the plane but loses money, and pricing to full cost loses
 * the traffic. Both numbers must exist.''',
        'shared/src/costing.js — the module header, which is the best '
        'explanation of airline cost behaviour anywhere in this codebase.')

    story += P(
        'The distinction is real and it has a direct commercial consequence. '
        'Consider a 12-hour sector costing US$19,000 in total. Flying it with '
        'five extra passengers adds almost nothing — fuel for a few kilograms '
        'of extra weight, a few trays. The landing fee does not change. The '
        'crew does not change. The lease certainly does not change.')

    story += TABLE(
        ['Approach', 'What it tells you', 'What happens'],
        [
            ['Price to **marginal** cost',
             'what each extra seat genuinely costs to carry',
             'The plane fills, and the airline still loses money'],
            ['Price to **full** cost',
             'what the flight needed in total, including the share of '
             'lease and insurance',
             'The flight pays for itself, but the fare loses the market'],
        ],
        widths=[24, 38, 38])

    story += H2('Building the cost of one sector')

    story += CODE(
        '''export function buildFlightCost(input) {
  if (!Number.isInteger(input.distanceKm) || input.distanceKm < 0) {
    throw new MoneyError('distanceKm must be a non-negative integer', 'COST_BAD_DISTANCE');
  }

  const fuelKg = input.fuelKg ?? 0;
  const fuelPricePerKg = intOr(input.fuelPriceCentsPerKg, 0, 'fuelPriceCentsPerKg');
  if (fuelKg < 0) throw new MoneyError('fuelKg cannot be negative', 'COST_NEGATIVE_FUEL');

  // Fuel is the classic integer-arithmetic trap. fuelKg x priceCentsPerKg
  // is fractional. We must round ONCE, here, at the point the fact is
  // created — not per-line later, and never by float.
  const fuelCents = Math.round(fuelKg * fuelPricePerKg);
  if (!Number.isSafeInteger(fuelCents)) {
    throw new MoneyError('Fuel cost overflow — split the uplift across delivery notes', 'COST_FUEL_OVERFLOW');
  }

  /** @type {Record<string, number>} */
  const lines = {
    fuel: fuelCents,
    crew_flight: intOr(input.flightCrewCents, 0, 'flightCrewCents'),
    crew_cabin: intOr(input.cabinCrewCents, 0, 'cabinCrewCents'),
    crew_training: intOr(input.crewTrainingCents, 0, 'crewTrainingCents'),
    maintenance_direct: intOr(input.maintenanceDirectCents, 0, 'maintenanceDirectCents'),
    maintenance_reserve: intOr(input.maintenanceReserveCents, 0, 'maintenanceReserveCents'),
    airport_charges: intOr(input.airportChargesCents, 0, 'airportChargesCents'),
    navigation_charges: intOr(input.navigationCents, 0, 'navigationCents'),
    catering: intOr(input.cateringCents, 0, 'cateringCents'),
    handling: intOr(input.handlingCents, 0, 'handlingCents'),
    de_icing: intOr(input.deIcingCents, 0, 'deIcingCents'),
  };''',
        'shared/src/costing.js')

    story += P('Three patterns in this function are worth naming:')

    story += NUMLIST([
        '**Every optional field defaults explicitly.** `input.fuelKg ?? 0` '
        'means a missing fuel figure is treated as zero, not left undefined '
        'and multiplied later.',
        '**A helper validates every monetary input the same way.** '
        '`intOr(x, 0, \'name\')` throws if the value is present but not integer '
        'cents. This is how the float prohibition is enforced across every '
        'cost line.',
        '**Overflow is caught before it silently corrupts.** The check on '
        '`fuelCents` exists because a single absurd fuel figure could exceed '
        'the safe range and lose digits.',
    ])

    story += H3('The unknown-category rule')

    story += CODE(
        '''  /** @type {Record<string, number>} */
  const byCategory = { FLIGHT_ATTRIBUTABLE: 0, FLEET_FIXED: 0, PERIOD: 0, UNKNOWN: 0 };
  for (const [category, amount] of Object.entries(lines)) {
    if (FLIGHT_ATTR.has(category)) byCategory.FLIGHT_ATTRIBUTABLE += amount;
    else if (FLEET_FIXED.has(category)) byCategory.FLEET_FIXED += amount;
    else if (PERIOD.has(category)) byCategory.PERIOD += amount;
    else byCategory.UNKNOWN += amount;
  }

  if (byCategory.UNKNOWN !== 0) {
    throw new MoneyError(
      `Cost build contains ${byCategory.UNKNOWN} cents of unrecognised cost categories`,
      'COST_UNKNOWN_CATEGORY',
    );
  }''',
        'shared/src/costing.js — an unrecognised category is an error, not a '
        'silent drop.')

    story += CALLOUT(
        'good', 'This is the philosophy of the codebase in eight lines',
        'The comment above it says: "An unrecognised category is an error, not '
        'a silent drop — silent drops in a costing engine become unreconciled '
        'variances that nobody can find months later." A cost that '
        'disappears without trace is far more dangerous than a system that '
        'refuses to run. **Failing loudly is a feature.**')

    story += H2('Allocating fixed cost to flights')

    story += CODE(
        '''export const ALLOCATION_DRIVERS = [
  'BLOCK_HOURS',       // standard: cost that scales with flying time
  'ASKS',              // seats x km: scales with capacity offered
  'SECTORS',           // per take-off: scales with movements
  'DISTANCE_KM',       // scales with distance
  'FLIGHTS',           // flat per rotation
  'DIRECT',            // already flight-specific, no allocation
];''',
        'shared/src/domain.js — the permitted ways to share a fixed cost.')

    story += CODE(
        '''export function allocateFleetFixed({ poolCents, flights, driver = 'BLOCK_HOURS' }) {
  if (!ALLOCATION_DRIVERS.includes(driver)) {
    throw new MoneyError(`Unknown allocation driver "${driver}"`, 'COST_BAD_DRIVER');
  }
  if (!Number.isSafeInteger(poolCents)) {
    throw new MoneyError('poolCents must be integer cents', 'COST_BAD_POOL');
  }
  if (flights.length === 0) {
    if (poolCents !== 0) throw new MoneyError('Non-zero pool across zero flights', 'COST_NO_FLIGHTS');
    return { allocations: [], driver, totalCents: 0 };
  }

  if (driver === 'DIRECT') {
    // Caller already attributed these; nothing to spread.
    return { allocations: flights.map(() => 0), driver, totalCents: 0 };
  }

  const weights = flights.map((f) => {
    switch (driver) {
      case 'BLOCK_HOURS': return f.blockHours ?? 0;
      case 'ASKS': return (f.seatsOffered ?? 0) * f.distanceKm;
      case 'SECTORS': return f.sectors ?? 1;
      case 'DISTANCE_KM': return f.distanceKm;
      case 'FLIGHTS': return 1;
      default: throw new MoneyError(`Unhandled driver "${driver}"`, 'COST_BAD_DRIVER');
    }
  });

  const allocations = allocate(poolCents, weights);
  // Self-check. If this ever throws, a rounding rule was changed and
  // the whole costing model needs re-verification.
  assertReconciles(allocations, poolCents, `fleet-fixed allocation (${driver})`);
  return { allocations, driver, totalCents: sum(...allocations) };
}''',
        'shared/src/costing.js')

    story += P(
        'A lease of US$400,000 a month for one aircraft is a real cost that '
        'does not vary with how much you fly. But the aircraft *does* fly '
        'specific sectors, and those sectors should carry a share. The choice '
        'of driver is a management policy, so it is made explicit and recorded '
        'rather than buried.')

    story += CALLOUT(
        'note', 'The self-check on the last line',
        '`assertReconciles(allocations, poolCents, ...)` verifies that the '
        'parts still sum to the whole *after* allocation. The comment says '
        'that if this ever throws, a rounding rule has changed and the costing '
        'model needs re-verification. The engine checks its own output on every '
        'call rather than trusting it.')

    story += H2('Full profit and loss for a flight')

    story += CODE(
        '''export function flightPnl({ costInput, fleetFixedLines = [], revenueCents, otherRevenueCents = 0 }) {
  const direct = buildFlightCost(costInput);
  const fixedTotal = sum(...fleetFixedLines.map((l) => l.cost));

  const fullCost = direct.totalCents + fixedTotal;
  const totalRevenue = intOr(revenueCents, 0, 'revenueCents') + intOr(otherRevenueCents, 0, 'otherRevenueCents');
  const metrics = flightMetrics({
    seatsOffered: costInput.seatsOffered ?? 0,
    passengers: costInput.passengers ?? 0,
    distanceKm: costInput.distanceKm,
    revenueCents: totalRevenue,
    operatingCostCents: fullCost,
  });

  return {
    ...metrics,
    // Physical facts carried through. Without these the aggregation layer
    // cannot sum passengers, seats, distance or block hours, and any
    // passenger-level or utilisation metric computed above the flight is
    // fabricated rather than derived.
    seatsOffered: costInput.seatsOffered ?? 0,
    passengers: costInput.passengers ?? 0,
    distanceKm: costInput.distanceKm,
    blockHours: costInput.blockHours ?? 0,

    revenueCents: totalRevenue,
    directCostCents: direct.totalCents,
    fleetFixedCostCents: fixedTotal,
    fullCostCents: fullCost,
    contributionCents: totalRevenue - fullCost,

    marginalCostOfExtraSeatCents: estimateMarginalSeatCost(costInput),
    breakEvenRevenueCents: fullCost,

    lines: direct.lines,
    fleetFixedLines,
  };
}''',
        'shared/src/costing.js — the flight profit and loss statement.')

    story += P(
        'The block comment on the physical facts is instructive. At one point '
        'this function returned only ratios and totals. The aggregation layer '
        'above it then had no way to sum passengers or distance, so any '
        'route-level utilisation figure was computed from zeros. That is '
        'Defect 1 in Part XIII, and the comment was added afterwards so the '
        'error cannot recur.')

    story += H2('Marginal cost: what one more passenger costs')

    story += CODE(
        '''export function estimateMarginalSeatCost(input) {
  const PASSENGER_ALL_UP_KG = 100;     // ~75 kg person + ~25 kg baggage
  const BURN_KG_PER_KG_PAYLOAD = 0.030; // ~3.0% of payload as incremental fuel
  const fuelPricePerKg = input.fuelPriceCentsPerKg ?? 0;
  const fuel = Math.round(PASSENGER_ALL_UP_KG * BURN_KG_PER_KG_PAYLOAD * fuelPricePerKg);
  // Onboard service scales with passengers served.
  const service = input.seatsOffered && input.seatsOffered > 0
    ? Math.round(((input.cateringCents ?? 0) + (input.handlingCents ?? 0)) / input.seatsOffered)
    : 0;
  return fuel + service;
}''',
        'shared/src/costing.js — an extra passenger weighs 100 kg all-up, and '
        'carrying weight costs roughly 3% of it in extra fuel. Catering and '
        'handling are divided by seats because they scale with load.')

    story += CODE(
        '''// At 95 cents per kg:
100 kg x 0.030 x 95c  =  285 cents for fuel
Catering + handling per seat  =  ~700 cents
Marginal cost of an extra seat =  985 cents  (US$9.85)''')

    story += CALLOUT(
        'warn', 'An honest limitation of this estimate',
        'The 3% burn figure and the 100 kg all-up weight are industry '
        'approximations, not measurements from your aircraft. They are also '
        'named constants, visible at the top of the function, precisely so a '
        'reader can see they are assumptions rather than derived facts. A '
        'qualified engineer should validate them against your fleet\'s actual '
        'fuel data before the number drives a pricing decision.')

    story += H2('Aggregating many flights')

    story += CODE(
        '''  const t = flightPnls.reduce(
    (a, f) => ({
      flights: a.flights + 1,
      asks: a.asks + f.asks,
      rpks: a.rpks + f.rpks,
      revenueCents: a.revenueCents + f.revenueCents,
      directCostCents: a.directCostCents + f.directCostCents,
      fleetFixedCostCents: a.fleetFixedCostCents + f.fleetFixedCostCents,
      fullCostCents: a.fullCostCents + f.fullCostCents,
      seatsOffered: a.seatsOffered + (f.seatsOffered ?? 0),
      passengers: a.passengers + (f.passengers ?? 0),
      distanceKm: a.distanceKm + (f.distanceKm ?? 0),
      blockHoursMilli: a.blockHoursMilli + Math.round((f.blockHours ?? 0) * 1000),
      marginalSeatCostCents: a.marginalSeatCostCents + (f.marginalCostOfExtraSeatCents ?? 0),
    }),
    { flights: 0, asks: 0, rpks: 0, /* ... */ },
  );

  assertReconciles([t.directCostCents, t.fleetFixedCostCents], t.fullCostCents, 'aggregate flight cost');''',
        'shared/src/costing.js')

    story += P(
        'Two details here are deliberate and were both added in response to '
        'real problems.')

    story += CODE(
        '''      blockHoursMilli: a.blockHoursMilli + Math.round((f.blockHours ?? 0) * 1000),
      // ...
      blockHours: t.blockHoursMilli / 1000,
      // ...
      marginalSeatCostCents: t.marginalSeatCostCents / t.flights,''')

    story += BUL([
        '**Block hours are accumulated in thousandths.** Summing '
        '`Math.round(blockHours * 1000)` as integers and dividing once at the '
        'end avoids the drift described in Part IV.',
        '**Marginal seat cost is averaged across flights**, then used for the '
        'break-even passenger calculation. The comment says this is "carried '
        'because the break-even passenger gap is ONLY computable from the '
        'airline\'s real marginal cost, not from a constant."',
    ])

    story += H2('The route verdict')

    story += CODE(
        '''  let verdict;
  if (agg.flights === 0) verdict = 'NO_DATA';
  else if (agg.contributionCents < 0) verdict = 'LOSS_MAKING';
  else if (agg.loadFactorPpm < targetLoadFactorPpm) verdict = 'MARGINAL';
  else verdict = 'PROFITABLE';

  return {
    verdict,
    structurallyImpossible,
    marginPpm,
    /** Exact arithmetic from real revenue-per-pax and real marginal cost. */
    breakEven: breakEvenPassengers(agg),
    levers: {
      requiredLoadFactorPpm: agg.breakEvenLoadFactorPpm,
      currentLoadFactorPpm: agg.loadFactorPpm,
      loadFactorGapPpm: agg.loadFactorPpm - agg.breakEvenLoadFactorPpm,
      requiredCaskMicrocents: agg.raskMicrocents,
      currentCaskMicrocents: agg.caskMicrocents,
      caskHeadroomMicrocents: agg.raskMicrocents - agg.caskMicrocents,
    },
  };''',
        'shared/src/costing.js — what a commercial manager actually sees.')

    story += P(
        'The `levers` object is the interesting part. Rather than returning '
        '"loss-making" and stopping, it separates two distinct problems: the '
        'route is under-performing commercially (load factor too low) or '
        'operationally (unit cost too high). Those need different responses, '
        'and a verdict that conflated them would send management in the wrong '
        'direction.')

    story += CODE(
        '''/**
 * Note on taxonomy. Because full cost per flight is modelled as
 * load-independent, "negative contribution" and "requires more than
 * 100% load factor to break even" are the same condition. An earlier
 * version exposed both as separate verdicts, which made one of them
 * unreachable. They are now separated cleanly: `verdict` describes the
 * money, and `structurallyImpossible` describes the achievability.
 */''')

    story += CALLOUT(
        'note', 'What that note is really about',
        'A verdict that can never be reached is a latent bug. The team found '
        'one branch was unreachable under the current cost model and said so '
        'in the code rather than leaving a condition that looks meaningful and '
        'never fires. This is unusually candid and it is the right instinct: '
        'the next engineer to change the cost model needs to know that this '
        'distinction is conditional on how the model treats load.')

    story += RULEHR()

    # ================= PART VI =================
    story += H1('Part VI — Fuel, the largest single cost')

    story += LEAD(
        'Fuel is typically a quarter to a third of an airline\'s operating '
        'cost, and it is the one cost the airline does not control, cannot '
        'renegotiate, and consumes before it earns.')

    story += CODE(
        '''/**
 * AMS — Fuel management and burn variance.
 *
 * Fuel is typically 25-35% of an airline's operating cost and is the
 * single largest lever on unit economics. A 2% saving on fuel equals
 * roughly 60 basis points of CASK, which is a strategic margin in a
 * low-margin market. It is also the one cost an airline does not
 * control, cannot renegotiate, and consumes before it earns.
 *
 * Three things a finance system must get right about fuel:
 *
 * 1. UPLIFT IS NOT BURN. The aircraft leaves with uplifted litres and
 *    lands with reserves (taxi, trip fuel, contingency, alternate,
 *    final reserve, and ETOPS reserve where applicable). Costing the
 *    whole uplift to the flight overstates the flight and understates
 *    the next one. AMS reconciles uplift-to-burn explicitly and carries
 *    the landing reserve forward.
 *
 * 2. PLANNED BURN IS NOT ACTUAL BURN. The crew files a plan derived
 *    from route, weight, weather and winds. Actual burn comes from the
 *    aircraft. The variance between them is the single most useful
 *    operational-financial metric an airline produces, because it
 *    isolates crew technique, routing efficiency and weight discipline
 *    from the fuel price, which is pure market risk.
 *
 * 3. CARRYING FUEL HAS AN OPPORTUNITY COST. Tankering — deliberately
 *    carrying extra fuel — trades deadweight (which burns fuel and
 *    costs payload) against the risk of paying a diversion penalty or
 *    buying fuel at an expensive alternate. That is a calculable
 *    trade, and AMS calculates it rather than leaving it to habit.
 *
 * @module fuel
 */''',
        'shared/src/fuel.js')

    story += H2('Uplift is not burn')

    story += P(
        'An aircraft that takes on 12,000 kg does not use 12,000 kg. It lands '
        'with several hundred kilograms still on board — enough for the taxi, '
        'a contingency, an alternate airport it may need, and a mandatory final '
        'reserve.')

    story += CODE(
        '''export function reconcileFuel(plan, actual) {
  const reserves = plan.taxiFuelKg + plan.contingencyKg + plan.alternateKg
    + plan.finalReserveKg + (plan.etopsReserveKg ?? 0);

  const burnable = plan.taxiFuelKg + plan.tripFuelKg + plan.contingencyKg;
  const actualBurn = actual.takeoffFuelKg - actual.landingFuelKg;

  const planBurn = plan.taxiFuelKg + plan.tripFuelKg;
  const varianceKg = actualBurn - planBurn;
  const variancePpm = planBurn === 0 ? 0
    : Math.floor((varianceKg / planBurn) * 1_000_000 + 0.5);

  const expectedLanding = plan.upliftKg - burnable;

  return {
    reservesKg: reserves,
    reservesMeetRegulatoryMinimum: expectedLanding >= reserves,
    plannedBurnKg: planBurn,
    actualBurnKg: actualBurn,
    varianceKg,
    variancePpm,
    /** Positive variance is bad: more than planned was burned. */
    varianceDirection: varianceKg > 0 ? 'OVER' : varianceKg < 0 ? 'UNDER' : 'ON_PLAN',
    expectedLandingFuelKg: expectedLanding,
    actualLandingFuelKg: actual.landingFuelKg,
    landingReserveVarianceKg: actual.landingFuelKg - expectedLanding,
    costCents: Math.round(actualBurn * plan.priceCentsPerKg),
    /** Cost of the variance alone — this is what management can influence. */
    varianceCostCents: Math.round(varianceKg * plan.priceCentsPerKg),
  };
}''',
        'shared/src/fuel.js')

    story += P(
        'The last two fields are the commercially valuable ones. `costCents` '
        'is what the flight cost in fuel. `varianceCostCents` is what the '
        'difference between plan and reality cost — which is the part '
        'management can actually influence. A 3% burn variance across a fleet '
        'is a seven-figure annual number, and it is invisible in a monthly '
        'profit and loss because it is buried inside the fuel line.')

    story += CALLOUT(
        'note', 'Why the reserve check compares plan to expectation, not to reality',
        '`reservesMeetRegulatoryMinimum` compares the expected landing fuel '
        'against the required reserves. This is a *planning* check performed '
        'before dispatch. Whether the aircraft actually landed with enough is a '
        'separate fact, reported by `landingReserveVarianceKg`. Conflating '
        'the two would let a planning error be hidden by a lucky landing, or '
        'blame the crew for a planning error.')

    story += H2('Reconciling plan against actual')

    story += CODE(
        '''  // Apply empirically observed variance so the aircraft is never
  // dispatched below regulatory reserve because the crew flew well
  // last time.
  const bufferPpm = ctx.expectedBurnVariancePpm ?? 30_000; // default +3%
  const buffered = Math.ceil((requiredWithContingency * (1_000_000 + bufferPpm)) / 1_000_000);''',
        'shared/src/fuel.js — the uplift recommendation carries an empirical '
        'safety margin.')

    story += P(
        'That comment describes a real accident pattern. An airline notices '
        'its crews consistently beat the fuel plan, and gradually trims the '
        'uplift. One day the flight meets headwinds and the aircraft lands '
        'below its legal final reserve. AMS refuses to learn from a favourable '
        'variance by reducing the required uplift.')

    story += H2('Tankering: carrying fuel is a decision')

    story += CODE(
        '''  // Tankering economics.
  //
  // The naive formulation — "carrying fuel is worth what fuel costs at
  // the alternate" — makes tankering look free, because it ignores the
  // two costs that actually matter:
  //
  //   1. Diversion only HAPPENS sometimes. The value of carrying
  //      contingency fuel is the EXPECTED cost avoided, so it is scaled
  //      by the probability of a diversion, not the gross cost of one.
  //   2. Carrying fuel is not free. It burns on every remaining sector
  //      of the rotation, and it may displace fuel you could otherwise
  //      uplift cheaply at the next station.
  //
  // Getting this wrong in either direction is expensive and it is a
  // decision made thousands of times a year, so AMS calculates it.
  const deadweightBurnFactor = ctx.deadweightBurnFactor ?? 0.030; // kg fuel per kg payload
  const probabilityOfDiversion = ctx.probabilityOfDiversion ?? 0.02;
  const remainingSectors = ctx.remainingSectors ?? 3;

  const costIfDivertedCents =
    ctx.costOfDiversionCents + ctx.fuelPriceAtAlternateCentsPerKg * plan.alternateKg;
  const expectedSavingCents = Math.round(probabilityOfDiversion * costIfDivertedCents);

  const carryingCostCents = Math.round(
    plan.contingencyKg * ctx.fuelPriceHereCentsPerKg
    * (1 + deadweightBurnFactor * remainingSectors),
  );

  const shouldTanker = expectedSavingCents > carryingCostCents;''',
        'shared/src/fuel.js')

    story += P(
        'This is a well-constructed expected-value calculation, and it is '
        'worth understanding as a template because the reasoning generalises. '
        'The question "is it worth carrying this?" is answered by comparing the '
        'expected benefit against the expected cost — not the maximum benefit '
        'against the certain cost, which is how organisations routinely make '
        'defensible-looking but wrong capital decisions.')

    story += CODE(
        '''// Carrying 300 kg of contingency fuel:
//   Benefit if diverted: $4,200 diversion + alternate fuel
//   x 2% probability    = $84 expected saving
//   Cost: 300 kg x 95c x (1 + 0.03 x 3 sectors) = $31
//   Verdict: TANKER  (net benefit $53)''')

    story += CALLOUT(
        'warn', 'The defaults here are assumptions, not findings',
        'A 2% diversion probability and a 3% deadweight burn factor are '
        'industry-plausible but unverified. Both are named constants with '
        'comments, and both can be overridden per call. Before this drives '
        'real tankering decisions, your flight operations team should replace '
        'them with figures from your own data.')

    story += H2('Statistical detection of a fuel problem')

    story += CODE(
        '''export function detectBurnVarianceAnomaly(variancePpmSeries, { window = 30, zThreshold = 2.5 } = {}) {
  if (variancePpmSeries.length < window) {
    return { status: 'INSUFFICIENT_DATA', sampleSize: variancePpmSeries.length };
  }

  const n = variancePpmSeries.length;
  const mean = variancePpmSeries.reduce((a, b) => a + b, 0) / n;
  const variance = variancePpmSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) {
    return { status: 'STABLE', meanPpm: Math.round(mean), stdev: 0, anomalies: [] };
  }

  /** @type {{index:number, value:number, zScore:number}[]} */
  const anomalies = [];
  variancePpmSeries.forEach((value, index) => {
    const z = (value - mean) / stdev;
    if (Math.abs(z) >= zThreshold) {
      anomalies.push({ index, value, zScore: Math.floor(z * 100) / 100 });
    }
  });

  return {
    status: anomalies.length === 0 ? 'STABLE' : 'ANOMALY_DETECTED',
    sampleSize: n,
    meanPpm: Math.round(mean),
    stdevMilli: Math.floor(stdev * 1000),
    anomalies,
    interpretation: mean < -20_000
      ? 'Fleet is consistently beating plan — verify distance data is not overstated'
      : mean > 40_000
        ? 'Fleet is consistently over plan — investigate routing, weight discipline, or uplift recording'
        : 'Burn performance within expected range',
  };
}''',
        'shared/src/fuel.js — z-score detection of a systematic fuel problem.')

    story += P(
        'This is a standard statistical technique given an aviation-specific '
        'interpretation, and that interpretation is the valuable part. A '
        'consistent *negative* variance means crews are beating plan — which '
        'sounds good and is actually a warning sign that the planning distance '
        'data is overstated, which in turn means every route profitability '
        'figure built on it is wrong.')

    story += CODE(
        '''  // `**2` is the exponent operator — "square this".
  // Math.sqrt(variance) is the square root.
  // The whole calculation is textbook: mean, variance, standard deviation,
  // then measure how far each point sits from the mean in standard
  // deviations.''')

    story += CALLOUT(
        'note', 'Why this is in the finance system and not the flight ops system',
        'Because the finding is a *financial* one. A systematic 4% burn '
        'overrun across a fleet is worth six figures annually, and it is '
        'invisible in a monthly profit and loss where it is averaged into the '
        'fuel line alongside genuine price movements. The statistic exists to '
        'surface a cost that would otherwise be absorbed silently.')

    story += RULEHR()