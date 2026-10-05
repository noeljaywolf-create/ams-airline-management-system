/**
 * Deterministic sample operation.
 *
 * A fictional operator, ZimbAir, on a plausible African network, for one
 * fiscal year. Deterministic on purpose: every reload must show the same
 * figures, or a demo cannot be checked.
 *
 * The data is INPUT to the real domain modules. No figure in the UI is
 * hard-coded — costs, ratios, verdicts, routes and deadlines are all
 * computed by shared/src/ code from the values below.
 */

import { cents } from '../../shared/src/money.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The generator is seeded from a module-level closure, so a SECOND call to
 * buildFlights() continues the sequence rather than repeating it. That makes
 * the demo non-reproducible: every reload would show different figures, and
 * "the number changed" would be indistinguishable from a real change.
 *
 * Fixed by re-seeding at the top of buildFlights. Now two calls with the
 * same argument return identical data, which is what makes a figure in this
 * UI checkable.
 */
let rand;
const reseed = () => { rand = mulberry32(20260915); };
reseed();

const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

export const TENANT = {
  id: 'zim-2026',
  name: 'ZimbAir',
  legalName: 'Zimbabwe Aviation Company (Pvt) Ltd',
  icao: 'ZIM',
  iata: 'ZM',
  country: 'Zimbabwe',
  base: 'HRE',
  currency: 'USD',
  aoc: 'CAAZ/AOC/2019/0417',
  certificationBody: 'CAAZ',
  fiscalYear: 2026,
  aircraftCount: 4,
};

/** Aircraft master. Fuel burn is a modelled approximation, clearly so. */
export const AIRCRAFT = [
  { id: 'Z-WAB', type: 'B738', desc: 'Boeing 737-800',   seats: 162, mtom: 79_015, lease: 'OPERATING_LEASE', monthlyCents: cents('412000.00') },
  { id: 'Z-WAC', type: 'B738', desc: 'Boeing 737-800',   seats: 162, mtom: 79_015, lease: 'FINANCE_LEASE',   monthlyCents: cents('389000.00') },
  { id: 'Z-WAD', type: 'A320', desc: 'Airbus A320neo',   seats: 186, mtom: 79_000, lease: 'OPERATING_LEASE', monthlyCents: cents('447500.00') },
  { id: 'Z-WAE', type: 'E75L', desc: 'Embraer E175',    seats: 88,  mtom: 45_800,  lease: 'WET_LEASE',       monthlyCents: cents('198000.00') },
];

/**
 * One row of the route network: two airports, the great-circle distance
 * between them, and the flags the carbon module needs.
 *
 * The explicit shape is load-bearing. Written as bare tuples, checkJs widens
 * every element to `string | number | boolean`, and the arithmetic and the
 * emissions calls below then fail to type-check even though they are correct
 * at runtime. That is exactly the class of mistake ADR-001's gate exists to
 * catch — and it caught this one.
 *
 * @typedef {Object} RouteDef
 * @property {string} from
 * @property {string} to
 * @property {number} km
 * @property {'regional'|'international'} kind
 * @property {boolean} international
 * @property {boolean} eeaInvolved
 */

/** @type {RouteDef[]} */
const ROUTE_DEFS = [
  { from: 'HRE', to: 'LUN',  km:  494, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'LVI',  km:  507, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'JNB',  km: 1360, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'NBO',  km: 1355, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'LAD',  km: 1699, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'MRU',  km: 3016, kind: 'international', international: true,  eeaInvolved: false },
{ from: 'HRE', to: 'DXB',  km: 4388, kind: 'international', international: true,  eeaInvolved: true  },
{ from: 'LUN', to: 'JNB',  km:  974, kind: 'regional',      international: false, eeaInvolved: false },
{ from: 'LUN', to: 'NBO',  km: 1067, kind: 'regional',      international: false, eeaInvolved: false },
{ from: 'LVI', to: 'JNB',  km:  999, kind: 'regional',      international: false, eeaInvolved: false },
{ from: 'LVI', to: 'NBO',  km: 1092, kind: 'regional',      international: false, eeaInvolved: false },
{ from: 'JNB', to: 'CPT',  km:  833, kind: 'regional',      international: true,  eeaInvolved: false },
{ from: 'CPT', to: 'LAD',  km: 2409, kind: 'international', international: true,  eeaInvolved: false },
{ from: 'JNB', to: 'DXB',  km: 3820, kind: 'international', international: true,  eeaInvolved: true  },
{ from: 'NBO', to: 'DXB',  km: 2215, kind: 'international', international: true,  eeaInvolved: true  }
];

/** @type {Record<string, number>} kg of fuel per km, by type */
const BURN_PER_KM = { B738: 2.95, A320: 2.72, E75L: 3.35 };

export const ROUTES = ROUTE_DEFS.map((d, i) => {
  const ac = AIRCRAFT[i % 2 === 0 ? 0 : 2];
  const factor = BURN_PER_KM[ac.type] ?? 3.0;
  const burnKg = Math.round(d.km * factor * (0.94 + rand() * 0.14));
  return {
    id: `${d.from}-${d.to}`,
    from: d.from,
    to: d.to,
    km: d.km,
    kind: d.kind,
    international: d.international,
    eeaInvolved: d.eeaInvolved,
    aircraft: ac.id,
    aircraftType: ac.type,
    seats: ac.seats,
    burnKg,
    blockHours: Number((d.km / 780 + 0.55).toFixed(2)),
    // Overflight, handling, airport and navigation charges for the sector.
    overflightCents: int(18_000, 96_000),
    airportChargesCents: int(52_000, 214_000),
    handlingCents: int(14_000, 41_000),
    cateringPerPaxCents: int(1_150, 2_400),
  };
});

/**
* Build a year of flights by rotating over the network.
 *
 * SECTORS_PER_ROUTE is the utilisation assumption, and it is the single most
 * consequential number in this file.
 *
 *   4 narrowbodies at ~8 sectors/day across ~300 operating days
 *   = ~9,600 sectors a year, spread over 15 routes = ~640 per route.
 *
 * An earlier value of 26 implied roughly ONE flight per day for the whole
 * fleet. That put a $19.2M annual fleet-fixed pool onto only 390 sectors —
 * $49,231 of fixed cost on a sector whose direct cost was $7,947. CASK came
 * out at $848 per seat-kilometre against an industry range of $0.05 to $0.12.
 *
 * Nothing was wrong with the domain code. allocateFleetFixed() and
 * aggregatePnl() computed precisely what they were asked to compute; the input
 * was an impossible fleet plan. A demo representing a real airline should not
 * require the reader to accept one.
 *
 * The explicit return annotation is also load-bearing: without it, checkJs
 * widens every field to `string | number | boolean` and every downstream
 * consumer fails to type-check.
 *
 * @param {number} [perRoute]
 * @returns {Array<{
 *   id: string, routeId: string, date: string, aircraft: string, aircraftType: string,
 *   seatsOffered: number, passengers: number, distanceKm: number, blockHours: number,
 *   fuelKg: number, fuelPlannedKg: number, fuelPriceCentsPerKg: number,
 *   taxiFuelKg: number, tripFuelKg: number, contingencyKg: number, alternateKg: number,
 *   finalReserveKg: number, upliftKg: number, takeoffFuelKg: number, landingFuelKg: number,
 *   flightCrewCents: number, cabinCrewCents: number, crewTrainingCents: number,
 *   maintenanceDirectCents: number, maintenanceReserveCents: number,
 *   airportChargesCents: number, navigationCents: number, cateringCents: number,
 *   handlingCents: number, deIcingCents: number,
 *   revenueCents: number, otherRevenueCents: number,
 *   international: boolean, eeaInvolved: boolean, safKg: number, mtomKg: number,
 * }>}
 */
export function buildFlights(perRoute = 640) {
  reseed();                 // reproducible: same call, same figures
  const flights = [];
  let seq = 1;

  for (const route of ROUTES) {
    for (let i = 0; i < perRoute; i += 1) {
      const seasonal = 1 + 0.14 * Math.sin((i / perRoute) * Math.PI * 2);

      // Fuel is built BOTTOM-UP so the arithmetic is physically consistent.
      //
      //   uplift      = taxi + trip + contingency + alternate + final reserve
      //   takeoffFuel = taxi + trip + contingency + alternate + final reserve
      //   landingFuel = contingency + alternate + final reserve  (jittered)
      //   actualBurn  = takeoffFuel - landingFuel = taxi + trip
      //
      // fuelKg is therefore taxi + trip: the fuel actually BURNED, which is
      // what gets costed. An earlier version set fuelKg to the trip figure
      // alone and derived takeoff/landing independently, which on a short
      // sector produced a NEGATIVE burn — the 1,500 kg final reserve
      // exceeded the whole fuel load. The demo tests caught it.
      const taxiFuelKg = Math.max(60, Math.round(route.burnKg * 0.055));
      const tripFuelKg = Math.round(route.burnKg * seasonal * (0.97 + rand() * 0.08));
      const fuelKg = taxiFuelKg + tripFuelKg;
      const contingencyKg = Math.max(40, Math.round(tripFuelKg * 0.05));
      const alternateKg = Math.max(80, Math.round(tripFuelKg * 0.09));
      const finalReserveKg = 1_500;
      const upliftKg = taxiFuelKg + tripFuelKg + contingencyKg + alternateKg + finalReserveKg;
      const plannedKg = Math.round(fuelKg * (0.985 + rand() * 0.045));

      const loadFactor = 0.66 + rand() * 0.28;
      const passengers = Math.min(route.seats, Math.round(route.seats * loadFactor));

      const fuelPrice = int(86, 128);
      const fareCents = int(9_800, 24_500);

      flights.push({
        id: `FL${String(seq++).padStart(4, '0')}`,
        routeId: route.id,
        date: `2026-${String(1 + Math.floor((i / perRoute) * 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
        aircraft: route.aircraft,
        aircraftType: route.aircraftType,
        seatsOffered: route.seats,
        passengers,
        distanceKm: route.km,
        blockHours: route.blockHours,

        fuelKg,
        fuelPlannedKg: plannedKg,
        fuelPriceCentsPerKg: fuelPrice,

        taxiFuelKg,
        tripFuelKg,
        contingencyKg,
        alternateKg,
        finalReserveKg,
        upliftKg,

        // Fuel on board at brake release, and what remained at touchdown.
        // The difference is the actual burn, always positive by construction.
        takeoffFuelKg: upliftKg,
        landingFuelKg: contingencyKg + alternateKg + finalReserveKg
          + int(-70, 130),

// cents() already returns minor units, so cents('1420.00') is
        // 142000. An earlier version read cents('142000') — fourteen times
        // too large — and then added int(0, 60_000) on top, producing a
        // $142,205 crew cost per sector. Every ratio downstream was wrong by
        // two orders of magnitude while every test still passed, because the
        // tests asserted internal consistency, not realism.
        flightCrewCents: cents('1420.00') + int(0, 600),
        cabinCrewCents: cents('740.00') + int(0, 340),
        crewTrainingCents: cents('210.00') + int(0, 90),
        maintenanceDirectCents: int(48_000, 310_000),
        maintenanceReserveCents: int(28_000, 96_000),
        airportChargesCents: route.airportChargesCents,
        navigationCents: route.overflightCents,
        cateringCents: passengers * route.cateringPerPaxCents,
        handlingCents: route.handlingCents,
        deIcingCents: rand() < 0.18 ? int(12_000, 44_000) : 0,

        revenueCents: passengers * fareCents,
        otherRevenueCents: rand() < 0.3 ? int(18_000, 96_000) : 0,
        international: route.international,
        eeaInvolved: route.eeaInvolved,
        safKg: rand() < 0.22 ? Math.round(fuelKg * (0.03 + rand() * 0.09)) : 0,
        mtomKg: route.aircraftType === 'E75L' ? 45_800 : 79_000,
      });
    }
  }
  return flights;
}

/** Fleet-fixed cost pools, allocated by block hours by default. */
export const FLEET_FIXED = AIRCRAFT.flatMap((ac) => {
  const bucket = ac.type === 'E75L' ? 'lease_spares' : 'lease_aircraft';
  return [{ cost: ac.monthlyCents, category: bucket, aircraft: ac.id }];
}).concat([
  { cost: cents('184000.00'), category: 'insurance_aircraft', aircraft: null },
  { cost: cents('262000.00'), category: 'crew_admin',         aircraft: null },
  { cost: cents('398000.00'), category: 'distribution',       aircraft: null },
]);

/** Routing network for the planner: costs and fuel per direct sector. */
export const SECTORS = (() => {
  const out = [];
  for (const r of ROUTES) {
    out.push({
      from: r.from, to: r.to,
      // Every component is integer cents, so the sum is too. Rounding here
      // would be a silent lie; if a component were ever a float the sector
      // must be rejected rather than coerced.
      costCents: r.overflightCents + r.airportChargesCents + r.handlingCents,
      fuelKg: r.burnKg,
    });
  }
  // A couple of one-stop connections that make the fuel constraint bite.
  out.push({ from: 'HRE', to: 'MRU', costCents: 268_000, fuelKg: 11_400 });
  out.push({ from: 'HRE', to: 'CPT', costCents: 241_000, fuelKg: 10_900 });
  out.push({ from: 'LUN', to: 'CPT', costCents: 158_000, fuelKg: 6_800 });
  out.push({ from: 'LVI', to: 'CPT', costCents: 171_000, fuelKg: 7_100 });
  return out;
})();

/** Fuel prices by station, in cents per kg. JNB is the cheap hub. */
export const FUEL_PRICES = {
  HRE: 118, LUN: 121, LVI: 116, JNB: 94, NBO: 109,
  CPT: 112, LAD: 127, MRU: 124, DXB: 101,
};

/** Life-limited parts, deliberately including calendar-bound items. */
export const LLPS = [
  { partNumber: 'P/N-4471-A', serialNumber: 'LLP-0001', cyclesTotalLimit: 20_000, cyclesSinceNew: 9_800,  hoursTotalLimit: 80_000, hoursSinceNew: 41_200, monthsTotalLimit: 144, monthsSinceNew: 61 },
  { partNumber: 'P/N-2233-B', serialNumber: 'LLP-0002', cyclesTotalLimit: 12_000, cyclesSinceNew: 11_400, hoursTotalLimit: null, hoursSinceNew: null, monthsTotalLimit: 120, monthsSinceNew: 113 },
  { partNumber: 'P/N-9014-C', serialNumber: 'LLP-0003', cyclesTotalLimit: 30_000, cyclesSinceNew: 4_100,  hoursTotalLimit: 60_000, hoursSinceNew: 9_800,  monthsTotalLimit: 96,  monthsSinceNew: 22 },
  { partNumber: 'P/N-7782-A', serialNumber: 'LLP-0004', cyclesTotalLimit: 16_000, cyclesSinceNew: 15_700, hoursTotalLimit: 70_000, hoursSinceNew: 58_000, monthsTotalLimit: 180, monthsSinceNew: 44 },
];

/**
 * Directive registry. Includes one deliberate SB/AD trap: an AD and the SB
 * that would satisfy it look like duplicates, and treating them as
 * interchangeable is the error the airworthiness module exists to prevent.
 *
 * @typedef {Object} DirectiveRow
 * @property {string} reference
 * @property {'AD'|'SB'} kind   Only an AD is legally mandatory
 * @property {string} authority
 * @property {string} ataChapter
 * @property {string} aircraftType
 * @property {[number, number]} serialRange  Inclusive [from, to]
 * @property {boolean} superseded
 * @property {number} [dueCycles]
 * @property {number} [dueHours]
 * @property {number} [repetitiveIntervalCycles]
 * @property {string} [sbReference]
 * @property {boolean} [isEmergency]
 * @property {string} [operatingLimitation]
 * @property {number} [nonCumulativeTolerancePpm]
 */

/**
 * The annotation is load-bearing. Without it, checkJs widens `kind` to plain
 * `string`, and the `'AD' | 'SB'` union that adsbApplies() declares rejects
 * every row. The gate catches that — a registry which cannot satisfy its own
 * consumer's type is a registry that was never type-checked.
 *
 * @type {DirectiveRow[]}
 */
export const DIRECTIVES = [
  { reference: 'EASA AD 2024-0184', kind: 'AD', authority: 'EASA', ataChapter: '32', aircraftType: 'B738', serialRange: [7000, 7999], dueCycles: 22_500, repetitiveIntervalCycles: 3_000, sbReference: 'SB 737-32-0145', isEmergency: false, superseded: false },
  { reference: 'SB 737-32-0145',  kind: 'SB', authority: 'BOEING', ataChapter: '32', aircraftType: 'B738', serialRange: [7000, 7999], dueCycles: 22_500, superseded: false },
  { reference: 'EASA AD 2025-0092', kind: 'AD', authority: 'EASA', ataChapter: '28', aircraftType: 'B738', serialRange: [7000, 7999], dueHours: 34_000, isEmergency: true, operatingLimitation: 'Within 3 hours of a suitable airport', superseded: false },
  { reference: 'FAA AD 23-14-02',  kind: 'AD', authority: 'FAA', ataChapter: '55', aircraftType: 'A320', serialRange: [8000, 8999], dueCycles: 15_800, superseded: false },
  { reference: 'EASA AD 2026-0125-E', kind: 'AD', authority: 'EASA', ataChapter: '26', aircraftType: 'A320', serialRange: [8000, 8999], dueHours: 19_500, isEmergency: false, superseded: false },
  { reference: 'EASA AD 2022-0177', kind: 'AD', authority: 'EASA', ataChapter: '29', aircraftType: 'E75L', serialRange: [200, 499], dueCycles: 9_400, superseded: true },
  { reference: 'CAAZ AD 04/2025',  kind: 'AD', authority: 'CAAZ', ataChapter: '30', aircraftType: 'B738', serialRange: [7000, 7999], dueCycles: 24_900, nonCumulativeTolerancePpm: 50_000, superseded: false },
];

export const AIRCRAFT_STATE = [
  { aircraftType: 'B738', serialNumber: 7412, cycles: 24_180, hours: 34_620 },
  { aircraftType: 'A320', serialNumber: 8471, cycles: 15_240, hours: 19_980 },
  { aircraftType: 'E75L', serialNumber: 311,  cycles: 8_120,  hours: 14_400 },
];

/** Daily MEL deferrals for the compliance board. */
export const DEFERRALS = [
  { itemRef: 'EASA AD 2025-0092', category: 'A', discoveredAtMs: Date.UTC(2026, 8, 1, 6, 30) },
  { itemRef: 'EASA AD 2024-0184', category: 'B', discoveredAtMs: Date.UTC(2026, 8, 14, 11, 0) },
];

/** Budget lines for the authority panel. */
export const BUDGET_LINES = [
  { id: 'BL-FUEL-26',   label: 'Fuel — Flight Operations',        budgetedCents: cents('18400000.00'), committedCents: cents('11240000.00'), pendingCents: cents('1840000.00'),  expendedCents: cents('4810000.00'),  revisedCents: cents('0.00'),  releasedCents: cents('0.00'),  frozenCents: cents('0.00'), isFrozen: false, status: 'ACTIVE' },
  { id: 'BL-MRO-26',    label: 'Maintenance Reserve',            budgetedCents: cents('9800000.00'),  committedCents: cents('4100000.00'),  pendingCents: cents('620000.00'),   expendedCents: cents('2180000.00'),  revisedCents: cents('0.00'),  releasedCents: cents('0.00'),  frozenCents: cents('120000.00'),  isFrozen: false, status: 'ACTIVE' },
  { id: 'BL-CREW-26',   label: 'Crew — Duty and Training',       budgetedCents: cents('14200000.00'), committedCents: cents('6810000.00'),  pendingCents: cents('940000.00'),   expendedCents: cents('3940000.00'),  revisedCents: cents('250000.00'), releasedCents: cents('0.00'), frozenCents: cents('0.00'), isFrozen: false, status: 'ACTIVE' },
  { id: 'BL-NAV-26',    label: 'Navigation & Overflight',        budgetedCents: cents('6900000.00'),  committedCents: cents('4120000.00'),  pendingCents: cents('310000.00'),   expendedCents: cents('1980000.00'),  revisedCents: cents('0.00'),  releasedCents: cents('0.00'),  frozenCents: cents('0.00'), isFrozen: false, status: 'ACTIVE' },
  { id: 'BL-SAF-26',    label: 'SAF Compliance',                 budgetedCents: cents('4200000.00'),  committedCents: cents('5100000.00'),  pendingCents: cents('0.00'),       expendedCents: cents('1860000.00'),  revisedCents: cents('0.00'),  releasedCents: cents('0.00'),  frozenCents: cents('0.00'), isFrozen: false, status: 'ACTIVE' },
  { id: 'BL-INS-26',    label: 'Insurance (ring-fenced)',        budgetedCents: cents('2200000.00'),  committedCents: cents('1840000.00'),  pendingCents: cents('0.00'),       expendedCents: cents('1840000.00'),  revisedCents: cents('0.00'),  releasedCents: cents('0.00'),  frozenCents: cents('360000.00'),  isFrozen: true,  status: 'ACTIVE' },
];

export const TARGET_LOAD_FACTOR_PPM = 780_000;
export const EUA_PRICE_CENTS_PER_TONNE = 8_500;
export const OFFSET_UNIT_PRICE_CENTS = 2_150;