'use client';

/** 24-hour strip, 6 AM to 6 AM, with the three shifts, the requested slot and the selected room's bookings (06 Timeline). */
import { addMinutes, manilaMinuteOfDay, manilaStartOfDay } from '../domain/time';
import type { PublicBooking } from '../services/views';
import { fmtDay, fmtSpan, fmtTime } from './format';
import { shortName } from './roomStates';

const DAY_MIN = 24 * 60;

/** The 24-hour "office day" (6 AM – 6 AM) that contains d. */
export function officeDay(d: Date): { start: Date; end: Date } {
  let start = addMinutes(manilaStartOfDay(d), 6 * 60);
  if (manilaMinuteOfDay(d) < 6 * 60) start = addMinutes(start, -DAY_MIN);
  return { start, end: addMinutes(start, DAY_MIN) };
}

const LABELS = ['6 AM', '10 AM', '2 PM', '6 PM', '10 PM', '2 AM', '6 AM'];

export function Timeline({
  slot,
  busy,
  roomName,
  now,
  head = true,
}: {
  slot: { start: Date; end: Date };
  busy: PublicBooking[] | null;
  roomName?: string;
  now: Date;
  /** The date (and room) line above the strip; the room sheet hides it (its title already says it). */
  head?: boolean;
}) {
  const day = officeDay(slot.start);
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - day.start.getTime()) / (DAY_MIN * 60_000)) * 100));
  const span = (s: Date, e: Date) => ({ left: `${pct(s)}%`, width: `${Math.max(0.6, pct(e) - pct(s))}%` });
  const showNow = now >= day.start && now < day.end;
  return (
    <div className="timeline">
      {head && (
        <div className="timeline__head">
          <span>
            {roomName && <strong>{roomName} · </strong>}
            {fmtDay(slot.start)}
          </span>
        </div>
      )}
      <div className="timeline__shifts" aria-hidden>
        <span title="Morning shift, 6 AM–2 PM">Morning</span>
        <span title="Afternoon shift, 2–10 PM">Afternoon</span>
        <span title="Night shift, 10 PM–6 AM">Night</span>
      </div>
      <div className="timeline__track" role="img" aria-label={`Timeline for ${fmtDay(slot.start)}${roomName ? `, ${roomName}` : ''}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="timeline__shift" style={{ left: `${(i * 100) / 3}%`, width: `${100 / 3}%` }} />
        ))}
        {busy?.map((b) => (
          <div
            key={b.ticketNo}
            className={`timeline__busy${b.mine ? ' timeline__busy--mine' : ''}`}
            style={span(new Date(b.start), new Date(b.end))}
            title={`${fmtSpan(b.start, b.end)} · ${b.mine ? 'You' : `${b.owner}${b.division ? ` (${b.division})` : ''}`} · ${b.participants} people`}
          >
            <span className="timeline__who">{b.mine ? 'You' : shortName(b.owner)}</span>
          </div>
        ))}
        <div className="timeline__slot" style={span(slot.start, slot.end)} />
        {showNow && <div className="timeline__now" style={{ left: `${pct(now)}%` }} title={`Now ${fmtTime(now)}`} />}
      </div>
      <div className="timeline__labels" aria-hidden>
        {LABELS.map((l, i) => (
          <span key={i} style={{ left: `${(i * 100) / 6}%` }}>
            {l}
          </span>
        ))}
      </div>
      {busy && busy.length > 0 && (
        <ul className="sr-only">
          {busy.map((b) => (
            <li key={b.ticketNo}>
              Busy {fmtSpan(b.start, b.end)}, {b.mine ? 'your booking' : `${b.owner}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
