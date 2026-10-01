/**
 * POST /api/mcp – the MCP server for Claude, ChatGPT and any MCP client (Streamable HTTP, stateless; docs/spec/04-api.md,
 * 05 MCP). Every request needs an OAuth access token for this server (Authorization: Bearer); without one the answer is
 * 401 with WWW-Authenticate pointing at the sign-in metadata. JSON-RPC in, JSON out (no event stream, no sessions).
 */
import { OPEN_CORS, preflight, rateLimited } from '../_http';
import { mcpCaller, publicOrigin, wwwAuthenticate } from '../../../mcp/oauth';
import { handleMessage, PROTOCOL_VERSIONS } from '../../../mcp/server';
import { shared } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 100_000;
const headers = { ...OPEN_CORS, 'Cache-Control': 'no-store' };
const rpcError = (status: number, code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers });

export const POST = shared(async function post(request: Request): Promise<Response> {
  const origin = publicOrigin(request);
  const caller = mcpCaller(request, origin);
  if (!('user' in caller)) {
    return Response.json(
      { error: caller.error?.code ?? 'unauthorized', error_description: caller.error?.description ?? 'Sign in: connect this app to REPH Rooms.' },
      { status: caller.status, headers: { ...headers, 'WWW-Authenticate': wwwAuthenticate(origin, caller.error) } },
    );
  }
  const { user } = caller;
  const limited = rateLimited(user.email, 'mcp');
  if (limited) return limited;
  const version = request.headers.get('mcp-protocol-version');
  if (version && !PROTOCOL_VERSIONS.includes(version)) return rpcError(400, -32600, `Unsupported MCP-Protocol-Version ${version}.`);

  const text = await request.text();
  if (text.length > MAX_BODY) return rpcError(413, -32600, 'The request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcError(400, -32700, 'The body must be JSON-RPC 2.0.');
  }
  const started = Date.now();
  const log = (tool: string, ok: boolean) => console.log(JSON.stringify({ route: 'mcp', user: user.email, tool, ok, ms: Date.now() - started }));
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0 || messages.length > 20) return rpcError(400, -32600, 'Send 1 to 20 messages.');
  const replies = (await Promise.all(messages.map((m) => handleMessage(m, user, origin, log)))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202, headers });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers });
}, { lock: false });

/** No server-initiated stream and no sessions: GET and DELETE are not used. */
const notAllowed = () => new Response(null, { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = preflight;
