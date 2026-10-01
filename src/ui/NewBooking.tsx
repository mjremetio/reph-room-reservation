'use client';

/**
 * New booking (docs/spec/06-ui.md, New booking): the Room Reservation Tool's form. Choose a room and **Book**,
 * or leave "Best fit" and **Find rooms** (shared search, POST /api/search: the map, 3D view
 * and table show the same result), then Book one. Nothing is booked until Confirm on the proposal card.
 */
import { useRef, useState } from 'react';
import type { RoomResultView } from '../agent/context';
import { RULES } from '../domain/rules';
import { useActions } from './actions';
import { api, useHealth, useRooms } from './api';
import { BookingFields, firstDate, formErrorOf, FormErrorBox, precheckBooking, toRequest, useDraft, type FormError } from './BookingFields';
import { fmtSpan, fmtWhen } from './format';
import { Sheet } from './Sheet';
import { useAppState, useDispatch, useNow, type Results, type Slot } from './store';

/** The map's time while it can still be booked, otherwise the next half hour with the same length (1 hour by default). */
function startingSlot(slot: Slot | null, now: Date): Slot {
  if (slot && Date.parse(slot.start) >= now.getTime() - RULES.startGraceMinutes * 60_000) return slot;
  const start = Math.ceil(now.getTime() / 1_800_000) * 1_800_000;
  const length = slot ? Date.parse(slot.end) - Date.parse(slot.start) : 3_600_000;
  return { start: new Date(start).toISOString(), end: new Date(start + length).toISOString() };
}

export function NewBooking() {
  const state = useAppState();
  const dispatch = useDispatch();
  const now = useNow();
  const { mapSearch, showProposal, send } = useActions();
  const { data: rooms } = useRooms();
  const { data: health } = useHealth();
  const agendaRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useDraft({
    agendaType: state.results?.agendaType ?? 'Meeting',
    participants: state.results?.participants ?? 4,
    slot: startingSlot(state.slot, now()),
  });
  const [results, setResults] = useState<Results | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const close = () => dispatch({ type: 'new_booking', open: false });
  const update = (patch: Parameters<typeof setDraft>[0]) => {
    setDraft(patch);
    // A different type, size, room or time makes old results stale.
    if (patch.agendaType || patch.participants || patch.slot || patch.roomId !== undefined || patch.repeat !== undefined) setResults(null);
    setError(null);
  };

  const find = async (at: Slot = firstDate(draft)) => {
    setWorking(true);
    setError(null);
    try {
      setResults(await mapSearch({ agendaType: draft.agendaType, participants: draft.participants, slot: at }));
    } catch (err) {
      setResults(null);
      setError(formErrorOf(err, 'Search failed. Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  const book = async (roomId: string, at?: Slot) => {
    const pre = precheckBooking(draft);
    if (pre) return setError(pre);
    setWorking(true);
    setError(null);
    try {
      showProposal(await api.proposeBooking(toRequest(draft, roomId, at)));
      close();
    } catch (err) {
      setError(formErrorOf(err));
    } finally {
      setWorking(false);
    }
  };

  const meta = (r: RoomResultView) => {
    const room = rooms?.find((x) => x.id === r.roomId);
    return [r.floor, room?.kind, room?.av, room?.capacity ? `seats ${room.capacity}` : null].filter(Boolean).join(' · ');
  };
  const free = results?.results.filter((r) => r.availability === 'available') ?? [];
  const partial = results?.results.filter((r) => r.availability === 'partial') ?? [];
  const when = firstDate(draft);

  return (
    <Sheet title="New booking" wide onClose={close}>
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.roomId) void book(draft.roomId);
          else void find();
        }}
      >
        <BookingFields draft={draft} onChange={update} agendaRef={agendaRef} invalid={error?.fields} />
        <FormErrorBox error={error} />
        <div className="btn-row">
          <button className="btn btn--primary" type="submit" disabled={working}>
            {working ? 'Checking…' : draft.roomId ? 'Book this room' : 'Find rooms'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={close}>
            Close
          </button>
        </div>
      </form>

      {results && (
        <section className="nb-results" aria-live="polite">
          <div className="section-title">
            {results.flow === 'A' ? `${free.length} rooms free` : results.flow === 'B' ? 'Only partly free' : results.flow === 'C' ? 'Everything is taken' : 'No rooms of this type here'} ·{' '}
            {fmtWhen(when.start, when.end)}
            {draft.repeat ? ' (first date)' : ''}
          </div>
          {results.warnings?.map((w) => (
            <div key={w} className="banner banner--info">
              {w}
            </div>
          ))}
          {free.slice(0, 5).map((r) => (
            <div key={r.roomId} className="nb-room">
              {r.rank && <span className="rank">{r.rank}</span>}
              <div className="card__body">
                <strong>
                  {r.name}, {r.floor}
                </strong>
                <div className="card__meta">{meta(r)}</div>
              </div>
              <button className="btn btn--primary btn--small" disabled={working} onClick={() => void book(r.roomId)}>
                Book
              </button>
            </div>
          ))}
          {results.flow === 'B' &&
            partial.slice(0, 3).map((r) => {
              const part = r.free?.[0];
              const owner = r.conflicts?.[0];
              return (
                <div key={r.roomId} className="nb-room">
                  <div className="card__body">
                    <strong>
                      {r.name}, {r.floor}
                    </strong>
                    <div className="card__meta">
                      {part ? `Free ${fmtSpan(part.start, part.end)}` : ''}
                      {owner ? ` · ${owner.mine ? 'You have' : `${owner.owner} has`} ${fmtSpan(owner.start, owner.end)}` : ''}
                    </div>
                  </div>
                  {part && !draft.repeat && (
                    <button className="btn btn--secondary btn--small" disabled={working} onClick={() => void book(r.roomId, part)}>
                      Book {fmtSpan(part.start, part.end)}
                    </button>
                  )}
                </div>
              );
            })}
          {results.flow !== 'A' && results.alternatives.length > 0 && !draft.repeat && (
            <>
              <div className="section-title">Other times</div>
              <div className="alt-times">
                {results.alternatives.slice(0, 6).map((a) => (
                  <button
                    key={`${a.roomId}-${a.start}`}
                    className="btn btn--secondary btn--small"
                    onClick={() => {
                      const slot = { start: a.start, end: a.end };
                      setDraft({ slot });
                      void find(slot);
                    }}
                  >
                    {a.name} · {fmtSpan(a.start, a.end)}
                  </button>
                ))}
              </div>
            </>
          )}
          {results.flow !== 'A' && (
            <div className="btn-row">
              <button
                className="btn btn--secondary btn--small"
                disabled={health?.openai !== 'configured'}
                onClick={() => {
                  const title = draft.agenda.trim();
                  void send(`${draft.agendaType} room for ${draft.participants} on ${fmtWhen(when.start, when.end)}${title ? ` for ${title}` : ''}. Who has the rooms, and can I ask for a swap?`);
                  close();
                }}
              >
                Ask the assistant
              </button>
            </div>
          )}
        </section>
      )}
    </Sheet>
  );
}
