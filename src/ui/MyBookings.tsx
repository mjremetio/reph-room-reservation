'use client';

/** S3 My bookings (docs/spec/02-flows.md F6–F8, F29): list, check in when the window is open, cancel through a cancel card, message Admin. */
import { describeRecurrence, fromRecurrenceJson } from '../domain/recurrence';
import { useBookingOps } from './actions';
import { useMyBookings, useRooms, type MyBooking } from './api';
import { fmtTime, fmtWhen, STATUS_WORDS } from './format';
import { Sheet } from './Sheet';
import { useDispatch, useNow } from './store';

function BookingRow({ b }: { b: MyBooking }) {
  const { data: rooms } = useRooms();
  const dispatch = useDispatch();
  const now = useNow();
  const room = rooms?.find((r) => r.id === b.roomId);
  const ops = useBookingOps(b.ticketNo);

  const windowOpensLater = now() < new Date(b.checkIn.start);
  const status = STATUS_WORDS[b.status] ?? b.status;

  return (
    <div className="card">
      <div className="card__eyebrow">{fmtWhen(b.start, b.end)}</div>
      <h3>{b.agenda}</h3>
      <div className="card__meta">
        {[room ? `${room.name}, ${room.floor}` : b.roomId, b.ticketNo, b.agendaType !== 'Meeting' ? b.agendaType : null, b.priority === 'Urgent' ? 'Urgent' : null].filter(Boolean).join(' · ')}
      </div>
      {b.recurrence && <div className="card__note">Repeats: {describeRecurrence(fromRecurrenceJson(b.recurrence))}</div>}
      {!!b.hardwareRequirements?.length && <div className="card__note">Hardware: {b.hardwareRequirements.join(', ')}</div>}
      {b.specialInstructions && <div className="card__note">Notes: {b.specialInstructions}</div>}
      {b.adminComments && <div className="card__note">Admin: {b.adminComments}</div>}
      <span className={`status-word${b.status === 'In Progress' ? ' status-word--waiting' : b.status === 'Checked-In' ? ' status-word--done' : ''}`} style={{ marginTop: 8 }}>
        {status}
      </span>
      {(b.status === 'Approved' || b.status === 'In Progress') && (b.checkIn.open || windowOpensLater) && (
        <div className="card__note">
          {b.checkIn.open ? `Check in by ${fmtTime(b.checkIn.end)}` : `Check in from ${fmtTime(b.checkIn.start)} to ${fmtTime(b.checkIn.end)}`}, or the room is released.
        </div>
      )}
      {ops.message && <div className={ops.message.kind === 'error' ? 'error-line' : 'card__note'}>{ops.message.text}</div>}

      {ops.confirmingCancel ? (
        <div className="btn-row">
          <button className="btn btn--danger btn--small" disabled={ops.working} onClick={() => void ops.confirmCancel()}>
            {ops.working ? 'Cancelling…' : 'Cancel booking'}
          </button>
          <button className="btn btn--secondary btn--small" onClick={ops.keep}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="btn-row">
          {b.checkIn.open && (
            <button className="btn btn--primary btn--small" disabled={ops.working} onClick={() => void ops.checkIn()}>
              Check in
            </button>
          )}
          {b.status !== 'Checked-In' && (
            <button className="btn btn--secondary btn--small" disabled={ops.working} onClick={() => void ops.askCancel()}>
              Cancel…
            </button>
          )}
          <button
            className="btn btn--link btn--small"
            onClick={() => dispatch({ type: 'show_room', roomId: b.roomId, floor: room?.floor, slot: { start: b.start, end: b.end }, map: true })}
          >
            Show on map
          </button>
          <button className="btn btn--link btn--small" onClick={() => dispatch({ type: 'inbox', inbox: { ticketNo: b.ticketNo } })}>
            Message Admin
          </button>
        </div>
      )}
    </div>
  );
}

export function MyBookings() {
  const dispatch = useDispatch();
  const { data, isLoading, error } = useMyBookings();
  const close = () => dispatch({ type: 'bookings', open: false });
  return (
    <Sheet title="My bookings" subtitle="Everything coming up, including requests waiting for Admin" onClose={close}>
      {isLoading && <p className="card__meta">Loading…</p>}
      {error && <div className="banner banner--error">I can&apos;t reach the booking system right now. Try again in a minute.</div>}
      {data?.length === 0 && <p className="card__meta">No upcoming bookings.</p>}
      {data?.map((b) => (
        <BookingRow key={b.ticketNo} b={b} />
      ))}
    </Sheet>
  );
}
