/**
 * AMS — Chart of accounts.
 *
 * Plan step 2.1 and step 5.1. The chart is derived from the existing
 * `COST_CATEGORIES` taxonomy in shared/src/domain.js rather than invented
 * separately, so a cost that reaches the general ledger and a cost that
 * reaches CASK come from ONE definition. Inventing a parallel chart is how
 * ERP implementations end up unable to answer "why does this number differ
 * between the cost report and the accounts?" — which is the question that
 * destroys trust in an airline finance system faster than any other.
 *
 * STRUCTURAL PROPERTY: each account carries a `statement` and a `bucket`.
 * The bucket is what disqualifies a category from CASK. It is a property of
 * the account, not a report-time toggle, exactly as plan step 2.1 requires:
 * a category cannot be quietly reclassified at report time to make CASK look
 * better.
 *
 * @module shared/src/accounts
 */

import { COST_CATEGORIES } from './domain.js';

/**
 * @typedef {'ASSET'|'LIABILITY'|'EQUITY'|'REVENUE'|'EXPENSE'} AccountType
 * @typedef {'FLIGHT_ATTRIBUTABLE'|'FLEET_FIXED'|'PERIOD'} CostBucket
 *
 * @typedef {Object} Account
 * @property {string} code
 * @property {string} name
 * @property {AccountType} type
 * @property {CostBucket|null} bucket  null for balance-sheet accounts
 * @property {boolean} [contra]        contra-representation (accrual, contra-asset)
 * @property {string} [parent]         for reporting roll-up
 */

/** @type {ReadonlyArray<Account>} */
export const CHART_OF_ACCOUNTS = Object.freeze([
  // ---------------- Assets ----------------
  { code: '1100', name: 'Cash and cash equivalents', type: 'ASSET', bucket: null },
  { code: '1200', name: 'Trade accounts receivable', type: 'ASSET', bucket: null },
  { code: '1300', name: 'Stores and spares inventory', type: 'ASSET', bucket: null },
  { code: '1500', name: 'Aircraft and flight equipment', type: 'ASSET', bucket: null },
  { code: '1510', name: 'Right-of-use assets (IFRS 16)', type: 'ASSET', bucket: null },
  { code: '1590', name: 'Accumulated depreciation', type: 'ASSET', bucket: null, contra: true },
  { code: '1600', name: 'Prepayments and deposits', type: 'ASSET', bucket: null },

  // ---------------- Liabilities ----------------
  { code: '2100', name: 'Trade accounts payable', type: 'LIABILITY', bucket: null },
  { code: '2200', name: 'Accrued operating expenses', type: 'LIABILITY', bucket: null },
  { code: '2300', name: 'Lease liabilities (IFRS 16)', type: 'LIABILITY', bucket: null },
  { code: '2400', name: 'Unearned revenue / customer deposits', type: 'LIABILITY', bucket: null },
  { code: '2500', name: 'Payroll liabilities', type: 'LIABILITY', bucket: null },

  // ---------------- Equity ----------------
  { code: '3100', name: 'Share capital', type: 'EQUITY', bucket: null },
  { code: '3200', name: 'Retained earnings', type: 'EQUITY', bucket: null },

  // ---------------- Revenue ----------------
  { code: '4100', name: 'Passenger revenue', type: 'REVENUE', bucket: null, parent: '4000' },
  { code: '4200', name: 'Cargo revenue', type: 'REVENUE', bucket: null, parent: '4000' },
  { code: '4300', name: 'Ancillary and other revenue', type: 'REVENUE', bucket: null, parent: '4000' },

  // ---------------- Flight-attributable operating costs ----------------
  { code: '5100', name: 'Jet fuel uplift', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5200', name: 'Flight crew', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5210', name: 'Cabin crew', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5220', name: 'Crew training', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5300', name: 'Maintenance — direct', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5310', name: 'Maintenance — provisions', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5400', name: 'Airport and landing charges', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5500', name: 'Navigation charges', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5600', name: 'Passenger catering', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5610', name: 'Ground handling', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },
  { code: '5620', name: 'De-icing', type: 'EXPENSE', bucket: 'FLIGHT_ATTRIBUTABLE' },

  // ---------------- Fleet-fixed operating costs ----------------
  { code: '6100', name: 'Aircraft lease charges', type: 'EXPENSE', bucket: 'FLEET_FIXED' },
  { code: '6110', name: 'Aircraft insurance', type: 'EXPENSE', bucket: 'FLEET_FIXED' },
  { code: '6120', name: 'Spare parts holding', type: 'EXPENSE', bucket: 'FLEET_FIXED' },
  { code: '6200', name: 'Crew administration', type: 'EXPENSE', bucket: 'FLEET_FIXED' },
  { code: '6300', name: 'Distribution and marketing', type: 'EXPENSE', bucket: 'FLEET_FIXED' },

  // ---------------- Period costs ----------------
  { code: '7100', name: 'Selling and marketing', type: 'EXPENSE', bucket: 'PERIOD' },
  { code: '7200', name: 'General and administrative', type: 'EXPENSE', bucket: 'PERIOD' },
  { code: '7300', name: 'Depreciation — non-aircraft', type: 'EXPENSE', bucket: 'PERIOD' },
  { code: '8100', name: 'Finance costs', type: 'EXPENSE', bucket: 'PERIOD' },
  { code: '8200', name: 'Income tax', type: 'EXPENSE', bucket: 'PERIOD' },
]);

/** code -> Account */
export const ACCOUNTS = Object.freeze(
  Object.fromEntries(CHART_OF_ACCOUNTS.map((a) => [a.code, Object.freeze(a)])),
);

/**
 * Cost category -> general ledger account.
 *
 * This is the join that makes the accounts and the cost report agree. Every
 * entry in COST_CATEGORIES must appear here; `assertTaxonomyComplete()`
 * enforces it, because a category with no account is a cost that silently
 * vanishes from the financial statements — the single most damaging defect a
 * cost model can have, and the one no test would catch without this check.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CATEGORY_TO_ACCOUNT = Object.freeze({
  fuel: '5100',
  crew_flight: '5200',
  crew_cabin: '5210',
  crew_training: '5220',
  maintenance_direct: '5300',
  maintenance_reserve: '5310',
  airport_charges: '5400',
  navigation_charges: '5500',
  catering: '5600',
  handling: '5610',
  de_icing: '5620',
  lease_aircraft: '6100',
  insurance_aircraft: '6110',
  lease_spares: '6120',
  crew_admin: '6200',
  distribution: '6300',
  sg_a: '7100',
  g_a: '7200',
  depreciation_other: '7300',
  finance_cost: '8100',
  tax: '8200',
  head_office: '7200',
});

/**
 * @param {string} code
 * @returns {Account}
 */
export function account(code) {
  const a = ACCOUNTS[code];
  if (!a) throw new Error(`Unknown GL account ${code}`);
  return a;
}

/**
 * Sum a set of cost categories to an account total. Used by the model-to-GL
 * bridge and by the cost report, so both read the same taxonomy.
 *
 * @param {Record<string, number>} byCategory
 * @returns {Map<string, number>} account code -> cents
 */
export function categoryTotalsToAccounts(byCategory) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const [category, cents] of Object.entries(byCategory)) {
    const code = CATEGORY_TO_ACCOUNT[category];
    if (!code) continue; // taxonomy gap; assertTaxonomyComplete() catches this
    out.set(code, (out.get(code) ?? 0) + cents);
  }
  return out;
}

/**
 * Throws if any cost category has no general ledger account.
 *
 * @throws {Error} naming every unmapped category
 */
export function assertTaxonomyComplete() {
  const missing = COST_CATEGORIES.filter((c) => !CATEGORY_TO_ACCOUNT[c]);
  if (missing.length) {
    throw new Error(
      `Cost categories with no GL account: ${missing.join(', ')}. `
      + 'A cost with no account cannot reach the financial statements.',
    );
  }
}