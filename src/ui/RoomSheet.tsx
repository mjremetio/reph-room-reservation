'use client';

/**
 * S2 room sheet (docs/spec/02-flows.md F11): facts, state at the selected time, the day's bookings and
 * "Book this room". Works without OpenAI: it uses /api/availability and POST /api/proposals directly.
 */
import { useEffect, useState } from 'react';
import { HANDOFFS } from '../config/handoffs';
import { BookingFields, formErrorOf, FormErrorBox, precheckBooking, toRequest, useDraft, type FormError } from './BookingFields';
import { useActions } from './actions';
import { api } from './api';
import { fmtSpan, fmtWhen } from './format';
import { STATE_WORDS, type RoomState } from './roomStates';
import { Sheet } from './Sheet';
import { useAppState, useDispatch, useNow } from './store';
import { Timeline } from './Timeline';
import { useMapData } from './useMapData';

/** The map's colours: green free, orange partly free, red taken, blue yours. */
const DOT: Record<RoomState, string> = {
  fits: 'var(--green)',
  yours: 'var(--blue)',
  partial: 'var(--orange)',
  taken: 'var(--red)',
  free: 'var(--green)',
  unsuitable: 'var(--line)',
};

export function RoomSheet() {
  const state = useAppState();
  const dispatch = useDispatch();
  const now = useNow();
  const map = useMapData();
  const { showProposal } = useActions();
  const room = state.sheetRoomId ? map.roomsById.get(state.sheetRoomId) : undefined;
  const status = room ? map.statuses.get(room.id) : undefined;
  // The owner's room booking list: the Types of agenda this room takes (none: it can't be booked).
  const types = room?.agendas ?? [];
  const fallbackSlot = { start: now().toISOString(), end: new Date(now().getTime() + 3_600_000).toISOString() };

  const [draft, setDraft] = useDraft({ agendaType: types[0] ?? 'Meeting', participants: state.results?.participants ?? 2, slot: state.slot ?? fallbackSlot });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const update = (patch: Parameters<typeof setDraft>[0]) => {
    setDraft(patch);
    setError(null); // the red marks go as soon as the form changes
  };

  useEffect(() => {
    setDraft({ ...(types[0] ? { agendaType: types[0] } : {}), ...(state.slot ? { slot: state.slot } : {}) });
    setError(null);
  }, [room?.id]);

  if (!room || !state.slot) return null;
  const close = () => dispatch({ type: 'sheet', roomId: null });
  const dayBusy = map.busy.get(room.id) ?? [];
  const bookable = room.selfBookable && types.length > 0 && status?.state !== 'taken';

  return (
    <Sheet
      title={room.name}
      subtitle={[room.floor, room.kind, room.capacity ? `${room.capacity} seats` : null, room.av === 'VC' ? 'Video conferencing' : room.av === 'BYOD' ? 'BYOD dock' : null].filter(Boolean).join(' · ')}
      onClose={close}
    >
          {status && (
            <div className="state-line">
              <span className="dot" style={{ background: DOT[status.state] }} />
              {STATE_WORDS[status.state][0]?.toUpperCase() + STATE_WORDS[status.state].slice(1)} · {fmtWhen(map.slot.start, map.slot.end)}
              {status.rank ? ` · rank ${status.rank}` : ''}
            </div>
          )}
          <div className="section-title">This day</div>
          <Timeline slot={map.slot} busy={dayBusy} now={now()} head={false} />
          {dayBusy.length > 0 ? (
            <ul className="day-list" style={{ marginTop: 8 }}>
              {dayBusy.map((b) => (
                <li key={b.ticketNo}>
                  <span className="when">{fmtSpan(b.start, b.end)}</span>
                  <span>{b.mine ? <strong>You · {b.agenda}</strong> : `${b.owner}${b.division ? ` (${b.division})` : ''} · ${b.participants} people`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card__meta">Free all day.</p>
          )}

          {!room.selfBookable ? (
            <>
              <div className="section-title">Book</div>
              <p>{HANDOFFS.visitor_office.label}</p>
              <a className="btn btn--secondary" href={HANDOFFS.visitor_office.link}>
                Email Admin
              </a>
            </>
          ) : types.length === 0 ? (
            <>
              <div className="section-title">Book</div>
              <p className="card__meta">This room can&apos;t be booked.</p>
            </>
          ) : (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const pre = precheckBooking(draft);
                if (pre) return setError(pre);
                setWorking(true);
                setError(null);
                try {
                  const proposal = await api.proposeBooking(toRequest(draft, room.id));
                  showProposal(proposal);
                  close();
                } catch (err) {
                  setError(formErrorOf(err));
                } finally {
                  setWorking(false);
                }
              }}
            >
              <div className="section-title">Book this room</div>
              {!bookable && <p className="card__meta">Taken at this time. Pick another time below.</p>}
              {types.length > 0 && (
                <div className="form-grid">
                  <BookingFields draft={draft} onChange={update} room={room} invalid={error?.fields} />
                  {room.capacity && draft.participants > room.capacity && <p className="error-line">{room.name} seats {room.capacity}.</p>}
                  <FormErrorBox error={error} />
                  <div className="btn-row">
                    <button className="btn btn--primary" type="submit" disabled={working}>
                      {working ? 'Checking…' : 'Book this room'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => {
                        dispatch({ type: 'composer', text: `Book ${room.name}, ${room.floor} on ${fmtWhen(draft.slot.start, draft.slot.end)}` });
                        dispatch({ type: 'assistant_open', open: true });
                        close();
                      }}
                    >
                      Ask the assistant
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
    </Sheet>
  );
}
