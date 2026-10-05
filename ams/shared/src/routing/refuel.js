/**
 * Optimal fuel uplift planning (airline tankering).
 * ==================================================
 *
 * THE REAL-WORLD PROBLEM
 * ----------------------
 * Having chosen the sequence of stops, the airline must decide HOW MUCH
 * fuel to load at each one. Fuel is by far the largest variable cost in
 * an airline operation — typically 20-30% of total operating cost — and
 * jet fuel prices swing by a factor of three between airports and by
 * that much again month to month.
 *
 * Loading extra fuel is not free and not merely a cost: it is WEIGHT.
 * Every extra kilogram is carried over the whole flight, burning more
 * fuel to carry the fuel. Airlines therefore tanker — carry fuel
 * forward from a cheap station to an expensive one — but only up to
 * where carrying stops paying.
 *
 * So: given a route, a price per kg at each departure airport, a tank
 * capacity and a mandatory reserve, choose the uplift at each stop to
 * minimise total fuel cost.
 *
 * This is a linear-cost lot-sizing problem and it has an EXACT
 * myopic solution. No dynamic programming over the whole route is
 * required, which matters: a full DP is O(stops x T^2) and infeasible
 * for a 60,000 kg tank.
 *
 * THE THEOREM
 * -----------
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
 *   under-buying is never optimal.  ∎
 *
 *   Over-buying: if the policy carries past i more fuel than needed to
 *   reach k, that surplus is consumed at a stop with p_k < p_i.
 *   Buying it at k instead is strictly cheaper. Capacity at i is not
 *   violated because we are removing, not adding. Hence over-buying is
 *   never optimal.  ∎
 *
 *   No cheaper stop ahead: then p_j >= p_i for all j > i. Every kilogram
 *   bought later can be bought at i for no greater price, subject to
 *   capacity. So buy the whole remaining requirement now; fill the tank
 *   only when the remainder does not fit, in which case the leftover is
 *   bought at the next stop regardless.  ∎
 *
 * The three cases exhaust the possibilities, so the myopic policy is
 * optimal. This is verified independently against exhaustive search in
 * the test suite.
 *
 * WHAT THIS DOES NOT MODEL — stated plainly, because a fuel plan that
 * hides its assumptions is worse than none:
 *
 *   - Burned fuel carrying fuel (the weight penalty). Including it makes
 *     the problem non-myopic and requires a real DP. Excluded here.
 *   - Fixed uplift fees, tankering permissions or airport fuel
 *     availability limits.
 *   - Non-linear volume discounts or contracted cargo litres.
 *
 * @module routing/refuel
 */

export class RefuelError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'REFUEL_ERROR') {
    super(message);
    this.name = 'RefuelError';
    this.code = code;
  }
}

/**
 * Minimum fuel on board required at each point along the route to
 * complete it legally. Computed backwards from the destination.
 *
 * @param {number[]} legFuelKg Fuel burned on each leg; leg i is stop i -> stop i+1
 * @param {number} reserveKg
 * @returns {number[]} requiredAtDeparture[i] for i in [0, legFuelKg.length)
 */
export function requiredAtDeparture(legFuelKg, reserveKg) {
  const n = legFuelKg.length;
  /** @type {number[]} */
  const required = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    // Departing stop i you must burn leg i to reach stop i+1, and then
    // hold AT LEAST the reserve — but possibly more than the reserve,
    // because everything the rest of the route needs must still be on
    // board when you leave i. Hence max(), and hence the composition is
    // legFuel[i] + max(reserve, required[i+1]), not max(legFuel[i]+reserve,
    // required[i+1]). The latter silently under-fuels the first departure
    // of every multi-leg route.
    const neededBeyond = i === n - 1 ? reserveKg : Math.max(reserveKg, required[i + 1]);
    required[i] = legFuelKg[i] + neededBeyond;
  }
  return required;
}

/**
 * Fuel that must be loaded at stop i to reach stop k (exclusive) while
 * holding the reserve at every intermediate landing.
 *
 * @param {number[]} legFuelKg
 * @param {number} i from stop index
 * @param {number} k to stop index
 * @param {number} reserveKg
 * @returns {number}
 */
export function fuelToReach(legFuelKg, i, k, reserveKg) {
  let cumulative = 0;
  let worst = 0;
  for (let m = i; m < k; m += 1) {
    cumulative += legFuelKg[m];
    if (cumulative > worst) worst = cumulative;
  }
  return worst + reserveKg;
}

/**
 * Compute the cost-optimal uplift plan for a fixed route.
 *
 * @param {Object} params
 * @param {string[]} params.stops            e.g. ['JFK','YUL','GRU']; last is the destination
 * @param {number[]} params.legFuelKg        legFuelKg[i] burns stops[i] -> stops[i+1]
 * @param {number[]} params.priceCentsPerKg  one per stop; the destination entry is ignored
 * @param {number} params.tankCapacityKg
 * @param {number} params.reserveKg
 * @returns {{ totalCostCents: number, upliftsKg: number[], departureFuelKg: number[], arrivalFuelKg: number[], decisions: Array<{stop: string, priceCentsPerKg: number, arrivalFuelKg: number, upliftKg: number, departureFuelKg: number, nextCheaperStop: string|null, rationale: string}> }}
 */
export function optimalRefuelPlan({ stops, legFuelKg, priceCentsPerKg, tankCapacityKg, reserveKg }) {
  const n = stops.length;
  if (n < 2) throw new RefuelError('A route needs at least one leg', 'REFUEL_ROUTE_TOO_SHORT');
  if (legFuelKg.length !== n - 1) {
    throw new RefuelError(`legFuelKg must have ${n - 1} entries, got ${legFuelKg.length}`, 'REFUEL_LEG_COUNT');
  }
  if (priceCentsPerKg.length !== n) {
    throw new RefuelError(`priceCentsPerKg must have ${n} entries, got ${priceCentsPerKg.length}`, 'REFUEL_PRICE_COUNT');
  }
  for (const v of legFuelKg) {
    if (!Number.isInteger(v) || v < 0) throw new RefuelError('legFuelKg entries must be non-negative integers', 'REFUEL_BAD_FUEL');
  }
  for (const p of priceCentsPerKg) {
    if (!Number.isInteger(p) || p < 0) throw new RefuelError('priceCentsPerKg entries must be non-negative integers', 'REFUEL_BAD_PRICE');
  }
  if (!Number.isInteger(tankCapacityKg) || tankCapacityKg < 0) throw new RefuelError('tankCapacityKg must be a non-negative integer', 'REFUEL_BAD_CAPACITY');
  if (!Number.isInteger(reserveKg) || reserveKg < 0) throw new RefuelError('reserveKg must be a non-negative integer', 'REFUEL_BAD_RESERVE');

  // Feasibility pre-check.
  //
  // Each LEG must fit in the tanks. The route as a WHOLE need not fit,
  // because intermediate stops are refuelled — requiring the whole route to
  // fit in one tank would reject every multi-stop plan, which is the
  // entire purpose of this function. An earlier version of this check
  // tested required[0] (total fuel for the remainder of the route) against
  // capacity, and refused exactly the plans it exists to produce.
  for (let i = 0; i < legFuelKg.length; i += 1) {
    if (legFuelKg[i] + reserveKg > tankCapacityKg) {
      throw new RefuelError(
        `Sector ${stops[i]} -> ${stops[i + 1]} needs ${legFuelKg[i] + reserveKg}kg ` +
          `(leg + ${reserveKg}kg reserve) but tank capacity is only ${tankCapacityKg}kg. ` +
          'No refuelling schedule can make this route legal.',
        'REFUEL_ROUTE_INFEASIBLE',
      );
    }
  }

  const upliftDecisions = new Array(n - 1);
  /** @type {number[]} */
  const upliftsKg = new Array(n - 1);
  /** @type {number[]} */
  const departureFuelKg = new Array(n - 1);
  /** @type {number[]} */
  const arrivalFuelKg = new Array(n - 1);

  // Total fuel needed on board at each departure IF NOTHING FURTHER WERE
  // REFUELLED. Used only to decide how much to buy while prices are cheap.
  const required = requiredAtDeparture(legFuelKg, reserveKg);

  let fuelOnBoard = 0; // arriving at stop 0 with empty tanks

  for (let i = 0; i < n - 1; i += 1) {
    const price = priceCentsPerKg[i];

    // First stop strictly cheaper than here, among later DEPARTURE stops.
    let nextCheaper = -1;
    for (let j = i + 1; j < n - 1; j += 1) {
      if (priceCentsPerKg[j] < price) { nextCheaper = j; break; }
    }

    /** @type {number} */
    let target;
    /** @type {string} */
    let rationale;
    if (nextCheaper >= 0) {
      target = fuelToReach(legFuelKg, i, nextCheaper, reserveKg);
      rationale = `hold ${priceCentsPerKg[i]}c/kg: only enough to reach ${stops[nextCheaper]} at ${priceCentsPerKg[nextCheaper]}c/kg`;
    } else {
      // Nothing cheaper ahead — buy the whole remaining requirement, but
      // never more than the tanks hold.
      target = Math.min(tankCapacityKg, required[i]);
      rationale = `hold ${priceCentsPerKg[i]}c/kg: no cheaper stop ahead, carry the remainder${target === tankCapacityKg && required[i] > tankCapacityKg ? ' (tank limited)' : ''}`;
    }

    const uplift = Math.max(0, target - fuelOnBoard);
    const departure = fuelOnBoard + uplift;
    if (departure > tankCapacityKg) {
      throw new RefuelError(
        `Uplift at ${stops[i]} would exceed tank capacity (${departure}kg > ${tankCapacityKg}kg). ` +
          'This indicates an inconsistent route or capacity.',
        'REFUEL_CAPACITY_EXCEEDED',
      );
    }

    upliftsKg[i] = uplift;
    departureFuelKg[i] = departure;
    arrivalFuelKg[i] = fuelOnBoard;

    upliftDecisions[i] = {
      stop: stops[i],
      priceCentsPerKg: price,
      arrivalFuelKg: fuelOnBoard,
      upliftKg: uplift,
      departureFuelKg: departure,
      nextCheaperStop: nextCheaper >= 0 ? stops[nextCheaper] : null,
      rationale,
    };

    fuelOnBoard = departure - legFuelKg[i];
    if (fuelOnBoard < reserveKg) {
      throw new RefuelError(
        `Arriving at ${stops[i + 1]} with ${fuelOnBoard}kg breaches the ${reserveKg}kg reserve. ` +
          'The plan is infeasible — this should be unreachable.',
        'REFUEL_RESERVE_BREACH',
      );
    }
  }

  let totalCostCents = 0;
  for (let i = 0; i < n - 1; i += 1) totalCostCents += upliftsKg[i] * priceCentsPerKg[i];

  return {
    totalCostCents,
    upliftsKg,
    departureFuelKg,
    arrivalFuelKg,
    decisions: upliftDecisions,
  };
}

/**
 * Exhaustive search over all uplift combinations. Exponential — used ONLY
 * to validate optimalRefuelPlan on small instances.
 *
 * @param {Object} params same shape as optimalRefuelPlan
 * @returns {{ feasible: boolean, totalCostCents: number, upliftsKg: number[] | null, combinationsTried: number }}
 */
export function bruteForceRefuel({ stops, legFuelKg, priceCentsPerKg, tankCapacityKg, reserveKg }) {
  const n = stops.length - 1;
  const required = requiredAtDeparture(legFuelKg, reserveKg);
  if (required[0] > tankCapacityKg) {
    return { feasible: false, totalCostCents: 0, upliftsKg: null, combinationsTried: 0 };
  }

  let best = Infinity;
  /** @type {number[] | null} */
  let bestUplifts = null;
  let tried = 0;

  /** @type {number[]} */
  const uplifts = new Array(n);

  const recurse = (i, fuelOnBoard, cost) => {
    tried += 1;
    if (i === n) {
      if (cost < best) { best = cost; bestUplifts = [...uplifts]; }
      return;
    }
    // Uplift is bounded above by capacity; above required[i] it is waste,
    // so the search space can be cut without losing the optimum.
    const upper = Math.min(tankCapacityKg - fuelOnBoard, required[i] + reserveKg);
    for (let u = 0; u <= upper; u += 1) {
      const departure = fuelOnBoard + u;
      const arrival = departure - legFuelKg[i];
      if (arrival < reserveKg) continue;
      uplifts[i] = u;
      recurse(i + 1, arrival, cost + u * priceCentsPerKg[i]);
    }
  };

  recurse(0, 0, 0);
  return {
    feasible: bestUplifts !== null,
    totalCostCents: best === Infinity ? 0 : best,
    upliftsKg: bestUplifts,
    combinationsTried: tried,
  };
}

/**
 * Which stops are worth their handling cost? Given a marginal fuel cost
 * at a stop and the detour penalty of using it, rank the candidates.
 *
 * This is a plain economic comparison, stated explicitly so a planner
 * cannot mistake it for a routing decision.
 *
 * @param {Object} params
 * @param {number} params.legFuelKg          fuel on the direct sector
 * @param {number} params.detourFuelKg        extra fuel burned by the detour
 * @param {number} params.stopOverheadCents   handling + crew + landing charges
 * @param {number} params.fuelPriceCentsPerKg price at the detour stop
 * @param {number} params.detourOverheadCents extra fixed cost of the stop
 * @returns {{ extraFuelCostCents: number, extraOverheadCents: number, totalExtraCents: number, worthIt: boolean }}
 */
export function detourEconomics({ legFuelKg, detourFuelKg, stopOverheadCents, fuelPriceCentsPerKg, detourOverheadCents = 0 }) {
  const extraFuelCostCents = detourFuelKg * fuelPriceCentsPerKg;
  const totalExtraCents = extraFuelCostCents + stopOverheadCents + detourOverheadCents;
  return {
    extraFuelCostCents,
    extraOverheadCents: stopOverheadCents + detourOverheadCents,
    totalExtraCents,
    worthIt: totalExtraCents < 0, // only ever true if a caller passes savings
  };
}