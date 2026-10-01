'use client';

/**
 * Who has the room (room_schedule, docs/spec/06-ui.md, Components): for each room its bookings in the window with
 * owner, division, time, group size and status (yours with your agenda), and the free times in between, in time
 * order. "Book" on a free time opens the room sheet at that time; "Ask to swap" sends a follow-up. Nothing books here.
 */
import type { ScheduleView } from '../../agent/context';
import { manilaStartOfDay } from '../../domain/time';
import type { PublicBooking } from '../../services/views';
import { useActions } from '../actions';
import { fmtDay, fmtSpan, fmtWhen, shortStatus } from '../format';
import { useDispatch } from '../store';
import { Appear } from './Appear';

type Row = { kind: 'busy'; start: string; booking: PublicBooking } | { kind: 'free'; start: string; end: string };

const HOUR = 3_600_000;

/** "Mon, Sep 28" for a whole day, else the date and times. */
function windowLabel(start: string, end: string): string {
  const s = new Date(start);
  const wholeDay = manilaStartOfDay(s).getTime() === s.getTime() && Date.parse(end) - s.getTime() === 24 * HOUR;
  return wholeDay ? fmtDay(s) : fmtWhen(start, end);
}

function RoomRows({ r }: { r: ScheduleView['rooms'][number] }) {
  const dispatch = useDispatch();
  const { send } = useActions();
  const rows: Row[] = [
    ...r.bookings.map((booking): Row => ({ kind: 'busy', start: booking.start, booking })),
    ...r.free.map((f): Row => ({ kind: 'free', ...f })),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  // A free time opens the room sheet there, one hour long (or the whole gap when shorter).
  const book = (f: { start: string; end: string }) => {
    const end = new Date(Math.min(Date.parse(f.end), Date.parse(f.start) + HOUR)).toISOString();
    dispatch({ type: 'show_room', roomId: r.roomId, floor: r.floor, slot: { start: f.start, end } });
    dispatch({ type: 'sheet', roomId: r.roomId });
  };
  return (
    <section className="schedule-room" aria-label={`${r.name}, ${r.floor}`}>
      <div className="schedule-room__head">
        <h3>
          {r.name}, {r.floor}
        </h3>
        <button className="btn btn--link btn--small" onClick={() => dispatch({ type: 'sheet', roomId: r.roomId })}>
          Open room
        </button>
      </div>
      {rows.length === 0 && <div className="card__meta">No bookings, and no free time left in this window.</div>}
      <ul className="schedule-list">
        {rows.map((row) =>
          row.kind === 'free' ? (
            <li key={`free-${row.start}`} className="schedule-item schedule-item--free">
              <span className="schedule-item__when">{fmtSpan(row.start, row.end)}</span>
              <span className="schedule-item__who">
                <span className="fit-tag fit-tag--green">Free</span>
              </span>
              <button className="btn btn--secondary btn--small" onClick={() => book(row)}>
                Book
              </button>
            </li>
          ) : (
            <li key={row.booking.ticketNo} className={`schedule-item${row.booking.mine ? ' schedule-item--mine' : ''}`}>
              <span className="schedule-item__when">{fmtSpan(row.booking.start, row.booking.end)}</span>
              <span className="schedule-item__who">
                {row.booking.mine ? (
                  <strong>You · {row.booking.agenda}</strong>
                ) : (
                  <>
                    <strong>{row.booking.owner}</strong>
                    {row.booking.division ? ` (${row.booking.division})` : ''}
                  </>
                )}
                <span className="card__meta">
                  {row.booking.participants} {row.booking.participants === 1 ? 'person' : 'people'} · {shortStatus(row.booking.status)}
                </span>
              </span>
              {!row.booking.mine && (
                <button className="btn btn--link btn--small" onClick={() => void send(`Ask ${row.booking.owner} (${row.booking.ticketNo}) if they can swap rooms with me`)}>
                  Ask to swap
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export function ScheduleCard({ schedule }: { schedule: ScheduleView }) {
  const named = schedule.freeRooms.length === 0 && schedule.rooms.length === 1;
  return (
    <Appear>
      <div className="card schedule-card">
        <div className="card__eyebrow">
          {named ? 'Who has it' : 'Booked rooms'} · {windowLabel(schedule.start, schedule.end)}
        </div>
        {schedule.rooms.map((r) => (
          <RoomRows key={r.roomId} r={r} />
        ))}
        {schedule.rooms.length === 0 && <div className="card__meta">Nothing is booked then.</div>}
        {schedule.more > 0 && <div className="more-link">+{schedule.more} more booked rooms on the map</div>}
        {schedule.freeRooms.length > 0 && (
          <div className="card__note">
            Free the whole time: {schedule.freeRooms.map((r) => `${r.name}, ${r.floor}`).join(' · ')}
          </div>
        )}
      </div>
    </Appear>
  );
}
