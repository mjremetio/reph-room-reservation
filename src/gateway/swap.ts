import type { Booking, Person } from '../domain/types';
import type { NewBooking, ReservationGateway } from './ReservationGateway';

/**
 * A swap the owner agreed to: move their booking to `ownerNewRoomId`, then book the freed room for the requester.
 * If the second step fails, the owner's booking is moved back so nobody is left without a room.
 * If the real tool supports doing both in one transaction, use that instead.
 */
export async function swapBookings(
  gw: ReservationGateway,
  ownerTicketNo: string,
  ownerNewRoomId: string,
  requesterBooking: NewBooking,
  actingFor: Person,
): Promise<{ owner: Booking; requester: Booking }> {
  const before = await gw.getBooking(ownerTicketNo);
  if (!before) throw new Error(`Booking ${ownerTicketNo} not found.`);
  const owner = await gw.moveBooking(ownerTicketNo, ownerNewRoomId, actingFor);
  try {
    const requester = await gw.createBooking(requesterBooking);
    return { owner, requester };
  } catch (err) {
    await gw.moveBooking(ownerTicketNo, before.roomId, actingFor);
    throw err;
  }
}
