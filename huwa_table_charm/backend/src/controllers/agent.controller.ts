import type { NextFunction, Request, Response } from 'express';
import * as agent from '../services/agent.service';
import { badRequest } from '../middleware/errors';

export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message, sessionKey, anonymousId } = req.body ?? {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw badRequest('A non-empty "message" is required', 'MISSING_MESSAGE');
    }
    const userId = req.user?.id ?? undefined;
    const result = await agent.chat({
      sessionKey,
      message,
      userId,
      anonymousId,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function searchProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await agent.executeTool(
      'product_search',
      {
        query: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        material: req.query.material as string | undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 8,
      },
      req.user?.id ?? null,
      (req.query.anonymousId as string) || 'guest',
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function checkCompatibility(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await agent.executeTool(
      'compatibility_check',
      { variantId: req.params.variantId },
      req.user?.id ?? null,
      (req.headers['x-anonymous-id'] as string) || 'guest',
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function recommendBundles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await agent.executeTool(
      'bundle_recommend',
      req.body,
      req.user?.id ?? null,
      (req.headers['x-anonymous-id'] as string) || 'guest',
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function addToCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { variantId, quantity } = req.body;
    const result = await agent.executeTool(
      'cart_add',
      { variantId, quantity },
      req.user?.id ?? null,
      (req.headers['x-anonymous-id'] as string) || 'guest',
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function trackOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await agent.executeTool(
      'order_track',
      { orderNumber: req.params.orderNumber },
      req.user?.id ?? null,
      (req.headers['x-anonymous-id'] as string) || 'guest',
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}
