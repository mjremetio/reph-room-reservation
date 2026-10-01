/**
 * The MCP server and its OAuth 2.1 sign-in (docs/spec/05-agent.md, MCP; 09 Security), through the route handlers on
 * the demo week (clock Mon, Sep 28, 9:00 AM): connect like Claude or ChatGPT would, use the tools, and the attacks
 * that must fail.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { before, test } from 'node:test';
import { createSession, SESSION_COOKIE } from '../../lib/session';

process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
process.env.RESERVATION_GATEWAY = 'mock';
process.env.MOCK_SCENARIO = 'demo';

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
let r: Record<'register' | 'token' | 'authorize' | 'mcp' | 'mcpGet' | 'resource' | 'server' | 'proposal' | 'confirm', Handler>;

before(async () => {
  r = {
    register: (await import('../../app/api/oauth/register/route')).POST as Handler,
    token: (await import('../../app/api/oauth/token/route')).POST as Handler,
    authorize: (await import('../../app/api/oauth/authorize/route')).POST as Handler,
    mcp: (await import('../../app/api/mcp/route')).POST as Handler,
    mcpGet: (await import('../../app/api/mcp/route')).GET as Handler,
    resource: (await import('../../app/.well-known/oauth-protected-resource/api/mcp/route')).GET as Handler,
    server: (await import('../../app/.well-known/oauth-authorization-server/route')).GET as Handler,
    proposal: (await import('../../app/api/proposals/[id]/route')).GET as Handler,
    confirm: (await import('../../app/api/proposals/[id]/route')).POST as Handler,
  };
});

const BASE = 'http://localhost:3000';
const MCP = `${BASE}/api/mcp`;
const CALLBACK = 'https://client.example/callback';
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const signedIn = (login: string) => ({ cookie: `${SESSION_COOKIE}=${createSession(login)}`, host: 'localhost:3000', origin: BASE });
const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const postForm = (path: string, form: Record<string, string>) =>
  new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const send = (token: string, message: Record<string, unknown>) =>
  r.mcp(postJson('/api/mcp', { jsonrpc: '2.0', ...message }, { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' }));
const rpc = (token: string, method: string, params: unknown = {}) => send(token, { id: 1, method, params });
const call = async (token: string, name: string, args: Record<string, unknown>) => {
  const body = await json(await rpc(token, 'tools/call', { name, arguments: args }));
  return { ...body.result, data: JSON.parse(body.result.content[0].text) };
};

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function register(uris = [CALLBACK]) {
  return json(await r.register(postJson('/api/oauth/register', { client_name: 'Test AI app', redirect_uris: uris, token_endpoint_auth_method: 'none' })));
}

async function authorize(clientId: string, challenge: string, login = 'MARKJOSEPH.REMETIO', extra: Record<string, string> = {}, allow = true) {
  const params = { response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', state: 's-123', resource: MCP, ...extra };
  return r.authorize(postJson('/api/oauth/authorize', { params, allow }, signedIn(login)));
}

/** The whole connect flow: register, Allow, code for tokens. */
async function connect(login = 'MARKJOSEPH.REMETIO') {
  const client = await register();
  const { verifier, challenge } = pkce();
  const consent = await json(await authorize(client.client_id, challenge, login));
  const back = new URL(consent.redirect);
  assert.equal(`${back.origin}${back.pathname}`, CALLBACK);
  assert.equal(back.searchParams.get('state'), 's-123');
  assert.equal(back.searchParams.get('iss'), BASE);
  const code = back.searchParams.get('code') as string;
  const tokens = await json(await r.token(postForm('/api/oauth/token', { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier, resource: MCP })));
  return Object.assign({ clientId: client.client_id as string, code, verifier }, tokens) as { clientId: string; code: string; verifier: string } & Record<string, any>;
}

test('metadata points MCP clients at the sign-in: PKCE S256, public clients, one scope', async () => {
  const resource = await json(await r.resource(new Request(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)));
  assert.equal(resource.resource, MCP);
  assert.deepEqual(resource.authorization_servers, [BASE]);
  const server = await json(await r.server(new Request(`${BASE}/.well-known/oauth-authorization-server`)));
  assert.equal(server.issuer, BASE);
  assert.equal(server.authorization_endpoint, `${BASE}/oauth/authorize`);
  assert.equal(server.registration_endpoint, `${BASE}/api/oauth/register`);
  assert.deepEqual(server.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(server.token_endpoint_auth_methods_supported, ['none']);
});

test('without a token /api/mcp answers 401 with WWW-Authenticate; a signed-in cookie is not enough', async () => {
  const attempts: Record<string, string>[] = [{}, signedIn('MARKJOSEPH.REMETIO'), { authorization: 'Bearer not-a-token' }];
  for (const headers of attempts) {
    const res = await r.mcp(postJson('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers));
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  }
  assert.equal((await r.mcpGet(new Request(MCP))).status, 405);
});

test('connect, list the tools and use them as the signed-in person', async () => {
  const { access_token: token, token_type, expires_in, refresh_token } = await connect();
  assert.equal(token_type, 'Bearer');
  assert.equal(expires_in, 3600);
  assert.ok(refresh_token);

  const init = await json(await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.match(init.result.instructions, /confirm_url/);
  assert.equal((await send(token, { method: 'notifications/initialized' })).status, 202, 'a notification gets no reply');

  const tools = (await json(await rpc(token, 'tools/list'))).result.tools as Array<{ name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }>;
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['check_in', 'find_rooms', 'find_swap_options', 'get_handoff', 'list_rooms', 'my_bookings', 'propose_booking', 'request_cancellation', 'room_schedule']);
  assert.ok(!names.includes('draft_owner_message'), "its link would give the model the owner's e-mail");
  assert.ok(tools.every((t) => t.inputSchema.type === 'object'));
  assert.equal(tools.find((t) => t.name === 'find_rooms')?.annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === 'propose_booking')?.annotations.readOnlyHint, false);

  // Optional (nullable) arguments may be left out.
  const found = await call(token, 'find_rooms', { agenda_type: 'Meeting', start: '2026-09-28T15:00:00+08:00', end: '2026-09-28T16:00:00+08:00', participants: 5 });
  assert.equal(found.isError, false);
  assert.equal(found.data.flow, 'A');
  assert.equal(found.data.fully_free[0].room, 'Amsterdam, 2F');
  // Every answer says what "now" is in Manila, with the year, so the AI app never counts days from its own clock.
  assert.match(found.data.now, /^Monday, September 28, 2026 \(2026-09-28\), 9:\d\d AM PHT \(Asia\/Manila, UTC\+8\)$/);

  const schedule = await call(token, 'room_schedule', { room: 'Central Park', start: '2026-09-28T00:00:00+08:00', end: '2026-09-29T00:00:00+08:00' });
  assert.equal(schedule.data.rooms[0].booked[0].owner, 'Tester, Alpha');
  assert.equal(schedule.data.shown_to_user, undefined);
  assert.ok(!JSON.stringify(schedule.data).includes('@'), 'no e-mail addresses');

  const mine = await call(token, 'my_bookings', {});
  assert.ok(mine.data.some((b: { ticket_no: string }) => b.ticket_no === 'RM-0129902'), 'as the signed-in person');
});

test('propose_booking only prepares: a 15-minute confirm link for that person, and Confirm in the app books', async () => {
  const { access_token: token } = await connect();
  const prepared = await call(token, 'propose_booking', {
    room_id: 'capetown',
    agenda_type: 'Meeting',
    agenda: 'Vendor demo',
    start: '2026-09-28T17:00:00+08:00',
    end: '2026-09-28T18:00:00+08:00',
    participants: 4,
  });
  assert.equal(prepared.isError, false);
  const link = new URL(prepared.data.confirm_url);
  assert.equal(link.origin, BASE);
  const id = link.searchParams.get('confirm') as string;
  assert.equal(Date.parse(prepared.data.expires_at) - Date.parse('2026-09-28T09:00:00+08:00') >= 15 * 60_000 - 5_000, true);
  assert.match(prepared.data.note, /Not done yet/);

  const params = { params: Promise.resolve({ id }) };
  const other = await r.proposal(new Request(`${BASE}/api/proposals/${id}`, { headers: signedIn('LILI.LAGUNOY') }), params);
  assert.equal(other.status, 410, 'someone else never sees it');
  const card = await json(await r.proposal(new Request(`${BASE}/api/proposals/${id}`, { headers: signedIn('MARKJOSEPH.REMETIO') }), params));
  assert.equal(card.kind, 'book');
  assert.equal(card.proposal.roomId, 'capetown');
  const booked = await json(await r.confirm(postJson(`/api/proposals/${id}`, undefined, signedIn('MARKJOSEPH.REMETIO')), params));
  assert.equal(booked.booking.roomId, 'capetown');
  assert.equal(booked.booking.status, 'Approved', "a Meeting needs no approval (the owner's room booking list)");
});

test('codes are single-use and bound to the PKCE verifier, the client and the redirect URI', async () => {
  const { clientId, code, verifier } = await connect();
  const again = await r.token(postForm('/api/oauth/token', { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: CALLBACK, code_verifier: verifier }));
  assert.equal(again.status, 400);
  assert.equal((await json(again)).error, 'invalid_grant');

  const client = await register();
  const { challenge } = pkce();
  const fresh = new URL((await json(await authorize(client.client_id, challenge))).redirect).searchParams.get('code') as string;
  const wrongVerifier = await json(await r.token(postForm('/api/oauth/token', { grant_type: 'authorization_code', code: fresh, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: pkce().verifier })));
  assert.equal(wrongVerifier.error, 'invalid_grant');
  const otherClient = await register();
  const stolen = await json(await r.token(postForm('/api/oauth/token', { grant_type: 'authorization_code', code: fresh, client_id: otherClient.client_id, redirect_uri: CALLBACK, code_verifier: verifier })));
  assert.equal(stolen.error, 'invalid_grant');
});

test('refresh tokens rotate: the new one works, the old one is refused; kinds and audiences never mix', async () => {
  const first = await connect();
  const rotated = await json(await r.token(postForm('/api/oauth/token', { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId })));
  assert.ok(rotated.access_token && rotated.refresh_token);
  assert.equal((await rpc(rotated.access_token, 'ping')).status, 200);
  const reused = await json(await r.token(postForm('/api/oauth/token', { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId })));
  assert.equal(reused.error, 'invalid_grant');

  // An access token is not a refresh token, and a refresh token is not an access token.
  assert.equal((await json(await r.token(postForm('/api/oauth/token', { grant_type: 'refresh_token', refresh_token: rotated.access_token, client_id: first.clientId })))).error, 'invalid_grant');
  assert.equal((await rpc(rotated.refresh_token, 'ping')).status, 401);
  // A token for this server is refused by another host name (audience), and a changed token by everyone.
  const elsewhere = await r.mcp(postJson('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { authorization: `Bearer ${rotated.access_token}`, 'x-forwarded-host': 'rooms.example.com', 'x-forwarded-proto': 'https' }));
  assert.equal(elsewhere.status, 401);
  const tampered = `${rotated.access_token.slice(0, -2)}${rotated.access_token.endsWith('A') ? 'B' : 'A'}A`;
  assert.equal((await rpc(tampered, 'ping')).status, 401);
});

test('registration only takes safe redirect URIs from public clients', async () => {
  for (const bad of [['javascript:alert(1)'], ['http://evil.example/cb'], ['https://client.example/cb#frag'], ['data:text/html,hi'], []]) {
    const res = await r.register(postJson('/api/oauth/register', { redirect_uris: bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const secret = await r.register(postJson('/api/oauth/register', { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_basic' }));
  assert.equal(secret.status, 400);
  for (const ok of [['http://127.0.0.1:33418/callback'], ['http://localhost:6274/oauth/callback'], ['cursor://anysphere.cursor-retrieval/oauth/callback'], ['https://claude.ai/api/mcp/auth_callback']]) {
    assert.equal((await r.register(postJson('/api/oauth/register', { redirect_uris: ok }))).status, 201, ok[0]);
  }
});

test('the consent step: signed in, same origin, registered return address; Deny sends access_denied', async () => {
  const client = await register();
  const { challenge } = pkce();
  const params = { response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256' };
  assert.equal((await r.authorize(postJson('/api/oauth/authorize', { params, allow: true }, { host: 'localhost:3000' }))).status, 401, 'not signed in');
  const csrf = await r.authorize(postJson('/api/oauth/authorize', { params, allow: true }, { ...signedIn('MARKJOSEPH.REMETIO'), origin: 'https://evil.example' }));
  assert.equal(csrf.status, 403, 'another site can’t press Allow');
  const elsewhere = await r.authorize(postJson('/api/oauth/authorize', { params: { ...params, redirect_uri: 'https://evil.example/cb' }, allow: true }, signedIn('MARKJOSEPH.REMETIO')));
  assert.equal(elsewhere.status, 400, 'never redirects to an unregistered address');
  const denied = new URL((await json(await authorize(client.client_id, challenge, 'MARKJOSEPH.REMETIO', {}, false))).redirect);
  assert.equal(denied.searchParams.get('error'), 'access_denied');
  assert.equal(denied.searchParams.get('code'), null);
  const noPkce = new URL((await json(await authorize(client.client_id, challenge, 'MARKJOSEPH.REMETIO', { code_challenge_method: 'plain' }))).redirect);
  assert.equal(noPkce.searchParams.get('error'), 'invalid_request');
  const otherServer = new URL((await json(await authorize(client.client_id, challenge, 'MARKJOSEPH.REMETIO', { resource: 'https://other.example/api/mcp' }))).redirect);
  assert.equal(otherServer.searchParams.get('error'), 'invalid_target');
});

test('JSON-RPC edges: unknown method and tool, bad arguments, batches', async () => {
  const { access_token: token } = await connect();
  assert.equal((await json(await rpc(token, 'resources/list'))).error.code, -32601);
  assert.equal((await json(await rpc(token, 'tools/call', { name: 'draft_owner_message', arguments: {} }))).error.code, -32602);
  const bad = await call(token, 'find_rooms', { agenda_type: 'Party', start: 'soon', end: 'later', participants: 0 });
  assert.equal(bad.isError, true);
  const batch = await r.mcp(
    postJson('/api/mcp', [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'ping' }], { authorization: `Bearer ${token}` }),
  );
  const replies = (await batch.json()) as Array<{ id: number }>;
  assert.deepEqual(replies.map((x) => x.id), [1, 2], 'the notification gets no reply');
});
