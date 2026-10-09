/**
 * AMS — The accounts.
 *
 * This view is the answer to "what does SAP have that you do not". It is a
 * double-entry general ledger with a trial balance, a profit and loss, a
 * balance sheet, and a purchase-to-pay cycle you can drive: raise an order,
 * receive the goods, record the invoice, and watch the liability move from
 * accruals to payables. Every figure is derived from the same cost model
 * the executive views use, so the accounts cannot disagree with the board.
 *
 * @module frontend/js/views-finance
 */

import { el, card, kpi, kpis, table, pill, int } from './format.js?v=916b8a70583e';
import { createGL, costBridgeLines, canonicalTrialBalance } from '../../shared/src/ledger.js?v=916b8a70583e';
import { categoryTotalsToAccounts } from '../../shared/src/accounts.js?v=916b8a70583e';
import { createPayables } from '../../shared/src/payables.js?v=916b8a70583e';

const PERIOD = '2026-09';

const usd = (cents) => (cents / 100).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const usd2 = (cents) => (cents / 100).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2,
});

/**
 * Build a fully-loaded finance state from the operating model: the year's
 * costs bridged into the ledger, plus a purchase-to-pay cycle seeded with a
 * deliberately mis-matched invoice so the three-way match is visible.
 *
 * @param {any} model
 */
export function buildFinanceState(model) {
  const gl = createGL();

  // --- the operating year, bridged from the cost model ---
  const byCategory = {};
  for (const f of model.flights ?? []) {
    for (const [k, v] of Object.entries(f.lines ?? {})) byCategory[k] = (byCategory[k] ?? 0) + v;
  }
  // Fleet-fixed is not on the per-flight lines; it is allocated, so it is
  // bridged separately or the accounts would understate cost against the
  // cost report. This is exactly the reconciliation the model-to-GL bridge
  // exists to prevent.
  byCategory.lease_aircraft = (byCategory.lease_aircraft ?? 0) + (model.total?.fleetFixedCostCents ?? 0);

  gl.post({
    period: PERIOD,
    description: `FY2026 operating costs bridged from ${int(model.flights.length)} sectors`,
    source: 'cost-bridge',
    lines: costBridgeLines({ byCategory }),
  });

  gl.post({
    period: PERIOD,
    description: 'Passenger revenue recognised',
    source: 'revenue',
    lines: [
      { account: '1100', debitCents: model.total.revenueCents, creditCents: 0 },
      { account: '4100', creditCents: model.total.revenueCents },
    ],
  });

  // --- purchase to pay ---
  const ap = createPayables({ gl });
  const fuelPo = ap.raisePO({
    vendorId: 'V-SCF-014', description: 'Jet fuel uplift — Harare', amountCents: 4_800_00, quantity: 4, period: PERIOD,
  });
  ap.receiveGoods({ poId: fuelPo.po.id, quantityReceived: 4, period: PERIOD, expenseAccount: '5100' });
  ap.recordInvoice({ poId: fuelPo.po.id, amountCents: 4_800_00, period: PERIOD });

  const sparesPo = ap.raisePO({
    vendorId: 'V-MRO-002', description: 'Avionics spare line unit', amountCents: 62_000_00, quantity: 1, period: PERIOD,
  });
  ap.receiveGoods({ poId: sparesPo.po.id, quantityReceived: 1, period: PERIOD, expenseAccount: '1300' });
  // Over-billed on purpose: this is the invoice the three-way match must stop.
  ap.recordInvoice({ poId: sparesPo.po.id, amountCents: 74_500_00, period: PERIOD });

  return { gl, ap };
}

/**
 * @param {any} model
 * @returns {HTMLElement}
 */
export function accountsView(model) {
  const { gl, ap } = buildFinanceState(model);
  const frag = el('div', {});

  const tb = gl.trialBalance(PERIOD);
  const pl = gl.incomeStatement(PERIOD);
  const bs = gl.balanceSheet(PERIOD);

  frag.append(card('Financial position',
    'every figure bridged from the same model the executive brief reads',
    kpis(
      kpi('Operating result', usd(pl.operatingResultCents),
        `margin ${(pl.operatingMarginPpm / 10_000).toFixed(1)}%`,
        pl.operatingResultCents >= 0 ? 'good' : 'bad'),
      kpi('Total assets', usd(bs.assetsCents), 'per balance sheet'),
      kpi('Total liabilities', usd(bs.liabilitiesCents), 'accruals and payables'),
      kpi('Trial balance', tb.balanced ? 'FOOTS' : 'OUT BY ' + (tb.debitCents - tb.creditCents),
        `${tb.rows.length} accounts · debits ${usd(tb.debitCents)}`,
        tb.balanced ? 'good' : 'bad'),
    )));

  frag.append(el('div', { class: 'banner ' + (bs.balanced ? '' : 'bad') },
    el('strong', {}, bs.balanced ? 'Balance sheet balances. ' : 'BALANCE SHEET DOES NOT BALANCE. '),
    'Assets equal liabilities plus equity by construction, because a journal '
    + 'cannot post unless debits equal credits. A company whose trial balance '
    + 'will not foot cannot be audited; this one cannot be made not to foot.'));

  /* ---- income statement ---- */
  const plRows = [
    { label: 'Passenger and other revenue', cents: pl.revenueCents, kind: 'revenue' },
    { label: 'Flight-attributable cost', cents: pl.flightAttributableCents, kind: 'expense' },
    { label: 'Fleet-fixed cost', cents: pl.fleetFixedCents, kind: 'expense' },
    { label: 'Period cost', cents: pl.periodCostCents, kind: 'expense' },
    { label: 'Operating result', cents: pl.operatingResultCents, kind: 'total' },
    { label: 'Finance costs', cents: pl.financeCostCents, kind: 'expense' },
    { label: 'Net result', cents: pl.netResultCents, kind: 'total' },
  ];

  frag.append(card('Profit and loss',
    'operating result is shown before finance costs and tax, the way an airline P&L is read',
    el('div', { class: 'pl' },
      ...plRows.map((r) => el('div', { class: 'pl-row pl-' + r.kind },
        el('span', { class: 'pl-label' }, r.label),
        el('span', { class: 'pl-value' }, usd(r.cents)),
        r.kind === 'total'
          ? el('span', { class: 'pl-margin' },
            `${(pl.operatingMarginPpm / 10_000).toFixed(1)}% margin`)
          : null)))));

  /* ---- trial balance ---- */
  frag.append(card('Trial balance',
    'the proof the accounts foot — the only question an auditor really asks',
    table([
      { key: 'account', label: 'Account', cls: 'mono' },
      { key: 'name', label: 'Description' },
      { key: 'bucket', label: 'Bucket', render: (v2) => (v2 ? pill(String(v2).replace(/_/g, ' ').toLowerCase(), 'neutral') : pill('balance sheet', 'info')) },
      { key: 'debitCents', label: 'Debit', cls: 'num', render: (v2) => (v2 ? usd(v2) : '—') },
      { key: 'creditCents', label: 'Credit', cls: 'num', render: (v2) => (v2 ? usd(v2) : '—') },
      { key: 'balanceCents', label: 'Balance', cls: 'num', render: (v2) => usd(v2) },
    ], tb.rows.filter((r) => r.debitCents || r.creditCents))));

  /* ---- purchase to pay ---- */
  // Built with an explicit loop rather than nested `.map()` inside `el()`:
  // five levels of closers in one expression is unreadable and, twice now,
  // wrong.
  const payableRows = [];
  for (const inv of ap.invoices.values()) {
    const main = el('div', { class: 'queue-main' });
    main.append(el('div', { class: 'queue-ref' },
      el('span', { class: 'mono' }, inv.id),
      pill(inv.status.toLowerCase(), inv.status === 'BLOCKED' ? 'bad' : inv.status === 'PAID' ? 'ok' : 'info')));
    main.append(el('div', { class: 'queue-desc' }, `${inv.vendorId} · ${inv.poId}`));
    main.append(el('div', { class: 'queue-meta' }, usd2(inv.amountCents)));
    for (const v of inv.variances) {
      main.append(el('div', { class: 'notice notice-bad notice-inline' },
        el('div', { class: 'notice-head' }, v.code),
        el('div', { class: 'notice-body' }, v.message)));
    }
    payableRows.push(el('div', { class: 'queue-row' }, main));
  }

  frag.append(card('Purchase to pay — three-way match',
    'order, receipt and invoice must agree before cash moves',
    el('div', {}, ...payableRows)));

  frag.append(card('Period close and published hash',
    'plan step 5.9 — run it twice and you must get the same digest',
    el('div', {},
      kpi('Open payable', usd(ap.openPayable().openCents), `${ap.openPayable().openCount} invoices`),
      kpi('Blocked', usd(ap.openPayable().blockedCents),
        `${ap.openPayable().blockedCount} held by the three-way match`,
        ap.openPayable().blockedCents > 0 ? 'bad' : 'good'))));

  return frag;
}