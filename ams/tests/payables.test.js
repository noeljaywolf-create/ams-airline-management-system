/**
 * Purchase to pay, and accounts payable.
 *
 * The assertions that matter are the ones an auditor would make:
 *   - can money leave without all three documents agreeing?
 *   - does the payable in the trial balance equal the sum of open invoices?
 *   - is a blocked invoice visible rather than silently dropped?
 *   - is the liability booked when goods ARRIVE, not when the invoice does?
 */

import { describe, expect, it } from 'vitest';
import { createGL } from '../shared/src/ledger.js';
import { createPayables } from '../shared/src/payables.js';

function fixture() {
  const gl = createGL();
  const ap = createPayables({ gl });
  return { gl, ap };
}

const PERIOD = '2026-09';

/** A clean PO, fully received, invoiced at the agreed price. */
function cleanCycle(ap, amountCents = 5_000_00, quantity = 5) {
  const { po } = ap.raisePO({
    vendorId: 'V-FUEL', description: 'Jet fuel uplift', amountCents, quantity, period: PERIOD,
  });
  ap.receiveGoods({ poId: po.id, quantityReceived: quantity, period: PERIOD });
  return { po, invoice: ap.recordInvoice({ poId: po.id, amountCents, period: PERIOD }).invoice };
}

describe('purchase orders', () => {
  it('refuses a fractional-cent amount', () => {
    const { ap } = fixture();
    const r = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 100.5, period: PERIOD });
    expect(r.code).toBe('AMOUNT_NOT_INTEGER_CENTS');
  });

  it('refuses an over-receipt without an approved variation', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 500_00, quantity: 5, period: PERIOD });
    const r = ap.receiveGoods({ poId: po.id, quantityReceived: 6, period: PERIOD });
    expect(r.code).toBe('OVER_RECEIPT');
    expect(ap.receipts.size).toBe(0);
  });

  it('books the full PO value exactly once on a part delivery sequence', () => {
    const { gl, ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 100_00, quantity: 3, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 1, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 1, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 1, period: PERIOD });
    const total = [...ap.receipts.values()].reduce((a, r) => a + r.amountCents, 0);
    expect(total).toBe(po.amountCents);
    expect(gl.trialBalance(PERIOD).balanced).toBe(true);
  });
});

describe('the three-way match', () => {
  it('accepts an invoice that agrees with order and receipt', () => {
    const { ap } = fixture();
    expect(cleanCycle(ap).invoice.status).toBe('OPEN');
  });

  it('BLOCKS an invoice with no goods receipt — the two-way match', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 500_00, period: PERIOD });
    const r = ap.recordInvoice({ poId: po.id, amountCents: 500_00, period: PERIOD });
    expect(r.invoice.status).toBe('BLOCKED');
    expect(r.variances.map((v) => v.code)).toContain('NO_GOODS_RECEIPT');
  });

  it('BLOCKS an invoice when the goods are short', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 500_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 2, period: PERIOD });
    const r = ap.recordInvoice({ poId: po.id, amountCents: 500_00, period: PERIOD });
    expect(r.variances.map((v) => v.code)).toContain('INCOMPLETE_RECEIPT');
  });

  it('BLOCKS an over-billed invoice and states the difference', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 5, period: PERIOD });
    const r = ap.recordInvoice({ poId: po.id, amountCents: 6_500_00, period: PERIOD });
    expect(r.invoice.status).toBe('BLOCKED');
    const v = r.variances.find((x) => x.code === 'PRICE_VARIANCE_OVER');
    expect(v.message).toMatch(/150000 cents/);
  });

  it('flags an under-billed invoice, because a credit note is due', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 5, period: PERIOD });
    const r = ap.recordInvoice({ poId: po.id, amountCents: 4_000_00, period: PERIOD });
    expect(r.variances.map((v) => v.code)).toContain('PRICE_VARIANCE_UNDER');
  });

  it('ignores a difference inside the tolerance', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 5, period: PERIOD });
    const r = ap.recordInvoice({ poId: po.id, amountCents: 5_000_50, period: PERIOD });
    expect(r.invoice.status).toBe('OPEN');
  });

  it('REFUSES to pay a blocked invoice', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 500_00, period: PERIOD });
    const inv = ap.recordInvoice({ poId: po.id, amountCents: 500_00, period: PERIOD }).invoice;
    const run = ap.payRun({ invoiceIds: [inv.id], period: PERIOD, actorId: 'p-cfo' });
    expect(run.paid).toHaveLength(0);
    expect(run.refused.map((r) => r.code)).toEqual(['BLOCKED_BY_MATCH']);
    expect(ap.openPayable().openCents).toBe(500_00);
  });

  it('refuses to pay the same invoice twice', () => {
    const { ap } = fixture();
    const { invoice } = cleanCycle(ap);
    ap.payRun({ invoiceIds: [invoice.id], period: PERIOD, actorId: 'p-cfo' });
    const second = ap.payRun({ invoiceIds: [invoice.id], period: PERIOD, actorId: 'p-cfo' });
    expect(second.refused.map((r) => r.code)).toEqual(['ALREADY_PAID']);
  });
});

describe('accrual accounting', () => {
  it('books the liability when goods ARRIVE, not when the invoice lands', () => {
    const { gl, ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 5, period: PERIOD });

    const accrued = gl.trialBalance(PERIOD).rows.find((r) => r.account === '2200');
    expect(accrued).toBeDefined();
    // A liability is a credit balance, so it presents negative.
    expect(Math.abs(accrued.balanceCents)).toBe(5_000_00);
    expect(gl.incomeStatement(PERIOD).operatingCostCents).toBe(5_000_00);
  });

  it('moves the liability from accruals to trade payables on invoicing', () => {
    const { gl, ap } = fixture();
    cleanCycle(ap);
    const tb = gl.trialBalance(PERIOD);
    expect(Math.abs(tb.rows.find((r) => r.account === '2200').balanceCents)).toBe(0);
    expect(Math.abs(tb.rows.find((r) => r.account === '2100').balanceCents)).toBe(5_000_00);
  });

  it('leaves the accrual standing when the invoice is blocked', () => {
    // The unresolved discrepancy belongs in aged accruals where a reviewer
    // will find it, not nowhere at all.
    const { gl, ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, quantity: 5, period: PERIOD });
    ap.receiveGoods({ poId: po.id, quantityReceived: 5, period: PERIOD });
    ap.recordInvoice({ poId: po.id, amountCents: 9_000_00, period: PERIOD });
    expect(Math.abs(gl.trialBalance(PERIOD).rows.find((r) => r.account === '2200').balanceCents)).toBe(5_000_00);
  });
});

describe('the sub-ledger ties to the general ledger', () => {
  it('open payable equals account 2100', () => {
    const { gl, ap } = fixture();
    cleanCycle(ap, 5_000_00, 5);
    cleanCycle(ap, 1_234_00, 3);
    const ap2100 = gl.trialBalance(PERIOD).rows.find((r) => r.account === '2100');
    expect(Math.abs(ap2100.balanceCents)).toBe(ap.openPayable().openCents);
  });

  it('after payment both are zero', () => {
    const { gl, ap } = fixture();
    const { invoice } = cleanCycle(ap);
    ap.payRun({ invoiceIds: [invoice.id], period: PERIOD, actorId: 'p-cfo' });
    expect(ap.openPayable().openCents).toBe(0);
    const ap2100 = gl.trialBalance(PERIOD).rows.find((r) => r.account === '2100');
    expect(ap2100 === undefined || ap2100.balanceCents === 0).toBe(true);
    expect(gl.trialBalance(PERIOD).balanced).toBe(true);
  });

  it('the trial balance foots through the whole cycle', () => {
    const { gl, ap } = fixture();
    cleanCycle(ap);
    const { invoice } = cleanCycle(ap);
    ap.payRun({ invoiceIds: [invoice.id], period: PERIOD, actorId: 'p-cfo' });
    const tb = gl.trialBalance(PERIOD);
    expect(tb.balanced).toBe(true);
    expect(gl.balanceSheet(PERIOD).balanced).toBe(true);
  });

  it('counts blocked value separately so it can be chased', () => {
    const { ap } = fixture();
    const { po } = ap.raisePO({ vendorId: 'V', description: 'x', amountCents: 5_000_00, period: PERIOD });
    ap.recordInvoice({ poId: po.id, amountCents: 5_000_00, period: PERIOD });
    const open = ap.openPayable();
    expect(open.blockedCount).toBe(1);
    expect(open.blockedCents).toBe(5_000_00);
  });
});