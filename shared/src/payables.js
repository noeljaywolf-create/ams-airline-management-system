/**
 * AMS — Purchase to pay, with accounts payable.
 *
 * THE THREE-WAY MATCH IS THE POINT
 * --------------------------------
 * An airline buys fuel, spares, crew training and ground handling against
 * purchase orders. The classic failure is paying for something that was
 * ordered, received a different quantity of, or invoiced at the wrong price
 * — and discovering it at month end when three departments each maintain
 * their own spreadsheet.
 *
 * SAP's control, and ours, is a three-way match before payment:
 *
 *     ORDER  what we agreed to buy and at what price
 *     RECEIPT what actually arrived, in what quantity
 *     INVOICE what the supplier billed
 *
 * All three must agree before cash leaves. Any variance is held for a human
 * to resolve, with the exact difference stated. Paying on two of three is
 * how an airline ends up paying twice for the same part.
 *
 * Every transition posts a real journal through shared/src/ledger.js, so AP
 * is not a side table: the payable balance in the trial balance is the sum
 * of open invoices, and it foots.
 *
 * @module shared/src/payables
 */

import { LedgerError } from './ledger.js';

/**
 * @typedef {Object} PurchaseOrder
 * @property {string} id
 * @property {string} vendorId
 * @property {string} description
 * @property {number} amountCents
 * @property {'OPEN'|'CLOSED'|'CANCELLED'} status
 * @property {string} period
 * @property {number} quantity
 *
 * @typedef {Object} GoodsReceipt
 * @property {string} id
 * @property {string} poId
 * @property {number} quantityReceived
 * @property {number} quantityOrdered
 * @property {number} amountCents
 * @property {string} period
 *
 * @typedef {Object} Variance
 * @property {string} code
 * @property {string} message
 *
 * @typedef {Object} SupplierInvoice
 * @property {string} id
 * @property {string} vendorId
 * @property {string} poId
 * @property {number} amountCents
 * @property {'OPEN'|'PAID'|'BLOCKED'|'REJECTED'} status
 * @property {string} period
 * @property {string} dueDate
 * @property {Variance[]} variances
 */

/**
 * A matched, unblocked invoice awaiting payment.
 * @typedef {SupplierInvoice & {status: 'OPEN'}} OpenInvoice
 */

const VARIANCE_TOLERANCE_CENTS = 100; // $1.00

/**
   * @param {{gl: ReturnType<import('./ledger.js').createGL>}} deps
   */
export function createPayables({ gl }) {
  /** @type {Map<string, PurchaseOrder>} */
  const pos = new Map();
  /** @type {Map<string, GoodsReceipt>} */
  const receipts = new Map();
  /** @type {Map<string, SupplierInvoice>} */
  const invoices = new Map();

  let poSeq = 0;
  let grSeq = 0;
  let invSeq = 0;

  /**
   * Raise a purchase order. Commitment, not payment: it reserves nothing in
   * AP and posts nothing. Approval happens in the cost-authority queue; this
   * is the document that approval creates.
   *
   * @param {{vendorId: string, description: string, amountCents: number,
   *          quantity?: number, period: string, actorId?: string}} input
   * @returns {{ok: boolean, po?: PurchaseOrder, code?: string, message?: string}}
   */
  function raisePO(input) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return { ok: false, code: 'AMOUNT_NOT_INTEGER_CENTS', message: 'PO amounts must be positive whole cents.' };
    }
    const po = {
      id: `PO-${String(++poSeq).padStart(5, '0')}`,
      vendorId: input.vendorId,
      description: input.description,
      amountCents: input.amountCents,
      status: /** @type {'OPEN'} */ ('OPEN'),
      period: input.period,
      quantity: input.quantity ?? 1,
    };
    pos.set(po.id, po);
    return { ok: true, po };
  }

  /**
   * Receive goods against a PO. This is the operational event — the part
   * arrived — and it is what creates the accrual, because the liability
   * exists from receipt whether or not the invoice has been received.
   *
   * @param {{poId: string, quantityReceived: number, period: string,
   *          expenseAccount?: string}} input
   */
  function receiveGoods(input) {
    const po = pos.get(input.poId);
    if (!po) return { ok: false, code: 'NO_SUCH_PO', message: `Unknown purchase order ${input.poId}.` };
    if (po.status !== 'OPEN') return { ok: false, code: 'PO_NOT_OPEN', message: `${po.id} is ${po.status}.` };

    if (!Number.isInteger(input.quantityReceived) || input.quantityReceived < 0) {
      return { ok: false, code: 'BAD_QUANTITY', message: 'Quantity received must be a non-negative integer.' };
    }

    const ordered = po.quantity ?? 1;
    if (input.quantityReceived > ordered) {
      // Over-receipt is a real control point: receiving more than was
      // ordered usually means an unauthorised price or quantity change that
      // the buyer agreed to verbally.
      return {
        ok: false,
        code: 'OVER_RECEIPT',
        message: `Received ${input.quantityReceived} against ${po.id}, which is ordered for ${ordered}. `
          + 'An over-receipt needs a price variation approved before it is booked.',
      };
    }

    // Book this receipt's value as the DIFFERENCE between the cumulative
    // proportional value to date and the cumulative value before it.
    //
    // The obvious implementation — round(PO value × this receipt ÷ ordered)
    // — loses a cent on every part delivery: three receipts of a 3-part PO
    // worth 10000 cents book 3333 each, totalling 9999. That one-cent gap
    // is exactly the kind of defect this codebase exists to prevent, so the
    // residue is absorbed by whichever receipt completes the order.
    const priorValue = [...receipts.values()]
      .filter((r) => r.poId === po.id)
      .reduce((a, r) => a + r.amountCents, 0);
    const cumulativeQty = [...receipts.values()]
      .filter((r) => r.poId === po.id)
      .reduce((a, r) => a + r.quantityReceived, 0) + input.quantityReceived;

    const receivedValue = cumulativeQty >= ordered
      ? po.amountCents - priorValue
      : Math.round((po.amountCents * cumulativeQty) / ordered) - priorValue;

    const gr = {
      id: `GR-${String(++grSeq).padStart(5, '0')}`,
      poId: po.id,
      quantityReceived: input.quantityReceived,
      quantityOrdered: ordered,
      amountCents: receivedValue,
      period: input.period,
    };
    receipts.set(gr.id, gr);

    // THE ACCRUAL. The liability exists from the moment the goods arrive,
    // whether or not the invoice has been seen. Dr expense / Cr accrued
    // expenses (2200). The invoice then clears 2200 into trade payables
    // (2100). Posting only on invoice is why accrual accounting gets
    // "simplified" away and month-end then has a large true-up nobody
    // can explain.
    if (receivedValue > 0) {
      const post = gl.post({
        period: input.period,
        description: `Accrual on goods receipt ${gr.id} for ${po.id}`,
        source: 'accounts-payable',
        lines: [
          { account: input.expenseAccount ?? '5100', debitCents: receivedValue, creditCents: 0 },
          { account: '2200', debitCents: 0, creditCents: receivedValue },
        ],
      });
      if (!post.ok) throw new LedgerError(post.code ?? 'GL_REJECTED', post.message ?? 'accrual rejected');
    }

    return { ok: true, receipt: gr };
  }

  /**
   * Record a supplier invoice and run the three-way match.
   *
   * @param {{poId: string, amountCents: number, period: string, dueDate?: string}} input
   */
  function recordInvoice(input) {
    const po = pos.get(input.poId);
    if (!po) return { ok: false, code: 'NO_SUCH_PO', message: `Unknown purchase order ${input.poId}.` };
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return { ok: false, code: 'AMOUNT_NOT_INTEGER_CENTS', message: 'Invoice amounts must be positive whole cents.' };
    }

    /** @type {SupplierInvoice} */
    const invoice = {
      id: `INV-${String(++invSeq).padStart(5, '0')}`,
      vendorId: po.vendorId,
      poId: po.id,
      amountCents: input.amountCents,
      status: /** @type {'OPEN'} */ ('OPEN'),
      period: input.period,
      dueDate: input.dueDate ?? `${input.period}-28`,
      variances: [],
    };
    invoices.set(invoice.id, invoice);

    const variances = threeWayMatch(po, receipts, invoice);
    invoice.variances = variances;
    invoice.status = variances.length ? 'BLOCKED' : 'OPEN';

    if (variances.length === 0) {
      // Clear the accrual: Dr accrued expenses (2200) / Cr trade payables
      // (2100). ONLY on a clean three-way match. A blocked invoice leaves
      // its accrual standing in 2200 — visible as an aged item to a
      // reviewer, which is exactly where an unresolved discrepancy should
      // sit. Clearing it anyway would erase the evidence of the problem.
      const clear = receivedValueFor(po, receipts);
      const post = gl.post({
        period: input.period,
        description: `Accrual cleared to trade payable on invoice ${invoice.id}`,
        source: 'accounts-payable',
        lines: [
          { account: '2200', debitCents: clear, creditCents: 0 },
          { account: '2100', debitCents: 0, creditCents: clear },
        ],
      });
      if (!post.ok) throw new LedgerError(post.code ?? 'GL_REJECTED', post.message ?? 'invoice posting rejected');
    }

    if (variances.length) {
      // A blocked invoice is still recorded — it is still a claim against the
      // company — but it must not enter the payment run, and it is flagged
      // rather than silently dropped.
      return { ok: true, invoice, variances };
    }
    return { ok: true, invoice, variances: [] };
  }

  /** Total received value against a PO. */
  function receivedValueFor(po, receipts) {
    return [...receipts.values()].filter((r) => r.poId === po.id).reduce((a, r) => a + r.amountCents, 0);
  }

  /**
   * Run the three-way match. Exported for direct testing: the match is a
   * value, not a side effect, so it can be reasoned about on its own.
   *
   * @param {PurchaseOrder} po
   * @param {Map<string, GoodsReceipt>} receipts
   * @param {SupplierInvoice} invoice
   * @returns {Array<{code: string, message: string}>}
   */
  function threeWayMatch(po, receipts, invoice) {
    /** @type {Array<{code: string, message: string}>} */
    const out = [];

    const relevant = [...receipts.values()].filter((r) => r.poId === po.id);
    if (relevant.length === 0) {
      out.push({
        code: 'NO_GOODS_RECEIPT',
        message: `Invoice ${invoice.id} has no matching goods receipt. Paying on an order and an invoice alone `
          + 'is the two-way match that lets a supplier bill for goods nobody received.',
      });
    }

    const receivedQty = relevant.reduce((a, r) => a + r.quantityReceived, 0);
    const orderedQty = po.quantity ?? 1;
    if (relevant.length > 0 && receivedQty < orderedQty) {
      out.push({
        code: 'INCOMPLETE_RECEIPT',
        message: `Received ${receivedQty} of ${orderedQty} ordered. The invoice covers the full order `
          + 'but the goods are short.',
      });
    }

    const receivedValue = relevant.reduce((a, r) => a + r.amountCents, 0);
    const delta = invoice.amountCents - receivedValue;

    if (delta > VARIANCE_TOLERANCE_CENTS) {
      out.push({
        code: 'PRICE_VARIANCE_OVER',
        message: `Invoice is ${delta} cents above the received value `
          + `(${invoice.amountCents} billed vs ${receivedValue} received).`,
      });
    } else if (delta < -VARIANCE_TOLERANCE_CENTS) {
      out.push({
        code: 'PRICE_VARIANCE_UNDER',
        message: `Invoice is ${-delta} cents below the received value `
          + `(${invoice.amountCents} billed vs ${receivedValue} received). `
          + 'A credit note is usually due rather than a payment.',
      });
    }

    return out;
  }

  /**
   * Pay approved, matched invoices. A blocked invoice can never be paid —
   * that is enforced here rather than left to the UI to remember.
   *
   * @param {{invoiceIds: string[], period: string, actorId: string}} input
   */
  function payRun(input) {
    /** @type {SupplierInvoice[]} */
    const paid = [];
    /** @type {Array<{invoiceId: string, code: string}>} */
    const refused = [];
    let total = 0;

    for (const id of input.invoiceIds) {
      const inv = invoices.get(id);
      if (!inv) { refused.push({ invoiceId: id, code: 'NO_SUCH_INVOICE' }); continue; }
      if (inv.status === 'PAID') { refused.push({ invoiceId: id, code: 'ALREADY_PAID' }); continue; }
      if (inv.status === 'BLOCKED') {
        refused.push({ invoiceId: id, code: 'BLOCKED_BY_MATCH' });
        continue;
      }

      inv.status = 'PAID';
      total += inv.amountCents;
      paid.push(inv);
    }

    if (total > 0) {
      // Dr Accounts payable / Cr Cash.
      const post = gl.post({
        period: input.period,
        description: `Payment run: ${paid.length} supplier invoice(s)`,
        source: 'accounts-payable',
        actorId: input.actorId,
        lines: [
          { account: '2100', debitCents: total, creditCents: 0 },
          { account: '1100', debitCents: 0, creditCents: total },
        ],
      });
      if (!post.ok) throw new LedgerError(post.code ?? 'GL_REJECTED', post.message ?? 'payment run rejected');
    }

    return { paid, refused, totalCents: total };
  }

  /**
   * Open payable: every recorded invoice not yet paid, whether matched or
   * blocked. This is the number that must agree with account 2100 in the
   * trial balance, and a test asserts that it does.
   */
  function openPayable() {
    const open = [...invoices.values()].filter((i) => i.status !== 'PAID');
    const blocked = open.filter((i) => i.status === 'BLOCKED');
    return {
      openCents: open.reduce((a, i) => a + i.amountCents, 0),
      blockedCents: blocked.reduce((a, i) => a + i.amountCents, 0),
      openCount: open.length,
      blockedCount: blocked.length,
    };
  }

  return {
    pos,
    receipts,
    invoices,
    raisePO,
    receiveGoods,
    recordInvoice,
    threeWayMatch,
    payRun,
    openPayable,
  };
}