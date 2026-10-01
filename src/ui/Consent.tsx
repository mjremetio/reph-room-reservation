'use client';

/**
 * The consent screen for connecting an AI app over MCP (docs/spec/06-ui.md, Connect an AI app): sign in if needed, then
 * Allow or Deny. It names the app (as the app calls itself) and where it returns to, and says what the app may do.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RULES } from '../domain/rules';
import { useSession } from './api';
import { useSignOut } from './session';
import { SignIn } from './SignIn';
import { Brand } from './Brand';

type Props = { clientName: string; returnTo: string; params: Record<string, string> };

function Decide({ clientName, returnTo, params }: Props) {
  const { data: user, isPending } = useSession();
  const signOut = useSignOut();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (isPending) return <div className="app-loading" aria-busy="true" />;
  if (!user) return <SignIn />;

  const decide = async (allow: boolean) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/oauth/authorize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ params, allow }) });
      const body = (await res.json().catch(() => ({}))) as { redirect?: string; message?: string };
      if (body.redirect) return window.location.assign(body.redirect);
      setError(body.message ?? 'That did not work. Start the connection again from the AI app.');
    } catch {
      setError("Can't reach the app server. Check your connection and try again.");
    }
    setWorking(false);
  };

  return (
    <main className="signin">
      <div className="signin__card consent" aria-labelledby="consent-title">
        <Brand />
        <h1 id="consent-title">Connect {clientName}?</h1>
        <p className="signin__lede">
          <strong>{clientName}</strong> wants to use REPH Rooms as <strong>{user.name}</strong>. It will be able to:
        </p>
        <ul className="consent__list">
          <li>find rooms and see who booked them (name, division, time, group size, status)</li>
          <li>list your bookings and check you in</li>
          <li>prepare bookings and cancellations: nothing is booked or cancelled until you press Confirm here, within {RULES.linkProposalHoldMinutes} minutes</li>
        </ul>
        <p className="signin__note">
          You go back to <strong>{returnTo}</strong>. Only allow apps you trust. The connection stays while you use it and ends after 14 days
          without use; remove the connector in the app to end it sooner.
        </p>
        {error && (
          <div className="form-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <div className="btn-row">
          <button className="btn btn--primary" disabled={working} onClick={() => void decide(true)}>
            Allow
          </button>
          <button className="btn btn--secondary" disabled={working} onClick={() => void decide(false)}>
            Deny
          </button>
        </div>
        <p className="signin__note">
          Not {user.name}?{' '}
          <button type="button" className="btn btn--link btn--small" onClick={() => void signOut()}>
            Sign in as someone else
          </button>
        </p>
      </div>
    </main>
  );
}

export function Consent(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <Decide {...props} />
    </QueryClientProvider>
  );
}
