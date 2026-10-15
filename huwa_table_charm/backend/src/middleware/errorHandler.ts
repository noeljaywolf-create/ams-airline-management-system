// Central express error handler. Always returns a consistent JSON envelope.
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import config from '../config';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Not found' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    return;
  }

  if (err instanceof SyntaxError) {
    res.status(400).json({ success: false, error: 'Malformed request body' });
    return;
  }

  if (config.env !== 'production') {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}
