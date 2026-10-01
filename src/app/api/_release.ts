/**
 * Releases bookings nobody checked in to (RULES.autoReleaseNoShows; guidelines p.6, p.11; docs/spec/02-flows.md F34):
 * before every route that reads or writes the state (`shared`), so whoever looks next, on any server instance, sees
 * the room free. No timer: Vercel's free plan runs scheduled jobs only once a day, and the app asks the server often
 * (the Admin pages every 3 seconds, every page every minute). Each release is audited (actor SYSTEM) and the owner
 * gets an automatic note in the booking's thread.
 */
import { RULES } from '../../domain/rules';
import { getGateway } from '../../gateway';
import { audit } from '../../lib/audit';
import { now } from '../../lib/clock';
import { bookingLabel } from '../../services/adminBookings';
import { adminNote } from '../../services/messages';
import { getStore } from '../../store';

const SYSTEM = { login: 'SYSTEM', name: 'REPH Rooms' };

export async function releaseNoShows(): Promise<void> {
  if (!RULES.autoReleaseNoShows) return;
  const gw = getGateway();
  const released = await gw.releaseNoShows();
  if (released.length === 0) return;
  const rooms = await gw.listRooms();
  const at = now();
  for (const b of released) {
    audit(SYSTEM, 'booking.release', b.ticketNo, bookingLabel(b, rooms));
    adminNote(getStore(), b, SYSTEM, `Released: nobody checked in within ${RULES.checkInGraceMinutes} minutes of the start, so the room is free for others. Book again if you still need it.`, at);
  }
}
