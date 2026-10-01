'use client';

/**
 * Table view (docs/spec/06-ui.md, DataTable): rooms and bookings for the selected time as sortable,
 * searchable, filterable tables with row actions and CSV export. Rooms use the same data as the map (rooms,
 * /api/availability, room states), so the views agree; Bookings is the tool's reservation list (/api/bookings).
 * Other people's bookings show only owner, division, time, group size and status (privacy rule 5).
 */
import { useMemo, useState } from 'react';
import { bookable } from '../domain/ranking';
import { describeRecurrence, fromRecurrenceJson } from '../domain/recurrence';
import { checkInWindow } from '../domain/rules';
import { addMinutes } from '../domain/time';
import type { AgendaType } from '../domain/types';
import { useActions, useBookingOps } from './actions';
import { ApiError, useBookingsList, useHealth, type BookingsFilter, type PublicBooking, type RoomView } from './api';
import { BookingDetails } from './BookingDetails';
import { fmtSpan, fmtTime, fmtTool, fmtToolDate, fmtWhen, STATUS_WORDS, toManilaIso } from './format';
import { reservedBy, STATE_WORDS, type RoomState, type RoomStatus } from './roomStates';
import { useAppState, useDispatch, useNow } from './store';
import { cmp, exportCsv, Pager, SortHeader, Toolbar, useDebounced, usePage, type Sort } from './table/kit';
import { AGENDA_TYPES } from './TimeFields';
import { officeDay } from './Timeline';
import { useMapData } from './useMapData';

const STATE_ORDER: Record<RoomState, number> = { fits: 0, yours: 1, partial: 2, free: 3, taken: 4, unsuitable: 5 };
const AV_WORDS: Record<string, string> = { VC: 'Video conf.', BYOD: 'BYOD dock' };

function StateChip({ state, rank }: { state: RoomState; rank?: number }) {
  return (
    <span className={`dt-chip dt-chip--${state}`}>
      {rank ? `#${rank} · ` : ''}
      {STATE_WORDS[state][0]?.toUpperCase() + STATE_WORDS[state].slice(1)}
    </span>
  );
}

/** "Free until 3:00 PM", "Busy until 4:30 PM", "Free all day": what happens next around the selected start. */
function nextChange(busy: PublicBooking[], at: Date, dayEnd: Date): string {
  const sorted = [...busy].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const current = sorted.find((b) => Date.parse(b.start) <= at.getTime() && at.getTime() < Date.parse(b.end));
  if (current) {
    // Back-to-back bookings count as one busy stretch.
    let end = Date.parse(current.end);
    for (const b of sorted) if (Date.parse(b.start) <= end && Date.parse(b.end) > end) end = Date.parse(b.end);
    return `Busy until ${fmtTime(new Date(end))}`;
  }
  const next = sorted.find((b) => Date.parse(b.start) > at.getTime());
  if (!next || Date.parse(next.start) >= dayEnd.getTime()) return 'Free rest of day';
  return `Free until ${fmtTime(next.start)}`;
}

// ---------------------------------------------------------------- Rooms

type RoomKey = 'name' | 'floor' | 'kind' | 'capacity' | 'state' | 'today';
interface RoomRow {
  room: RoomView;
  status: RoomStatus | undefined;
  state: RoomState;
  next: string;
  today: number;
}

function RoomsTable() {
  const state = useAppState();
  const dispatch = useDispatch();
  const map = useMapData();
  const [q, setQ] = useState('');
  const [floor, setFloor] = useState('all');
  const [kind, setKind] = useState('all');
  const [av, setAv] = useState('any');
  const [status, setStatus] = useState('all');
  const [minSeats, setMinSeats] = useState('');
  const [bookableOnly, setBookableOnly] = useState(true);
  const [sort, setSort] = useState<Sort<RoomKey>>({ key: state.results ? 'state' : 'name', dir: 'asc' });

  const day = officeDay(map.slot.start);
  const rows: RoomRow[] = useMemo(
    () =>
      map.rooms.map((room) => {
        const s = map.statuses.get(room.id);
        const busy = map.busy.get(room.id) ?? [];
        return { room, status: s, state: s?.state ?? 'free', next: nextChange(busy, map.slot.start, day.end), today: busy.length };
      }),
    [map.rooms, map.statuses, map.busy, map.slot.start, day.end],
  );

  const kinds = [...new Set(map.rooms.map((r) => r.kind))].sort();
  const filtered = rows
    .filter(({ room, state: st }) => {
      const text = `${room.name} ${room.floor} ${room.kind} ${room.av ?? ''} ${STATE_WORDS[st]} ${reservedBy(map.statuses.get(room.id))?.full ?? ''}`.toLowerCase();
      if (q && !text.includes(q.trim().toLowerCase())) return false;
      if (floor !== 'all' && room.floor !== floor) return false;
      if (kind !== 'all' && room.kind !== kind) return false;
      if (av !== 'any' && room.av !== av) return false;
      if (bookableOnly && !bookable(room)) return false;
      if (minSeats && (room.capacity ?? 0) < Number(minSeats)) return false;
      if (status === 'available' && st !== 'fits' && st !== 'free') return false;
      if (status !== 'all' && status !== 'available' && st !== status) return false;
      return true;
    })
    .sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1;
      const val = (r: RoomRow): string | number | null => {
        switch (sort.key) {
          case 'name':
            return r.room.name;
          case 'floor':
            return r.room.floor;
          case 'kind':
            return r.room.kind;
          case 'capacity':
            return r.room.capacity;
          case 'state':
            return STATE_ORDER[r.state] * 10 + (r.status?.rank ?? 9);
          case 'today':
            return r.today;
        }
      };
      return d * cmp(val(a), val(b)) || a.room.name.localeCompare(b.room.name);
    });

  const clear = () => {
    setQ('');
    setFloor('all');
    setKind('all');
    setAv('any');
    setStatus('all');
    setMinSeats('');
    setBookableOnly(true);
  };
  const showOnMap = (room: RoomView) => dispatch({ type: 'show_room', roomId: room.id, floor: room.floor, map: true });
  const pager = usePage(filtered, JSON.stringify([q, floor, kind, av, status, minSeats, bookableOnly, sort]));
  const exportRooms = () =>
    exportCsv(
      `rooms-${toManilaIso(map.slot.start).slice(0, 16).replace(/[:T]/g, '-')}.csv`,
      ['Room', 'Floor', 'Type', 'Equipment', 'Seats', `Status (${fmtWhen(map.slot.start, map.slot.end)})`, 'Rank', 'Reserved by', 'Next', 'Bookings today', 'Self-service'],
      filtered.map((r) => [
        r.room.name,
        r.room.floor,
        r.room.kind,
        r.room.av ?? '',
        r.room.capacity ?? '',
        STATE_WORDS[r.state],
        r.status?.rank ?? '',
        reservedBy(r.status)?.full ?? '',
        r.next,
        r.today,
        !r.room.selfBookable ? 'Admin only' : bookable(r.room) ? 'yes' : 'no',
      ]),
    );

  return (
    <>
      <Toolbar>
        <label className="dt-search">
          <span className="sr-only">Search rooms</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input type="search" placeholder="Search rooms, people, type, equipment…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option value="all">All floors</option>
          <option value="2F">2F</option>
          <option value="3F">3F</option>
        </select>
        <select aria-label="Room type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select aria-label="Equipment" value={av} onChange={(e) => setAv(e.target.value)}>
          <option value="any">Any equipment</option>
          <option value="VC">Video conferencing</option>
          <option value="BYOD">BYOD dock</option>
        </select>
        <select aria-label="Status at the selected time" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          <option value="available">Available</option>
          {state.results && <option value="fits">Fits the request</option>}
          <option value="partial">Partly free</option>
          <option value="taken">Taken</option>
          <option value="yours">Yours</option>
        </select>
        <label className="dt-number">
          Min seats
          <input type="number" min={1} max={500} value={minSeats} onChange={(e) => setMinSeats(e.target.value)} />
        </label>
        <label className="dt-check">
          <input type="checkbox" checked={bookableOnly} onChange={(e) => setBookableOnly(e.target.checked)} />
          Self-service only
        </label>
        <div className="dt-toolbar__spacer" />
        <button className="btn btn--link btn--small" onClick={clear}>
          Clear filters
        </button>
        <button className="btn btn--secondary btn--small" onClick={exportRooms} disabled={filtered.length === 0}>
          Export CSV
        </button>
      </Toolbar>
      <div className="dt-scroll">
        <table className="dt">
          <caption className="sr-only">Rooms in Bldg. H with their status at the selected time</caption>
          <thead>
            <tr>
              <SortHeader label="Room" k="name" sort={sort} setSort={setSort} className="dt-sticky" />
              <SortHeader label="Floor" k="floor" sort={sort} setSort={setSort} />
              <SortHeader label="Type" k="kind" sort={sort} setSort={setSort} />
              <th scope="col">Equipment</th>
              <SortHeader label="Seats" k="capacity" sort={sort} setSort={setSort} className="dt-num" />
              <SortHeader label="Status" k="state" sort={sort} setSort={setSort} />
              <th scope="col">Reserved by</th>
              <th scope="col">Next</th>
              <SortHeader label="Today" k="today" sort={sort} setSort={setSort} className="dt-num" />
              <th scope="col" className="dt-actions-h">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pager.rows.map(({ room, status: s, state: st, next, today }) => (
              <tr
                key={room.id}
                className={`dt-row${state.selectedRoomId === room.id ? ' is-selected' : ''}`}
                tabIndex={0}
                aria-label={`${room.name}, ${room.floor}: open details`}
                onClick={() => dispatch({ type: 'sheet', roomId: room.id })}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    dispatch({ type: 'sheet', roomId: room.id });
                  }
                }}
              >
                <th scope="row" className="dt-sticky">
                  <span className="dt-room">{room.name}</span>
                </th>
                <td>{room.floor}</td>
                <td>{room.kind}</td>
                <td>{room.av ? AV_WORDS[room.av] : <span className="dt-muted">—</span>}</td>
                <td className="dt-num">{room.capacity ?? <span className="dt-muted">?</span>}</td>
                <td>
                  <StateChip state={st} rank={s?.rank} />
                </td>
                <td>{reservedBy(s)?.full ?? <span className="dt-muted">—</span>}</td>
                <td className="dt-muted">{!room.selfBookable ? 'Booked through Admin' : bookable(room) ? next : 'Not bookable'}</td>
                <td className="dt-num">{today}</td>
                <td className="dt-actions">
                  <button
                    className="btn btn--primary btn--small"
                    disabled={!bookable(room) || st === 'taken'}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'sheet', roomId: room.id });
                    }}
                  >
                    Book
                  </button>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={(e) => {
                      e.stopPropagation();
                      showOnMap(room);
                    }}
                  >
                    Map
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="dt-empty">
            No rooms match. <button className="btn btn--link btn--small" onClick={clear}>Clear filters</button>
          </div>
        )}
      </div>
      <Pager pager={pager} noun="Rooms" />
    </>
  );
}

// ---------------------------------------------------------------- Bookings
type BookingKey = 'ticket' | 'owner' | 'division' | 'room' | 'start' | 'end' | 'created' | 'status' | 'participants';

/** Actions only on bookings that are still ahead or running and not cancelled or completed. */
function BookingActions({ b, room, onDetails }: { b: PublicBooking; room: RoomView | undefined; onDetails: () => void }) {
  const now = useNow();
  const dispatch = useDispatch();
  const { send } = useActions();
  const { data: health } = useHealth();
  const state = useAppState();
  const ops = useBookingOps(b.ticketNo);
  const w = checkInWindow({ start: new Date(b.start) });
  const t = now();
  const active = (b.status === 'Approved' || b.status === 'In Progress') && t < new Date(b.end);
  const canCheckIn = b.mine && active && t >= w.start && t < w.end;
  const error = ops.message?.kind === 'error' && <span className="error-line">{ops.message.text}</span>;

  if (ops.confirmingCancel) {
    return (
      <span className="dt-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn--danger btn--small" disabled={ops.working} onClick={() => void ops.confirmCancel()}>
          {ops.working ? 'Cancelling…' : 'Cancel booking'}
        </button>
        <button className="btn btn--secondary btn--small" onClick={ops.keep}>
          Keep
        </button>
        {error}
      </span>
    );
  }

  return (
    <span className="dt-actions" onClick={(e) => e.stopPropagation()}>
      <button className="btn btn--secondary btn--small" onClick={onDetails}>
        Details
      </button>
      {b.mine && canCheckIn && (
        <button className="btn btn--primary btn--small" disabled={ops.working} onClick={() => void ops.checkIn()}>
          Check in
        </button>
      )}
      {b.mine && active && (
        <button className="btn btn--secondary btn--small" disabled={ops.working} onClick={() => void ops.askCancel()}>
          Cancel…
        </button>
      )}
      {!b.mine && active && (
        <button
          className="btn btn--secondary btn--small"
          disabled={health?.openai !== 'configured' || state.streaming}
          title={health?.openai !== 'configured' ? 'Needs the assistant' : undefined}
          onClick={() => void send(`Ask ${b.owner} (${b.ticketNo}) if they can swap rooms with me`)}
        >
          Ask to swap
        </button>
      )}
      <button
        className="btn btn--link btn--small"
        onClick={() => dispatch({ type: 'show_room', roomId: b.roomId, floor: room?.floor, slot: { start: b.start, end: b.end }, map: true })}
      >
        Map
      </button>
      {error}
    </span>
  );
}

const BOOKING_STATUSES = ['In Progress', 'Approved', 'Checked-In', 'Cancelled', 'Completed'] as const;
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`);
const addDaysYmd = (ymd: string, n: number) => fmtToolDate(addMinutes(dayStart(ymd), n * 24 * 60));

/**
 * The Room Reservation Tool's reservation list (GET /api/bookings): its search panel (reservation date from–to,
 * type of agenda, site, building, room, employee name) plus status, and its columns in its order.
 * Dates follow the map's day until you change them.
 */
function BookingsTable() {
  const map = useMapData();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [agendaType, setAgendaType] = useState<AgendaType | ''>('');
  const [roomId, setRoomId] = useState('');
  const [employee, setEmployee] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [atSlot, setAtSlot] = useState(false);
  const [sort, setSort] = useState<Sort<BookingKey>>({ key: 'start', dir: 'asc' });
  const [details, setDetails] = useState<PublicBooking | null>(null);

  const mapDay = fmtToolDate(map.slot.start);
  const from = range?.from ?? mapDay;
  const to = range?.to ?? mapDay;
  const employeeQ = useDebounced(employee.trim());
  const filter: BookingsFilter = {
    from: dayStart(from),
    to: dayStart(addDaysYmd(to, 1)),
    site: 'Manila',
    building: 'Bldg. H',
    ...(agendaType ? { agendaType } : {}),
    ...(roomId ? { roomId } : {}),
    ...(employeeQ ? { employee: employeeQ } : {}),
    ...(status ? { status } : {}),
  };
  const { data: all = [], isLoading, error } = useBookingsList(filter);
  const room = (id: string) => map.roomsById.get(id);
  const overlapsSlot = (b: PublicBooking) => Date.parse(b.start) < map.slot.end.getTime() && map.slot.start.getTime() < Date.parse(b.end);
  const rooms = [...map.roomsById.values()].sort((a, b) => a.floor.localeCompare(b.floor) || a.name.localeCompare(b.name));

  const filtered = all
    .filter((b) => {
      const r = room(b.roomId);
      const text = `${b.ticketNo} ${b.owner} ${b.division ?? ''} ${r?.name ?? ''} ${r?.floor ?? ''} ${b.mine ? (b.agenda ?? '') : ''}`.toLowerCase();
      if (q && !text.includes(q.trim().toLowerCase())) return false;
      if (mineOnly && !b.mine) return false;
      if (atSlot && !overlapsSlot(b)) return false;
      return true;
    })
    .sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1;
      const val = (x: PublicBooking): string | number | null => {
        switch (sort.key) {
          case 'ticket':
            return x.ticketNo;
          case 'start':
            return Date.parse(x.start);
          case 'end':
            return Date.parse(x.end);
          case 'created':
            return x.createdAt ? Date.parse(x.createdAt) : null;
          case 'room':
            return room(x.roomId)?.name ?? x.roomId;
          case 'owner':
            return x.owner;
          case 'division':
            return x.division;
          case 'participants':
            return x.participants;
          case 'status':
            return x.status;
        }
      };
      return d * cmp(val(a), val(b)) || Date.parse(a.start) - Date.parse(b.start);
    });

  const pager = usePage(filtered, JSON.stringify([from, to, agendaType, roomId, employeeQ, status, q, mineOnly, atSlot, sort]));
  const setFrom = (v: string) => {
    if (!v) return;
    const cap = addDaysYmd(v, 30); // the API allows 31 days
    setRange({ from: v, to: to < v ? v : to > cap ? cap : to });
  };
  const setTo = (v: string) => v && setRange({ from, to: v < from ? from : v });
  const clear = () => {
    setRange(null);
    setAgendaType('');
    setRoomId('');
    setEmployee('');
    setStatus('');
    setQ('');
    setMineOnly(false);
    setAtSlot(false);
  };
  // The tool's list columns in its order, then the rest of the form. Agenda, category, the form fields and
  // created/modified by are filled only for your own bookings (privacy rule 5).
  const exportBookings = () =>
    exportCsv(
      `bookings-${from}${to !== from ? `-to-${to}` : ''}.csv`,
      ['Ticket No', 'Agenda', 'Employee', 'Division', 'Category', 'Building', 'Room', 'Starts At', 'Ends At', 'Created By', 'Created Date', 'Status', 'Participants', 'Priority', 'Type of Training', 'Special Instructions', 'Hardware Requirements', 'Recurrence', 'Admin Comments', 'Modified By'],
      filtered.map((b) => [
        b.ticketNo,
        b.agenda ?? '',
        b.owner,
        b.division ?? '',
        b.agendaType ?? '',
        room(b.roomId)?.building ?? '',
        room(b.roomId)?.toolName ?? room(b.roomId)?.name ?? b.roomId,
        fmtTool(b.start),
        fmtTool(b.end),
        b.createdBy ?? '',
        b.createdAt ? fmtToolDate(b.createdAt) : '',
        b.status,
        b.participants,
        b.priority ?? '',
        b.trainingType ?? '',
        b.specialInstructions ?? '',
        b.hardwareRequirements?.join('; ') ?? '',
        b.recurrence ? describeRecurrence(fromRecurrenceJson(b.recurrence)) : '',
        b.adminComments ?? '',
        b.modifiedBy ?? '',
      ]),
    );

  return (
    <>
      <Toolbar>
        <label className="dt-field">
          <span>Reservation date</span>
          <input type="date" aria-label="Reservation date from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="dt-field">
          <span>to</span>
          <input type="date" aria-label="Reservation date to" value={to} min={from} max={addDaysYmd(from, 30)} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select aria-label="Type of agenda" value={agendaType} onChange={(e) => setAgendaType(e.target.value as AgendaType | '')}>
          <option value="">Any type of agenda</option>
          {AGENDA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Site" value="Manila" onChange={() => {}}>
          <option value="Manila">Manila</option>
          <option value="Iloilo" disabled>
            Iloilo (room list coming)
          </option>
        </select>
        <select aria-label="Building" value="Bldg. H" onChange={() => {}}>
          <option value="Bldg. H">Bldg. H</option>
        </select>
        <select aria-label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.floor})
            </option>
          ))}
        </select>
        <label className="dt-search dt-search--small">
          <span className="sr-only">Employee name</span>
          <input type="search" placeholder="Employee name" value={employee} onChange={(e) => setEmployee(e.target.value)} />
        </label>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_WORDS[s]}
            </option>
          ))}
        </select>
      </Toolbar>
      <Toolbar>
        <label className="dt-search">
          <span className="sr-only">Search bookings</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input type="search" placeholder="Search ticket, division, room…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="dt-check">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Mine only
        </label>
        <label className="dt-check">
          <input type="checkbox" checked={atSlot} onChange={(e) => setAtSlot(e.target.checked)} />
          At {fmtSpan(map.slot.start, map.slot.end)} only
        </label>
        <div className="dt-toolbar__spacer" />
        <button className="btn btn--link btn--small" onClick={clear}>
          Clear filters
        </button>
        <button className="btn btn--secondary btn--small" onClick={exportBookings} disabled={filtered.length === 0}>
          Export CSV
        </button>
      </Toolbar>
      {error && <div className="banner banner--error">{error instanceof ApiError ? error.message : "I can't load the reservation list right now."}</div>}
      <div className="dt-scroll">
        <table className="dt">
          <caption className="sr-only">
            Reservations in the Room Reservation Tool&apos;s columns. Agenda, category and created by/date are shown for your own bookings only.
          </caption>
          <thead>
            <tr>
              <SortHeader label="Ticket No" k="ticket" sort={sort} setSort={setSort} className="dt-sticky" />
              <th scope="col">Agenda</th>
              <SortHeader label="Employee" k="owner" sort={sort} setSort={setSort} />
              <SortHeader label="Division" k="division" sort={sort} setSort={setSort} />
              <th scope="col">Category</th>
              <th scope="col">Building</th>
              <SortHeader label="Room" k="room" sort={sort} setSort={setSort} />
              <SortHeader label="Starts At" k="start" sort={sort} setSort={setSort} />
              <SortHeader label="Ends At" k="end" sort={sort} setSort={setSort} />
              <th scope="col">Created By</th>
              <SortHeader label="Created Date" k="created" sort={sort} setSort={setSort} />
              <SortHeader label="Status" k="status" sort={sort} setSort={setSort} />
              <SortHeader label="People" k="participants" sort={sort} setSort={setSort} className="dt-num" />
              <th scope="col" className="dt-actions-h">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((b) => {
              const r = room(b.roomId);
              const muted = (title?: string) => (
                <span className="dt-muted" title={title}>
                  —
                </span>
              );
              return (
                <tr
                  key={b.ticketNo}
                  className={`dt-row${b.mine ? ' is-mine' : ''}`}
                  tabIndex={0}
                  aria-label={`${b.ticketNo}: open details`}
                  onClick={() => setDetails(b)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setDetails(b);
                    }
                  }}
                >
                  <th scope="row" className="dt-sticky dt-mono">
                    {b.ticketNo}
                    {overlapsSlot(b) && <span className="dt-now">at selected time</span>}
                  </th>
                  <td>{b.agenda ?? muted('Only your own agenda titles are shown')}</td>
                  <td>
                    {b.owner} {b.mine && <span className="dt-you">You</span>}
                  </td>
                  <td>{b.division ?? muted()}</td>
                  <td>{b.agendaType ?? muted()}</td>
                  <td>{r?.building}</td>
                  <td>
                    <span className="dt-room">{r?.toolName ?? r?.name ?? b.roomId}</span> <span className="dt-muted">{r?.floor}</span>
                  </td>
                  <td className="dt-time">{fmtTool(b.start)}</td>
                  <td className="dt-time">{fmtTool(b.end)}</td>
                  <td>{b.createdBy ?? muted()}</td>
                  <td className="dt-time">{b.createdAt ? fmtToolDate(b.createdAt) : muted()}</td>
                  <td>
                    <span className={`dt-status dt-status--${b.status.replace(/\s/g, '-').toLowerCase()}`}>{STATUS_WORDS[b.status] ?? b.status}</span>
                  </td>
                  <td className="dt-num">{b.participants}</td>
                  <td>
                    <BookingActions b={b} room={r} onDetails={() => setDetails(b)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <div className="dt-empty">Loading reservations…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="dt-empty">
            No reservations match. <button className="btn btn--link btn--small" onClick={clear}>Clear filters</button>
          </div>
        )}
      </div>
      <Pager pager={pager} noun="Reservations" />
      {details && <BookingDetails b={details} room={room(details.roomId)} onClose={() => setDetails(null)} />}
    </>
  );
}

export function DataTable() {
  const [tab, setTab] = useState<'rooms' | 'bookings'>('rooms');
  const map = useMapData();
  return (
    <div className="datatable">
      <div className="dt-tabs" role="tablist" aria-label="Table">
        <button role="tab" aria-selected={tab === 'rooms'} className="dt-tab" onClick={() => setTab('rooms')}>
          Rooms <span className="dt-tab__count">{map.rooms.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'bookings'} className="dt-tab" onClick={() => setTab('bookings')}>
          Bookings
        </button>
      </div>
      <div role="tabpanel">{tab === 'rooms' ? <RoomsTable /> : <BookingsTable />}</div>
    </div>
  );
}
