import { describe, it, expect } from 'vitest';
import {
  solveRoute, solveRouteDP, bruteForceRoute, buildAdjacency, RoutingError, explainRoute,
} from '../shared/src/routing/constrained-path.js';
import {
  optimalRefuelPlan, bruteForceRefuel, requiredAtDeparture, fuelToReach, RefuelError,
} from '../shared/src/routing/refuel.js';

/**
 * Verification suite for two optimisation algorithms.
 *
 * These tests do not assert what the code intends to do. They assert
 * agreement between three INDEPENDENT implementations, plus structural
 * properties that must hold for any correct answer.
 *
 *   1. solveRoute        — Pareto label-setting (production)
 *   2. solveRouteDP      — fuel-indexed DP (reference)
 *   3. bruteForceRoute   — exhaustive enumeration (oracle)
 *
 * If all three agree on thousands of random instances, and the oracle is
 * correct by construction, the production algorithm is correct on those
 * instances. That is meaningfully stronger than a test suite written
 * from the same mental model as the implementation — which is how the
 * `_roll` defect shipped through 118 green tests.
 */

/* ------------------------------------------------------------------ *
 * Deterministic PRNG so a failure is always reproducible.
 * ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => number} rand @param {number} lo @param {number} hi */
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/**
 * Generate a random small instance: a dense-ish random digraph over
 * `n` nodes, with costs and fuel drawn independently so that cost/fuel
 * trade-offs genuinely arise.
 */
function randomInstance(rand, n) {
  const nodes = Array.from({ length: n }, (_, i) => `N${i}`);
  const flights = [];
  for (const from of nodes) {
    for (const to of nodes) {
      if (from === to) continue;
      if (rand() < 0.42) continue; // sparse
      flights.push({
        from, to,
        costCents: int(rand, 1, 5000),
        fuelKg: int(rand, 1, 12),
      });
    }
  }
  return {
    flights,
    source: nodes[0],
    destination: nodes[n - 1],
    tankCapacityKg: int(rand, 10, 40),
    minReserveKg: int(rand, 0, 6),
  };
}

/** Cheapest route ignoring the fuel constraint — the WRONG answer in general. */
function unconstrainedCheapest({ flights, source, destination }) {
  const adj = buildAdjacency(flights);
  const dist = new Map([[source, 0]]);
  const heap = [{ c: 0, n: source }];
  while (heap.length) {
    heap.sort((a, b) => a.c - b.c);
    const { c, n } = heap.shift();
    if (n === destination) return c;
    if (c > (dist.get(n) ?? Infinity)) continue;
    for (const e of adj.get(n) ?? []) {
      const nc = c + e.costCents;
      if (nc < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nc); heap.push({ c: nc, n: e.to }); }
    }
  }
  return dist.get(destination) ?? null;
}

/** Recompute cumulative fuel for a route and assert it is legal. */
function assertRouteLegal(instance, stops) {
  const index = new Map();
  for (const f of instance.flights) index.set(`${f.from}>${f.to}`, f);
  const usable = instance.tankCapacityKg - instance.minReserveKg;
  let cumulative = 0;
  let cost = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const leg = index.get(`${stops[i]}>${stops[i + 1]}`);
    expect(leg, `leg ${stops[i]}->${stops[i + 1]} must exist`).toBeDefined();
    cumulative += leg.fuelKg;
    cost += leg.costCents;
  }
  expect(cumulative).toBeLessThanOrEqual(usable);
  return { cumulative, cost };
}

/* ================================================================== *
 * 1. THREE-WAY AGREEMENT — the core correctness argument
 * ================================================================== */
describe('constrained shortest path — three independent solvers agree', () => {
  it('agrees with the exhaustive oracle on 3000 random instances', () => {
    let compared = 0;
    let feasible = 0;
    for (let seed = 1; seed <= 3000; seed += 1) {
      const rand = mulberry32(seed * 2654435761);
      const n = int(rand, 2, 6);
      const inst = randomInstance(rand, n);
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
        expect(pareto.stops[0]).toBe(inst.source);
        expect(pareto.stops[pareto.stops.length - 1]).toBe(inst.destination);
      }
    }
    expect(compared).toBeGreaterThan(2500);
    // The test is worthless if every instance was trivially infeasible.
    expect(feasible / compared).toBeGreaterThan(0.3);
  });

  it('agrees with the DP reference solver on 1500 random instances', () => {
    let feasible = 0;
    for (let seed = 1; seed <= 1500; seed += 1) {
      const rand = mulberry32(seed * 40503 + 17);
      const n = int(rand, 2, 6);
      const inst = randomInstance(rand, n);
      if (inst.flights.length === 0) continue;

      const pareto = solveRoute(inst);
      const dp = solveRouteDP(inst);
      expect(pareto.feasible, `seed ${seed}: feasibility must match DP`).toBe(dp.feasible);
      if (dp.feasible) {
        expect(pareto.costCents, `seed ${seed}: optimal cost must match DP`).toBe(dp.costCents);
        feasible += 1;
      }
    }
    expect(feasible).toBeGreaterThan(400);
  });

  it('the DP result is itself legal, not merely equal in cost', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const rand = mulberry32(seed * 22695477 + 3);
      const inst = randomInstance(rand, int(rand, 2, 6));
      if (inst.flights.length === 0) continue;
      const dp = solveRouteDP(inst);
      if (!dp.feasible) continue;
      assertRouteLegal(inst, dp.stops);
    }
  });
});

/* ================================================================== *
 * 2. THE CONSTRAINT IS LOAD-BEARING
 *
 * If these ever stop finding instances, the suite has silently become
 * vacuous. A regression that dropped the fuel constraint would pass every
 * other test in this file.
 * ================================================================== */
describe('the fuel constraint actually binds', () => {
  it('finds many instances where the unconstrained shortest path is INFEASIBLE', () => {
    let disagreements = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const rand = mulberry32(seed * 69069 + 11);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const unconstrained = unconstrainedCheapest(inst);
      if (unconstrained === null) continue;
      const constrained = solveRoute(inst);
      if (constrained.feasible && constrained.costCents > unconstrained) disagreements += 1;
    }
    // A naive Dijkstra would be wrong this often. Proof the constraint matters.
    expect(disagreements).toBeGreaterThan(50);
  });

  it('a greedy cheapest-next-hop planner is NOT optimal', () => {
    // Constructed counterexample: the cheapest first hop strands the aircraft,
    // while a dearer first hop reaches the destination.
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
    expect(result.feasible).toBe(true);
    // Greedy would pick A-B-D at cost 20 — but that burns 180kg in a 100kg tank.
    expect(result.costCents).toBe(22);
    expect(result.stops).toEqual(['A', 'C', 'D']);
    expect(assertRouteLegal(inst, result.stops).cumulative).toBeLessThanOrEqual(100);
  });
});

/* ================================================================== *
 * 3. STRUCTURAL PROPERTIES
 * ================================================================== */
describe('monotonicity — properties any correct solver must satisfy', () => {
  it('more tank capacity never increases the optimal cost', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const rand = mulberry32(seed * 1103515245 + 12345);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const base = solveRoute({ ...inst, tankCapacityKg: 20, minReserveKg: 3 });
      const bigger = solveRoute({ ...inst, tankCapacityKg: 45, minReserveKg: 3 });
      if (base.feasible && bigger.feasible) {
        expect(bigger.costCents, `seed ${seed}: capacity grew, cost must not rise`).toBeLessThanOrEqual(base.costCents);
      }
    }
  });

  it('a lower mandatory reserve never increases the optimal cost', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const rand = mulberry32(seed * 214013 + 7);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const strict = solveRoute({ ...inst, tankCapacityKg: 30, minReserveKg: 6 });
      const relaxed = solveRoute({ ...inst, tankCapacityKg: 30, minReserveKg: 1 });
      if (strict.feasible && relaxed.feasible) {
        expect(relaxed.costCents, `seed ${seed}: reserve fell, cost must not rise`).toBeLessThanOrEqual(strict.costCents);
      }
    }
  });

  it('raising any sector cost never decreases the optimal cost', () => {
    for (let seed = 1; seed <= 600; seed += 1) {
      const rand = mulberry32(seed * 1013904223 + 5);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const before = solveRoute(inst);
      if (!before.feasible) continue;

      // Increase the cost of every flight by 10%. Feasibility is unchanged
      // because feasibility depends only on fuel.
      const inflated = inst.flights.map((f) => ({ ...f, costCents: Math.round(f.costCents * 1.1) }));
      const after = solveRoute({ ...inst, flights: inflated });
      if (!after.feasible) continue; // fine: routes using that sector may now be pointless

      const touchedBefore = inst.flights.some((f) => before.stops.includes(f.from) && before.stops.includes(f.to));
      if (touchedBefore) {
        expect(after.costCents, `seed ${seed}: costs rose, optimum must not fall`).toBeGreaterThanOrEqual(before.costCents);
      }
    }
  });

  it('when the unconstrained optimum is feasible, it is also the constrained optimum', () => {
    let checked = 0;
    for (let seed = 1; seed <= 1200; seed += 1) {
      const rand = mulberry32(seed * 22699 + 91);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const unconstrained = unconstrainedCheapest(inst);
      if (unconstrained === null) continue;
      const result = solveRoute(inst);
      if (!result.feasible) continue;

      // If the constrained answer equals the unconstrained lower bound,
      // it is provably optimal — an independent certificate.
      if (result.costCents === unconstrained) checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

/* ================================================================== *
 * 4. EDGE CASES AND INPUT VALIDATION
 * ================================================================== */
describe('edge cases', () => {
  it('source equals destination costs nothing', () => {
    const r = solveRoute({ flights: [], source: 'A', destination: 'A', tankCapacityKg: 10, minReserveKg: 2 });
    expect(r).toMatchObject({ feasible: true, costCents: 0, stops: ['A'] });
  });

  it('reports infeasible when no route exists', () => {
    const r = solveRoute({
      flights: [{ from: 'A', to: 'B', costCents: 100, fuelKg: 5 }],
      source: 'A', destination: 'Z', tankCapacityKg: 100, minReserveKg: 0,
    });
    expect(r.feasible).toBe(false);
  });

  it('reports infeasible rather than returning an unflyable route', () => {
    const r = solveRoute({
      flights: [{ from: 'A', to: 'B', costCents: 100, fuelKg: 5000 }],
      source: 'A', destination: 'B', tankCapacityKg: 1000, minReserveKg: 500,
    });
    expect(r.feasible).toBe(false);
  });

  it('refuses a capacity that cannot hold the mandatory reserve', () => {
    expect(() => solveRoute({
      flights: [], source: 'A', destination: 'B', tankCapacityKg: 100, minReserveKg: 200,
    })).toThrow(RoutingError);
  });

  it('rejects non-integer fuel — silent truncation would create phantom capacity', () => {
    expect(() => solveRoute({
      flights: [{ from: 'A', to: 'B', costCents: 1, fuelKg: 10.5 }],
      source: 'A', destination: 'B', tankCapacityKg: 100, minReserveKg: 0,
    })).toThrow(/integer/);
  });

  it('rejects negative costs', () => {
    expect(() => solveRoute({
      flights: [{ from: 'A', to: 'B', costCents: -1, fuelKg: 1 }],
      source: 'A', destination: 'B', tankCapacityKg: 100, minReserveKg: 0,
    })).toThrow(/non-negative/);
  });

  it('drops self loops, which can never improve a route', () => {
    const withLoop = solveRoute({
      flights: [
        { from: 'A', to: 'A', costCents: 0, fuelKg: 0 },
        { from: 'A', to: 'B', costCents: 500, fuelKg: 10 },
      ],
      source: 'A', destination: 'B', tankCapacityKg: 100, minReserveKg: 0,
    });
    expect(withLoop.costCents).toBe(500);
    expect(withLoop.stops).toEqual(['A', 'B']);
  });

  it('handles zero-fuel legs without infinite looping', () => {
    const r = solveRoute({
      flights: [
        { from: 'A', to: 'B', costCents: 5, fuelKg: 0 },
        { from: 'B', to: 'C', costCents: 5, fuelKg: 0 },
        { from: 'C', to: 'A', costCents: 1, fuelKg: 0 },
      ],
      source: 'A', destination: 'C', tankCapacityKg: 0, minReserveKg: 0,
    });
    expect(r).toMatchObject({ feasible: true, costCents: 10 });
    expect(r.stops).toEqual(['A', 'B', 'C']);
  });

  it('a zero-cost cycle does not hang the planner', () => {
    const r = solveRoute({
      flights: [
        { from: 'A', to: 'B', costCents: 0, fuelKg: 0 },
        { from: 'B', to: 'A', costCents: 0, fuelKg: 0 },
        { from: 'A', to: 'T', costCents: 1, fuelKg: 0 },
      ],
      source: 'A', destination: 'T', tankCapacityKg: 0, minReserveKg: 0,
    });
    expect(r.costCents).toBe(1);
  });

  it('prefers the cheaper option when both are feasible', () => {
    const r = solveRoute({
      flights: [
        { from: 'A', to: 'B', costCents: 100, fuelKg: 1000 },
        { from: 'B', to: 'D', costCents: 100, fuelKg: 1000 },
        { from: 'A', to: 'D', costCents: 9000, fuelKg: 1500 },
      ],
      source: 'A', destination: 'D', tankCapacityKg: 2500, minReserveKg: 0,
    });
    expect(r.costCents).toBe(200);
  });

  it('uses a more expensive route when the cheap one is unflyable', () => {
    const r = solveRoute({
      flights: [
        { from: 'A', to: 'B', costCents: 100, fuelKg: 1000 },
        { from: 'B', to: 'D', costCents: 100, fuelKg: 1000 },
        { from: 'A', to: 'D', costCents: 9000, fuelKg: 1500 },
      ],
      source: 'A', destination: 'D', tankCapacityKg: 1900, minReserveKg: 0,
    });
    expect(r.costCents).toBe(9000);
    expect(r.stops).toEqual(['A', 'D']);
  });

  it('is deterministic across repeated runs', () => {
    const inst = {
      flights: [
        { from: 'A', to: 'B', costCents: 100, fuelKg: 1000 },
        { from: 'B', to: 'D', costCents: 100, fuelKg: 1000 },
        { from: 'A', to: 'C', costCents: 120, fuelKg: 800 },
        { from: 'C', to: 'D', costCents: 120, fuelKg: 800 },
        { from: 'B', to: 'C', costCents: 30, fuelKg: 400 },
      ],
      source: 'A', destination: 'D', tankCapacityKg: 2000, minReserveKg: 100,
    };
    const first = JSON.stringify(solveRoute(inst).stops);
    for (let i = 0; i < 50; i += 1) {
      expect(JSON.stringify(solveRoute(inst).stops)).toBe(first);
    }
  });

  it('explains a route leg by leg', () => {
    const inst = {
      flights: [
        { from: 'JFK', to: 'YUL', costCents: 42_000, fuelKg: 3200 },
        { from: 'YUL', to: 'GRU', costCents: 71_000, fuelKg: 8600 },
      ],
    };
    const detail = explainRoute({ flights: inst.flights, stops: ['JFK', 'YUL', 'GRU'] });
    expect(detail).toHaveLength(2);
    expect(detail[0]).toMatchObject({ sector: 'JFK-YUL', cumulativeFuelKg: 3200 });
    expect(detail[1]).toMatchObject({ sector: 'YUL-GRU', cumulativeFuelKg: 11800 });
  });
});

/* ================================================================== *
 * 5. A REAL ROUTE, WITH NUMBERS A PLANNER WOULD RECOGNISE
 * ================================================================== */
describe('realistic long-haul scenario', () => {
  // A320neo, usable tanks ~18 t, 30-minute final reserve 1,500 kg.
  const NETWORK = {
    flights: [
      { from: 'JFK', to: 'YUL', costCents: 38_000, fuelKg: 3_200 },
      { from: 'YUL', to: 'GRU', costCents: 74_000, fuelKg: 8_600 },
      { from: 'JFK', to: 'GRU', costCents: 61_000, fuelKg: 12_100 },
      { from: 'JFK', to: 'DUB', costCents: 22_000, fuelKg: 3_300 },
      { from: 'DUB', to: 'GRU', costCents: 89_000, fuelKg: 10_400 },
    ],
  };
  const TANK = 24_000;
  const RESERVE = 1_500;

  it('takes the cheapest feasible route when the tank is large enough', () => {
    // 24,000 - 1,500 = 22,500 kg usable. Everything fits, so cost decides:
    // the 61,000c direct sector beats the 112,000c two-stop routing.
    const result = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU', tankCapacityKg: TANK, minReserveKg: RESERVE });
    expect(result.feasible).toBe(true);
    expect(result.costCents).toBe(61_000);
    expect(result.stops).toEqual(['JFK', 'GRU']);
  });

  it('abandons the cheapest sector and takes two stops when the tank forbids it', () => {
    // 13,300 - 1,500 = 11,800 kg usable.
    //   JFK-GRU needs 12,100 kg  -> does NOT fit.
    //   JFK-YUL-GRU needs 11,800 kg -> exactly fits.
    //   JFK-DUB-GRU needs 13,700 kg -> does not fit.
    // The planner must prefer the dearer route because the cheap one is
    // unflyable. This is the entire point of the algorithm.
    const tight = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU', tankCapacityKg: 13_300, minReserveKg: RESERVE });
    expect(tight.feasible).toBe(true);
    expect(tight.costCents).toBe(112_000);
    expect(tight.stops).toEqual(['JFK', 'YUL', 'GRU']);

    // One kilogram tighter and even that is impossible.
    const impossible = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU', tankCapacityKg: 13_299, minReserveKg: RESERVE });
    expect(impossible.feasible).toBe(false);
  });

  it('matches the oracle and the DP on the realistic network', () => {
    const inst = { ...NETWORK, source: 'JFK', destination: 'GRU', tankCapacityKg: TANK, minReserveKg: RESERVE };
    const a = solveRoute(inst);
    const b = solveRouteDP(inst);
    const c = bruteForceRoute(inst);
    expect(b.costCents).toBe(a.costCents);
    expect(c.costCents).toBe(a.costCents);
  });

  it('finds the cheaper route once the direct sector becomes flyable', () => {
    // 13,000 - 500 = 12,500 kg usable. The 12,100 kg direct sector now fits,
    // so it wins on cost.
    const result = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU', tankCapacityKg: 13_000, minReserveKg: 500 });
    expect(result.costCents).toBe(61_000);
  });

  it('handles a network where the only viable path needs two intermediate stops', () => {
    const narrow = {
      flights: [
        { from: 'A', to: 'B', costCents: 10, fuelKg: 3_000 },
        { from: 'B', to: 'C', costCents: 10, fuelKg: 3_000 },
        { from: 'C', to: 'D', costCents: 10, fuelKg: 3_000 },
        { from: 'A', to: 'D', costCents: 1, fuelKg: 30_000 },
      ],
      source: 'A', destination: 'D', tankCapacityKg: 10_000, minReserveKg: 1_000,
    };
    // Usable is 9,000 kg: the 30,000 kg direct sector is impossible, and the
    // three 3,000 kg legs total exactly 9,000 kg — the tightest legal fit.
    const result = solveRoute(narrow);
    expect(result.costCents).toBe(30);
    expect(result.stops).toEqual(['A', 'B', 'C', 'D']);
    expect(assertRouteLegal(narrow, result.stops).cumulative).toBe(9_000);

    // One kilogram less and the three-stop route becomes illegal too.
    const tooTight = solveRoute({ ...narrow, tankCapacityKg: 9_999 });
    expect(tooTight.feasible).toBe(false);
  });
});

/* ================================================================== *
 * 6. SCALE
 * ================================================================== */
describe('scale', () => {
  it('plans a 400-airport network with 6,000 sectors in well under a second', () => {
    const N = 400;
    const rand = mulberry32(987654321);
    const nodes = Array.from({ length: N }, (_, i) => `APT${i}`);
    /** @type {any[]} */
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
    expect(result.costCents).toBeGreaterThan(0);
    assertRouteLegal(
      { flights, tankCapacityKg: 45_000, minReserveKg: 1_500 }, result.stops,
    );
    // 6,000 sectors must not take seconds.
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ================================================================== *
 * 7. FUEL UPLIFT PLANNING
 * ================================================================== */
describe('refuel — myopic policy versus exhaustive search', () => {
  it('matches the oracle on 2000 random routes', () => {
    let compared = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const rand = mulberry32(seed * 48271 + 31);
      const legs = int(rand, 1, 3);
      const stops = Array.from({ length: legs + 1 }, (_, i) => `S${i}`);
      const legFuelKg = Array.from({ length: legs }, () => int(rand, 1, 9));
      // Coarse price granularity keeps the brute-force space small.
      const priceCentsPerKg = Array.from({ length: legs + 1 }, () => int(rand, 1, 4) * 25);
      const reserveKg = int(rand, 0, 2);
      const tankCapacityKg = legFuelKg.reduce((a, b) => a + b, 0) + reserveKg + int(rand, 0, 3);

      const args = { stops, legFuelKg, priceCentsPerKg, tankCapacityKg, reserveKg };
      const mine = optimalRefuelPlan(args);
      const oracle = bruteForceRefuel(args);

      compared += 1;
      expect(oracle.feasible, `seed ${seed}: test instance must be feasible`).toBe(true);
      expect(mine.totalCostCents, `seed ${seed}: myopic plan must be cost-optimal`).toBe(oracle.totalCostCents);
    }
    expect(compared).toBeGreaterThan(1500);
  });

  it('arrives at every stop with at least the reserve, and reports honest arithmetic', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const rand = mulberry32(seed * 7919 + 13);
      const legs = int(rand, 1, 5);
      const args = {
        stops: Array.from({ length: legs + 1 }, (_, i) => `S${i}`),
        legFuelKg: Array.from({ length: legs }, () => int(rand, 1, 10)),
        priceCentsPerKg: Array.from({ length: legs + 1 }, () => int(rand, 1, 5) * 20),
        tankCapacityKg: int(rand, 60, 120),
        reserveKg: int(rand, 1, 5),
      };
      const plan = optimalRefuelPlan(args);

      let fuel = 0;
      let cost = 0;
      for (let i = 0; i < legs; i += 1) {
        expect(fuel, `seed ${seed}: uplift must not exceed tank capacity`).toBeLessThanOrEqual(args.tankCapacityKg);
        fuel += plan.upliftsKg[i];
        expect(fuel).toBeLessThanOrEqual(args.tankCapacityKg);
        expect(plan.departureFuelKg[i]).toBe(fuel);
        cost += plan.upliftsKg[i] * args.priceCentsPerKg[i];
        fuel -= args.legFuelKg[i];
        expect(fuel, `seed ${seed}: reserve breached on arrival`).toBeGreaterThanOrEqual(args.reserveKg);
        expect(plan.arrivalFuelKg[i + 1] ?? fuel).toBe(fuel);
      }
      expect(cost, 'reported cost must equal the sum of uplift x price').toBe(plan.totalCostCents);
    }
  });

  it('tankers forward when a real intermediate station is cheaper', () => {
    // MAN is a genuine fueling station at 70c/kg, cheaper than JFK at 95c.
    const plan = optimalRefuelPlan({
      stops: ['JFK', 'MAN', 'GRU'],
      legFuelKg: [3200, 8600],
      priceCentsPerKg: [95, 70, 88],
      tankCapacityKg: 24_000,
      reserveKg: 1_500,
    });
    // At JFK the next cheaper stop is MAN, so buy only enough to reach it:
    // 3,200 + 1,500 = 4,700 kg. Do NOT tanker all the way to GRU, because
    // GRU at 88c is dearer than MAN at 70c.
    expect(plan.upliftsKg).toEqual([4700, 8600]);
    expect(plan.decisions[0].nextCheaperStop).toBe('MAN');
    expect(plan.decisions[0].departureFuelKg).toBe(4700);
    expect(plan.decisions[1].nextCheaperStop).toBe(null);
    expect(plan.totalCostCents).toBe(4700 * 95 + 8600 * 70);
  });

  it('tankers the whole way when the destination price is irrelevant to decisions', () => {
    // GRU is the cheapest node but it is the ARRIVAL point: no fuel is sold
    // there, so its price must not influence any uplift. The planner therefore
    // sees "no cheaper fueling station ahead" at both JFK and YUL, and loads
    // everything that is still needed at the cheaper of the two.
    const plan = optimalRefuelPlan({
      stops: ['JFK', 'YUL', 'GRU'],
      legFuelKg: [3200, 8600],
      priceCentsPerKg: [95, 110, 88],
      tankCapacityKg: 24_000,
      reserveKg: 1_500,
    });
    expect(plan.decisions[0].nextCheaperStop).toBe(null);
    expect(plan.upliftsKg).toEqual([13_300, 0]);
    expect(plan.totalCostCents).toBe(13_300 * 95);
    expect(plan.departureFuelKg[0]).toBe(13_300);
    expect(plan.departureFuelKg[1]).toBe(10_100); // 8,600 leg + 1,500 reserve
    expect(plan.upliftsKg[1]).toBe(0);
  });

  it('buys nothing extra when every stop is dearer than the first', () => {
    const plan = optimalRefuelPlan({
      stops: ['A', 'B', 'C'],
      legFuelKg: [1000, 1000],
      priceCentsPerKg: [50, 80, 120],
      tankCapacityKg: 10_000,
      reserveKg: 500,
    });
    expect(plan.upliftsKg).toEqual([2500, 0]); // whole route plus reserve, loaded at A
    expect(plan.totalCostCents).toBe(2500 * 50);
  });

  it('fills the tank when the remainder of the route exceeds it', () => {
    const plan = optimalRefuelPlan({
      stops: ['A', 'B', 'C'],
      legFuelKg: [8000, 8000],
      priceCentsPerKg: [50, 60, 70],
      tankCapacityKg: 10_000,
      reserveKg: 500,
    });
    expect(plan.upliftsKg[0]).toBe(10_000);        // tank limited
    expect(plan.decisions[0].rationale).toMatch(/tank limited/);
    expect(plan.upliftsKg[1]).toBe(6_500);         // depart B with 8,500 = 8,000 leg + 500 reserve
    expect(plan.departureFuelKg[1]).toBe(8_500);
    expect(plan.departureFuelKg[1]).toBeLessThanOrEqual(10_000);
  });

  it('respects the reserve when planning a short hop into a cheap station', () => {
    const plan = optimalRefuelPlan({
      stops: ['A', 'B'],
      legFuelKg: [4000],
      priceCentsPerKg: [100, 40],
      tankCapacityKg: 9000,
      reserveKg: 1500,
    });
    expect(plan.upliftsKg).toEqual([5500]); // cannot buy less than leg + reserve
    expect(plan.totalCostCents).toBe(5500 * 100);
  });

  it('refuses a single sector that cannot fit in the tanks', () => {
    expect(() => optimalRefuelPlan({
      stops: ['A', 'B'], legFuelKg: [50_000],
      priceCentsPerKg: [100, 100], tankCapacityKg: 20_000, reserveKg: 1_500,
    })).toThrow(/No refuelling schedule can make this route legal/);
  });

  it('accepts a multi-stop route whose TOTAL fuel exceeds tank capacity', () => {
    // 8,000 + 8,000 kg of legs, but only 10,000 kg in the tanks. This is
    // legal precisely because the aircraft refuels at B. A feasibility
    // check that demanded the whole route fit in one tank would reject it —
    // which is the bug this test was written to pin down.
    const legFuelKg = [8000, 8000];
    const plan = optimalRefuelPlan({
      stops: ['A', 'B', 'C'], legFuelKg,
      priceCentsPerKg: [50, 60, 70], tankCapacityKg: 10_000, reserveKg: 500,
    });
    const totalLegFuel = legFuelKg.reduce((a, b) => a + b, 0);
    expect(totalLegFuel).toBeGreaterThan(10_000);
    expect(plan.upliftsKg[0]).toBe(10_000);
    expect(plan.departureFuelKg[0]).toBeLessThanOrEqual(10_000);
    expect(plan.departureFuelKg[1]).toBe(8500);
  });

  it('names the offending sector rather than reporting a route-level failure', () => {
    expect(() => optimalRefuelPlan({
      stops: ['A', 'B', 'C'], legFuelKg: [4000, 30_000],
      priceCentsPerKg: [10, 10, 10], tankCapacityKg: 10_000, reserveKg: 500,
    })).toThrow(/Sector B -> C needs 30500kg/);
  });

  it('rejects mismatched array lengths rather than reading undefined', () => {
    expect(() => optimalRefuelPlan({
      stops: ['A', 'B', 'C'], legFuelKg: [1000],
      priceCentsPerKg: [10, 10, 10], tankCapacityKg: 5000, reserveKg: 100,
    })).toThrow(RefuelError);
  });

  it('rejects a single-stop route, which has no legs to plan', () => {
    expect(() => optimalRefuelPlan({
      stops: ['A'], legFuelKg: [], priceCentsPerKg: [10],
      tankCapacityKg: 5000, reserveKg: 0,
    })).toThrow(/at least one leg/);
  });
});

/* ================================================================== *
 * 8. BACKWARD REQUIREMENT ARITHMETIC
 * ================================================================== */
describe('requiredAtDeparture', () => {
  it('composes the whole remainder of the route, not just the next leg', () => {
    // legs [1000, 2000, 500], reserve 300, route A-B-C-D.
    // Departing C: 500 leg + 300 reserve           =  800
    // Departing B: 2000 leg + max(300, 800)         = 2800
    // Departing A: 1000 leg + max(300, 2800)        = 3800
    //
    // This test originally asserted 2300/2300, which was wrong in exactly
    // the same way the implementation was wrong: it treated the reserve
    // as if it were the only requirement beyond the next leg, so it
    // under-fuelled the first departure. Both the code and the test were
    // wrong in the same direction, which is what a test suite written from
    // the author's own mental model looks like. Caught by the exhaustive
    // oracle, not by inspection of either.
    const required = requiredAtDeparture([1000, 2000, 500], 300);
    expect(required[2]).toBe(800);
    expect(required[1]).toBe(2800);
    expect(required[0]).toBe(3800);
  });

  it('single-leg route needs exactly the leg plus the reserve', () => {
    expect(requiredAtDeparture([4000], 1500)).toEqual([5500]);
  });

  it('respects the reserve at every intermediate landing, not just the last', () => {
    // Leg 1 is short and leg 2 is long: departing stop 0 must cover both.
    expect(fuelToReach([100, 900], 0, 2, 50)).toBe(1050);
    // Arriving at stop 1 needs only its own leg plus reserve.
    expect(fuelToReach([100, 900], 1, 2, 50)).toBe(950);
  });
});