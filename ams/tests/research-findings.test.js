import { describe, it, expect } from 'vitest';
import { airworthinessGate, melStatus, rectifyDeadline } from '../shared/src/airworthiness.js';
import { ATA_CHAPTERS, ATA_CHAPTER_NAMES, MEL_CATEGORIES } from '../shared/src/domain.js';

/**
 * These tests encode RESEARCH FINDINGS, not implementation behaviour.
 * Sources: EASA CS-GEN-MMEL Issue 2; 14 CFR Part 39 as published in the
 * Federal Register; live EASA ADs 2026-0125-E and 2023-0167R1.
 *
 * They are written BEFORE the code they validate, deliberately — a test
 * written afterwards tends to encode whatever the code happens to do.
 */

const NOW = Date.UTC(2026, 8, 30);                 // Wed 30 Sep 2026
const aircraft = {
  aircraftType: 'B737-800', serialNumber: 40_012,
  cycles: 21_000, hours: 34_000, nowMs: NOW,
};

describe('finding 1 — a MEL deferral can never cure an AD', () => {
  const overdueAd = {
    reference: 'EASA AD 2024-0184', kind: /** @type {const} */ ('AD'),
    authority: 'EASA', ataChapter: '32',
    aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]),
    dueCycles: 20_000,
  };

  it('an overdue AD blocks dispatch', () => {
    const gate = airworthinessGate([overdueAd], aircraft);
    expect(gate.dispatchable).toBe(false);
    expect(gate.overdueCount).toBe(1);
  });

  it('a matching MEL deferral does NOT clear the AD', () => {
    // The operator believes this is deferrable. It is not — the MEL
    // cannot deviate from an Airworthiness Directive.
    const gate = airworthinessGate([overdueAd], aircraft, [{ itemRef: 'EASA AD 2024-0184' }]);
    expect(gate.dispatchable).toBe(false);
    expect(gate.overdue[0].deferred).toBe(false);
  });

  it('the illegal deferral attempt is reported, not silently ignored', () => {
    const gate = airworthinessGate([overdueAd], aircraft, [{ itemRef: 'EASA AD 2024-0184' }]);
    expect(gate.illegalDeferralAttempts).toContain('EASA AD 2024-0184');
  });

  it('an SB may be recorded as applied while the AD stays open', () => {
    // Applying the Service Bulletin does not satisfy the Directive.
    const sb = {
      reference: 'SB 737-31-1234', kind: /** @type {const} */ ('SB'),
      ataChapter: '32', aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]),
      dueCycles: 21_050,
    };
    const gate = airworthinessGate([sb, overdueAd], aircraft, [{ itemRef: 'SB 737-31-1234' }]);
    expect(gate.dispatchable).toBe(false);          // the AD still blocks
    expect(gate.overdue[0].reference).toBe('EASA AD 2024-0184');
    expect(gate.illegalDeferralAttempts).toEqual([]); // SB attempt is not illegal
  });

  it('an overdue AD still blocks when combined with a legal MEL deferral', () => {
    const sb = {
      reference: 'SB 737-31-1234', kind: /** @type {const} */ ('SB'),
      ataChapter: '34', aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]),
      dueCycles: 21_050,
    };
    const gate = airworthinessGate([overdueAd, sb], aircraft, [{ itemRef: 'SB 737-31-1234' }]);
    expect(gate.dispatchable).toBe(false);
    expect(gate.dueSoonCount).toBeGreaterThanOrEqual(0);
  });
});

describe('finding 3 — MEL day-of-discovery exclusion', () => {
  it('Category B: Monday 09:00 is due END OF Thursday, not Thursday 09:00', () => {
    const monday = Date.UTC(2026, 8, 28, 9, 0, 0);   // Mon 28 Sep 2026 09:00
    const deadline = rectifyDeadline('B', monday);
    const d = new Date(/** @type {number} */ (deadline));

    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(9);
    expect(d.getUTCDate()).toBe(1);        // 1 October — Thursday
    expect(d.getUTCHours()).toBe(23);
    expect(d.getUTCMinutes()).toBe(59);
    expect(d.getUTCSeconds()).toBe(59);
  });

  it('a Friday 06:00 flight is EXPIRED against a Monday Category B defect', () => {
    const monday = Date.UTC(2026, 8, 28, 9, 0, 0);
    const fridayMorning = Date.UTC(2026, 9, 2, 6, 0, 0);
    const status = melStatus({ itemRef: '34-11-01', category: 'B', discoveredAtMs: monday }, fridayMorning);
    expect(status.compliant).toBe(false);
    expect(status.status).toBe('EXPIRED');
  });

  it('a Wednesday 06:00 flight is still VALID against the same defect', () => {
    const monday = Date.UTC(2026, 8, 28, 9, 0, 0);      // Mon 28 Sep 2026
    const wednesday = Date.UTC(2026, 8, 30, 6, 0, 0);     // Wed 30 Sep 2026 06:00
    const status = melStatus({ itemRef: '34-11-01', category: 'B', discoveredAtMs: monday }, wednesday);
    expect(status.compliant).toBe(true);
    // Compliant, but flagged DUE_SOON — one day of runway left.
    expect(['VALID', 'DUE_SOON']).toContain(status.status);
    expect(status.daysRemaining).toBe(1);
  });

  it('a Thursday 06:00 flight is the LAST compliant one', () => {
    const monday = Date.UTC(2026, 8, 28, 9, 0, 0);
    const thursday = Date.UTC(2026, 9, 1, 6, 0, 0);      // Thu 1 Oct 2026 06:00
    const status = melStatus({ itemRef: '34-11-01', category: 'B', discoveredAtMs: monday }, thursday);
    expect(status.compliant).toBe(true);
  });

  it('Category C is 10 days and Category D is 120, both excluding discovery', () => {
    const monday = Date.UTC(2026, 8, 28, 9, 0, 0);
    expect(MEL_CATEGORIES.C.days).toBe(10);
    expect(MEL_CATEGORIES.D.days).toBe(120);
    expect(new Date(/** @type {number} */ (rectifyDeadline('C', monday))).getUTCDate()).toBe(8);
    expect(new Date(/** @type {number} */ (rectifyDeadline('D', monday))).toISOString().slice(0, 10)).toBe('2027-01-26');
  });

  it('Category A has NO standard interval and is not inferred from a day count', () => {
    expect(rectifyDeadline('A', Date.UTC(2026, 8, 28))).toBeNull();
    const status = melStatus({ itemRef: '21-04-02', category: 'A', discoveredAtMs: Date.UTC(2026, 8, 28) }, NOW);
    expect(status.status).toBe('CAT_A_NO_STANDARD_INTERVAL');
    expect(status.compliant).toBe(true);          // but repair tracking is still required
    expect(status.requiresRepairTracking).toBe(true);
  });

  it('rejects an unknown category rather than defaulting', () => {
    expect(() => rectifyDeadline(/** @type {any} */ ('X'), Date.now())).toThrow(/Unknown MEL category/);
  });
});

describe('finding 2 — ADs carry ATA chapter and are searchable by it', () => {
  it('every observed chapter is present', () => {
    for (const ch of ['21', '22', '28', '32', '34', '49', '53', '55']) {
      expect(ATA_CHAPTERS).toContain(ch);
    }
  });

  it('chapters are named for the ones engineers actually search', () => {
    expect(ATA_CHAPTER_NAMES['32']).toBe('Landing Gear');
    expect(ATA_CHAPTER_NAMES['34']).toBe('Navigation');
    expect(ATA_CHAPTER_NAMES['53']).toBe('Fuselage');
    expect(ATA_CHAPTER_NAMES['49']).toBe('Auxiliary Power Unit');
  });

  it('the gate surfaces the ATA chapter of every overdue and due-soon item', () => {
    const registry = [
      { reference: 'AD-NLG', kind: /** @type {const} */ ('AD'), ataChapter: '32',
        aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]), dueCycles: 20_000 },
      { reference: 'AD-NAV', kind: /** @type {const} */ ('AD'), ataChapter: '34',
        aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]), dueCycles: 21_050 },
    ];
    const gate = airworthinessGate(registry, aircraft);
    expect(gate.overdue[0].ataChapter).toBe('32');
    expect(gate.dueSoon[0].ataChapter).toBe('34');
  });

  it('the tightest upcoming deadline is surfaced for planning', () => {
    const gate = airworthinessGate([
      { reference: 'A', kind: /** @type {const} */ ('AD'), ataChapter: '34',
        aircraftType: 'B737-800', serialRange: /** @type {const} */ ([0, 99_999]), dueCycles: 21_050 },
    ], aircraft);
    expect(gate.nextDue?.reference).toBe('A');
  });
});