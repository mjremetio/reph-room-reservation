/**
 * Shared helpers for API routes: the error format and codes from docs/spec/04-api.md,
 * validation, same-origin POSTs and the Phase 1 in-memory rate limit.
 */
import type { z } from 'zod';
import { ConflictError, NotAllowedError, NotFoundError } from '../../gateway/ReservationGateway';
import { now } from '../../lib/clock';
import type { Prepared } from '../../services/prepareBooking';

type ErrorCode = 'INVALID' | 'UNAUTHORIZED' | 'NOT_ALLOWED' | 'NOT_FOUND' | 'CONFLICT' | 'EXPIRED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INTERNAL';

export function fail(status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, code, message, ...extra }, { status });
}

const PREPARED_STATUS = { INVALID: 400, NOT_ALLOWED: 403, NOT_FOUND: 404, CONFLICT: 409 } as const;

/** A service's refusal (Prepared) as an HTTP error: the first problem as the message, all of them, and the fields to mark. */
export function preparedFailure(p: Extract<Prepared<unknown>, { ok: false }>): Response {
  return fail(PREPARED_STATUS[p.code], p.code, p.problems[0] ?? 'That can not be booked.', { problems: p.problems, ...(p.fields ? { fields: p.fields } : {}) });
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

function invalid(error: z.ZodError): Response {
  const problems = error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  return fail(400, 'INVALID', problems[0] ?? 'The request is not valid.', { problems });
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(400, 'INVALID', 'The request body must be JSON.') };
  }
  const result = schema.safeParse(raw);
  return result.success ? { ok: true, data: result.data } : { ok: false, response: invalid(result.error) };
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): Parsed<z.infer<S>> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  return result.success ? { ok: true, data: result.data } : { ok: false, response: invalid(result.error) };
}

// Fixed one-minute windows per user (or, for sign-in, per client address) and bucket. In memory for Phase 1 (one server instance).
const windows = new Map<string, { count: number; resetAt: number }>();
// `live`: the Admin pages' change check (every 3 s = 20 a minute per open tab).
const RATE_LIMITS = { assistant: 20, default: 120, signin: 10, mcp: 60, oauth: 30, live: 90 } as const;

export function rateLimited(who: string, bucket: keyof typeof RATE_LIMITS): Response | null {
  const t = now().getTime();
  const key = `${bucket}:${who.toLowerCase()}`;
  const w = windows.get(key);
  if (!w || w.resetAt <= t) {
    windows.set(key, { count: 1, resetAt: t + 60_000 });
    return null;
  }
  w.count += 1;
  if (w.count <= RATE_LIMITS[bucket]) return null;
  return fail(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.');
}

/** The client's address (first x-forwarded-for hop): the rate-limit key before anyone is signed in. */
export function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * CORS for the MCP endpoints (docs/spec/09-quality.md, Security): any origin may call them, because they take only a
 * bearer token or public data and never read cookies. The app's own routes stay same-origin (crossOrigin below).
 */
export const OPEN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '600',
};
export const preflight = () => new Response(null, { status: 204, headers: OPEN_CORS });

/** CSRF guard for POSTs: when the browser sends an Origin, it must match the host. */
export function crossOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    // fall through
  }
  return fail(403, 'NOT_ALLOWED', 'Requests must come from this app.');
}

/** Maps gateway errors to the HTTP codes in 04; anything unexpected is logged and returned as 500. */
export function gatewayFailure(error: unknown, what: string): Response {
  if (error instanceof ConflictError) {
    if (error.kind === 'requester') return fail(409, 'CONFLICT', 'You already have another room booked at that time. One room per person at a time.');
    return fail(409, 'CONFLICT', 'Someone booked it a moment ago. Ask the assistant for other options.');
  }
  if (error instanceof NotAllowedError) return fail(403, 'NOT_ALLOWED', error.message);
  if (error instanceof NotFoundError) return fail(404, 'NOT_FOUND', error.message);
  console.error(JSON.stringify({ level: 'error', msg: `${what} failed`, error: error instanceof Error ? error.message : String(error) }));
  return fail(500, 'INTERNAL', 'That did not go through. Please try again.');
}
