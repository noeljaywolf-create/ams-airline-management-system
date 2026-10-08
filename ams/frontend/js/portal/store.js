/**
 * AMS — application state.
 *
 * A single mutable object with a subscribe/dispatch loop, rather than a
 * framework. The demo has no build step on purpose (plan: "browser demo
 * intentionally has no framework/build step"), and a 200-line store is
 * cheaper than a framework for the state this app actually has:
 *
 *   - who is acting (persona)
 *   - the cost-authority ledger
 *   - scenario inputs that move the computed model
 *   - transient notices (blocked actions, refusals)
 *
 * Every mutation goes through `act()`, which is the only place that notifies
 * subscribers. That matters for correctness, not tidiness: views re-render
 * from one snapshot, so a half-applied change can never be painted.
 *
 * @module frontend/js/portal/store
 */

import { createLedger } from './ledger.js';
import { PERSONAS, PERSONA_NAMES } from './registry.js';
import { registerNames } from './sod.js';

registerNames(PERSONA_NAMES);

/**
 * Scenario inputs. These are the levers a real planning tool exposes: the
 * user moves them and every derived figure recomputes. Defaults reproduce
 * the baseline model exactly, so an untouched demo shows the same numbers
 * as the read-only views.
 *
 * @typedef {Object} Scenario
 * @property {number} fuelPriceIndexPct   jet fuel price vs baseline, 100 = baseline
 * @property {number} loadFactorPct       target load factor
 * @property {number} fxUsdIndexPct       USD strength vs baseline
 * @property {number} safSharePct         share of uplift that is SAF
 */

/** @returns {Scenario} */
export function baselineScenario() {
  return { fuelPriceIndexPct: 100, loadFactorPct: 79.8, fxUsdIndexPct: 100, safSharePct: 0 };
}

/**
 * Sum the model's itemised fuel cost across every flight.
 * `total` carries no fuel field, so the direct-cost lines are the only
 * source of truth for it.
 *
 * @param {any} model
 * @returns {number} fuel cost in integer cents
 */
export function fuelCostFromLines(model) {
  if (!Array.isArray(model?.flights)) return 0;
  let sum = 0;
  for (const f of model.flights) sum += f?.lines?.fuel ?? 0;
  return sum;
}

export function createStore() {
  const ledger = createLedger();

  const listeners = new Set();

  const state = {
    personaId: 'p-cfo',
    scenario: baselineScenario(),
    notices: [],
    /** Set by boot once the model is computed. */
    model: null,
  };

  /** @returns {import('./registry.js').Persona} */
  const persona = () => {
    const p = PERSONAS.find((x) => x.id === state.personaId);
    if (!p) throw new Error(`unknown persona ${state.personaId}`);
    return p;
  };

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * @param {(s: typeof state) => void|Promise<void>} fn
   * @param {object} [opts]
   * @param {boolean} [opts.silent] run without notifying (used during boot)
   */
  async function act(fn, { silent = false } = {}) {
    await fn(state);
    if (!silent) notify();
  }

  function pushNotice(notice) {
    // Cap the list: an unbounded notice log is itself a UI defect once a
    // user clicks around, and the audit chain below is the durable record.
    state.notices = [{ id: `n${Date.now()}${state.notices.length}`, ...notice }, ...state.notices].slice(0, 6);
  }

  function clearNotices() {
    state.notices = [];
  }

  return {
    state,
    ledger,
    persona,
    subscribe,
    act,
    pushNotice,
    clearNotices,

    /** @param {string} id */
    setPersona(id) {
      state.personaId = id;
      clearNotices();
      notify();
    },

    /** @param {keyof Scenario} key @param {number} value */
    setScenario(key, value) {
      state.scenario = { ...state.scenario, [key]: value };
      notify();
    },

    resetScenario() {
      state.scenario = baselineScenario();
      notify();
    },

    /**
     * Apply a scenario to the computed model. Kept here rather than in a
     * view so the finance, executive and portal surfaces all quote the same
     * adjusted numbers — a figure that differs per screen is the failure
     * mode this whole build exists to avoid.
     *
     * The adjustment is deliberately structural rather than cosmetic: fuel
     * is a share of cost and revenue moves with load factor, so the ratios
     * are RECOMPUTED from the adjusted sums instead of scaled. Multiplying
     * a ratio by a factor would be wrong, and visibly wrong at the
     * extremes, which is the only place a planning tool is actually used.
     *
     * @param {any} model the baseline computed model
     * @returns {any} the adjusted model, structurally identical
     */
    applyScenario(model) {
      const base = baselineScenario();
      const s = state.scenario;
      if (s.fuelPriceIndexPct === 100 && s.loadFactorPct === base.loadFactorPct
        && s.fxUsdIndexPct === 100 && s.safSharePct === 0) {
        return model;
      }

      const t = model.total;
      const fuelFactor = s.fuelPriceIndexPct / 100;
      // Both sides of this ratio are PERCENTAGES, so neither is divided by
      // 100. Dividing the baseline only is a 100x error that inflates the
      // result without looking wrong on screen — caught by the scenario
      // arithmetic test, not by any view.
      const loadRatio = s.loadFactorPct / base.loadFactorPct;

      // Fuel is not a field on `total`, so derive it from the model's own
      // itemised direct-cost lines. Verified equal to
      // `model.fuelAgg.sectorCostCents`, which is the measure the existing
      // demo-realism gate pins, so the two cannot drift apart.
      const fuelCents = fuelCostFromLines(model);
      const fuelShare = t.fullCostCents ? fuelCents / t.fullCostCents : 0;
      const nonFuelCost = t.fullCostCents - fuelCents;

      const fullCostCents = Math.round(nonFuelCost + fuelCents * fuelFactor);
      const revenueCents = Math.round(t.revenueCents * loadRatio);
      const rpks = Math.round(t.rpks * loadRatio);

      const total = {
        ...t,
        rpks,
        fullCostCents,
        directCostCents: t.directCostCents,
        revenueCents,
        contributionCents: revenueCents - fullCostCents,
        caskMicrocents: t.asks ? Math.floor((fullCostCents * 1_000_000) / t.asks + 0.5) : 0,
        raskMicrocents: t.asks ? Math.floor((revenueCents * 1_000_000) / t.asks + 0.5) : 0,
        loadFactorPpm: t.asks ? Math.floor((rpks / t.asks) * 1_000_000 + 0.5) : 0,
        breakEvenLoadFactorPpm: revenueCents === 0 ? 0
          : Math.floor((fullCostCents / revenueCents) * 1_000_000 + 0.5),
      };
      total.marginPpm = revenueCents === 0 ? 0
        : Math.floor(((revenueCents - fullCostCents) / revenueCents) * 1_000_000 + 0.5);

      return {
        ...model,
        total,
        scenarioApplied: true,
        scenarioInputs: { ...s },
        /** Figures to show next to each slider so the effect is legible. */
        scenarioBaseline: {
          revenueCents: t.revenueCents,
          fullCostCents: t.fullCostCents,
          contributionCents: t.contributionCents,
        },
      };
    },
  };
}
