/** POST /api/oauth/token – authorization code (PKCE) and refresh token grants for MCP clients (src/mcp/oauth.ts). */
import { clientAddress, OPEN_CORS, preflight, rateLimited } from '../../_http';
import { exchangeToken, publicOrigin } from '../../../../mcp/oauth';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const limited = rateLimited(clientAddress(request), 'oauth');
  if (limited) return limited;
  const text = await request.text();
  // Form-encoded per RFC 6749; JSON accepted too, since some clients send it.
  let form = new URLSearchParams();
  if (text.length <= 10_000) {
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      try {
        form = new URLSearchParams(Object.entries(JSON.parse(text) as Record<string, unknown>).filter(([, v]) => typeof v === 'string') as [string, string][]);
      } catch {
        // an empty form: answered as an unsupported grant
      }
    } else form = new URLSearchParams(text);
  }
  const { status, json } = await exchangeToken(form, publicOrigin(request));
  return Response.json(json, { status, headers: { ...OPEN_CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}, { lock: false });

export const OPTIONS = preflight;
