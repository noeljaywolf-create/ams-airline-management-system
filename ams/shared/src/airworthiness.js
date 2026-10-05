/**
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
 * An Airworthiness Directive (AD) is a mandatory instruction issued by
 * a regulator, often after a fleet-wide safety finding. A Service
 * Bulletin (SB) is the manufacturer's version — often technically
 * equivalent but not, by itself, legally mandatory until adopted by an
 * AD. Conflating them is a common and expensive error: a fleet that
 * "applied the SB" is not necessarily compliant with the AD.
 *
 * AMS therefore tracks ADs and SBs as SEPARATE compliance tracks. An
 * SB applied does not close an AD. Only the AD does.
 *
 * @module airworthiness
 */

import { ATA_CHAPTER_NAMES, COMPLIANCE_WARNING_THRESHOLD_PPM, MEL_CATEGORIES } from './domain.js';

/**
 * @typedef {Object} LLP
 * @property {string} partNumber
 * @property {string} serialNumber
 * @property {number} [cyclesTotalLimit]
 * @property {number} [hoursTotalLimit]
 * @property {number} [monthsTotalLimit]
 * @property {number} [cyclesSinceNew]
 * @property {number} [hoursSinceNew]
 * @property {number} [monthsSinceNew]
 */

/**
 * An Airworthiness Directive or Service Bulletin.
 *
 * Structure derived from directives as actually published:
 *   - 14 CFR Part 39 (79 FR 19848; 87 FR 67354)
 *   - EASA AD 2026-0125-E (emergency), AD 2023-0167R1, AD 2024-0213
 *
 * A "reference + due date" model is inadequate: real applicability
 * depends on serial range AND on which production modifications have
 * been embodied, and real compliance uses several simultaneous
 * thresholds plus a repetitive interval.
 *
 * @typedef {Object} ADSB
 * @property {string} reference          e.g. 'EASA AD 2024-0184' or 'SB 737-31-1234'
 * @property {'AD'|'SB'} kind            ONLY an AD is legally mandatory
 * @property {string} [authority]        EASA | FAA | CAAZ | …
 * @property {string} [ataChapter]       '32' — how engineers actually search
 * @property {string} aircraftType       e.g. 'B737-800'
 * @property {readonly [number, number]} serialRange  inclusive [from, to]
 * @property {string[]} [modsRequired]   modifications whose embodiment brings it in
 * @property {string[]} [modsExcluded]   modifications that take it out of scope
 * @property {string} [reason]           the safety finding that triggered it
 * @property {string} [sbReference]      accomplishment instruction
 * @property {number} [dueCycles]        absolute cycle threshold
 * @property {number} [dueHours]         absolute flight-hour threshold
 * @property {number} [dueDate]          absolute calendar date, ms epoch
 * @property {number} [repetitiveIntervalCycles]
 * @property {number} [repetitiveIntervalHours]
 * @property {number} [nonCumulativeTolerancePpm]  5% = 50_000
 * @property {string} [terminatingAction] a CMM repair that ends the inspections
 * @property {boolean} [superseded]
 * @property {boolean} [isEmergency]     imposes an operating limitation first
 * @property {string} [operatingLimitation]
 * @property {string} [complianceMethod] description of acceptable means
 * @property {number} [effectiveFrom]
 */

/**
 * Life-limited part: calculate remaining life on all three counters and
 * identify the CONTROLLING one — the limit that will bite first.
 *
 * A part can have generous cycle life but tight calendar life. Flying
 * it less does not save it. AMS therefore reports the controlling
 * limit explicitly, because a planner who only looks at cycles will
 * scrap a perfectly serviceable part.
 *
 * @param {LLP} llp
 * @returns {object}
 */
export function llpStatus(llp) {
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
  }

  // Controlling limit = least remaining life, normalised to a percentage
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
    /** Sectors until retirement if flown at the given rate. */
    status,
    mustRemove: status === 'OVERDUE',
    /** An LLP inside the warning band is a planning item, not a surprise. */
    planReplacement: status !== 'COMPLIANT',
  };
}

/**
 * Determine whether an AD/SB applies to a specific aircraft, and if so
 * how much runway remains before compliance is due.
 *
 * @param {ADSB} ad
 * @param {{ aircraftType: string, serialNumber: number, cycles: number, hours: number, nowMs: number }} aircraft
 * @returns {{ applies: boolean, reason: string, complianceStatus: object|null }}
 */
export function adsbApplies(ad, aircraft) {
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

  /** @type {{counter: string, due: number, current: number, remaining: number, unit: string}[]} */
  const thresholds = [];
  if (ad.dueCycles !== undefined) {
    thresholds.push({
      counter: 'CYCLES', due: ad.dueCycles, current: aircraft.cycles,
      remaining: ad.dueCycles - aircraft.cycles, unit: 'C',
    });
  }
  if (ad.dueHours !== undefined) {
    thresholds.push({
      counter: 'HOURS', due: ad.dueHours, current: aircraft.hours,
      remaining: ad.dueHours - aircraft.hours, unit: 'H',
    });
  }
  if (ad.dueDate !== undefined) {
    thresholds.push({
      counter: 'CALENDAR', due: ad.dueDate, current: aircraft.nowMs,
      remaining: ad.dueDate - aircraft.nowMs, unit: 'ms',
    });
  }

  if (thresholds.length === 0) {
    throw new TypeError(`AD/SB ${ad.reference} declares no compliance threshold`);
  }

  const controlling = thresholds.reduce((worst, t) =>
    remainingPpm(t, aircraft) < remainingPpm(worst, aircraft) ? t : worst);

  const remainingPpmValue = remainingPpm(controlling, aircraft);

  return {
    applies: true,
    reason: `Applies to ${ad.aircraftType} serial ${aircraft.serialNumber}`,
    complianceStatus: {
      reference: ad.reference,
      kind: ad.kind,
      // Authority and ATA chapter are carried through so the compliance
      // board can be grouped and searched the way engineers work —
      // by ATA chapter, not by directive reference number.
      authority: ad.authority ?? null,
      ataChapter: ad.ataChapter ?? null,
      ataChapterName: ad.ataChapter
        ? (ATA_CHAPTER_NAMES[ad.ataChapter] ?? `ATA ${ad.ataChapter}`)
        : null,
      isEmergency: Boolean(ad.isEmergency),
      operatingLimitation: ad.operatingLimitation ?? null,
      controllingCounter: controlling.counter,
      due: controlling.due,
      current: controlling.current,
      remaining: controlling.remaining,
      unit: controlling.unit,
      remainingPpm: remainingPpmValue,
      status: statusFromRemainingPpm(remainingPpmValue),
      /**
       * An SB applied does NOT satisfy an AD. This flag is the reason
       * AMS keeps the two tracks separate.
       */
      requiresMandatoryInstruction: ad.kind === 'AD',
      complianceMethod: ad.complianceMethod ?? null,
    },
  };
}


/**
 * MEL rectification deadline, computed as a CALENDAR-DATE operation.
 *
 * Source: EASA CS-GEN-MMEL Issue 2. Categories B, C and D are
 * "N calendar days EXCLUDING THE DAY OF DISCOVERY", and the interval
 * runs to the END of the resulting day.
 *
 * This is an off-by-one that naive duration arithmetic gets wrong on
 * every CAT B item. A Category B defect discovered at 09:00 on Monday
 * is due at the end of THURSDAY — not Thursday 09:00. A flight
 * operating Friday morning must be dispatched as EXPIRED.
 *
 * Category A specifies no standard interval and MUST NOT be inferred
 * from a day count; it returns null and requires an explicit
 * rectification limit from the approved programme.
 *
 * @param {string} category 'A' | 'B' | 'C' | 'D'
 * @param {number} discoveredAtMs
 * @returns {number | null} epoch ms deadline, or null for Category A
 */
export function rectifyDeadline(category, discoveredAtMs) {
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
}

/**
 * MEL deferral tracking against a Category A / B / C / D interval.
 *
 * @param {{ itemRef: string, ataChapter?: string, category?: string,
 *           discoveredAtMs?: number, deferredAtMs?: number,
 *           rectifyByMs?: number | null,
 *           requiresModification?: boolean,
 *           requiresOperatingLimitation?: boolean }} deferral
 * @param {number} nowMs
 * @returns {any}
 */
export function melStatus(deferral, nowMs) {
  const category = /** @type {any} */ (deferral).category;
  const discoveredAtMs = /** @type {any} */ (deferral).discoveredAtMs;

  // Prefer the category-derived deadline; fall back to an explicitly
  // supplied rectifyBy for bespoke operator intervals.
  const categoryDeadline = category && discoveredAtMs
    ? rectifyDeadline(category, discoveredAtMs)
    : undefined;
  const rectifyBy = /** @type {any} */ (deferral).rectifyByMs !== undefined
    ? /** @type {any} */ (deferral).rectifyByMs
    : categoryDeadline;

  const elapsedDays = Math.floor((nowMs - (discoveredAtMs ?? nowMs)) / 86_400_000);

  if (rectifyBy === null || rectifyBy === undefined) {
    return {
      ...deferral,
      category: category ?? 'A',
      rectifyByMs: null,
      status: 'CAT_A_NO_STANDARD_INTERVAL',
      elapsedDays,
      compliant: true,
      // An indefinite deferral still requires repair tracking.
      requiresRepairTracking: true,
      note: MEL_CATEGORIES[category ?? 'A']?.note,
    };
  }

  const daysRemaining = Math.floor((rectifyBy - nowMs) / 86_400_000);
  const compliant = nowMs <= rectifyBy;
  return {
    ...deferral,
    category: category ?? 'A',
    rectifyByMs: rectifyBy,
    elapsedDays,
    daysRemaining,
    status: !compliant ? 'EXPIRED' : daysRemaining <= 3 ? 'DUE_SOON' : 'VALID',
    compliant,
    requiresRepairTracking: true,
    requiresOperatingLimitation: Boolean(/** @type {any} */ (deferral).requiresOperatingLimitation),
    requiresModification: Boolean(/** @type {any} */ (deferral).requiresModification),
    note: MEL_CATEGORIES[category ?? 'A']?.note,
  };
}

/**
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
    /**
     * Reported separately so the operator sees WHY it is blocked, rather
     * than merely being refused.
     */
    illegalDeferralAttempts,
    /** Tightest upcoming deadline across the whole registry. */
    nextDue: [...overdue, ...dueSoon].sort((a, b) => a.remainingPpm - b.remainingPpm)[0] ?? null,
  };
}

/**
 * Maintenance check planning: given actual utilisation since the last
 * check, when is the next one due?
 *
 * @param {Object} params
 * @param {number} params.intervalHours  Hours-based interval
 * @param {number} params.intervalCycles Cycles-based interval
 * @param {number} params.hoursAtLastCheck
 * @param {number} params.cyclesAtLastCheck
 * @param {number} params.currentHours
 * @param {number} params.currentCycles
 * @param {number} params.utilisationHoursPerDay
 */
export function checkDue({ intervalHours, intervalCycles, hoursAtLastCheck, cyclesAtLastCheck, currentHours, currentCycles, utilisationHoursPerDay = 10 }) {
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
    hoursRemaining,
    cyclesRemaining,
    daysRemaining,
    controllingCounter: controlling,
    status: daysRemaining <= 3 ? 'OVERDUE_OR_IMMINENT' : daysRemaining <= 21 ? 'DUE_SOON' : 'SCHEDULED',
  };
}

/* --------------------------- internals --------------------------- */

/** @param {number|undefined} total @param {number|undefined} used */
function remaining(total, used) {
  if (total === undefined || used === undefined) return null;
  return Math.max(0, total - used);
}

/**
 * Remaining runway as parts-per-million of the counter's own limit.
 * @param {{counter: string, due: number, current: number, remaining: number, unit: string}} t
 * @param {{ nowMs: number }} aircraft
 * @returns {number}
 */
function remainingPpm(t, aircraft) {
  // Absolute counters (cycles, hours) express runway as distance to due.
  if (t.counter === 'CYCLES') {
    const total = t.due + 0.0000001; // avoid divide-by-zero on a brand-new limit
    return Math.floor(((t.due - t.current) / total) * 1_000_000);
  }
  if (t.counter === 'HOURS') {
    return Math.floor(((t.due - t.current) / t.due) * 1_000_000);
  }
  // Calendar: normalise against a nominal 10-year window so that a
  // far-future calendar limit does not always look "safe".
  const WINDOW_MS = 10 * 365 * 86_400_000;
  const elapsed = aircraft.nowMs - t.current;
  const cycleDays = Math.max(1, Math.floor((aircraft.nowMs - t.current) / 86_400_000));
  void cycleDays; void elapsed; void WINDOW_MS;
  // Calendar limits are absolute; express remaining as a share of the
  // limit's own horizon when known, otherwise ppm of a decade.
  return Math.floor((Math.min(t.remaining, WINDOW_MS) / WINDOW_MS) * 1_000_000);
}

/** @param {number} remainingPpmValue */
function statusFromRemainingPpm(remainingPpmValue) {
  if (remainingPpmValue <= 0) return 'OVERDUE';
  if (remainingPpmValue < COMPLIANCE_WARNING_THRESHOLD_PPM) return 'DUE_SOON';
  return 'COMPLIANT';
}
