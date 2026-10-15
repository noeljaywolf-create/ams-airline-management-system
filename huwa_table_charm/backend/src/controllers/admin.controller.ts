import type { NextFunction, Request, Response } from 'express';
import * as catalog from '../services/catalog.service';
import * as inventory from '../services/inventory.service';
import * as orderService from '../services/order.service';
import db from '../config/database';

// ---- Product management ----

export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await catalog.createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (e) { next(e); }
}

export async function createVariant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const variant = await catalog.createVariant(req.body);
    res.status(201).json({ success: true, data: variant });
  } catch (e) { next(e); }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, material, features, images, tags, published } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (material !== undefined) updates.material = material;
    if (features !== undefined) updates.features = JSON.stringify(features);
    if (images !== undefined) updates.images = JSON.stringify(images);
    if (tags !== undefined) updates.tags = JSON.stringify(tags);
    if (published !== undefined) updates.published = published;
    updates.updated_at = new Date().toISOString();
    await db('products').where({ id: req.params.productId }).update(updates);
    const product = await catalog.getProductByIdOrSlug(req.params.productId);
    res.json({ success: true, data: product });
  } catch (e) { next(e); }
}

export async function listAllProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await catalog.listProducts({
      publishedOnly: false,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
}

// ---- Category management ----

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug, title } = req.body;
    const cat = await catalog.createCategory(slug, title);
    res.status(201).json({ success: true, data: cat });
  } catch (e) { next(e); }
}

// ---- Inventory management ----

export async function getStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stock = await inventory.getStockForVariant(req.params.variantId);
    res.json({ success: true, data: stock });
  } catch (e) { next(e); }
}

export async function restock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { quantity, note } = req.body;
    const stock = await inventory.restock(req.params.variantId, quantity, note);
    res.json({ success: true, data: stock });
  } catch (e) { next(e); }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { change, note } = req.body;
    const stock = await inventory.adjustStock(req.params.variantId, change, note);
    res.json({ success: true, data: stock });
  } catch (e) { next(e); }
}

export async function lowStockAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alerts = await inventory.lowStockAlerts();
    res.json({ success: true, data: alerts });
  } catch (e) { next(e); }
}

export async function listProductionJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jobs = await inventory.listProductionJobs(req.query.status as string | undefined);
    res.json({ success: true, data: jobs });
  } catch (e) { next(e); }
}

// ---- Order management ----

export async function listAllOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    const result = await orderService.listAllOrders(pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: { ...result, page, pageSize } });
  } catch (e) { next(e); }
}

export async function adminTransitionOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { toState, note } = req.body;
    const order = await orderService.transitionOrder(req.params.orderId, toState, note);
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
}

// ---- Dashboard stats ----

export async function dashboardStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [productCount] = await db('products').count('* as c');
    const [orderCount] = await db('orders').count('* as c');
    const [revenue] = await db('orders').where({ state: 'PAID' }).orWhere({ state: 'SHIPPED' }).orWhere({ state: 'DELIVERED' }).sum('total_cents as total');
    const alerts = await inventory.lowStockAlerts();
    res.json({
      success: true,
      data: {
        totalProducts: Number((productCount as any).c ?? 0),
        totalOrders: Number((orderCount as any).c ?? 0),
        totalRevenueCents: Number((revenue as any).total ?? 0),
        lowStockAlerts: alerts.length,
      },
    });
  } catch (e) { next(e); }
}
