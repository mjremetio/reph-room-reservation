/** GET /.well-known/oauth-protected-resource/api/mcp – the same metadata at the path RFC 9728 derives from /api/mcp. */
import { OPEN_CORS, preflight } from '../../../../api/_http';
import { protectedResourceMetadata, publicOrigin } from '../../../../../mcp/oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return Response.json(protectedResourceMetadata(publicOrigin(request)), { headers: { ...OPEN_CORS, 'Cache-Control': 'public, max-age=300' } });
}

export const OPTIONS = preflight;
