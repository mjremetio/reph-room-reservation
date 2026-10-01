import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomResultView } from '../../agent/context';
import { ROOMS } from '../../data/rooms';
import { manila } from '../../domain/time';
import type { PublicBooking } from '../../services/views';
import { roomStatuses } from '../roomStates';

const slot = { start: manila(2026, 9, 28, 15), end: manila(2026, 9, 28, 16) };
const booking = (roomId: string, startH: number, endH: number, mine = false): PublicBooking => ({
  ticketNo: `T-${roomId}-${startH}`,
  roomId,
  start: manila(2026, 9, 28, startH).toISOString(),
  end: manila(2026, 9, 28, endH).toISOString(),
  status: 'Approved',
  owner: mine ? 'Remetio, Mark Joseph' : 'Tester, Alpha',
  division: 'Operations',
  participants: 4,
  mine,
});

test('without results: free, taken, partly free, yours, Admin-only and not bookable rooms', () => {
  const busy = new Map([
    ['johannesburg', [booking('johannesburg', 14, 17)]],
    // Intramuros: busy 2:00–3:30, so 3:00–4:00 is only partly free.
    ['intramuros', [{ ...booking('intramuros', 14, 15), end: manila(2026, 9, 28, 15, 30).toISOString() }]],
    // Your own booking shows as yours even in a room nobody can book now (from before the room booking list).
    ['tokyo', [booking('tokyo', 15, 16, true)]],
  ]);
  const s = roomStatuses({ rooms: ROOMS, busy, slot });
  assert.equal(s.get('amsterdam')?.state, 'free');
  assert.equal(s.get('johannesburg')?.state, 'taken');
  assert.equal(s.get('intramuros')?.state, 'partial');
  assert.equal(s.get('tokyo')?.state, 'yours');
  assert.equal(s.get('office-2f-025')?.state, 'unsuitable');
  assert.equal(s.get('london')?.state, 'unsuitable', 'on no list of the room booking list');
});

test('with results: ranked fits, and rooms that cannot host the request are not suitable', () => {
  const results: RoomResultView[] = [
    { roomId: 'amsterdam', name: 'Amsterdam', floor: '2F', availability: 'available', rank: 1, reasons: ['right size'] },
    { roomId: 'centralpark', name: 'Central Park', floor: '2F', availability: 'unavailable', reasons: [] },
  ];
  const s = roomStatuses({ rooms: ROOMS, busy: new Map(), slot, results: { agendaType: 'Meeting', participants: 5, results } });
  assert.equal(s.get('amsterdam')?.state, 'fits');
  assert.equal(s.get('amsterdam')?.rank, 1);
  assert.equal(s.get('centralpark')?.state, 'taken');
  assert.equal(s.get('snowdon')?.state, 'unsuitable', 'training room for a meeting');
  assert.equal(s.get('binondo')?.state, 'unsuitable', 'seats 4, too small for 5');
  assert.equal(s.get('capetown')?.state, 'free', 'suitable and free, just not in the top results');
});

test('a pending proposal shows the room as yours', () => {
  const s = roomStatuses({ rooms: ROOMS, busy: new Map(), slot, pending: new Set(['batanes']) });
  assert.equal(s.get('batanes')?.state, 'yours');
});
