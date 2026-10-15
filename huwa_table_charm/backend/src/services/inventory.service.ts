import { v4 as uuid } from 'uuid';
import db from '../config/database';
import { notFound, badRequest } from '../middleware/errors';

export interface StockRow {
  id: string;
  variant_id: string;
  on_hand: number;
  reserved: number;
  sellable: number;
  reorder_point: number;
  backorder_allowed: boolean;
  updated_at: string;
}

/**
 * Get the current stock record for a variant.
 */
export async function getStockForVariant(variantId: string): Promise<StockRow | null> {
  const row = await db('inventory_stock').where({ variant_id: variantId }).first();
  return row ? (row as StockRow) : null;
}

/**
 * Restock a variant (admin forecast / receiving) and recompute sellable.
 */
export async function restock(variantId: string, quantity: number, note?: string): Promise<StockRow> {
  if (quantity <= 0) throw badRequest('Quantity must be positive');
  const row = await getStockForVariant(variantId);
  if (!row) throw notFound('No stock record for variant');

  await db('inventory_stock')
    .where({ variant_id: variantId })
    .update({
      on_hand: row.on_hand + quantity,
      sellable: row.sellable + quantity,
      updated_at: new Date().toISOString(),
    });
  await db('stock_movements').insert({
    id: uuid(),
    variant_id: variantId,
    type: 'restock',
    change: quantity,
    note: note ?? 'Admin restock',
  });
  return (await getStockForVariant(variantId)) as StockRow;
}

/**
 * Set the reorder point (low-stock threshold) for a variant.
 */
export async function setReorderPoint(variantId: string, reorderPoint: number): Promise<StockRow> {
  if (reorderPoint < 0) throw badRequest('Reorder point cannot be negative');
  const row = await getStockForVariant(variantId);
  if (!row) throw notFound('No stock record for variant');
  await db('inventory_stock').where({ variant_id: variantId }).update({ reorder_point: reorderPoint });
  return (await getStockForVariant(variantId)) as StockRow;
}

/**
 * List variants at or below their reorder point (low-stock alerts).
 */
export async function lowStockAlerts(): Promise<Array<{ variantId: string; sku: string; onHand: number; reorderPoint: number }>> {
  const rows = await db('inventory_stock').whereNotNull('reorder_point').select('*');
  const alerts = [];
  for (const row of rows as StockRow[]) {
    if (row.sellable <= row.reorder_point) {
      const variant = await db('variants').where({ id: row.variant_id }).first() as any;
      alerts.push({
        variantId: row.variant_id,
        sku: variant?.sku ?? row.variant_id,
        onHand: row.sellable,
        reorderPoint: row.reorder_point,
      });
    }
  }
  return alerts;
}

/**
 * List production jobs for make-to-order fulfilment.
 */
export async function listProductionJobs(status?: string) {
  const q = db('production_jobs').modify((query) => {
    if (status) query.where({ status });
  });
  return q.orderBy('created_at', 'desc');
}

/**
 * Start a queued production job (moves queued → in_production).
 */
export async function startProductionJob(jobId: string) {
  const job = await db('production_jobs').where({ id: jobId }).first();
  if (!job) throw notFound('Production job not found');
  await db('production_jobs')
    .where({ id: jobId })
    .update({ status: 'in_production', started_at: new Date().toISOString() });
  return db('production_jobs').where({ id: jobId }).first();
}

// Admin adjustment with audit trail
export async function adjustStock(variantId: string, change: number, note: string): Promise<StockRow> {
  const row = await getStockForVariant(variantId);
  if (!row) throw notFound('No stock record for variant');
  const newOnHand = row.on_hand + change;
  if (newOnHand < 0) throw badRequest('Stock cannot go negative');
  await db('inventory_stock').where({ variant_id: variantId }).update({
    on_hand: newOnHand,
    sellable: row.sellable + change,
    updated_at: new Date().toISOString(),
  });
  await db('stock_movements').insert({
    id: uuid(),
    variant_id: variantId,
    type: 'audit_adjustment',
    change,
    note,
  });
  return (await getStockForVariant(variantId)) as StockRow;
}
