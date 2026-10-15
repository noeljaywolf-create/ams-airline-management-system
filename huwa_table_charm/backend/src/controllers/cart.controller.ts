import type { NextFunction, Request, Response } from 'express';
import * as cartService from '../services/cart.service';

function resolveUser(req: Request): string | null {
  return req.user?.id ?? null;
}

function resolveAnonymous(req: Request): string {
  // Prefer the passed cart id as the anonymous key; fall back to a header
  const anon = (req.query.anonymousId as string) || (req.headers['x-anonymous-id'] as string);
  return anon ?? 'guest';
}

export async function getCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await cartService.getCart(resolveUser(req), resolveAnonymous(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { variantId, quantity } = req.body;
    const data = await cartService.addItem(resolveUser(req), resolveAnonymous(req), variantId, quantity);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { quantity } = req.body;
    const data = await cartService.updateItem(
      resolveUser(req),
      resolveAnonymous(req),
      req.params.itemId,
      quantity,
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function clearCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await cartService.clearCart(resolveUser(req), resolveAnonymous(req));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

export async function addBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await cartService.addBatch(resolveUser(req), resolveAnonymous(req), req.body.items);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
}
