/**
 * Map state for every room (docs/spec/06-ui.md, Room states on the map). Pure, so it is unit tested.
 * With search results (from the assistant's room_results event or the map's own search) rooms show
 * fits / partly free / taken; without, they show free / taken for the selected time.
 */
import type { RoomResultView } from '../agent/context';
import { overlaps } from '../domain/availability';
import { bookable, scoreRoom } from '../domain/ranking';
import type { AgendaType, Room } from '../domain/types';
import type { PublicBooking } from '../services/views';

export type RoomState = 'fits' | 'yours' | 'partial' | 'taken' | 'free' | 'unsuitable';

export interface RoomStatus {
  state: RoomState;
  rank?: number;
  result?: RoomResultView;
  /** Bookings that overlap the selected time. */
  busy: PublicBooking[];
}

export interface StatusInput {
  rooms: Room[];
  busy: Map<string, PublicBooking[]>;
  slot: { start: Date; end: Date };
  results?: { agendaType: AgendaType; participants: number; results: RoomResultView[] } | null;
  /** Rooms with a proposal or booking the user just made for this time. */
  pending?: Set<string>;
}

function covers(bookings: PublicBooking[], slot: { start: Date; end: Date }): boolean {
  let cursor = slot.start.getTime();
  for (const b of [...bookings].sort((x, y) => Date.parse(x.start) - Date.parse(y.start))) {
    if (Date.parse(b.start) > cursor) return false;
    cursor = Math.max(cursor, Date.parse(b.end));
  }
  return cursor >= slot.end.getTime();
}

export function roomStatuses({ rooms, busy, slot, results, pending }: StatusInput): Map<string, RoomStatus> {
  const out = new Map<string, RoomStatus>();
  const byRoom = new Map(results?.results.map((r) => [r.roomId, r] as const) ?? []);
  for (const room of rooms) {
    const atSlot = (busy.get(room.id) ?? []).filter((b) => overlaps(slot, { start: new Date(b.start), end: new Date(b.end) }));
    const status = (state: RoomState, extra: Partial<RoomStatus> = {}): RoomStatus => ({ state, busy: atSlot, ...extra });

    if (atSlot.some((b) => b.mine) || pending?.has(room.id)) {
      out.set(room.id, status('yours', { result: byRoom.get(room.id) }));
      continue;
    }
    const result = byRoom.get(room.id);
    if (result) {
      const state = result.availability === 'available' ? 'fits' : result.availability === 'partial' ? 'partial' : 'taken';
      out.set(room.id, status(state, { rank: result.rank, result }));
      continue;
    }
    // Admin-only rooms, and rooms on no list of the owner's room booking list: nobody books them here.
    if (!bookable(room)) {
      out.set(room.id, status('unsuitable'));
      continue;
    }
    if (results) {
      const req = { site: room.site, agendaType: results.agendaType, participants: results.participants, ...slot };
      if (!scoreRoom(room, req)) {
        out.set(room.id, status('unsuitable'));
        continue;
      }
    }
    if (atSlot.length === 0) out.set(room.id, status('free'));
    else out.set(room.id, status(covers(atSlot, slot) ? 'taken' : 'partial'));
  }
  return out;
}

export const STATE_WORDS: Record<RoomState, string> = {
  fits: 'fits',
  yours: 'yours',
  partial: 'partly free',
  taken: 'taken',
  free: 'free',
  unsuitable: 'not suitable',
};

/** "Tester, A." from "Tester, Alpha" (names are "Last, First" like the current tool). */
export function shortName(name: string): string {
  const [last, first] = name.split(',').map((p) => p.trim());
  return first ? `${last}, ${first[0]}.` : name;
}

/**
 * Who holds the room at the selected time: owner name (and division), or "You". Only what the privacy
 * rule allows for other people's bookings (owner, division, time, group size).
 */
export function reservedBy(status: RoomStatus | undefined): { short: string; full: string; count: number } | null {
  if (!status || status.busy.length === 0) return null;
  const sorted = [...status.busy].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const people = [...new Map(sorted.map((b) => [b.mine ? 'You' : b.owner, b] as const)).values()];
  const first = people[0] as PublicBooking;
  const short = (first.mine ? 'You' : shortName(first.owner)) + (people.length > 1 ? ` +${people.length - 1}` : '');
  const full = people.map((b) => (b.mine ? 'You' : `${b.owner}${b.division ? ` (${b.division})` : ''}`)).join('; ');
  return { short, full, count: people.length };
}
