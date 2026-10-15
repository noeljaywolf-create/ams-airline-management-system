import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../config/database';
import config from '../config';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { conflict, unauthorized, badRequest } from '../middleware/errors';
import type { RegisterInput, LoginInput, AuthUserDto, AuthTokens } from '@huwa/shared';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  roles: string;
}

const toAuthUser = (row: UserRow): AuthUserDto => ({
  id: row.id,
  email: row.email,
  name: row.name,
  roles: row.roles.split(',') as AuthUserDto['roles'],
});

export async function register(input: RegisterInput): Promise<{ user: AuthUserDto; tokens: AuthTokens }> {
  const existing = await db('users').where({ email: input.email.toLowerCase() }).first();
  if (existing) throw conflict('Email already registered');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const id = uuid();
  await db('users').insert({
    id,
    email: input.email.toLowerCase(),
    password_hash: passwordHash,
    name: input.name,
    roles: 'customer',
  });

  const row = await db('users').where({ id }).first() as UserRow;
  const user = toAuthUser(row);
  const tokens = issueTokens(user);
  return { user, tokens };
}

export async function login(input: LoginInput): Promise<{ user: AuthUserDto; tokens: AuthTokens }> {
  const row = await db('users').where({ email: input.email.toLowerCase() }).first() as UserRow | undefined;
  if (!row) throw unauthorized('Invalid email or password');

  const ok = await bcrypt.compare(input.password, row.password_hash);
  if (!ok) throw unauthorized('Invalid email or password');

  const user = toAuthUser(row);
  const tokens = issueTokens(user);
  return { user, tokens };
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  // verify signature + that the token still exists and is unexpired
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }

  const stored = await db('refresh_tokens')
    .where({ token: refreshToken })
    .andWhere('expires_at', '>', new Date())
    .first();
  if (!stored) throw unauthorized('Refresh token has been revoked or expired');

  const user = await db('users').where({ id: payload.sub }).first();
  if (!user) throw unauthorized('User no longer exists');

  return issueTokens(toAuthUser(user as UserRow));
}

function issueTokens(user: AuthUserDto): AuthTokens {
  const accessToken = signAccessToken({ id: user.id, email: user.email, roles: user.roles });
  const tokens = { accessToken, refreshToken: signRefreshToken(user.id) };

  // persist refresh token for revocability
  const expiresMs = expiresInMs(config.jwt.refreshExpiresIn);
  void db('refresh_tokens')
    .insert({
      id: uuid(),
      user_id: user.id,
      token: tokens.refreshToken,
      expires_at: new Date(Date.now() + expiresMs),
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Failed to persist refresh token', e);
    });

  return tokens;
}

/** Convert a jsonwebtoken duration string (e.g. "7d", "2h", "30m") to milliseconds. */
function expiresInMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // safe default: 7 days
  const n = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const factors: Record<'s' | 'm' | 'h' | 'd', number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * factors[unit];
}

export async function logout(refreshToken: string): Promise<void> {
  if (!refreshToken) throw badRequest('refreshToken required');
  await db('refresh_tokens').where({ token: refreshToken }).del();
}
