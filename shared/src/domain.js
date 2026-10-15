/**
 * AMS — Airline Management System
 * Shared domain vocabulary: the single source of truth for every state,
 * cost category, department and role in the platform.
 *
 * Nothing else in the codebase is permitted to hard-code these strings.
 * A state that does not appear here cannot be written to the database,
 * because every state column carries a CHECK constraint built from
 * these arrays.
 */

/* ------------------------------------------------------------------ *
 * Departments — the platform's portal registry
 * Aviation regulations mandate named accountable managers, so the
 * department structure is a regulatory artefact, not a UI preference.
 * ------------------------------------------------------------------ */
export const DEPARTMENTS = [
  'executive',
  'flight_operations',
  'technical_engineering',
  'crew_scheduling',
  'training_standards',
  'safety_risk',
  'quality_assurance',
  'commercial_revenue',
  'ticketing_distribution',
  'customer_service',
  'cargo',
  'ground_operations',
  'finance_treasury',
  'procurement_supply',
  'human_resources',
  'it_mis',
];

/**
 * Regulatory accountable-manager roles. Aviation regulations in most
 * jurisdictions require an operator to appoint and evidence holders for
 * each of these; AMS records the holder and the authority approval.
 */
export const ACCOUNTABLE_MANAGER_ROLES = [
  'ceo',
  'flight_operations_manager',
  'aircraft_maintenance_manager',
  'safety_officer',
  'quality_manager',
  'security_manager',
  'accountable_manager_flight_ops',
  'accountable_manager_technical',
];

/**
 * Delivery phase per department. Phase 1 departments are functional in
 * the first release; Phase 2 departments are registered with roles and a
 * portal shell so the framework is proven, but their operational logic
 * is explicitly deferred rather than faked.
 */
export const DEPARTMENT_PHASE = {
  executive: 1,
  finance_treasury: 1,
  procurement_supply: 1,
  technical_engineering: 1,
  it_mis: 1,
  flight_operations: 2,
  crew_scheduling: 2,
  training_standards: 2,
  safety_risk: 2,
  quality_assurance: 2,
  commercial_revenue: 2,
  ticketing_distribution: 2,
  customer_service: 2,
  cargo: 2,
  ground_operations: 2,
  human_resources: 2,
};

/* ------------------------------------------------------------------ *
 * Financial dimensions
 * ------------------------------------------------------------------ */

/**
 * IATA-aligned cost taxonomy. Deliberately NOT the IMF GFSM chart of
 * accounts used in the government PFMS build: GFSM is a government
 * statistical mandate, airlines report under IFRS with an industry
 * cost structure. The distinction matters because CASK/RASK are only
 * comparable between carriers when the numerator uses this taxonomy.
 */
export const COST_CATEGORIES = [
  // ---- Flight-attributable (variable with the flight) ----
  'fuel',                    // uplift minus landing reserves
  'crew_flight',             // flight crew duty + travel + hotel
  'crew_cabin',              // cabin crew duty + travel + hotel
  'crew_training',           // recurrent/check training, allocated by duty
  'maintenance_direct',      // parts, labour, external maintenance
  'maintenance_reserve',     // provision per flight hour
  'airport_charges',         // landing, parking, passenger service
  'navigation_charges',      // RNAV / en-route
  'catering',                // passenger catering uplift
  'handling',                // ground handling agents
  'de_icing',                // winter ops
  // ---- Fleet-attributable (fixed, allocated by driver) ----
  'lease_aircraft',          // IFRS 16 interest + depreciation
  'insurance_aircraft',
  'lease_spares',            // LLP holding cost
  'crew_admin',              // salaries not attributable to a single flight
  'distribution',            // sales, marketing, distribution fees
  // ---- Period / non-operating (EXCLUDED from CASM) ----
  'sg_a',                    // selling & marketing
  'g_a',                     // general & administrative
  'finance_cost',            // interest on working capital, ROU liability
  'tax',                     // income tax
  'depreciation_other',      // IT, property, non-aircraft
  'head_office',             // group / holding company
];

/** Only these contribute to CASM. Period costs are excluded by design. */
export const FLIGHT_ATTRIBUTABLE_CATEGORIES = [
  'fuel', 'crew_flight', 'crew_cabin', 'crew_training', 'maintenance_direct',
  'maintenance_reserve', 'airport_charges', 'navigation_charges', 'catering',
  'handling', 'de_icing',
];

/** Fleet-fixed categories allocated to flights by an allocation driver. */
export const FLEET_FIXED_CATEGORIES = [
  'lease_aircraft', 'insurance_aircraft', 'lease_spares', 'crew_admin', 'distribution',
];

/** Explicitly excluded from unit cost. Getting this wrong is the single
 *  most common reason two carriers' CASK figures are not comparable. */
export const PERIOD_CATEGORIES = [
  'sg_a', 'g_a', 'finance_cost', 'tax', 'depreciation_other', 'head_office',
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZWG'];

/* ------------------------------------------------------------------ *
 * Allocation drivers — how fleet-fixed cost is pushed onto flights
 * ------------------------------------------------------------------ */
export const ALLOCATION_DRIVERS = [
  'BLOCK_HOURS',       // standard: cost that scales with flying time
  'ASKS',              // seats x km: scales with capacity offered
  'SECTORS',           // per take-off: scales with movements
  'DISTANCE_KM',       // scales with distance
  'FLIGHTS',           // flat per rotation
  'DIRECT',            // already flight-specific, no allocation
];

/* ------------------------------------------------------------------ *
 * Fleet & airworthiness
 * ------------------------------------------------------------------ */
export const LEASE_TYPES = ['OWNED', 'FINANCE_LEASE', 'OPERATING_LEASE', 'WET_LEASE'];

export const AIRCRAFT_STATUS = [
  'IN_SERVICE', 'IN_MAINTENANCE', 'GROUNDED', 'STORED', 'RETIRED',
];

export const MAINTENANCE_CHECK_TYPES = [
  'A_CHECK', 'C_CHECK', 'LINE', 'PREFLIGHT', 'POSTFLIGHT',
  'ENGINE_OVERHAUL', 'APU_OVERHAUL', 'COMPONENT_REMOVAL',
];

export const COMPLIANCE_STATUS = [
  'COMPLIANT', 'DUE_SOON', 'OVERDUE', 'NOT_APPLICABLE',
];

/** Threshold in cycles/hours before an AD or SB becomes DUE_SOON. */
export const COMPLIANCE_WARNING_THRESHOLD_PPM = 50_000; // 5% of remaining life

/* ------------------------------------------------------------------ *
 * Procurement — vendor categories are aviation-specific
 * ------------------------------------------------------------------ */
export const VENDOR_CATEGORIES = [
  'FUEL',                  // Jet A / Jet A-1 into-plane
  'SPARES',                // OEM and MRO spares, with traceability
  'AIRCRAFT_LEASE',        // aircraft lessors
  'GROUND_HANDLING',
  'CATERING',
  'NAVIGATION_SURVEILLANCE',
  'INSURANCE',
  'GSE',                   // ground support equipment
  'IT',
  'FACILITIES',
  'PROFESSIONAL_SERVICES',
  'TRAVEL',
];

export const SOURCING_METHODS = [
  'OPEN_TENDER', 'RFQ', 'PQQ', 'NEGOTIATED', 'SINGLE_SOURCE',
  'FRAMEWORK', 'REVERSE_AUCTION',
];

/**
 * ATA chapter codes.
 *
 * Airworthiness Directives are published under an ATA chapter, and
 * technical and compliance staff search by ATA chapter — "what is
 * outstanding on landing gear?" — not by AD reference number. Without
 * this field every such query becomes a full-text scan.
 *
 * Source: structure observed directly in 14 CFR Part 39 ADs published
 * in the Federal Register (79 FR 19848; 87 FR 67354) and in live EASA
 * directives AD 2026-0125-E, AD 2023-0167R1 and AD 2024-0213.
 */
export const ATA_CHAPTERS = [
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32',
  '33', '34', '35', '36', '38', '45', '46', '47', '48', '49', '51', '52',
  '53', '54', '55', '56', '77',
];

/** The chapters most commonly encountered on an airliner. */
export const ATA_CHAPTER_NAMES = {
  '21': 'Air Conditioning',
  '22': 'Autoflight',
  '23': 'Communications',
  '24': 'Electrical Power',
  '25': 'Cabin Equipment and Furnishings',
  '26': 'Flight Controls',
  '27': 'Landing Gear Control',
  '28': 'Fuel',
  '29': 'Hydraulics',
  '30': 'Ice and Rain Protection',
  '31': 'Instruments, Recording and Reporting',
  '32': 'Landing Gear',
  '33': 'Navigation Lights',
  '34': 'Navigation',
  '35': 'Oxygen',
  '36': 'Pneumatic',
  '38': 'Icing',
  '45': 'Maintenance',
  '46': 'Information Systems',
  '47': 'Instruments, Recording and Reporting',
  '48': 'Manual and Miscellaneous Equipment',
  '49': 'Auxiliary Power Unit',
  '51': 'Cabin Equipment and Furnishings',
  '52': 'Doors',
  '53': 'Fuselage',
  '54': 'Nacelles',
  '55': 'Powerplant',
  '56': 'Windows',
  '77': 'Engine Controls',
};

/**
 * MEL rectification interval categories.
 *
 * Source: EASA CS-GEN-MMEL Issue 2, Annex II to ED Decision 2020/012/R.
 *
 * Category B  — three calendar days,   excluding the day of discovery
 * Category C  — ten calendar days,     excluding the day of discovery
 * Category D  — one hundred and twenty calendar days, same exclusion
 * Category A  — no standard interval; where a period is specified in
 *               anything other than calendar days, it starts at the
 *               moment the defect is deferred.
 */
export const MEL_CATEGORIES = {
  A: { days: null, note: 'No standard interval specified; starts at deferral' },
  B: { days: 3, note: '3 calendar days excluding the day of discovery' },
  C: { days: 10, note: '10 calendar days excluding the day of discovery' },
  D: { days: 120, note: '120 calendar days excluding the day of discovery' },
};

/** @typedef {'A'|'B'|'C'|'D'} MelCategory */

/* ------------------------------------------------------------------ *
 * Carbon compliance regimes
 * ------------------------------------------------------------------ */
export const CARBON_REGIMES = ['CORSIA', 'EU_ETS', 'UK_ETS', 'SAF_MANDATE'];

/** CORSIA: operators below this annual international CO2 have no obligation. */
export const CORSIA_CO2_THRESHOLD_TONNES = 10_000;
/** CORSIA and EU ETS both exempt aircraft below this max take-off mass. */
export const CORSIA_MTOM_EXEMPTION_KG = 5_700;
/** New entrants exempt for 3 years or until 0.1% of 2020 total international CO2. */
export const CORSIA_NEW_ENTRANT_YEARS = 3;
/** CORSIA compliance periods are three years each. */
export const CORSIA_COMPLIANCE_PERIODS = [
  '2021-2023', '2024-2026', '2027-2029', '2030-2032', '2033-2035',
];

/** Jet A-1 kerosene CO2 emission factor, kg CO2 per kg fuel (ICAO default). */
export const EMISSION_FACTOR_JET_A1 = 3.16;
export const EMISSION_FACTOR_JET_A = 3.15;
/** Jet A-1 lower heating value, MJ per kg — needed for tankering mass maths. */
export const LHV_JET_A1_MJ_PER_KG = 43.02;

/* ------------------------------------------------------------------ *
 * State machines
 * ------------------------------------------------------------------ */
export const COST_AUTHORITY_STATES = [
  'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'AUTHORISED', 'COMMITTED',
  'SETTLED', 'REJECTED', 'CANCELLED',
];

export const REQUISITION_STATES = [
  'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'PO_CREATED', 'CLOSED',
  'REJECTED', 'CANCELLED',
];

export const PO_STATES = [
  'CREATED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED',
  'INVOICED', 'CLOSED', 'CANCELLED',
];

export const TENDER_STATES = [
  'DRAFT', 'APPROVED', 'PUBLISHED', 'BIDDING_OPEN', 'EVALUATION', 'AWARDED',
  'CONTRACTED', 'CLOSED', 'CANCELLED',
];

export const PERIOD_STATES = ['OPEN', 'SOFT_CLOSED', 'HARD_CLOSED'];

export const AIRCRAFT_EVENT_STATES = [
  'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'DEFERRED', 'CANCELLED',
];

/* ------------------------------------------------------------------ *
 * Roles & segregation of duties
 * ------------------------------------------------------------------ */
export const ROLES = [
  'platform_admin',
  'tenant_admin',
  'ceo',
  'finance_director',
  'controller',
  'accountant',
  'procurement_manager',
  'technical_manager',
  'flight_ops_manager',
  'safety_officer',
  'auditor',
];

export const SOD_RULES = [
  'SELF_APPROVAL',            // approver === requester
  'EVALUATOR_IS_AUTHOR',     // evaluator also authored the sourcing event
  'PAYMENT_RELEASER_IS_ORIGINATOR',
  'SUPPLIER_BIDS_OWN_TENDER',
  'TECHNICAL_APPROVES_OWN_CHECK',
  'PERIOD_CERTIFIER_WITHOUT_AUTHORITY',
];

/* ------------------------------------------------------------------ *
 * Operational environment
 * ------------------------------------------------------------------ */
export const UTC_OFFSET_MINUTES = 120; // Harare UTC+2, no daylight saving
export const REPORTING_CURRENCY = 'USD';

/* ------------------------------------------------------------------ *
 * Union types
 *
 * These are JSDoc-only. In a plain-JavaScript codebase there is no
 * `export type` syntax, so union types are documented for the editor
 * and for `checkJs`, and enforced at RUNTIME by the CHECK constraints
 * generated on each state column from the const arrays above.
 *
 * A value that is not in the corresponding array cannot reach the
 * database. The type annotation is a convenience; the constraint is
 * the guarantee.
 * ------------------------------------------------------------------ */

/**
 * @typedef {'executive'|'flight_operations'|'technical_engineering'|'crew_scheduling'
 *  |'training_standards'|'safety_risk'|'quality_assurance'|'commercial_revenue'
 *  |'ticketing_distribution'|'customer_service'|'cargo'|'ground_operations'
 *  |'finance_treasury'|'procurement_supply'|'human_resources'|'it_mis'} Department
 *
 * @typedef {string} AccountableManagerRole
 * @typedef {string} CostCategory
 * @typedef {string} Currency
 * @typedef {string} AllocationDriver
 * @typedef {string} LeaseType
 * @typedef {string} AircraftStatus
 * @typedef {string} ComplianceStatus
 * @typedef {string} VendorCategory
 * @typedef {string} SourcingMethod
 * @typedef {string} CarbonRegime
 * @typedef {string} CostAuthorityState
 * @typedef {string} RequisitionState
 * @typedef {string} PeriodState
 * @typedef {string} Role
 * @typedef {string} SodRule
 * @typedef {string} FlightDirection
 */
