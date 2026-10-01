/**
 * OAuth 2.1 for the MCP server (docs/spec/05-agent.md, MCP; 09 Security), so Claude, ChatGPT or any MCP client can act
 * for one signed-in person, and only after that person pressed Allow:
 * - Metadata: protected resource (RFC 9728) and authorization server (RFC 8414), under /.well-known/.
 * - Dynamic client registration (RFC 7591): public clients only; the client id is a signed record of its name and
 *   redirect URIs, so nothing is stored. Redirect URIs: https, http on localhost, or a native app's own scheme.
 * - Authorization code with PKCE (S256 only; 60-second codes, used once) and a consent screen (/oauth/authorize).
 * - Access tokens for 1 hour, bound to this server's /api/mcp (RFC 8707 audience); refresh tokens for 14 days,
 *   rotated on every use (a used one is refused). All signed and stateless (src/lib/tokens.ts).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Requestor } from '../gateway/ReservationGateway';
import { accountByLogin, accountPerson } from '../lib/session';
import { fingerprint, readToken, signToken, useOnce } from '../lib/tokens';

export const SCOPE = 'rooms';
export const ACCESS_SECONDS = 3600;
export const REFRESH_SECONDS = 14 * 24 * 3600;
const CODE_SECONDS = 60;

/**
 * This server's origin as clients see it (Caddy or Vercel in front: X-Forwarded-Proto and -Host). Without a proxy
 * header or request URL: http on this computer, https anywhere else.
 */
export function originFrom(headers: Headers, fallback?: URL): string {
  const first = (name: string) => headers.get(name)?.split(',')[0]?.trim();
  const host = first('x-forwarded-host') || headers.get('host') || fallback?.host || 'localhost';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = first('x-forwarded-proto') || fallback?.protocol.replace(':', '') || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Where Allow sends the person back to, in words: "claude.ai", "an app on this computer", "the cursor app". */
export function describeRedirect(uri: string): string {
  const u = new URL(uri);
  if (u.protocol === 'https:') return u.hostname;
  if (u.protocol === 'http:') return 'an app on this computer';
  return `the ${u.protocol.replace(':', '')} app`;
}
export const publicOrigin = (request: Request) => originFrom(request.headers, new URL(request.url));
export const mcpUrl = (origin: string) => `${origin}/api/mcp`;
const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;
const sameResource = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'REPH Room Assistant',
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  };
}

type OAuthError = { error: string; error_description: string };
export type OAuthResult = { status: number; json: Record<string, unknown> };
const oauthError = (status: number, error: string, description: string): OAuthResult => ({ status, json: { error, error_description: description } satisfies OAuthError });
const NOT_SET_UP = oauthError(503, 'temporarily_unavailable', "Sign-in isn't set up on this server yet (SESSION_SECRET).");

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'ftp:', 'ws:', 'wss:']);

/** https, http on this computer (localhost, 127.0.0.1, [::1]), or a native app's own scheme (RFC 8252); no fragments or credentials. */
export function allowedRedirectUri(uri: string): boolean {
  if (uri.length > 500) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !BLOCKED_SCHEMES.has(u.protocol);
}

export interface Client {
  uris: string[];
  name: string;
}

export const readClient = (clientId: string | null | undefined): Client | null => readToken<{ uris: string[]; name: string }>('client', clientId);

/** POST /api/oauth/register (RFC 7591). */
export function registerClient(body: unknown): OAuthResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every((u) => typeof u === 'string' && allowedRedirectUri(u))) {
    return oauthError(400, 'invalid_redirect_uri', 'Give 1 to 5 redirect URIs: https, http on localhost, or the app’s own scheme.');
  }
  if ((b.token_endpoint_auth_method ?? 'none') !== 'none') {
    return oauthError(400, 'invalid_client_metadata', 'Only public clients are supported: token_endpoint_auth_method "none", with PKCE.');
  }
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token'))) {
    return oauthError(400, 'invalid_client_metadata', 'Supported grant types: authorization_code and refresh_token.');
  }
  const name = typeof b.client_name === 'string' && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : 'An AI app';
  const clientId = signToken('client', { uris, name }, null);
  if (!clientId) return NOT_SET_UP;
  return {
    status: 201,
    json: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
    },
  };
}

export interface AuthorizeRequest {
  clientId: string;
  client: Client;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
}

/** The redirect URI with these query parameters added (also for an app's own scheme). */
export function withParams(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Checks an authorization request. Until the client and its redirect URI are known good, problems are shown on this
 * site and never redirected; after that they go back to the app as an OAuth error (RFC 6749 §4.1.2.1).
 */
export function checkAuthorize(
  params: Record<string, string | undefined>,
  origin: string,
): { ok: true; value: AuthorizeRequest } | { ok: false; message: string; redirect?: string } {
  const clientId = params.client_id ?? '';
  const client = readClient(clientId);
  if (!client) return { ok: false, message: 'This app is not registered here. Remove the connector in the AI app and add it again.' };
  const redirectUri = params.redirect_uri ?? (client.uris.length === 1 ? client.uris[0] : undefined);
  if (!redirectUri || !client.uris.includes(redirectUri)) return { ok: false, message: 'The app asked to return to an address it did not register.' };
  const state = params.state && params.state.length <= 500 ? params.state : undefined;
  const fail = (error: string, description: string) => ({
    ok: false as const,
    message: description,
    redirect: withParams(redirectUri, { error, error_description: description, state, iss: origin }),
  });
  if (params.response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
  if (params.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge ?? '')) {
    return fail('invalid_request', 'PKCE is required: code_challenge with code_challenge_method=S256.');
  }
  const resource = params.resource ?? mcpUrl(origin);
  if (!sameResource(resource, mcpUrl(origin))) return fail('invalid_target', `This server only issues tokens for ${mcpUrl(origin)}.`);
  return { ok: true, value: { clientId, client, redirectUri, state, codeChallenge: params.code_challenge as string, resource: mcpUrl(origin) } };
}

/** After Allow: a 60-second, single-use code bound to the client, redirect URI, PKCE challenge, person and resource. */
export function issueCode(req: AuthorizeRequest, login: string): string | null {
  return signToken('code', { cid: fingerprint(req.clientId), uri: req.redirectUri, cc: req.codeChallenge, sub: login, aud: req.resource, scope: SCOPE }, CODE_SECONDS);
}

type Grant = { cid: string; sub: string; aud: string; scope: string };

function issueTokens(g: Grant): OAuthResult {
  const claims = { cid: g.cid, sub: g.sub, aud: g.aud, scope: g.scope };
  const access = signToken('access', claims, ACCESS_SECONDS);
  const refresh = signToken('refresh', claims, REFRESH_SECONDS);
  if (!access || !refresh) return NOT_SET_UP;
  return { status: 200, json: { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: g.scope } };
}

const invalidGrant = (description: string) => oauthError(400, 'invalid_grant', description);

/** POST /api/oauth/token: authorization_code (with PKCE) or refresh_token (rotated). */
export async function exchangeToken(form: URLSearchParams, origin: string): Promise<OAuthResult> {
  const clientId = form.get('client_id');
  const resource = form.get('resource');
  const grantType = form.get('grant_type');
  if (grantType === 'authorization_code') {
    const code = readToken<Grant & { uri: string; cc: string }>('code', form.get('code'));
    if (!code) return invalidGrant('The code is invalid or has expired.');
    if (!clientId || fingerprint(clientId) !== code.cid) return invalidGrant('The code was issued to another app.');
    const redirectUri = form.get('redirect_uri');
    if (redirectUri !== null && redirectUri !== code.uri) return invalidGrant('redirect_uri does not match the authorization request.');
    const verifier = form.get('code_verifier') ?? '';
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return invalidGrant('code_verifier is missing or malformed.');
    const challenge = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
    const expected = Buffer.from(code.cc);
    if (challenge.length !== expected.length || !timingSafeEqual(challenge, expected)) return invalidGrant('The PKCE check failed.');
    if (resource && !sameResource(resource, code.aud)) return oauthError(400, 'invalid_target', 'resource does not match the authorization request.');
    if (!(await useOnce(code.jti, code.exp as number))) return invalidGrant('The code was already used.');
    if (!accountByLogin(code.sub, code.iat * 1000)) return invalidGrant('The account no longer exists or was signed out.');
    return issueTokens(code);
  }
  if (grantType === 'refresh_token') {
    const refresh = readToken<Grant>('refresh', form.get('refresh_token'));
    if (!refresh) return invalidGrant('The refresh token is invalid or has expired. Connect the app again.');
    if (!clientId || fingerprint(clientId) !== refresh.cid) return invalidGrant('The refresh token was issued to another app.');
    if (resource && !sameResource(resource, refresh.aud)) return oauthError(400, 'invalid_target', 'resource does not match the original grant.');
    if (!(await useOnce(refresh.jti, refresh.exp as number))) return invalidGrant('The refresh token was already used. Connect the app again.');
    if (!accountByLogin(refresh.sub, refresh.iat * 1000)) return invalidGrant('The account no longer exists or was signed out.');
    return issueTokens(refresh);
  }
  return oauthError(400, 'unsupported_grant_type', 'Use grant_type authorization_code or refresh_token.');
}

/** The WWW-Authenticate header that points MCP clients at the sign-in (RFC 9728 §5.1). */
export function wwwAuthenticate(origin: string, error?: { code: string; description: string }): string {
  const bits = [`resource_metadata="${resourceMetadataUrl(origin)}"`, `scope="${SCOPE}"`];
  if (error) bits.push(`error="${error.code}"`, `error_description="${error.description}"`);
  return `Bearer ${bits.join(', ')}`;
}

/**
 * The person an MCP request acts for: a valid access token for this server's /api/mcp in the Authorization header.
 * Cookies are never used here, so a web page can't borrow someone's sign-in.
 */
export function mcpCaller(request: Request, origin: string): { user: Requestor } | { status: 401 | 403; error?: { code: string; description: string } } {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return { status: 401 };
  const token = readToken<Grant>('access', match[1]);
  if (!token || !sameResource(token.aud, mcpUrl(origin))) return { status: 401, error: { code: 'invalid_token', description: 'The access token is invalid, expired or for another server.' } };
  if (!token.scope.split(' ').includes(SCOPE)) return { status: 403, error: { code: 'insufficient_scope', description: `The ${SCOPE} scope is needed.` } };
  const account = accountByLogin(token.sub, token.iat * 1000);
  if (!account) return { status: 401, error: { code: 'invalid_token', description: 'The account no longer exists or was signed out.' } };
  return { user: accountPerson(account) };
}
