/**
 * Shared by every /api/admin/* route (docs/spec/04-api.md, Admin): same-origin writes, Admin only (checked on every
 * request against the account store), the default rate limit, and clashes explained for Admin.
 */
import { getGateway } from '../../../gateway';
import { ConflictError } from '../../../gateway/ReservationGateway';
import { requireAdmin, type AdminActor } from '../../../lib/requestor';
import { clash } from '../../../services/adminBookings';
import { crossOrigin, gatewayFailure, preparedFailure, rateLimited } from '../_http';

export async function adminGuard(request: Request, write = false, bucket: 'default' | 'live' = 'default'): Promise<AdminActor | Response> {
  if (write) {
    const blocked = crossOrigin(request);
    if (blocked) return blocked;
  }
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  return rateLimited(admin.email, bucket) ?? admin;
}

/** Like gatewayFailure, but a clash names who holds the room, or which other room the owner already has. */
export async function adminFailure(error: unknown, what: string): Promise<Response> {
  if (!(error instanceof ConflictError)) return gatewayFailure(error, what);
  return preparedFailure(clash(error.kind, error.conflicts, await getGateway().listRooms()));
}
