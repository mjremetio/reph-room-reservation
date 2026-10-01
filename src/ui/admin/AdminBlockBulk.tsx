'use client';

/**
 * Block rooms… and Bulk booking… on Admin › Bookings (docs/spec/06-ui.md, S16; flows F35, F36). Admin picks the rooms
 * and the time; Check lists the bookings in the way (nothing changes); the button blocks or books and cancels exactly
 * those, each owner getting a message. A booking made after Check stops it, so Admin checks again and sees it first.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminBlockJson, AdminBulkJson } from '../../agent/context';
import { WEEKDAYS, type Weekday } from '../../domain/recurrence';
import { addMinutes } from '../../domain/time';
import type { AgendaType, Priority, TrainingType } from '../../domain/types';
import { adminApi, useSession, type AdminBooking, type AdminRoomView } from '../api';
import { fmtWhen, STATUS_WORDS } from '../format';
import { Sheet } from '../Sheet';
import { AGENDA_TYPES } from '../TimeFields';
import { fromLocalInput, fromYmd, toLocalInput, useAdminAction, useServerNow, ymd } from './shared';

/** The server's limit for one block or bulk booking (BULK_LIMITS.rooms in src/services/adminBlocks.ts). */
const MAX_ROOMS = 30;
const DAY = 24 * 60;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const nextHalfHour = (d: Date) => new Date(Math.ceil(d.getTime() / 1_800_000) * 1_800_000);
const weekdayOf = (d: Date) => WEEKDAYS[new Date(d.getTime() + 8 * 3_600_000).getUTCDay()] as Weekday;

function useRoomName(rooms: AdminRoomView[]) {
  return (id: string) => {
    const r = rooms.find((x) => x.id === id);
    return r ? `${r.name}, ${r.floor}` : id;
  };
}

/** Every room by floor, a check box each; `why` greys out a room that can't take the booking, saying why. */
function RoomPicker({ rooms, value, onChange, why }: { rooms: AdminRoomView[]; value: string[]; onChange: (ids: string[]) => void; why?: (r: AdminRoomView) => string | null }) {
  const floors = [...new Set(rooms.map((r) => r.floor))].sort();
  const add = (ids: string[]) => onChange([...new Set([...value, ...ids])].slice(0, MAX_ROOMS));
  return (
    <fieldset className="room-picker">
      <legend>
        Rooms <span className="bf-optional">({value.length} picked, up to {MAX_ROOMS})</span>
      </legend>
      {floors.map((floor) => {
        const onFloor = rooms.filter((r) => r.floor === floor).sort((a, b) => a.name.localeCompare(b.name));
        const open = onFloor.filter((r) => !why?.(r));
        const all = open.length > 0 && open.every((r) => value.includes(r.id));
        return (
          <div key={floor} className="room-picker__floor">
            <div className="room-picker__head">
              <strong>{floor}</strong>
              {open.length > 0 && (
                <button type="button" className="btn btn--link btn--small" onClick={() => (all ? onChange(value.filter((id) => !open.some((r) => r.id === id))) : add(open.map((r) => r.id)))}>
                  {all ? 'Clear' : `All on ${floor}`}
                </button>
              )}
            </div>
            {onFloor.map((r) => {
              const reason = why?.(r) ?? null;
              const checked = value.includes(r.id);
              return (
                <label key={r.id} className={`room-picker__room${reason ? ' is-off' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && (!!reason || value.length >= MAX_ROOMS)}
                    onChange={(e) => (e.target.checked ? add([r.id]) : onChange(value.filter((id) => id !== r.id)))}
                  />
                  <span>{r.name}</span>
                  <span className="dt-muted">{reason ?? (r.capacity ? `${r.capacity} seats` : '')}</span>
                </label>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
}

/** The bookings it would cancel, after Check. */
function Affected({ affected, roomName, head }: { affected: AdminBooking[]; roomName: (id: string) => string; head: string }) {
  return (
    <div className={`affected${affected.length ? '' : ' affected--none'}`} role="status">
      <p>
        <strong>{head}</strong>{' '}
        {affected.length ? `${plural(affected.length, 'booking')} in the way will be cancelled; each owner gets a message with the reason.` : 'No bookings in the way.'}
      </p>
      {affected.length > 0 && (
        <ul>
          {affected.map((b) => (
            <li key={b.ticketNo}>
              <span className="dt-mono">{b.ticketNo}</span> · {b.owner}
              {b.division ? ` (${b.division})` : ''} · {roomName(b.roomId)} · {fmtWhen(b.start, b.end)} · {STATUS_WORDS[b.status] ?? b.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Done({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="admin-bulk">
      <div className="banner banner--info" role="status">
        {text}
      </div>
      <div className="btn-row">
        <button className="btn btn--primary btn--small" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Close rooms for a time (maintenance, an event): nobody else can book them then. */
export function BlockRoomsSheet({ rooms, onClose }: { rooms: AdminRoomView[]; onClose: () => void }) {
  const now = useServerNow();
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [wholeDays, setWholeDays] = useState(false);
  const [start, setStart] = useState(() => toLocalInput(nextHalfHour(now())));
  const [end, setEnd] = useState(() => toLocalInput(addMinutes(nextHalfHour(now()), 60)));
  const [fromDay, setFromDay] = useState(() => ymd(now()));
  const [toDay, setToDay] = useState(() => ymd(now()));
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<AdminBooking[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const action = useAdminAction();
  const roomName = useRoomName(rooms);
  // Any change needs a new Check: the list of bookings in the way is for exactly this block.
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setAffected(null);
      action.setError(null);
    };
  const body = (): AdminBlockJson => ({
    roomIds,
    start: wholeDays ? `${fromDay}T00:00:00+08:00` : fromLocalInput(start),
    end: wholeDays ? `${ymd(addMinutes(fromYmd(toDay), DAY))}T00:00:00+08:00` : fromLocalInput(end),
    reason: reason.trim(),
  });
  const when = () => fmtWhen(body().start, body().end);

  const submit = async () => {
    if (!affected) {
      const res = await action.run(() => adminApi.blockPreview(body()));
      if (res) setAffected(res.affected);
      return;
    }
    const res = await action.run(() => adminApi.block(body(), affected.map((b) => b.ticketNo)));
    if (!res) return setAffected(null); // e.g. someone booked in the meantime: Check again shows them
    setDone(`Blocked ${plural(res.blocks.length, 'room')} · ${when()}.${res.cancelled.length ? ` Cancelled ${plural(res.cancelled.length, 'booking')}; each owner got a message.` : ''} Lift a block by opening it in Bookings.`);
  };

  return (
    <Sheet title="Block rooms" subtitle="Nobody else can book them then. People see “Blocked by Admin”." onClose={onClose} wide>
      {done ? (
        <Done text={done} onClose={onClose} />
      ) : (
        <form
          className="admin-bulk"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <RoomPicker rooms={rooms} value={roomIds} onChange={change(setRoomIds)} />
          <div className="form-grid">
            <label className="bf-check">
              <input type="checkbox" checked={wholeDays} onChange={(e) => change(setWholeDays)(e.target.checked)} />
              Whole days
            </label>
            {wholeDays ? (
              <div className="form-row">
                <label>
                  From
                  <input type="date" required value={fromDay} onChange={(e) => e.target.value && change(setFromDay)(e.target.value)} />
                </label>
                <label>
                  To (included)
                  <input type="date" required min={fromDay} value={toDay} onChange={(e) => e.target.value && change(setToDay)(e.target.value)} />
                </label>
              </div>
            ) : (
              <div className="form-row">
                <label>
                  Starts at
                  <input type="datetime-local" step={900} required value={start} onChange={(e) => e.target.value && change(setStart)(e.target.value)} />
                </label>
                <label>
                  Ends at
                  <input type="datetime-local" step={900} required value={end} onChange={(e) => e.target.value && change(setEnd)(e.target.value)} />
                </label>
              </div>
            )}
            <label>
              Reason
              <input required maxLength={200} value={reason} placeholder="e.g. Aircon maintenance" onChange={(e) => change(setReason)(e.target.value)} />
              <span className="bf-help">For Admin, and for the owners of any bookings it cancels.</span>
            </label>
            <p className="card__note">Times are Manila time. A block can last up to 92 days.</p>
          </div>
          {affected && <Affected affected={affected} roomName={roomName} head={`${plural(roomIds.length, 'room')} · ${when()}.`} />}
          {action.error && (
            <div className="banner banner--error" role="alert">
              {action.error}
            </div>
          )}
          <div className="btn-row">
            {affected ? (
              <button className={`btn btn--small ${affected.length ? 'btn--danger' : 'btn--primary'}`} type="submit" disabled={action.working}>
                {action.working ? 'Blocking…' : affected.length ? `Block and cancel ${plural(affected.length, 'booking')}` : `Block ${plural(roomIds.length, 'room')}`}
              </button>
            ) : (
              <button className="btn btn--primary btn--small" type="submit" disabled={action.working || roomIds.length === 0 || !reason.trim()}>
                {action.working ? 'Checking…' : 'Check bookings in the way'}
              </button>
            )}
            <button className="btn btn--secondary btn--small" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

type Repeat = 'none' | 'Daily' | 'Weekly';

/** Book several rooms at once (and each for every date of a repeat), Approved, for Admin or a person they pick. */
export function BulkBookingSheet({ rooms, onClose }: { rooms: AdminRoomView[]; onClose: () => void }) {
  const now = useServerNow();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users });
  const { data: me } = useSession();
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [agendaType, setAgendaType] = useState<AgendaType>('Meeting');
  const [agenda, setAgenda] = useState('');
  const [participants, setParticipants] = useState('4');
  const [start, setStart] = useState(() => toLocalInput(nextHalfHour(now())));
  const [end, setEnd] = useState(() => toLocalInput(addMinutes(nextHalfHour(now()), 60)));
  const [priority, setPriority] = useState<Priority>('Normal');
  const [trainingType, setTrainingType] = useState<TrainingType>('On-Site');
  const [instructions, setInstructions] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [days, setDays] = useState<Weekday[]>([]);
  const [until, setUntil] = useState(() => ymd(addMinutes(now(), 28 * DAY)));
  const [ownerEmail, setOwnerEmail] = useState('');
  const [preview, setPreview] = useState<{ count: number; owner: string; affected: AdminBooking[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const action = useAdminAction();
  const roomName = useRoomName(rooms);
  // Everyone else with an active account (the Admin is "Me").
  const people = (users.data ?? []).filter((u) => !u.disabled && u.login !== me?.login).sort((a, b) => a.name.localeCompare(b.name));
  const size = Math.max(1, Number(participants) || 1);
  // The owner's room booking list: each room only for its Types of agenda, up to its capacity (the server checks too).
  const why = (r: AdminRoomView) =>
    r.agendas.length === 0 ? 'not on the booking list' : !r.agendas.includes(agendaType) ? `not for ${agendaType}` : r.capacity && size > r.capacity ? `seats ${r.capacity}` : null;
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
      action.setError(null);
    };
  const setType = (t: AgendaType) => {
    change(setAgendaType)(t);
    setRoomIds((ids) => ids.filter((id) => rooms.find((r) => r.id === id)?.agendas.includes(t)));
  };
  const lastDay = `${until}T23:59:00+08:00`;
  const body = (): AdminBulkJson => ({
    roomIds,
    agendaType,
    agenda: agenda.trim(),
    start: fromLocalInput(start),
    end: fromLocalInput(end),
    participants: size,
    priority,
    ...(agendaType === 'Training' ? { trainingType } : {}),
    ...(instructions.trim() ? { specialInstructions: instructions.trim() } : {}),
    ...(repeat === 'Daily' ? { recurrence: { freq: 'Daily' as const, every: 1, until: lastDay } } : {}),
    ...(repeat === 'Weekly' ? { recurrence: { freq: 'Weekly' as const, every: 1, days, until: lastDay } } : {}),
    ...(ownerEmail ? { ownerEmail } : {}),
  });

  const submit = async () => {
    if (!preview) {
      const res = await action.run(() => adminApi.bulkPreview(body()));
      if (res) setPreview(res);
      return;
    }
    const res = await action.run(() => adminApi.bulk(body(), preview.affected.map((b) => b.ticketNo)));
    if (!res) return setPreview(null); // e.g. someone booked in the meantime: Check again shows them
    setDone(
      `Booked ${plural(res.created.length, 'booking')} for ${preview.owner}, Approved.${ownerEmail ? ` ${preview.owner} gets a note in Messages.` : ''}${res.cancelled.length ? ` Cancelled ${plural(res.cancelled.length, 'booking')} in the way; each owner got a message.` : ''}`,
    );
  };

  return (
    <Sheet title="Bulk booking" subtitle="Several rooms at once, Approved at once. Each room must take the type and the group." onClose={onClose} wide>
      {done ? (
        <Done text={done} onClose={onClose} />
      ) : (
        <form
          className="admin-bulk"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <RoomPicker rooms={rooms} value={roomIds} onChange={change(setRoomIds)} why={why} />
          <div className="form-grid">
            <label>
              For
              <select value={ownerEmail} onChange={(e) => change(setOwnerEmail)(e.target.value)}>
                <option value="">Me (Admin)</option>
                {people.map((p) => (
                  <option key={p.login} value={p.email}>
                    {p.name}
                    {p.division ? ` · ${p.division}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agenda
              <input required maxLength={200} value={agenda} placeholder="Specific title, e.g. Sales onboarding week" onChange={(e) => change(setAgenda)(e.target.value)} />
            </label>
            <div className="form-row">
              <label>
                Type of agenda
                <select value={agendaType} onChange={(e) => setType(e.target.value as AgendaType)}>
                  {AGENDA_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                People in each room
                <input type="number" required min={1} max={500} value={participants} onChange={(e) => change(setParticipants)(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Starts at
                <input type="datetime-local" step={900} required value={start} onChange={(e) => e.target.value && change(setStart)(e.target.value)} />
              </label>
              <label>
                Ends at
                <input type="datetime-local" step={900} required value={end} onChange={(e) => e.target.value && change(setEnd)(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Repeat
                <select
                  value={repeat}
                  onChange={(e) => {
                    const next = e.target.value as Repeat;
                    change(setRepeat)(next);
                    // Every week starts on the first date's weekday; Admin can add more days.
                    if (next === 'Weekly') setDays([weekdayOf(new Date(fromLocalInput(start)))]);
                  }}
                >
                  <option value="none">No repeat</option>
                  <option value="Daily">Every day</option>
                  <option value="Weekly">Every week on…</option>
                </select>
              </label>
              {repeat !== 'none' && (
                <label>
                  Until (last date)
                  <input type="date" required min={start.slice(0, 10)} value={until} onChange={(e) => e.target.value && change(setUntil)(e.target.value)} />
                </label>
              )}
            </div>
            {repeat === 'Weekly' && (
              <fieldset className="bf-radios bf-days">
                <legend>On</legend>
                {WEEKDAYS.map((w) => (
                  <label key={w} title={w}>
                    <input type="checkbox" aria-label={w} checked={days.includes(w)} onChange={(e) => change(setDays)(e.target.checked ? [...days, w] : days.filter((x) => x !== w))} />
                    {w.slice(0, 3)}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="form-row">
              <label>
                Priority
                <select value={priority} onChange={(e) => change(setPriority)(e.target.value as Priority)}>
                  <option>Normal</option>
                  <option>Urgent</option>
                </select>
              </label>
              {agendaType === 'Training' && (
                <label>
                  Type of training
                  <select value={trainingType} onChange={(e) => change(setTrainingType)(e.target.value as TrainingType)}>
                    <option>On-Site</option>
                    <option>Virtual</option>
                  </select>
                </label>
              )}
            </div>
            <label>
              <span>
                Special instructions <span className="bf-optional">(optional)</span>
              </span>
              <input maxLength={500} value={instructions} onChange={(e) => change(setInstructions)(e.target.value)} />
            </label>
            <p className="card__note">Times are Manila time. Up to 100 bookings at once (rooms × dates).</p>
          </div>
          {preview && <Affected affected={preview.affected} roomName={roomName} head={`${plural(preview.count, 'booking')} for ${preview.owner}.`} />}
          {action.error && (
            <div className="banner banner--error" role="alert">
              {action.error}
            </div>
          )}
          <div className="btn-row">
            {preview ? (
              <button className={`btn btn--small ${preview.affected.length ? 'btn--danger' : 'btn--primary'}`} type="submit" disabled={action.working}>
                {action.working
                  ? 'Booking…'
                  : preview.affected.length
                    ? `Book ${preview.count} and cancel ${plural(preview.affected.length, 'booking')}`
                    : `Book ${plural(preview.count, 'room booking')}`}
              </button>
            ) : (
              <button className="btn btn--primary btn--small" type="submit" disabled={action.working || roomIds.length === 0 || !agenda.trim() || (repeat === 'Weekly' && days.length === 0)}>
                {action.working ? 'Checking…' : 'Check bookings in the way'}
              </button>
            )}
            <button className="btn btn--secondary btn--small" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
