'use client';

/**
 * The signed-in person (demo sign-in, docs/spec/06-ui.md, Sign-in). The app shell only renders while someone is
 * signed in, so useMe() always has a person there. They are the Name of Requestor of every booking; there is no
 * name picker. Signing out (or a 401 from any call) drops everything cached for them and shows the sign-in screen.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, useSession, type Person } from './api';

export function useMe(): Person {
  const { data } = useSession();
  if (!data) throw new Error('useMe() is only for the signed-in app.');
  return data;
}

/** Keeps only the session and the shared health check; everything else belonged to the person who left. */
export function forgetUser(client: QueryClient, user: Person | null): void {
  client.setQueryData(['session'], user);
  client.removeQueries({ predicate: (q) => !['session', 'health'].includes(String(q.queryKey[0])) });
}

export function useSignOut(): () => Promise<void> {
  const client = useQueryClient();
  return async () => {
    await api.signOut().catch(() => undefined); // the cookie may already be gone; the screen changes either way
    forgetUser(client, null);
  };
}
