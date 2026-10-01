/**
 * Signed, stateless tokens for the MCP sign-in (OAuth 2.1, docs/spec/05-agent.md, MCP): client ids, authorization
 * codes, access and refresh tokens. Each kind has its own key derived from SESSION_SECRET, so one kind can never pass
 * for another; the payload carries the kind, a random id and the expiry (wall-clock seconds, like the session cookie).
 * Nothing is stored except the one-time ids already used (codes, rotated refresh tokens), in src/lib/kv.ts (Redis when
 * configured, so every server instance sees them) until they expire.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { kv, kvKey } from './kv';
import { sessionSecret } from './session';

export type TokenKind = 'client' | 'code' | 'access' | 'refresh';

type Stamped = { k: TokenKind; jti: string; iat: number; exp?: number };

const keyFor = (kind: TokenKind, secret: string) => createHmac('sha256', secret).update(`reph-oauth:${kind}`).digest();
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A signed token of this kind; null without SESSION_SECRET in production. ttlSeconds null = no expiry (client ids). */
export function signToken(kind: TokenKind, claims: Record<string, unknown>, ttlSeconds: number | null): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const iat = nowSeconds();
  const body: Stamped & Record<string, unknown> = { ...claims, k: kind, jti: randomUUID(), iat, ...(ttlSeconds ? { exp: iat + ttlSeconds } : {}) };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payload}.${createHmac('sha256', keyFor(kind, secret)).update(payload).digest('base64url')}`;
}

/** The claims of a valid, unexpired token of this kind, else null. */
export function readToken<T extends Record<string, unknown>>(kind: TokenKind, token: string | null | undefined): (T & Stamped) | null {
  const secret = sessionSecret();
  const [payload, sig, extra] = token?.split('.') ?? [];
  if (!secret || !payload || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', keyFor(kind, secret)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & Stamped;
    if (claims.k !== kind || typeof claims.jti !== 'string') return null;
    if (claims.exp !== undefined && !(typeof claims.exp === 'number' && claims.exp > nowSeconds())) return null;
    return claims;
  } catch {
    return null;
  }
}

/** True the first time a one-time id is used (until it expires); false for a replay. */
export async function useOnce(jti: string, expSeconds: number): Promise<boolean> {
  return kv().setNew(kvKey('once', jti), '1', Math.max(1, expSeconds - nowSeconds()) * 1000);
}

/** A short, stable fingerprint (e.g. of a client id) to keep tokens small. */
export const fingerprint = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 22);
