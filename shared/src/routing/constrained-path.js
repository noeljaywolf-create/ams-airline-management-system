/**
 * Constrained shortest path with a fuel-tank capacity limit.
 * =============================================================
 *
 * THE REAL-WORLD PROBLEM
 * ----------------------
 * An airline must decide the intermediate stops on a route. Every direct
 * sector has a cost (crew, handling, navigation, overflight fees) and a
 * fuel requirement. The aircraft can only carry `tankCapacityKg`, and
 * must land with at least `minReserveKg` remaining — the ICAO final
 * reserve (30 minutes at holding speed, 1,500 ft above the alternate,
 * ISA conditions).
 *
 * So: find the minimum-COST sequence of stops from A to B such that the
 * CUMULATIVE fuel burned on every prefix of the route never exceeds
 * `tankCapacityKg - minReserveKg`.
 *
 * This is a resource-constrained shortest path with a single consumable
 * resource. It is polynomial (so exactly solvable, not heuristic), but
 * the naive approaches are wrong:
 *
 *   - Unconstrained Dijkstra returns routes the aircraft cannot fly.
 *   - Greedy "cheapest next hop" returns routes that strand the aircraft.
 *   - Clamping fuel at capacity after the fact silently produces
 *     infeasible itineraries that look valid.
 *
 * WHY THIS IS WORTH GETTING RIGHT
 * -------------------------------
 * A cost-first planner under fuel constraint decides the airline's
 * network: which city pairs are viable, where hubbing pays, and whether
 * a long-haul is operated direct or with a technical stop. A planner
 * that returns an infeasible route does not merely cost money — it
 * grounds aircraft.
 *
 * THE ALGORITHM
 * -------------
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
 *
 * CORRECTNESS
 * -----------
 * Invariant I1 (reachability): every label in the frontier at v
 *   corresponds to an actual feasible path from the source to v.
 *   Proof: labels are created only by extending a popped label with a
 *   real edge, and only when the resulting cumulative fuel satisfies the
 *   capacity constraint. Base case is the trivial path at the source.
 *
 * Invariant I2 (pruning soundness): if L1 dominates L2 at v, then for
 *   every feasible completion C of L2 to any destination, C ∘ L1 is also
 *   feasible and no more expensive than C ∘ L2.
 *   Proof: fuel is consumable and monotone — having burnt less fuel
 *   leaves at least as much remaining at every subsequent point, so
 *   every leg that was feasible remains feasible. Cost is additive, and
 *   cost1 <= cost2, so the total cannot increase.  ∎
 *
 * Theorem: the algorithm returns the minimum-cost feasible path.
 *   Proof: Take an optimal feasible path P. Walk it from the source. Each
 *   prefix label is either in the frontier, or was pruned. If pruned,
 *   it was dominated by some retained L' which by I2 can replace that
 *   prefix with no increase in cost or fuel. Following I2
 *   inductively, a path of cost <= OPT(P) survives to the destination.
 *   By I1 every surviving label is feasible, so its cost >= OPT(P).
 *   Therefore the minimum-cost surviving label has cost exactly OPT(P).
 *   ∎
 *
 * Complexity: O(L · E · log L) where L is the largest per-node frontier.
 * In practice L is tiny (usually < 5) because real networks have few
 * genuinely incomparable cost/fuel trade-offs per airport.
 *
 * @module routing/constrained-path
 */

/** @typedef {number} Cents Integer minor units. */

/**
 * @typedef {Object} Flight
 * @property {string} from
 * @property {string} to
 * @property {Cents}  costCents
 * @property {number} fuelKg   Must be a non-negative integer number of kg.
 */

/**
 * @typedef {Object} Label
 * @property {Cents}  costCents
 * @property {number} fuelUsedKg
 * @property {string} node
 * @property {Label | null} prev
 */

export class RoutingError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'ROUTING_ERROR') {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Binary min-heap keyed on cost. Cheap, dependency-free, and the
 * whole thing runs in microseconds for realistic network sizes.
 * ------------------------------------------------------------------ */
class MinHeap {
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
}

/**
 * Does label (ca, fa) dominate (cb, fb)?
 * True when a is at least as good on BOTH dimensions and strictly
 * better on at least one. Identical labels do not dominate each other —
 * we simply keep the one already present.
 */
function dominates(ca, fa, cb, fb) {
  return ca <= cb && fa <= fb && (ca < cb || fa < fb);
}

/**
 * Build an adjacency map and validate the inputs.
 * @param {Flight[]} flights
 * @returns {Map<string, Array<{to: string, costCents: Cents, fuelKg: number}>>}
 */
export function buildAdjacency(flights) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const f of flights) {
    if (typeof f.from !== 'string' || typeof f.to !== 'string') {
      throw new RoutingError('Flight from/to must be strings', 'ROUTE_BAD_NODE');
    }
    if (!Number.isSafeInteger(f.costCents) || f.costCents < 0) {
      throw new RoutingError(
        `Flight ${f.from}->${f.to} cost must be a non-negative integer number of cents`,
        'ROUTE_BAD_COST',
      );
    }
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
    if (!out.has(f.from)) out.set(f.from, []);
    out.get(f.from).push({ to: f.to, costCents: f.costCents, fuelKg: f.fuelKg });
  }
  // Sort so results are deterministic across runs and engines.
  for (const list of out.values()) {
    list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : x.costCents - y.costCents));
  }
  return out;
}

/**
 * Optimal minimum-cost route subject to the fuel-tank capacity limit.
 *
 * @param {Object} params
 * @param {Flight[]} params.flights
 * @param {string} params.source
 * @param {string} params.destination
 * @param {number} params.tankCapacityKg  Maximum fuel on board at departure
 * @param {number} params.minReserveKg    Fuel that must remain at every landing
 * @returns {{ feasible: boolean, costCents: Cents, fuelUsedKg: number, stops: string[], labelsExpanded: number, labelsPruned: number, maxFrontier: number }}
 */
export function solveRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
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
  }

  const EMPTY = {
    feasible: false, costCents: 0, fuelUsedKg: 0, stops: [],
    labelsExpanded: 0, labelsPruned: 0, maxFrontier: 0,
  };

  if (source === destination) {
    return { ...EMPTY, feasible: true, stops: [source] };
  }

  const adjacency = buildAdjacency(flights);

  /** @type {Map<string, Label[]>} */
  const frontier = new Map();
  const heap = new MinHeap();

  /** @param {string} node @returns {Label[]} */
  const labelsAt = (node) => {
    if (!frontier.has(node)) frontier.set(node, []);
    return /** @type {Label[]} */ (frontier.get(node));
  };

  const start = { costCents: 0, fuelUsedKg: 0, node: source, prev: null };
  labelsAt(source).push(start);
  heap.push(start);

  let labelsExpanded = 0;
  let labelsPruned = 0;
  let maxFrontier = 1;

  while (heap.size > 0) {
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

      // Is this candidate already dominated, or an exact duplicate?
      //
      // The duplicate check is not cosmetic. A zero-cost, zero-fuel cycle
      // produces a label identical to one already present. Identical
      // labels do not strictly dominate one another, so without this the
      // planner re-queues the same (cost, fuel) pair forever and never
      // terminates. Rejecting the duplicate is safe: the incumbent label
      // has an equally good prefix and is already in the heap.
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
  }

  return { ...EMPTY, labelsExpanded, labelsPruned, maxFrontier };
}

/** @param {Label} label @returns {string[]} */
function reconstructStops(label) {
  /** @type {string[]} */
  const stops = [];
  for (let l = /** @type {Label | null} */ (label); l; l = l.prev) stops.push(l.node);
  return stops.reverse();
}

/**
 * EXACT reference solver by fuel-indexed dynamic programming.
 *
 * Independent of the Pareto algorithm, so agreement between the two is
 * strong evidence of correctness. DP requires integer fuel values and
 * bounded capacity, which is fine for verification and small networks
 * but not for a whole airline's route network — hence the two exist.
 *
 * `best[v][f]` = minimum cost to reach v having burned exactly f kg.
 * Fuel is non-decreasing along a path, so processing states in
 * increasing fuel order is a valid topological order.
 *
 * @param {Object} params same shape as solveRoute, plus `maxExpand`
 * @returns {{ feasible: boolean, costCents: Cents, stops: string[] }}
 */
export function solveRouteDP({ flights, source, destination, tankCapacityKg, minReserveKg, maxExpand = 5_000_000 }) {
  if (!Number.isSafeInteger(tankCapacityKg) || !Number.isSafeInteger(minReserveKg)) {
    throw new RoutingError('Capacity and reserve must be integers', 'ROUTE_BAD_CAPACITY');
  }
  const usable = tankCapacityKg - minReserveKg;
  if (usable < 0) {
    throw new RoutingError('Capacity below reserve', 'ROUTE_CAPACITY_BELOW_RESERVE');
  }
  const EMPTY = { feasible: false, costCents: 0, stops: [] };
  if (source === destination) return { feasible: true, costCents: 0, stops: [source] };

  const adjacency = buildAdjacency(flights);

  // best.get(node) = Map(fuelUsed -> { costCents, prevNode, prevFuel })
  /** @type {Map<string, Map<number, {costCents: number, prevNode: string | null, prevFuel: number | null}>>} */
  const best = new Map();

  // States are bucketed by the fuel they have burned. Fuel never decreases
  // along a path, so ascending fuel order is a valid topological order.
  //
  // Each state carries the node it ARRIVED at. An earlier version of this
  // function carried the node it DEPARTED from, which silently re-expanded
  // the previous node's outgoing flights on the next iteration. That bug
  // made the DP report routes as infeasible that the Pareto solver found,
  // and it survived review because nothing cross-checked the two.
  /** @type {Array<Array<{node: string, costCents: number, prevNode: string | null, prevFuel: number | null}> | undefined>} */
  const buckets = [];
  buckets[0] = [{ node: source, costCents: 0, prevNode: null, prevFuel: null }];

  let expanded = 0;
  for (let f = 0; f <= usable; f += 1) {
    const bucket = buckets[f];
    if (!bucket) continue;
    for (const state of bucket) {
      expanded += 1;
      if (expanded > maxExpand) {
        throw new RoutingError(
          `DP state space exceeded ${maxExpand} - use solveRoute instead`,
          'ROUTE_DP_TOO_LARGE',
        );
      }
      for (const edge of adjacency.get(state.node) ?? []) {
        const nf = f + edge.fuelKg;
        if (nf > usable) continue;
        const nc = state.costCents + edge.costCents;
        if (!best.has(edge.to)) best.set(edge.to, new Map());
        const cell = /** @type {Map<number, any>} */ (best.get(edge.to));
        if (cell.has(nf) && cell.get(nf).costCents <= nc) continue;
        cell.set(nf, { costCents: nc, prevNode: state.node, prevFuel: f });
        if (!buckets[nf]) buckets[nf] = [];
        /** @type {any[]} */ (buckets[nf]).push({ node: edge.to, costCents: nc, prevNode: state.node, prevFuel: f });
      }
    }
  }

  const target = best.get(destination);
  if (!target || target.size === 0) return EMPTY;

  let bestCost = Infinity;
  let bestFuel = -1;
  for (const [f, cell] of target) {
    if (cell.costCents < bestCost) { bestCost = cell.costCents; bestFuel = f; }
  }
  if (bestCost === Infinity || bestFuel < 0) return EMPTY;

  // Walk predecessors back through the reconstruction table.
  /** @type {string[]} */
  const stops = [destination];
  let node = destination;
  let fuel = bestFuel;
  while (node !== source) {
    const cell = /** @type {Map<number, any>} */ (best.get(node)).get(fuel);
    if (!cell) break;
    node = cell.prevNode;
    fuel = cell.prevFuel;
    if (node === null) break;
    stops.push(node);
  }
  return { feasible: true, costCents: bestCost, stops: stops.reverse() };
}
/**
 * Exhaustive enumerator over every simple path. Exponential, used ONLY
 * to validate the fast algorithms on small instances.
 *
 * @param {Object} params
 * @returns {{ feasible: boolean, costCents: Cents, stops: string[] | null, pathsExplored: number }}
 */
export function bruteForceRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
  const usable = tankCapacityKg - minReserveKg;
  if (usable < 0) throw new RoutingError('Capacity below reserve', 'ROUTE_CAPACITY_BELOW_RESERVE');
  if (source === destination) return { feasible: true, costCents: 0, stops: [source], pathsExplored: 0 };

  const adjacency = buildAdjacency(flights);
  let bestCost = Infinity;
  let bestStops = /** @type {string[] | null} */ (null);
  let explored = 0;

  /** @param {string} node @param {number} fuel @param {Cents} cost @param {string[]} path */
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
}

/**
 * Human-readable justification for a route, suitable for a network
 * planner or an auditor asking why the airline chose this sequence.
 *
 * @param {Object} params
 * @returns {Array<{sector: string, costCents: Cents, fuelKg: number, cumulativeFuelKg: number, reserveRemainingKg: number}>}
 */
export function explainRoute({ flights, stops }) {
  const index = new Map();
  for (const f of flights) index.set(`${f.from} ${f.to}`, f);
  let cumulative = 0;
  const out = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const f = index.get(`${stops[i]} ${stops[i + 1]}`);
    if (!f) throw new RoutingError(`No flight ${stops[i]} -> ${stops[i + 1]}`, 'ROUTE_MISSING_LEG');
    cumulative += f.fuelKg;
    out.push({
      sector: `${f.from}-${f.to}`,
      costCents: f.costCents,
      fuelKg: f.fuelKg,
      cumulativeFuelKg: cumulative,
      reserveRemainingKg: null, // filled by caller who knows capacity
    });
  }
  return out;
}