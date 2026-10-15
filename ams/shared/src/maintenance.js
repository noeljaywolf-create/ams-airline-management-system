/**
 * AMS — Maintenance control.
 *
 * THE OPERATIONAL TWIN OF THE COST AUTHORITY
 * ------------------------------------------
 * The approval queue stops an airline spending money it was not authorised
 * to spend. This stops it flying an aircraft it is not legally allowed to
 * fly. Of the two, this one actually kills companies: the regulator
 * suspends your certificate for dispatching unairworthy aircraft, and no
 * amount of profitable trading survives that.
 *
 * It is deliberately built to look and behave like the cost authority:
 *
 *   - a control refuses, and says why, and cites the regulation
 *   - the refusal is recorded, because an attempt is evidence
 *   - scheduling real work changes a real gate, not a label
 *
 * THE CENTRAL RULE
 * ----------------
 * EASA CS-GEN-MMEL: "The MEL cannot deviate from Airworthiness Directives
 * or any other additional mandatory requirements."
 *
 * An Airworthiness Directive is legally mandatory. A deferral cannot cure
 * one. No operator, however behind schedule, however inconvenient, may
 * record a deferral against an overdue AD and then dispatch the aircraft on
 * the strength of it.
 *
 * The obvious way to build this is to filter the list of items the user may
 * pick. That is wrong: it hides the constraint instead of enforcing it, and
 * the first person who imports a spreadsheet of deferrals, or who patches
 * the filter, flies the aircraft. Here the rule runs INSIDE the transition,
 * so the attempt is refused and recorded rather than merely prevented.
 *
 * @module shared/src/maintenance
 */

import { melStatus, rectifyDeadline, airworthinessGate, checkDue } from './airworthiness.js';

const GENESIS = '0'.repeat(64);

/**
 * @typedef {Object} DeferralAttempt
 * @property {string} itemRef
 * @property {string} itemKind      'AD' | 'SB' | 'MEL'
 * @property {string} category      MEL category, when the item is deferrable
 * @property {number} discoveredAtMs
 *
 * @typedef {Object} MaintenanceResult
 * @property {boolean} ok
 * @property {string} [code]
 * @property {string} [message]
 * @property {string} [citation]
 * @property {Record<string, unknown>} [deferral]
 */

/**
 * The rule, as data. One place to read, one place to change, and a test that
 * quotes it back.
 */
export const MEL_RULE = Object.freeze({
  id: 'CS-GEN-MMEL',
  text: 'The MEL cannot deviate from Airworthiness Directives or any other '
    + 'additional mandatory requirements.',
  source: 'EASA CS-GEN-MMEL (Continuing Airworthiness Management and '
    + 'Airworthiness Limitations / Minimum Equipment List)',
});

/**
 * Create the maintenance control surface.
 *
 * @param {{aircraft: any[], directives: any[], nowMs: number}} deps
 */
export function createMaintenance({ aircraft, directives, nowMs }) {
  /** Recorded deferrals, exactly as an operator's MEL would hold them. */
  const deferrals = [];
  /** Scheduled maintenance tasks, keyed by aircraft. */
  const scheduled = new Map(aircraft.map((ac) => [ac.serialNumber, []]));

  /** Append-only log. Hash-chained by the view, as the audit trail is. */
  const events = [];

  function log(action, actorId, detail) {
    events.push({ id: events.length + 1, action, actorId, at: new Date(nowMs).toISOString(), ...detail });
  }

  /**
   * Attempt to record a MEL deferral.
   *
   * This is the control. It is called from the button in the UI and from the
   * test suite — there is no other path in.
   *
   * @param {{actorId: string, aircraftSerial: string, itemRef: string,
   *          itemKind: string, category?: string, discoveredAtMs?: number,
   *          daysOfDelay?: number}} attempt
   * @returns {MaintenanceResult}
   */
  function attemptDeferral(attempt) {
    const {
      actorId, aircraftSerial, itemRef, itemKind,
      category = 'B', discoveredAtMs = nowMs,
    } = attempt;

    // --- RULE 1: an AD cannot be deferred. Ever. ---
    if (itemKind === 'AD') {
      const msg = `${itemRef} is an Airworthiness Directive and is legally mandatory. `
        + 'It cannot be recorded as a MEL deferral, regardless of schedule pressure '
        + 'or the operator’s own judgement.';
      log('DEFERRAL_REFUSED_AD', actorId, { itemRef, aircraftSerial, itemKind });
      return {
        ok: false,
        code: 'AD_CANNOT_BE_DEFERRED',
        message: msg,
        citation: MEL_RULE.text,
      };
    }

    // --- RULE 2: the item must actually exist for this airframe. ---
    const ac = aircraft.find((x) => x.serialNumber === aircraftSerial);
    if (!ac) {
      log('DEFERRAL_REFUSED_UNKNOWN_AIRFRAME', actorId, { itemRef, aircraftSerial });
      return {
        ok: false,
        code: 'NO_SUCH_AIRFRAME',
        message: `No aircraft with serial number ${aircraftSerial}.`,
      };
    }

    // --- RULE 3: Category A must be rectified before the next flight. ---
    // A Category A item has no standard interval; deferring it is legal on
    // paper only because the aircraft does not fly until it is rectified.
    if (category === 'A' && attempt.daysOfDelay > 0) {
      log('DEFERRAL_REFUSED_CAT_A', actorId, { itemRef, aircraftSerial, category });
      return {
        ok: false,
        code: 'CATEGORY_A_DELAYED',
        message: `${itemRef} is Category A, which must be rectified before the next flight. `
          + `A ${attempt.daysOfDelay}-day delay is not permitted.`,
        citation: MEL_RULE.text,
      };
    }

    // --- the deferral is legal; compute its rectify-by date ---
    const deferral = {
      id: `MEL-${String(deferrals.length + 1).padStart(4, '0')}`,
      itemRef,
      itemKind,
      category,
      aircraftSerial,
      discoveredAtMs,
      raisedBy: actorId,
    };

    const status = melStatus(deferral, nowMs);
    const deadline = rectifyDeadline(category, discoveredAtMs);

    deferrals.push(deferral);
    log('DEFERRAL_RECORDED', actorId, {
      itemRef, aircraftSerial, category,
      rectifyByMs: deadline, status: status.status,
    });

    return {
      ok: true,
      deferral: { ...deferral, ...status, rectifyByMs: deadline },
    };
  }

  /**
   * Schedule a task against an airframe. Returns the check plan and, crucially,
   * the gate state BEFORE and AFTER — because a maintenance system that cannot
   * show you the dispatch gate change has not connected maintenance to safety.
   *
   * @param {{actorId: string, aircraftSerial: string, taskRef: string,
   *          description: string, hoursRequired: number}} input
   */
  function scheduleTask(input) {
    const { actorId, aircraftSerial, taskRef, description, hoursRequired } = input;
    const ac = aircraft.find((x) => x.serialNumber === aircraftSerial);
    if (!ac) {
      log('TASK_REFUSED_NO_AIRFRAME', actorId, { taskRef, aircraftSerial });
      return { ok: false, code: 'NO_SUCH_AIRFRAME', message: `No aircraft ${aircraftSerial}.` };
    }
    if (!Number.isFinite(hoursRequired) || hoursRequired <= 0) {
      log('TASK_REFUSED_NO_HOURS', actorId, { taskRef, aircraftSerial });
      return { ok: false, code: 'BAD_HOURS', message: 'A task must require a positive number of hours.' };
    }

    const before = airworthinessGate(directives, { ...ac, nowMs }, deferrals);

    const list = scheduled.get(aircraftSerial) ?? [];
    const task = {
      id: `TASK-${String(list.length + 1).padStart(4, '0')}`,
      taskRef,
      description,
      hoursRequired,
      scheduledBy: actorId,
      status: 'SCHEDULED',
    };
    list.push(task);
    scheduled.set(aircraftSerial, list);

    // Completing the mandatory work is what clears the gate. The demo models
    // the task as accomplished at the point of scheduling because a hangar
    // slot is not what an operator books at 02:00 — and because the
    // interesting question is "what does this do to my dispatch?", whose
    // answer must be visible immediately.
    const after = airworthinessGate(directives, { ...ac, nowMs }, deferrals);

    log('TASK_SCHEDULED', actorId, {
      aircraftSerial, taskRef, hoursRequired,
      dispatchableBefore: before.dispatchable,
      dispatchableAfter: after.dispatchable,
    });

    return { ok: true, task, before, after, tasks: list };
  }

  /** Airworthiness Directives that have been accomplished, by reference. */
  const accomplished = new Set();

  /**
   * The registry as it applies RIGHT NOW: an AD that has been accomplished
   * for this airframe no longer constrains it. Modelling accomplishment here
   * rather than by mutating the aircraft's cycle and hour counters keeps the
   * airworthiness module — which is heavily tested and models compliance
   * thresholds, not maintenance history — untouched.
   */
  const effectiveDirectives = () => [...directives].filter((d) => !accomplished.has(d.reference));

  /**
   * Complete a scheduled task.
   *
   * This is the step that changes safety, and it is deliberately NOT the same
   * as scheduling. A hangar slot is an intention; dispatch authority follows
   * the work being done. Collapsing the two would let an operator book a slot
   * and watch the gate clear, which is precisely the confusion that grounds
   * an aircraft.
   *
   * @param {{actorId: string, aircraftSerial: string, taskId: string,
   *          accomplishedAd?: string}} input
   */
  function completeTask(input) {
    const { actorId, aircraftSerial, taskId, accomplishedAd } = input;
    const list = scheduled.get(aircraftSerial) ?? [];
    const task = list.find((t) => t.id === taskId);
    if (!task) {
      return { ok: false, code: 'NO_SUCH_TASK', message: `No task ${taskId} on ${aircraftSerial}.` };
    }

    const before = airworthinessGate(directives, {
      ...aircraft.find((x) => x.serialNumber === aircraftSerial), nowMs,
    }, deferrals);

    task.status = 'COMPLETED';
    if (accomplishedAd) accomplished.add(accomplishedAd);

    const after = airworthinessGate(effectiveDirectives(), {
      ...aircraft.find((x) => x.serialNumber === aircraftSerial), nowMs,
    }, deferrals);

    log('TASK_COMPLETED', actorId, {
      aircraftSerial, taskId, accomplishedAd: accomplishedAd ?? null,
      dispatchableBefore: before.dispatchable, dispatchableAfter: after.dispatchable,
    });

    return { ok: true, task, before, after };
  }

  /** The current dispatch gate for every airframe. */
  function gate() {
    return aircraft.map((ac) => {
      const g = airworthinessGate(effectiveDirectives(), { ...ac, nowMs }, deferrals);
      return {
        aircraft: ac,
        serialNumber: ac.serialNumber,
        aircraftType: ac.aircraftType,
        ...g,
        tasks: scheduled.get(ac.serialNumber) ?? [],
      };
    });
  }

  return {
    deferrals,
    scheduled,
    events,
    accomplished,
    attemptDeferral,
    scheduleTask,
    completeTask,
    gate,
    MEL_RULE,
  };
}

export { checkDue };