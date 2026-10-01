/**
 * POST /api/oauth/authorize – the consent screen's Allow or Deny (src/app/oauth/authorize/page.tsx). Needs the signed-in
 * person (session cookie, same origin only), checks the request again, and answers with where to send the browser:
 * back to the app with a single-use code, or with error=access_denied.
 */
import { requireRequestor } from '../../../../lib/requestor';
import { checkAuthorize, issueCode, publicOrigin, withParams } from '../../../../mcp/oauth';
import { crossOrigin, fail, parseBody, rateLimited } from '../../_http';
import { ConsentBody } from '../../_schemas';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

export const POST = shared(async function post(request: Request): Promise<Response> {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const user = await requireRequestor(request);
  if (user instanceof Response) return user;
  const limited = rateLimited(user.email, 'oauth');
  if (limited) return limited;
  const body = await parseBody(request, ConsentBody);
  if (!body.ok) return body.response;
  const origin = publicOrigin(request);
  const check = checkAuthorize(body.data.params, origin);
  if (!check.ok) return check.redirect ? Response.json({ ok: true, redirect: check.redirect }) : fail(400, 'INVALID', check.message);
  const { redirectUri, state } = check.value;
  if (!body.data.allow) return Response.json({ ok: true, redirect: withParams(redirectUri, { error: 'access_denied', error_description: 'The person did not allow access.', state, iss: origin }) });
  const code = issueCode(check.value, user.login);
  if (!code) return fail(503, 'UNAVAILABLE', "Sign-in isn't set up on this server yet.");
  console.log(JSON.stringify({ route: 'oauth', user: user.email, client: check.value.client.name, event: 'allowed' }));
  return Response.json({ ok: true, redirect: withParams(redirectUri, { code, state, iss: origin }) }, { headers: { 'Cache-Control': 'no-store' } });
});
