"""
Part IV: algorithms that must be exactly right.
"""

from framework import (ASSUMED, BUG, BUL, CODE, H1, H2, H3, HR, LEAD, LOCK,
                       NUMLIST, P, PART, TABLE, VERIFIED)


def part4(story):
    story += PART(
        'Part IV — Algorithms that must be exactly right',
        'The routing module is the newest part of AMS and the only one where '
        'the correctness argument is written out in full. This part teaches '
        'that argument, and — more importantly — teaches how we know the '
        'implementation matches it.')

    story += H2('The problem class: resource-constrained shortest path')

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

    story += LEAD(
        'In one sentence: find the cheapest sequence of stops from A to B such '
        'that the fuel burned so far never exceeds capacity minus reserve.')

    story += P(
        'This is called a *resource-constrained shortest path* problem. The '
        'distinguishing feature is the second constraint: among all routes, '
        'minimise cost subject to cumulative fuel never exceeding a limit. It '
        'is harder than ordinary shortest path, and the difference is not '
        'subtle.')

    story += CODE(
        '''JFK → YUL   38,000c   3,200 kg
YUL → GRU   74,000c   8,600 kg
JFK → GRU   61,000c  12,100 kg
JFK → DUB   22,000c   3,300 kg
DUB → GRU   89,000c  10,400 kg

// With tank 24,000 and reserve 1,500 → 22,500 kg usable, every route fits:
const generous = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU',
  tankCapacityKg: 24_000, minReserveKg: 1_500 });
generous.costCents   // 61,000 — direct wins on cost

// Tighten to 13,300 / 1,500 → 11,800 kg usable:
const tight = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU',
  tankCapacityKg: 13_300, minReserveKg: 1_500 });
tight.costCents     // 112,000 — the direct sector no longer fits
tight.stops         // ['JFK','YUL','GRU'] — a MORE expensive route

// One kilogram tighter and nothing is legal:
const impossible = solveRoute({ ...NETWORK, source: 'JFK', destination: 'GRU',
  tankCapacityKg: 13_299, minReserveKg: 1_500 });
impossible.feasible // false''')

    story += H2('Why greedy and unconstrained shortest path both fail')

    story += CODE(
        '''describe('the fuel constraint actually binds', () => {
  it('finds many instances where the unconstrained shortest path is INFEASIBLE', () => {
    let disagreements = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const rand = mulberry32(seed * 69069 + 11);
      const inst = randomInstance(rand, int(rand, 3, 6));
      const unconstrained = unconstrainedCheapest(inst);
      if (unconstrained === null) continue;
      const constrained = solveRoute(inst);
      if (constrained.feasible && constrained.costCents > unconstrained) disagreements += 1;
    }
    // A naive Dijkstra would be wrong this often. Proof the constraint matters.
    expect(disagreements).toBeGreaterThan(50);
  });

  it('a greedy cheapest-next-hop planner is NOT optimal', () => {
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
    // Greedy picks A-B-D at cost 20 — but that burns 180kg in a 100kg tank.
    expect(result.costCents).toBe(22);
    expect(result.stops).toEqual(['A', 'C', 'D']);
  });
});''',
        'tests/routing.test.js')

    story += CODE(
        '''// The greedy counterexample, visualised
//
//   100 kg tank
//
//   A ──10c/90kg──► B ──10c/90kg──► D
//                    TOTAL: 20c, 180kg   ← CANNOT FLY
//
//   A ──11c/50kg──► C ──11c/50kg──► D
//                    TOTAL: 22c, 100kg   ← exactly fits
//
// Greedy returns the cheaper answer. Greedy grounds the aircraft.''')

    story += LOCK(
        'Why the greedy failure is the dangerous kind',
        'The greedy answer is *cheaper*. It is also impossible to fly. A '
        'planner that reported it would look better on every dashboard metric '
        'and would be catastrophically wrong.\n\n'
        'This is the shape of defect that no amount of dashboard review '
        'catches: the number looks right, because the question was never asked.')

    story += H2('Label-setting and the dominance relation')

    story += CODE(
        '''/**
 * Pareto label-setting (the BIRD family). At each node we keep a set of
 * NON-DOMINATED labels, where a label is (cost, fuelUsed).
 *
 *   Label L1 dominates L2  iff  cost1 <= cost2 AND fuel1 <= fuel2
 *                            (and they are not identical)
 *
 * Dominance is SOUND because both the objective and the resource are
 * monotone in the same direction: any completion feasible from L2 is
 * also feasible from L1 and costs no more. Therefore a dominated label
 * can never be the prefix of an optimal solution, and discarding it
 * cannot remove the optimum.
 */''')

    story += P(
        'The intuition is worth a concrete example, because "non-dominated" is '
        'abstract until you see a frontier.')

    story += CODE(
        '''// At airport B, three routes from A have been considered:
//   (cost 50,000c, fuel 3,000 kg)
//   (cost 40,000c, fuel 7,000 kg)
//   (cost 45,000c, fuel 3,100 kg)
//
// Is the third label worth keeping?
//   vs (50,000, 3,000): 45,000 < 50,000 but 3,100 > 3,000 → NOT dominated
//   vs (40,000, 7,000): 45,000 > 40,000 but 3,100 < 7,000 → NOT dominated
// → KEEP IT. It is genuinely different: cheaper than one, lighter than the other.
//
// The frontier at B is {(40,000 / 7,000), (45,000 / 3,100), (50,000 / 3,000)}.
// The (50,000, 3,000) label IS dominated? No — nothing is both cheaper AND lighter.
// So all three survive.''')

    story += CODE(
        '''// Now a fourth arrives: (cost 44,000c, fuel 3,200 kg)
//   vs (50,000, 3,000): 44,000 < 50,000, 3,200 > 3,000  → not dominated
//   vs (45,000, 3,100): 44,000 < 45,000, 3,200 > 3,100  → not dominated
//   vs (40,000, 7,000): 44,000 > 40,000, 3,200 < 7,000  → not dominated
// → KEEP IT too. Four genuinely incomparable options.''')

    story += CODE(
        '''// Finally: (cost 41,000c, fuel 3,050 kg)
//   vs (45,000, 3,100): 41,000 < 45,000 AND 3,050 < 3,100 → DOMINATES, discard that one
//   vs (40,000, 7,000): 41,000 > 40,000, but 3,050 < 7,000 → not dominated
//   vs (50,000, 3,000): 41,000 < 50,000, but 3,050 > 3,000 → not dominated
// → The (45,000, 3,100) label is discarded. It can never help.''')

    story += LOCK(
        'The intuitive argument for discarding a dominated label',
        'If a label is both more expensive AND heavier than another label at the '
        'same airport, then every route reachable from it is reachable from the '
        'other one, for less money, with more fuel in the tanks. It is not '
        'merely *probably* useless — it is **provably** useless, because the '
        'remaining journey is identical either way.\n\n'
        'This is what makes the algorithm exact rather than heuristic. No '
        'promising option is thrown away.')

    story += CODE(
        '''function dominates(ca, fa, cb, fb) {
  return ca <= cb && fa <= fb && (ca < cb || fa < fb);
}''')

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

    story += H2('Why the dominance rule is sound')

    story += CODE(
        ''' * Invariant I1 (reachability): every label in the frontier at v
 *   corresponds to an actual feasible path from the source to v.
 *   Proof: labels are created only by extending a popped label with a
 *   real edge, and only when the resulting cumulative fuel satisfies the
 *   capacity constraint. Base case is the trivial path at the source.
 *
 * Invariant I2 (pruning soundness): if L1 dominates L2 at v, then for
 *   every feasible completion C of L2 to any destination, C composed
 *   with L1 is also feasible and no more expensive than C composed with
 *   L2.
 *   Proof: fuel is consumable and monotone — having burnt less fuel
 *   leaves at least as much remaining at every subsequent point, so
 *   every leg that was feasible remains feasible. Cost is additive, and
 *   cost1 <= cost2, so the total cannot increase.
 *
 * Theorem: the algorithm returns the minimum-cost feasible path.
 *   Proof: Take an optimal feasible path P. Walk it from the source. Each
 *   prefix label is either in the frontier, or was pruned. If pruned,
 *   it was dominated by some retained L' which by I2 can replace that
 *   prefix with no increase in cost or fuel. Following I2
 *   inductively, a path of cost <= OPT(P) survives to the destination.
 *   By I1 every surviving label is feasible, so its cost >= OPT(P).
 *   Therefore the minimum-cost surviving label has cost exactly OPT(P).''')

    story += LEAD(
        'Translated out of notation: because both the objective (cost) and the '
        'constraint (fuel) improve in the same direction, a worse label can '
        'never rescue a better one. That is what makes discarding labels safe, '
        'and it is the entire reason the algorithm is exact rather than a '
        'heuristic.')

    story += H3('The one assumption the theorem depends on')

    story += ASSUMED(
        'Monotonicity of the resource',
        'The proof requires that using *less* resource never hurts. That is true '
        'for fuel, because fuel is only ever consumed and never generated en '
        'route.\n\n'
        'It would be false for a resource that could be replenished, or for one '
        'with a penalty for carrying too little. If AMS ever added a constraint '
        'of that shape — "you must also arrive with at least X kg" — the '
        'dominance rule would need to change, and a label that is both cheaper '
        'and lighter might no longer be the better one.\n\n'
        'Nothing in the code documents this dependency. It is a real '
        'constraint on future modification and belongs in a comment next to '
        '`dominates()`.')

    story += H2('Complexity, and knowing when you are near the wall')

    story += CODE(
        ''' * Complexity: O(L · E · log L) where L is the largest per-node frontier.
 * In practice L is tiny (usually < 5) because real networks have few
 * genuinely incomparable cost/fuel trade-offs per airport.''')

    story += TABLE(
        ['Symbol', 'Meaning', 'Typical value in an airline network'],
        [
            ['V', 'Airports in the network', '200–1,500 worldwide; 20–80 for a '
             'single operation'],
            ['E', 'Direct sectors', '~3–15 per airport'],
            ['L', 'Largest per-node non-dominated frontier',
             '**2–5.** The critical assumption.'],
            ['B', 'Maximum distinct fuel values', '~45,000 kg for a widebody'],
        ],
        widths=[10, 32, 58])

    story += CODE(
        '''it('plans a 400-airport network with 6,000 sectors in well under a second', () => {
    const N = 400;
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
    assertRouteLegal({ flights, tankCapacityKg: 45_000, minReserveKg: 1_500 }, result.stops);
    // 6,000 sectors must not take seconds.
    expect(elapsed).toBeLessThan(1000);
});''',
        'tests/routing.test.js')

    story += P(
        'The test generates fuel *uncorrelated* with cost. That is deliberate '
        'and it is the most important line in the fixture. If cheap sectors '
        'happened to be light, the dominance rule would rarely need more than '
        'one label per airport, and the hard path through the algorithm would '
        'never be exercised.')

    story += VERIFIED(
        'Where the wall is, and how you know',
        'The algorithm\'s cost depends on the frontier size L, not on fuel '
        'quantity. That is what makes it tractable at all — a fuel-indexed DP '
        'over 45,000 kg of capacity would be 45,000 states per airport, roughly '
        '68 million states for a 1,500-airport network.\n\n'
        'The Pareto algorithm has no such dependence, which is why it is the '
        'production solver and the DP is a reference implementation only. The '
        'DP carries a guard:\n\n'
        '```\n'
        'if (expanded > maxExpand) {\n'
        '  throw new RoutingError(\n'
        '    `DP state space exceeded ${maxExpand} - use solveRoute instead`,\n'
        '    \'ROUTE_DP_TOO_LARGE\');\n'
        '}\n'
        '```')

    story += ASSUMED(
        'The L ≈ 2–5 assumption is not proven, only observed',
        'The complexity is stated as O(L · E · log L) and the comment asserts '
        'that L is usually small. This has not been verified adversarially. A '
        'network constructed so that many labels are genuinely incomparable at '
        'one airport could drive L to hundreds, making the search quadratic in '
        'practice.\n\n'
        '**The mitigation is instrumentation**: `solveRoute` already returns '
        '`labelsExpanded`, `labelsPruned` and `maxFrontier`. Logging `maxFrontier` '
        'in production would turn the assumption into a measurement. This is not '
        'wired up anywhere, and it should be.')

    story += H2('Differential verification against brute force')

    story += CODE(
        '''/**
 * Exhaustive enumerator over every simple path. Exponential, used ONLY
 * to validate the fast algorithms on small instances.
 */''')

    story += CODE(
        '''export function bruteForceRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
  const usable = tankCapacityKg - minReserveKg;
  if (usable < 0) throw new RoutingError('Capacity below reserve', 'ROUTE_CAPACITY_BELOW_RESERVE');
  if (source === destination) return { feasible: true, costCents: 0, stops: [source], pathsExplored: 0 };

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
  return {
    feasible: bestStops !== null,
    costCents: bestCost === Infinity ? 0 : bestCost,
    stops: bestStops,
    pathsExplored: explored,
  };
}''')

    story += P(
        'This solver has no cleverness in it. It tries every route, checks '
        'feasibility, keeps the cheapest, and returns. That makes it an '
        '*oracle*: correct by construction, with nothing to get wrong except '
        'the constraints themselves.')

    story += CODE(
        '''describe('constrained shortest path — three independent solvers agree', () => {
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
      }
    }
    expect(compared).toBeGreaterThan(2500);
    // The test is worthless if every instance was trivially infeasible.
    expect(feasible / compared).toBeGreaterThan(0.3);
  });

  it('agrees with the DP reference solver on 1500 random instances', () => {
    // ... same structure ...
  });

  it('the DP result is itself legal, not merely equal in cost', () => { /* ... */ });
});''')

    story += P('Three assertions do distinct work, and the third is the one '
               'teams skip.')

    story += TABLE(
        ['Assertion', 'What it catches'],
        [
            ['Feasibility must match the oracle',
             'The solver reports "no route" when one exists, or vice versa'],
            ['Cost must match the oracle',
             'The solver returns a suboptimal route'],
            ['**The route must re-add to its own reported cost**',
             'The cost is right but the returned stops are a different route — '
             'e.g. a predecessor-pointer bug assembling the wrong path'],
        ],
        widths=[36, 64])

    story += CODE(
        '''/** Recompute cumulative fuel for a route and assert it is legal. */
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
}''')

    story += LOCK(
        'Why the self-consistency check is not redundant',
        'A solver could return the correct cost alongside a route that does not '
        'achieve it — if, for instance, a reconstruction bug assembled the stops '
        'from wrong predecessor pointers. Comparing two costs would pass. '
        'Walking the returned route and re-adding its own costs catches that, '
        'and independently confirms the fuel constraint holds on the answer that '
        'will actually be flown.')

    story += BUG(
        'The defect this technique found: the DP carried the wrong node',
        '```\n'
        'buckets[nf].push({ fuelUsed: nf, costCents: nc,\n'
        '                   from: state.from, prevFuel: f });\n'
        '                     ^^^^^^^^^^^^^^\n'
        '```\n\n'
        'It recorded the node the flight **departed** from rather than the one it '
        '**arrived** at. Every subsequent step then re-expanded the wrong '
        'airport\'s outgoing flights, so the DP reported routes as infeasible '
        'that the primary solver had found.\n\n'
        'The consequence is instructive: the bug was in the *reference* '
        'implementation, and it would have been missed indefinitely by any '
        'hand-written expectation. It was caught only because the test forces '
        'two independent implementations to agree.')

    story += LOCK(
        'The general principle this defect teaches',
        'A second implementation is only useful if something **forces** them to '
        'agree. Two solvers that disagree and are never compared provide no more '
        'assurance than one.\n\n'
        'This is why the AMS test suite cross-checks rather than asserting '
        'hand-computed values wherever it can.')

    story += H2('Property tests and metamorphic tests')

    story += CODE(
        '''describe('monotonicity — properties any correct solver must satisfy', () => {
  it('more tank capacity never increases the optimal cost', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const rand = mulberry32(seed * 1103515245 + 12345);
      const inst = randomInstance(rand, int(rand, 3, 6));
      if (inst.flights.length === 0) continue;

      const base = solveRoute({ ...inst, tankCapacityKg: 20, minReserveKg: 3 });
      const bigger = solveRoute({ ...inst, tankCapacityKg: 45, minReserveKg: 3 });
      if (base.feasible && bigger.feasible) {
        expect(bigger.costCents, `seed ${seed}: capacity grew, cost must not rise`)
          .toBeLessThanOrEqual(base.costCents);
      }
    }
  });

  it('a lower mandatory reserve never increases the optimal cost', () => { /* ... */ });

  it('raising any sector cost never decreases the optimal cost', () => { /* ... */ });

  it('when the unconstrained optimum is feasible, it is also the constrained optimum',
    () => {
      let checked = 0;
      for (let seed = 1; seed <= 1200; seed += 1) {
        // ...
        if (result.costCents === unconstrained) checked += 1;
      }
      expect(checked).toBeGreaterThan(20);
    });
});''')

    story += P(
        'These tests know nothing about the algorithm. They express truths '
        'about the *problem*, and any correct implementation must satisfy them. '
        'A completely different correct algorithm would pass them; the '
        'particular implementation described in this document need not be known '
        'to the test.')

    story += TABLE(
        ['Property', 'Why it must hold'],
        [
            ['More capacity cannot cost more',
             'A bigger tank removes a constraint; it cannot add one'],
            ['A lower reserve cannot cost more',
             'Same reasoning — a weaker requirement cannot hurt'],
            ['Higher prices cannot cost less',
             'Expensive flights are never an opportunity'],
            ['A feasible unconstrained optimum equals the constrained optimum',
             'If the cheap answer is allowed, it should win'],
        ],
        widths=[40, 60])

    story += P(
        'The last property is worth spelling out. It says: *constraint the '
        'answer, and if the unconstrained answer is still legal, the '
        'constrained answer must equal it.* That is an independent certificate '
        'of optimality — the test can confirm the solver\'s answer without '
        'consulting the oracle at all.')

    story += H3('Edge cases as a deliberate category')

    story += CODE(
        '''  it('drops self loops, which can never improve a route', () => {
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
  });

  it('a zero-cost cycle does not hang the planner', () => { /* ... */ });

  it('rejects non-integer fuel — silent truncation would create phantom capacity',
    () => {
      expect(() => solveRoute({
        flights: [{ from: 'A', to: 'B', costCents: 1, fuelKg: 10.5 }],
        source: 'A', destination: 'B', tankCapacityKg: 100, minReserveKg: 0,
      })).toThrow(/integer/);
  });''')

    story += CODE(
        '''export function buildAdjacency(flights) {
  for (const f of flights) {
    if (!Number.isSafeInteger(f.fuelKg) || f.fuelKg < 0) {
      throw new RoutingError(
        `Flight ${f.from}->${f.to} fuel must be a non-negative integer number of kg`,
        'ROUTE_BAD_FUEL',
      );
    }
    if (f.from === f.to) {
      // A self-loop can never improve a route in this problem: it adds
      // cost and fuel, so it is strictly dominated. Silently dropping it
      // is safe and prevents degenerate label churn.
      continue;
    }
    // ...
  }
}''')

    story += BUG(
        'The infinite loop, and why no assertion would have found it',
        '```\n'
        'if (dominates(other.costCents, other.fuelUsedKg, costCents, fuelUsedKg)) {\n'
        '  dominated = true; break;\n'
        '}\n'
        '```\n\n'
        'A zero-cost, zero-fuel cycle produces a label **identical** to one '
        'already present. `dominates` requires strict inequality on at least one '
        'dimension, so an identical label does not dominate — and is not '
        'dominated. It was accepted, expanded, and produced another identical '
        'label, forever.\n\n'
        'The fix rejects duplicates explicitly:\n\n'
        '```\n'
        'if (other.costCents === costCents && other.fuelUsedKg === fuelUsedKg) {\n'
        '  dominated = true; break;\n'
        '}\n'
        '```\n\n'
        '**How it was found:** the test suite hung and was killed by a five-minute '
        'timeout. No correctness assertion would have detected it, because the '
        'code was not producing wrong answers — it was producing no answers. '
        'Non-termination is invisible to assertions and only to a timeout.')

    story += CODE(
        '''/**
 * Deterministic JSON serialisation — from the audit chain, with the same
 * principle: make randomness reproducible, or a failure is not a defect
 * report but a rumour.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}''',
        'tests/routing.test.js')

    story += P(
        'Without a seeded generator, a random test failure is unreproducible and '
        'therefore nearly useless as a defect report. With one, "seed 3 fails" is '
        'a permanent regression case. Every random assertion in the AMS suite '
        'names the seed in its failure message.')

    story += H2('The uplift planner and its exchange argument')

    story += CODE(
        ''' * THE THEOREM
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
 * optimal. This is verified independently against exhaustive search in
 * the test suite.''')

    story += LEAD(
        'Read plainly: buy too little at a stop and you will buy the shortfall '
        'somewhere more expensive later, so you should have bought it here. Buy '
        'too much and you are carrying fuel that will be consumed somewhere '
        'cheaper, so you should have bought it there. The only defensible '
        'quantity is the minimum needed to reach the next cheaper station. '
        'There is nothing subtle here — which is exactly why it is worth '
        'understanding.')

    story += CODE(
        '''export function optimalRefuelPlan({ stops, legFuelKg, priceCentsPerKg,
    tankCapacityKg, reserveKg }) {
  // ...
  let fuelOnBoard = 0; // arriving at stop 0 with empty tanks

  for (let i = 0; i < n - 1; i += 1) {
    const price = priceCentsPerKg[i];

    // First stop strictly cheaper than here, among later DEPARTURE stops.
    let nextCheaper = -1;
    for (let j = i + 1; j < n - 1; j += 1) {
      if (priceCentsPerKg[j] < price) { nextCheaper = j; break; }
    }

    let target;
    let rationale;
    if (nextCheaper >= 0) {
      target = fuelToReach(legFuelKg, i, nextCheaper, reserveKg);
      rationale = `hold ${priceCentsPerKg[i]}c/kg: only enough to reach ${stops[nextCheaper]}...`;
    } else {
      target = Math.min(tankCapacityKg, required[i]);
      rationale = `hold ${priceCentsPerKg[i]}c/kg: no cheaper stop ahead...`;
    }

    const uplift = Math.max(0, target - fuelOnBoard);
    // ...
    fuelOnBoard = departure - legFuelKg[i];
    if (fuelOnBoard < reserveKg) {
      throw new RefuelError(
        `Arriving at ${stops[i + 1]} with ${fuelOnBoard}kg breaches the ${reserveKg}kg reserve. ` +
          'The plan is infeasible — this should be unreachable.',
        'REFUEL_RESERVE_BREACH',
      );
    }
  }
  // ...
}''',
        'shared/src/routing/refuel.js')

    story += CODE(
        '''// Worked example — JFK sells at 95c, MAN at 70c, GRU is the destination
const plan = optimalRefuelPlan({
  stops: ['JFK', 'MAN', 'GRU'],
  legFuelKg: [3200, 8600],
  priceCentsPerKg: [95, 70, 88],
  tankCapacityKg: 24_000,
  reserveKg: 1_500,
});
plan.upliftsKg        // [4700, 8600]
plan.totalCostCents   // 4700*95 + 8600*70 = 1,048,500''')

    story += TABLE(
        ['Stop', 'Price', 'Arriving', 'Buy', 'Reason'],
        [
            ['JFK', '95c', '0 kg', '4,700 kg',
             'MAN at 70c is cheaper — buy only enough to reach it'],
            ['MAN', '70c', '1,500 kg', '8,600 kg',
             'Nothing cheaper ahead — buy what the rest needs'],
            ['GRU', '—', '1,500 kg', '—', 'Arrival'],
        ],
        widths=[11, 10, 16, 13, 50])

    story += P(
        'Loading all 13,300 kg at JFK instead would cost 1,263,500 cents — 17% '
        'more, for no benefit. The planner correctly refuses to tanker past the '
        'cheap station.')

    story += BUG(
        'The destination-price trap, caught by a test that was itself wrong',
        '```\n'
        '// GRU has the LOWEST price of the three — but you cannot buy\n'
        '// fuel on arrival, so its price must not influence any decision.\n'
        'plan.upliftsKg   // [13_300, 0]  — all loaded at JFK\n'
        '```\n\n'
        'An early test asserted the planner would stop at GRU because it looked '
        'cheap. **The test was wrong, not the code.** Fixing the test required '
        'reasoning about which prices can legitimately influence a decision.\n\n'
        'This is a small, clean example of a recurring theme: a '
        'plausible-looking expectation is not the same thing as a correct one, '
        'and the code can be right while the test that describes it is wrong.')

    story += CODE(
        '''export function requiredAtDeparture(legFuelKg, reserveKg) {
  const n = legFuelKg.length;
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
}''')

    story += CODE(
        '''it('composes the whole remainder of the route, not just the next leg', () => {
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
});''',
        'tests/routing.test.js')

    story += LOCK(
        'The most instructive defect in the codebase',
        'The implementation and its test were wrong in **exactly** the same '
        'way, so the test passed and confirmed the bug.\n\n'
        'Testing something against your own model of how it should behave does '
        'not validate the model. This is why the routing tests compare against '
        'an **exhaustive search** rather than against hand-written '
        'expectations: an oracle cannot share your misunderstanding, because it '
        'has no model at all.')

    story += CODE(
        '''// And the fourth: a feasibility check that rejected the plans it existed for
  for (let i = 0; i < legFuelKg.length; i += 1) {
    if (legFuelKg[i] + reserveKg > tankCapacityKg) {
      throw new RefuelError(
        `Sector ${stops[i]} -> ${stops[i + 1]} needs ${legFuelKg[i] + reserveKg}kg ` +
          `(leg + ${reserveKg}kg reserve) but tank capacity is only ${tankCapacityKg}kg. ` +
          'No refuelling schedule can make this route legal.',
        'REFUEL_ROUTE_INFEASIBLE',
      );
    }
  }''',
        'The corrected check: each LEG must fit, not the whole route.')

    story += P(
        'The original checked `required[0] > tankCapacityKg`, which is the fuel '
        'for the *entire remaining route*. For any multi-stop route that exceeds '
        'capacity — which is normal, because you refuel at the intermediate '
        'stops. The check therefore rejected every multi-stop plan, which is '
        'precisely what the function exists to produce.')

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
        tankCapacityKg: legFuelKg.reduce((a, b) => a + b, 0) + reserveKg + int(rand, 0, 3),
      };
      const mine = optimalRefuelPlan(args);
      const oracle = bruteForceRefuel(args);
      expect(mine.totalCostCents, `seed ${seed}: myopic plan must be cost-optimal`)
        .toBe(oracle.totalCostCents);
    }
    expect(compared).toBeGreaterThan(1500);
  });

  it('arrives at every stop with at least the reserve, and reports honest arithmetic',
    () => { /* ... */ });
});''')

    story += HR()