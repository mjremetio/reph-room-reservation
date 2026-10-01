/** GET /.well-known/oauth-authorization-server – OAuth metadata for MCP clients (RFC 8414; src/mcp/oauth.ts). */
import { OPEN_CORS, preflight } from '../../api/_http';
import { authorizationServerMetadata, publicOrigin } from '../../../mcp/oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return Response.json(authorizationServerMetadata(publicOrigin(request)), { headers: { ...OPEN_CORS, 'Cache-Control': 'public, max-age=300' } });
}

export const OPTIONS = preflight;
