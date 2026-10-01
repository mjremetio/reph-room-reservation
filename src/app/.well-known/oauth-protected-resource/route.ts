/**
 * GET /.well-known/oauth-protected-resource (and …/api/mcp, the path WWW-Authenticate names) – which server signs
 * MCP clients in (RFC 9728; src/mcp/oauth.ts).
 */
import { OPEN_CORS, preflight } from '../../api/_http';
import { protectedResourceMetadata, publicOrigin } from '../../../mcp/oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return Response.json(protectedResourceMetadata(publicOrigin(request)), { headers: { ...OPEN_CORS, 'Cache-Control': 'public, max-age=300' } });
}

export const OPTIONS = preflight;
