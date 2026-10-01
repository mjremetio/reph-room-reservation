/** POST /api/oauth/register – dynamic client registration for MCP clients (RFC 7591; src/mcp/oauth.ts). */
import { clientAddress, OPEN_CORS, preflight, rateLimited } from '../../_http';
import { registerClient } from '../../../../mcp/oauth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(clientAddress(request), 'oauth');
  if (limited) return limited;
  const text = await request.text();
  let body: unknown = null;
  try {
    body = text.length <= 10_000 ? JSON.parse(text) : null;
  } catch {
    // answered below as invalid metadata
  }
  const { status, json } = registerClient(body);
  return Response.json(json, { status, headers: { ...OPEN_CORS, 'Cache-Control': 'no-store' } });
}

export const OPTIONS = preflight;
