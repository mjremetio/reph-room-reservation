'use client';

/**
 * Cards for find_rooms results (docs/spec/02-flows.md F2–F4): ranked rooms (flow A), partly free rooms with
 * every free part and who has the rest (flow B), who has the other rooms (every flow: owner, division, time,
 * group size, status), and alternative times. Buttons send a follow-up message to the assistant; nothing here books anything.
 */
import type { RoomResultView } from '../../agent/context';
import { useActions } from '../actions';
import { useRooms, type RoomView } from '../api';
import { firstName, fmtSpan, fmtWhen, shortStatus } from '../format';
import { useAppState, useDispatch, type Results } from '../store';
import { Appear } from './Appear';

const MAX_CARDS = 3;

function meta(room: RoomView | undefined): string {
  if (!room) return '';
  const bits = [room.floor, room.kind, room.av, room.capacity ? `seats ${room.capacity}` : 'capacity not on file'];
  return bits.filter(Boolean).join(' · ');
}

function useSelect() {
  const dispatch = useDispatch();
  return (r: { roomId: string; floor: string }) => dispatch({ type: 'show_room', roomId: r.roomId, floor: r.floor });
}

function RoomResultCard({ r, room, index }: { r: RoomResultView; room?: RoomView; index: number }) {
  const { selectedRoomId } = useAppState();
  const { send } = useActions();
  const select = useSelect();
  const selected = selectedRoomId === r.roomId;
  return (
    <Appear index={index}>
      <div
        className={`card result-card${selected ? ' card--selected' : ''}`}
        onClick={() => select(r)}
        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && select(r)}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${r.name}, ${r.floor}, rank ${r.rank}. Show on map`}
      >
        <div className="card__row">
          <div className="rank" aria-hidden>
            {r.rank}
          </div>
          <div className="card__body">
            <h3>
              {r.name}, {r.floor}
            </h3>
            <div className="card__meta">{meta(room)}</div>
            <div>
              {r.reasons.map((reason) => (
                <span key={reason} className="fit-tag">
                  {reason}
                </span>
              ))}
            </div>
          </div>
          <button
            className="btn btn--primary btn--small"
            onClick={(e) => {
              e.stopPropagation();
              void send(`Book ${r.name}, ${r.floor}`);
            }}
          >
            Book
          </button>
        </div>
      </div>
    </Appear>
  );
}

/** "4 people · Approved" */
const groupAndStatus = (c: NonNullable<RoomResultView['conflicts']>[number]) =>
  `${c.participants} ${c.participants === 1 ? 'person' : 'people'} · ${shortStatus(c.status)}`;

function PartialCard({ r, index }: { r: RoomResultView; index: number }) {
  const { send } = useActions();
  const { selectedRoomId } = useAppState();
  const select = useSelect();
  const free = r.free?.[0];
  const owner = r.conflicts?.find((c) => !c.mine);
  return (
    <Appear index={index}>
      <div className={`card${selectedRoomId === r.roomId ? ' card--selected' : ''}`} onClick={() => select(r)}>
        <div className="card__eyebrow">Partly free</div>
        <h3>
          {r.name}, {r.floor}
        </h3>
        {r.free?.map((f) => (
          <span key={f.start} className="fit-tag fit-tag--orange">
            Free {fmtSpan(f.start, f.end)}
          </span>
        ))}
        {r.conflicts?.map((c) => (
          <div key={c.ticketNo} className="owner-line">
            Booked {fmtSpan(c.start, c.end)} by <strong>{c.mine ? 'you' : c.owner}</strong>
            <div className="card__meta">{[c.mine ? null : c.division, groupAndStatus(c)].filter(Boolean).join(' · ')}</div>
          </div>
        ))}
        <div className="btn-row">
          {free && (
            <button className="btn btn--small" onClick={() => void send(`Book ${r.name}, ${r.floor} for ${fmtSpan(free.start, free.end)} only`)}>
              Book {fmtSpan(free.start, free.end)} only
            </button>
          )}
          {owner && (
            <button className="btn btn--secondary btn--small" onClick={() => void send(`Ask ${owner.owner} (${owner.ticketNo}) if they can swap rooms with me`)}>
              Ask {firstName(owner.owner)} to swap
            </button>
          )}
        </div>
      </div>
    </Appear>
  );
}

/** Who has the other rooms at that time: each booking's owner, division, time, group size and status, and any free part. */
function WhoHasCard({ rooms, index, title }: { rooms: RoomResultView[]; index: number; title: string }) {
  const { send } = useActions();
  const select = useSelect();
  if (rooms.length === 0) return null;
  return (
    <Appear index={index}>
      <div className="card">
        <div className="card__eyebrow">{title}</div>
        {rooms.map((r) =>
          r.conflicts?.map((c, i) => (
            <div key={`${r.roomId}-${c.ticketNo}`} className="taken-row">
              <div className="card__body" onClick={() => select(r)}>
                <strong>
                  {r.name}, {r.floor}
                </strong>
                <div className="card__meta">
                  {c.mine ? 'You' : `${c.owner}${c.division ? ` (${c.division})` : ''}`} · {fmtSpan(c.start, c.end)} · {groupAndStatus(c)}
                </div>
                {i === 0 &&
                  r.free?.map((f) => (
                    <span key={f.start} className="fit-tag fit-tag--orange">
                      Free {fmtSpan(f.start, f.end)}
                    </span>
                  ))}
              </div>
              {!c.mine && (
                <button className="btn btn--secondary btn--small" onClick={() => void send(`Ask ${c.owner} (${c.ticketNo}) if they can swap rooms with me`)}>
                  Ask to swap
                </button>
              )}
            </div>
          )),
        )}
      </div>
    </Appear>
  );
}

function AlternativesCard({ data, index }: { data: Results; index: number }) {
  const { send } = useActions();
  const state = useAppState();
  const dispatch = useDispatch();
  const lastRequest = [...state.messages].reverse().find((m) => m.role === 'user')?.parts[0];
  const alts = data.alternatives.slice(0, 6);
  return (
    <Appear index={index}>
      <div className="card">
        <div className="card__eyebrow">Other times</div>
        {alts.length > 0 ? (
          <div className="alt-times">
            {alts.map((a) => (
              <button
                key={`${a.roomId}-${a.start}`}
                className="btn btn--secondary btn--small"
                onClick={() => void send(`Let's check ${a.name}, ${a.floor} on ${fmtWhen(a.start, a.end)} instead`)}
              >
                {a.name} · {fmtSpan(a.start, a.end)}
              </button>
            ))}
          </div>
        ) : (
          <div className="card__meta">No nearby times with the same length.</div>
        )}
        <div className="btn-row">
          <button
            className="btn btn--link btn--small"
            onClick={() => lastRequest?.kind === 'text' && dispatch({ type: 'composer', text: lastRequest.text })}
          >
            Change my request
          </button>
        </div>
      </div>
    </Appear>
  );
}

export function ResultsCard({ data }: { data: Results }) {
  const { data: rooms } = useRooms();
  const byId = new Map(rooms?.map((r) => [r.id, r] as const) ?? []);
  const free = data.results.filter((r) => r.availability === 'available');
  const partial = data.results.filter((r) => r.availability === 'partial');
  const taken = data.results.filter((r) => r.availability === 'unavailable');

  if (data.flow === 'A') {
    const shown = free.slice(0, MAX_CARDS);
    return (
      <div>
        {shown.map((r, i) => (
          <RoomResultCard key={r.roomId} r={r} room={byId.get(r.roomId)} index={i} />
        ))}
        {free.length > MAX_CARDS && <div className="more-link">+{free.length - MAX_CARDS} more free rooms on the map</div>}
        <WhoHasCard rooms={[...partial, ...taken]} index={shown.length} title="Who has the other rooms" />
      </div>
    );
  }
  if (data.flow === 'B') {
    return (
      <div>
        {partial.map((r, i) => (
          <PartialCard key={r.roomId} r={r} index={i} />
        ))}
        <WhoHasCard rooms={taken} index={partial.length} title="Taken the whole time" />
        <AlternativesCard data={data} index={partial.length + 1} />
      </div>
    );
  }
  if (data.flow === 'C') {
    return (
      <div>
        <WhoHasCard rooms={taken} index={0} title="Who has the rooms" />
        <AlternativesCard data={data} index={1} />
      </div>
    );
  }
  return null;
}
