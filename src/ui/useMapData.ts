'use client';

import { useMemo } from 'react';
import { overlaps } from '../domain/availability';
import { useAvailability, useRooms, type PublicBooking, type RoomView } from './api';
import { roomStatuses, type RoomStatus } from './roomStates';
import { useAppState, type State } from './store';
import { officeDay } from './Timeline';

/** Rooms the user has an open proposal for at the selected time: shown as "yours" (06, How UI events drive the screen). */
function pendingRooms(state: State, slot: { start: Date; end: Date }): Set<string> {
  const out = new Set<string>();
  for (const m of state.messages) {
    for (const p of m.parts) {
      if (p.kind !== 'card' || p.card.type !== 'proposal') continue;
      const { status, proposal } = p.card;
      if ((status === 'open' || status === 'confirming' || status === 'booked') && overlaps(slot, { start: new Date(proposal.start), end: new Date(proposal.end) })) {
        out.add(proposal.roomId);
      }
    }
  }
  return out;
}

export interface MapData {
  ready: boolean;
  rooms: RoomView[];
  roomsById: Map<string, RoomView>;
  busy: Map<string, PublicBooking[]>;
  statuses: Map<string, RoomStatus>;
  slot: { start: Date; end: Date };
  error: string | null;
}

export function useMapData(): MapData {
  const state = useAppState();
  const slot = useMemo(
    () => (state.slot ? { start: new Date(state.slot.start), end: new Date(state.slot.end) } : { start: new Date(0), end: new Date(0) }),
    [state.slot],
  );
  const day = useMemo(() => officeDay(slot.start), [slot.start]);
  const rooms = useRooms();
  const availability = useAvailability(day.start, day.end, !!state.slot);

  return useMemo(() => {
    const list = rooms.data ?? [];
    const roomsById = new Map(list.map((r) => [r.id, r] as const));
    const busy = new Map((availability.data?.rooms ?? []).map((r) => [r.roomId, r.busy] as const));
    const statuses = roomStatuses({ rooms: list, busy, slot, results: state.results, pending: pendingRooms(state, slot) });
    const error = rooms.error?.message ?? availability.error?.message ?? null;
    return { ready: !!rooms.data && !!availability.data && !!state.slot, rooms: list, roomsById, busy, statuses, slot, error };
  }, [rooms.data, rooms.error, availability.data, availability.error, slot, state]);
}
