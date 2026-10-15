import type { NextFunction, Request, Response } from 'express';
import * as orderService from '../services/order.service';
import * as paymentService from '../services/payment.service';
import { notFound } from '../middleware/errors';

function resolveUser(req: Request): string | null {
  return req.user?.id ?? null;
}
function resolveAnonymous(req: Request): string {
  return (req.query.anonymousId as string) || (req.headers['x-anonymous-id'] as string) || 'guest';
}

/**
 * POST /api/checkout — create the order from cart and return a Stripe client secret.
 */
export async function checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { shippingAddress } = req.body;
    const isAssisted = Boolean(req.body.isAssisted);
    const paymentMethod = req.body.paymentMethod ?? 'card';
    const result = await orderService.createOrderFromCart(
      resolveUser(req),
      resolveAnonymous(req),
      shippingAddress,
      isAssisted,
      paymentMethod,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/checkout/:orderId/confirm — dev/test confirmation that simulates a
 * successful Stripe charge and finalises the order to PAID.
 */
export async function confirmOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await paymentService.confirmPayment(req.params.orderId);
    const order = await orderService.finalizePaidOrder(req.params.orderId);
    res.json({ success: true, data: order });
  } catch (e) {
    next(e);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    res.json({ success: true, data: order });
  } catch (e) {
    next(e);
  }
}

export async function getOrderByNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) throw notFound('Order not found');
    res.json({ success: true, data: order });
  } catch (e) {
    next(e);
  }
}

export async function getMyOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orders = await orderService.listOrdersByUser(req.user!.id, req.user!.email);
    res.json({ success: true, data: orders });
  } catch (e) {
    next(e);
  }
}

export async function transition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { toState, note } = req.body;
    const order = await orderService.transitionOrder(req.params.orderId, toState, note);
    res.json({ success: true, data: order });
  } catch (e) {
    next(e);
  }
}
