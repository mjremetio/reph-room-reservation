'use client';

/**
 * A booking's reservation form, read-only, in the tool's field order (docs/spec/06-ui.md, Booking details).
 * Your own bookings show every field; other people's show only owner, division, time, group size and status
 * (privacy rule 5), so the rest is left out rather than shown empty.
 */
import type { ReactNode } from 'react';
import { describeRecurrence, fromRecurrenceJson } from '../domain/recurrence';
import type { PublicBooking, RoomView } from './api';
import { fmtTool, fmtToolDate, STATUS_WORDS } from './format';
import { Sheet } from './Sheet';

export function BookingDetails({ b, room, onClose }: { b: PublicBooking; room: RoomView | undefined; onClose: () => void }) {
  const dash = (v: ReactNode) => v || <span className="dt-muted">—</span>;
  const rows: Array<[string, ReactNode]> = [
    ['Ticket #', b.ticketNo],
    ['Name of requestor', b.owner],
    ['Division', dash(b.division)],
    ...(b.mine
      ? ([
          ['Agenda', b.agenda],
          ['Type of agenda', b.agendaType],
          ['Priority', dash(b.priority)],
          ['Type of training', dash(b.trainingType)],
          ['Special instructions', dash(b.specialInstructions)],
        ] as Array<[string, ReactNode]>)
      : []),
    ['Number of participants', b.participants],
    ...(b.mine ? ([['Hardware requirements', dash(b.hardwareRequirements?.join(', '))]] as Array<[string, ReactNode]>) : []),
    ['Building', dash(room?.building)],
    ['Room', room ? `${room.toolName ?? room.name} (${room.floor})` : b.roomId],
    ['Starts at', fmtTool(b.start)],
    ['Ends at', fmtTool(b.end)],
    ...(b.mine
      ? ([
          ['Recurrence', dash(b.recurrence && describeRecurrence(fromRecurrenceJson(b.recurrence)))],
        ] as Array<[string, ReactNode]>)
      : []),
    ['Status', STATUS_WORDS[b.status] ?? b.status],
    ...(b.mine
      ? ([
          ['Admin comments', dash(b.adminComments)],
          ['Modified by', dash(b.modifiedBy)],
          ['Created by', dash(b.createdBy)],
          ['Created date', dash(b.createdAt && fmtToolDate(b.createdAt))],
        ] as Array<[string, ReactNode]>)
      : []),
  ];
  return (
    <Sheet title={b.ticketNo} subtitle={b.mine ? 'Your reservation' : `${b.owner}'s reservation`} onClose={onClose}>
      <dl className="details">
        {rows.map(([k, v]) => (
          <div key={k} className="details__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!b.mine && <p className="card__note">For other people&apos;s bookings, only the owner&apos;s name, division, time, group size and status are shown.</p>}
    </Sheet>
  );
}
