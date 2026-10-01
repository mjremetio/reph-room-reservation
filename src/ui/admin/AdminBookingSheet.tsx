'use client';

/**
 * One booking for Admin (docs/spec/06-ui.md, S17 Admin booking): every field of the tool and the owner's e-mail;
 * Approve, Turn down (with a reason), Change, Swap rooms, Cancel and Check in; and the booking's thread with its
 * owner. Every action goes through /api/admin/* (the server checks the rules again) and leaves a note for the owner.
 */
import { useState, type ReactNode } from 'react';
import { describeRecurrence, fromRecurrenceJson } from '../../domain/recurrence';
import { checkInWindow } from '../../domain/rules';
import { adminApi, type AdminBooking, type AdminRoomView } from '../api';
import { fmtTool, fmtToolDate, fmtWhen, STATUS_WORDS } from '../format';
import { Thread } from '../Messages';
import { Sheet } from '../Sheet';
import { AGENDA_TYPES } from '../TimeFields';
import { fromLocalInput, StatusChip, toLocalInput, useAdminAction, useServerNow } from './shared';

type Mode = 'view' | 'reject' | 'cancel' | 'change' | 'swap';
const open = (b: AdminBooking) => b.status !== 'Cancelled' && b.status !== 'Completed';
const overlaps = (a: AdminBooking, b: AdminBooking) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

export function AdminBookingSheet({
  booking,
  rooms,
  others,
  onClose,
}: {
  booking: AdminBooking;
  rooms: AdminRoomView[];
  /** Bookings to swap with (the ones on screen). */
  others: AdminBooking[];
  onClose: () => void;
}) {
  const now = useServerNow();
  const [b, setB] = useState(booking);
  const [mode, setMode] = useState<Mode>('view');
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const action = useAdminAction();
  const room = rooms.find((r) => r.id === b.roomId);
  const roomName = (id: string) => {
    const r = rooms.find((x) => x.id === id);
    return r ? `${r.name}, ${r.floor}` : id;
  };

  const act = async (kind: 'approve' | 'reject' | 'cancel' | 'checkin', note?: string) => {
    const res = await action.run(() => adminApi.act(b.ticketNo, kind, note?.trim() || undefined));
    if (!res) return;
    setB(res.booking ?? { ...b, status: 'Cancelled' });
    setMode('view');
    setComment('');
    setDone({ approve: 'Approved.', reject: 'Turned down.', cancel: 'Cancelled.', checkin: 'Checked in.' }[kind] + ' The owner gets a note in Messages.');
  };

  const w = checkInWindow({ start: new Date(b.start) });
  const t = now();
  const canCheckIn = (b.status === 'Approved' || b.status === 'In Progress') && t >= w.start && t < w.end;
  const dash = (v: ReactNode) => v || <span className="dt-muted">—</span>;
  const rows: Array<[string, ReactNode]> = [
    ['Name of requestor', b.owner],
    ['E-mail', dash(b.ownerEmail)],
    ['Division', dash(b.division)],
    ['Agenda', b.agenda],
    ['Type of agenda', b.agendaType],
    ['Priority', dash(b.priority)],
    ['Type of training', dash(b.trainingType)],
    ['Number of participants', `${b.participants}${room?.capacity ? ` (room seats ${room.capacity})` : ''}`],
    ['Room', roomName(b.roomId)],
    ['Starts at', fmtTool(b.start)],
    ['Ends at', fmtTool(b.end)],
    ['Recurrence', dash(b.recurrence && describeRecurrence(fromRecurrenceJson(b.recurrence)))],
    ['Special instructions', dash(b.specialInstructions)],
    ['Hardware requirements', dash(b.hardwareRequirements?.join(', '))],
    ['Admin comments', dash(b.adminComments)],
    ['Created by', dash(b.createdBy)],
    ['Created date', dash(b.createdAt && fmtToolDate(b.createdAt))],
    ['Modified by', dash(b.modifiedBy)],
  ];

  return (
    <Sheet title={b.ticketNo} subtitle={<>{fmtWhen(b.start, b.end)} · <StatusChip status={b.status} /></>} onClose={onClose} wide>
      <div className="admin-sheet">
        <section>
          {room && b.participants > (room.capacity ?? Infinity) && <div className="banner banner--error">{b.participants} people in a room for {room.capacity}.</div>}
          {done && (
            <div className="banner banner--info" role="status">
              {done}
            </div>
          )}
          {action.error && (
            <div className="banner banner--error" role="alert">
              {action.error}
            </div>
          )}
          {mode === 'view' && (
            <div className="btn-row admin-actions">
              {b.status === 'In Progress' && (
                <>
                  <button className="btn btn--primary btn--small" disabled={action.working} onClick={() => void act('approve')}>
                    Approve
                  </button>
                  <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => setMode('reject')}>
                    Turn down…
                  </button>
                </>
              )}
              {open(b) && (
                <>
                  <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => setMode('change')}>
                    Change…
                  </button>
                  <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => setMode('swap')}>
                    Swap rooms…
                  </button>
                </>
              )}
              {canCheckIn && (
                <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => void act('checkin')}>
                  Check in
                </button>
              )}
              {open(b) && b.status !== 'Checked-In' && (
                <button className="btn btn--danger btn--small" disabled={action.working} onClick={() => setMode('cancel')}>
                  Cancel…
                </button>
              )}
            </div>
          )}
          {(mode === 'reject' || mode === 'cancel') && (
            <form
              className="form-grid admin-inline"
              onSubmit={(e) => {
                e.preventDefault();
                void act(mode, comment);
              }}
            >
              <label>
                {mode === 'reject' ? 'Why is it turned down? (the owner sees this)' : 'Reason (optional, the owner sees this)'}
                <textarea rows={2} maxLength={500} autoFocus value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="btn-row">
                <button className="btn btn--danger btn--small" type="submit" disabled={action.working || (mode === 'reject' && !comment.trim())}>
                  {mode === 'reject' ? 'Turn down' : 'Cancel booking'}
                </button>
                <button className="btn btn--secondary btn--small" type="button" onClick={() => setMode('view')}>
                  Back
                </button>
              </div>
            </form>
          )}
          {mode === 'change' && (
            <ChangeForm
              b={b}
              rooms={rooms}
              busy={action.working}
              onCancel={() => setMode('view')}
              onSave={async (body) => {
                const res = await action.run(() => adminApi.change(b.ticketNo, body));
                if (res) {
                  setB(res.booking);
                  setMode('view');
                  setDone('Changed. The owner gets a note in Messages.');
                }
              }}
            />
          )}
          {mode === 'swap' && (
            <SwapPicker
              b={b}
              candidates={others.filter((o) => o.ticketNo !== b.ticketNo && open(o) && o.roomId !== b.roomId)}
              roomName={roomName}
              busy={action.working}
              onCancel={() => setMode('view')}
              onSwap={async (other) => {
                const res = await action.run(() => adminApi.swap(b.ticketNo, other.ticketNo));
                if (res?.bookings[0]) {
                  setB(res.bookings[0]);
                  setMode('view');
                  setDone(`Swapped with ${other.ticketNo}. Both owners get a note in Messages.`);
                }
              }}
            />
          )}
          <dl className="details">
            {rows.map(([k, v]) => (
              <div key={k} className="details__row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="section-title">Messages with {b.owner}</h3>
          <Thread ticketNo={b.ticketNo} admin />
        </section>
      </div>
    </Sheet>
  );
}

function ChangeForm({
  b,
  rooms,
  busy,
  onSave,
  onCancel,
}: {
  b: AdminBooking;
  rooms: AdminRoomView[];
  busy: boolean;
  onSave: (body: Parameters<typeof adminApi.change>[1]) => void;
  onCancel: () => void;
}) {
  const [roomId, setRoomId] = useState(b.roomId);
  const [start, setStart] = useState(toLocalInput(b.start));
  const [end, setEnd] = useState(toLocalInput(b.end));
  const [participants, setParticipants] = useState(String(b.participants));
  const [agenda, setAgenda] = useState(b.agenda ?? '');
  const [agendaType, setAgendaType] = useState(b.agendaType ?? 'Meeting');
  const [priority, setPriority] = useState(b.priority ?? 'Normal');
  const submit = () => {
    const body: Parameters<typeof adminApi.change>[1] = {};
    if (roomId !== b.roomId) body.roomId = roomId;
    if (start !== toLocalInput(b.start)) body.start = fromLocalInput(start);
    if (end !== toLocalInput(b.end)) body.end = fromLocalInput(end);
    if (Number(participants) !== b.participants) body.participants = Number(participants);
    if (agenda.trim() !== b.agenda) body.agenda = agenda.trim();
    if (agendaType !== b.agendaType) body.agendaType = agendaType;
    if (priority !== (b.priority ?? 'Normal')) body.priority = priority;
    onSave(body);
  };
  return (
    <form
      className="form-grid admin-inline admin-change"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label>
        Room
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {/* The owner's room booking list: only rooms that take this Type of agenda (the server checks too). */}
          {rooms.map((r) => (
            <option key={r.id} value={r.id} disabled={r.id !== b.roomId && !r.agendas.includes(agendaType)}>
              {r.name}, {r.floor}
              {r.capacity ? ` · ${r.capacity} seats` : ''}
              {r.selfBookable ? '' : ' · Admin only'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Starts at
        <input type="datetime-local" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        Ends at
        <input type="datetime-local" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label>
        Number of participants
        <input type="number" min={1} max={500} value={participants} onChange={(e) => setParticipants(e.target.value)} />
      </label>
      <label>
        Agenda
        <input maxLength={200} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
      </label>
      <label>
        Type of agenda
        <select value={agendaType} onChange={(e) => setAgendaType(e.target.value as typeof agendaType)}>
          {AGENDA_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
          <option>Normal</option>
          <option>Urgent</option>
        </select>
      </label>
      <p className="card__note">Times are Manila time. The room must be free and the owner can&apos;t hold another room then.</p>
      <div className="btn-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save change'}
        </button>
        <button className="btn btn--secondary btn--small" type="button" onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}

function SwapPicker({
  b,
  candidates,
  roomName,
  busy,
  onSwap,
  onCancel,
}: {
  b: AdminBooking;
  candidates: AdminBooking[];
  roomName: (id: string) => string;
  busy: boolean;
  onSwap: (other: AdminBooking) => void;
  onCancel: () => void;
}) {
  // Bookings at an overlapping time first: those are the usual swaps (a bigger group needs the bigger room).
  const sorted = [...candidates].sort((x, y) => Number(overlaps(y, b)) - Number(overlaps(x, b)) || Date.parse(x.start) - Date.parse(y.start));
  const [pick, setPick] = useState(sorted[0]?.ticketNo ?? '');
  const other = sorted.find((o) => o.ticketNo === pick);
  return (
    <div className="form-grid admin-inline">
      <label>
        Swap rooms with
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {sorted.length === 0 && <option value="">No other open bookings in this list</option>}
          {sorted.map((o) => (
            <option key={o.ticketNo} value={o.ticketNo}>
              {overlaps(o, b) ? '● ' : ''}
              {o.ticketNo} · {roomName(o.roomId)} · {fmtWhen(o.start, o.end)} · {o.owner} ({o.participants})
            </option>
          ))}
        </select>
      </label>
      {other && (
        <ul className="card__note admin-swap-preview">
          <li>
            {b.ticketNo} ({b.owner}, {b.participants} people): {roomName(b.roomId)} → <strong>{roomName(other.roomId)}</strong>
          </li>
          <li>
            {other.ticketNo} ({other.owner}, {other.participants} people): {roomName(other.roomId)} → <strong>{roomName(b.roomId)}</strong>
          </li>
          <li>Each keeps its own time. {STATUS_WORDS[other.status] ?? other.status}.</li>
        </ul>
      )}
      <div className="btn-row">
        <button className="btn btn--primary btn--small" disabled={busy || !other} onClick={() => other && onSwap(other)}>
          {busy ? 'Swapping…' : 'Swap rooms'}
        </button>
        <button className="btn btn--secondary btn--small" onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}
