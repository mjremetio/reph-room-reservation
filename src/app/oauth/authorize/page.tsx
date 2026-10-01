/**
 * GET /oauth/authorize – where an MCP client (Claude, ChatGPT, …) sends the person to connect (src/mcp/oauth.ts).
 * The request is checked here first: an unknown app or an unregistered return address is shown as an error and never
 * redirected. Then the person signs in (if needed) and presses Allow or Deny (src/ui/Consent.tsx).
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAuthorize, describeRedirect, originFrom } from '../../../mcp/oauth';
import { Consent } from '../../../ui/Consent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an AI app · REPH Rooms', robots: { index: false, follow: false } };

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = Object.fromEntries(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  const check = checkAuthorize(params, originFrom(await headers()));
  if (!check.ok && check.redirect) redirect(check.redirect);
  if (!check.ok) {
    return (
      <main className="signin">
        <div className="signin__card" role="alert">
          <h1>Can&apos;t connect this app</h1>
          <p className="signin__lede">{check.message}</p>
        </div>
      </main>
    );
  }
  return <Consent clientName={check.value.client.name} returnTo={describeRedirect(check.value.redirectUri)} params={params} />;
}
