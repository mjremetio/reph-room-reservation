/**
 * Every API route that reads or writes reservations or the app's store runs on the state all server instances share
 * (src/services/sharedState.ts; docs/spec/09-quality.md, Deployment, Shared state). A write (POST, PATCH, DELETE)
 * holds the lock for the whole route; routes that only read and prepare (the assistants, search, a new proposal, MCP,
 * the token endpoint) pass `{ lock: false }`, and a tool among them that writes (check_in) takes the lock itself.
 * Bookings nobody checked in to are released first (`releaseNoShows`). Redis unreachable, or the lock taken for too
 * long → 503 UNAVAILABLE.
 */
import { SharedStateError, withShared } from '../../services/sharedState';
import { fail } from './_http';
import { releaseNoShows } from './_release';

export function shared<C>(route: (request: Request, context: C) => Promise<Response>, opts: { lock?: boolean } = {}) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      const run = async () => {
        await releaseNoShows();
        return route(request, context);
      };
      return await withShared(run, opts.lock ?? request.method !== 'GET');
    } catch (error) {
      if (error instanceof SharedStateError) return fail(503, 'UNAVAILABLE', error.message);
      throw error;
    }
  };
}
