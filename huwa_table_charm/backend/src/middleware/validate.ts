import type { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { validationError } from './errors';

/**
 * Validate a request part (body | query | params) against a Zod schema.
 * Attaches the parsed value to req[part].
 */
export function validate(schema: ZodSchema, part: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const first = result.error.errors[0];
      next(validationError(`${first.path.join('.')}: ${first.message}`));
      return;
    }
    (req as any)[part] = result.data;
    next();
  };
}

/**
 * Wrap async route handlers so thrown errors are forwarded to the error handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
