import type { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../config/database';

/**
 * Record an admin/mutation action into the audit log. Attach after a successful mutation.
 * Call next() afterwards so it is non-blocking.
 */
export async function recordAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.on('finish', async () => {
    // Only log mutating/admin/order actions on success
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (res.statusCode >= 400) return;
    try {
      await db('audit_logs').insert({
        id: uuid(),
        user_id: req.user?.id ?? null,
        action: `${req.method} ${req.baseUrl}${req.path}`,
        resource: req.baseUrl,
        resource_id: (req.params as any).id ?? null,
        detail: req.body ? { keys: Object.keys(req.body) } : null,
      });
    } catch (e) {
      // logging must never break the request flow
      // eslint-disable-next-line no-console
      console.error('Audit log write failed', e);
    }
  });
  next();
}
