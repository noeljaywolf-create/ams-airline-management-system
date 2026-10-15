import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { unauthorized, forbidden } from './errors';
import type { RequestUser, UserRole } from '@huwa/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export function signAccessToken(user: { id: string; email: string; roles: UserRole[] }): string {
  return jwt.sign({ sub: user.id, email: user.email, roles: user.roles }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { sub: string };
}

/**
 * Require a valid access token. Attaches req.user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Missing access token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as {
      sub: string;
      email: string;
      roles: UserRole[];
    };
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles };
    next();
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

/**
 * Optional auth: sets req.user when a valid token is supplied, otherwise continues.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwt.secret) as {
        sub: string;
        email: string;
        roles: UserRole[];
      };
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles };
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

/**
 * Require at least one of the given roles.
 */
export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized('Authentication required');
    if (!roles.some((r) => req.user!.roles.includes(r))) {
      throw forbidden('Insufficient permissions');
    }
    next();
  };
}
