import type { NextFunction, Request, Response } from 'express';
import * as payment from '../services/payment.service';

export async function webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const raw = req.body as string | Buffer;
    const result = await payment.handleWebhook(raw, sig);
    res.json({ received: true, status: result });
  } catch (e) {
    next(e);
  }
}
