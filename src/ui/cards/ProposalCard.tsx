'use client';

/**
 * Proposal → booked (docs/spec/02-flows.md F5). Nothing is booked until Confirm; the card counts down
 * the 3-minute hold and greys out when it expires. 409 and 410 get a clear next step.
 */
import { useEffect, useState } from 'react';
import { describeRecurrence, fromRecurrenceJson } from '../../domain/recurrence';
import { RULES } from '../../domain/rules';
import { useActions } from '../actions';
import { useRooms } from '../api';
import { fmtWhen, STATUS_WORDS } from '../format';
import { saveFile } from '../download';
import { icsFile } from '../ics';
import { useDispatch, useNow, type Card } from '../store';

type ProposalCardT = Extract<Card, { type: 'proposal' }>;
const HOLD_MS = RULES.proposalHoldMinutes * 60_000;

function useSecondsLeft(expiresAt: string, active: boolean): number {
  const now = useNow();
  const calc = () => Math.max(0, Math.ceil((Date.parse(expiresAt) - now().getTime()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    if (!active) return;
    setLeft(calc());
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
  }, [expiresAt, active, now]);
  return left;
}

function Countdown({ seconds }: { seconds: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const fraction = Math.min(1, (seconds * 1000) / HOLD_MS);
  const color = seconds <= 30 ? 'var(--orange)' : 'var(--blue)';
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="countdown" role="timer" aria-label={`${label} left to confirm`}>
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--plate)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="countdown__label">{label}</span>
    </div>
  );
}

/** The optional form fields, shown only when set (Normal priority is the default and stays implicit). */
function FormDetails({ p }: { p: ProposalCardT['proposal'] }) {
  return (
    <>
      {p.priority === 'Urgent' && (
        <>
          <dt>Priority</dt>
          <dd>Urgent</dd>
        </>
      )}
      {p.trainingType && (
        <>
          <dt>Training</dt>
          <dd>{p.trainingType}</dd>
        </>
      )}
      {p.specialInstructions && (
        <>
          <dt>Notes</dt>
          <dd>{p.specialInstructions}</dd>
        </>
      )}
      {!!p.hardwareRequirements?.length && (
        <>
          <dt>Hardware</dt>
          <dd>{p.hardwareRequirements.join(', ')}</dd>
        </>
      )}
      {p.recurrence && (
        <>
          <dt>Repeats</dt>
          <dd>
            {describeRecurrence(fromRecurrenceJson(p.recurrence))}
            {p.dates && ` · ${p.dates.length} dates`}
          </dd>
        </>
      )}
    </>
  );
}

function Booked({ card }: { card: ProposalCardT }) {
  const { data: rooms } = useRooms();
  const dispatch = useDispatch();
  const now = useNow();
  const b = card.booking;
  const p = card.proposal;
  const room = rooms?.find((r) => r.id === p.roomId);
  const status = b?.status ?? 'Approved';
  return (
    <div className="card booked-card">
      <div className="card__row">
        <div className="booked__check" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M4 10.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="card__body">
          <div className="card__eyebrow">{p.dates && p.dates.length > 1 ? `Booked · all ${p.dates.length} dates` : 'Booked'}</div>
          {b && <div className="ticket">{b.ticketNo}</div>}
          <span className={`status-word${status === 'In Progress' ? ' status-word--waiting' : ''}`}>{STATUS_WORDS[status] ?? status}</span>
          <dl className="proposal__grid">
            <dt>Room</dt>
            <dd>
              {p.roomName}, {p.floor}
              {room?.capacity ? ` · seats ${room.capacity}` : ''}
            </dd>
            <dt>When</dt>
            <dd>{fmtWhen(p.start, p.end)}</dd>
            <dt>Agenda</dt>
            <dd>{p.agenda}</dd>
            <dt>For</dt>
            <dd>{p.requester}</dd>
            <FormDetails p={p} />
          </dl>
        </div>
      </div>
      <div className="btn-row">
        {b && (
          <button
            className="btn btn--secondary btn--small"
            onClick={() =>
              saveFile(`${b.ticketNo}.ics`, [icsFile({ ticketNo: b.ticketNo, agenda: p.agenda, start: p.start, end: p.end, location: `${p.roomName}, ${p.floor}, Bldg. H` }, now())], 'text/calendar;charset=utf-8')
            }
          >
            Add to calendar
          </button>
        )}
        <button
          className="btn btn--secondary btn--small"
          onClick={() => dispatch({ type: 'show_room', roomId: p.roomId, floor: p.floor, slot: { start: p.start, end: p.end }, map: true })}
        >
          Show on map
        </button>
      </div>
    </div>
  );
}

export function ProposalCard({ card }: { card: ProposalCardT }) {
  const { confirmProposal, checkAgain } = useActions();
  const dispatch = useDispatch();
  const live = card.status === 'open' || card.status === 'confirming';
  const seconds = useSecondsLeft(card.proposal.expiresAt, live);
  const expired = card.status === 'expired' || (card.status === 'open' && seconds === 0);

  if (card.status === 'booked') {
    // The proposal card turns over to reveal the booking (06, Motion).
    return (
      <div className="flip-in">
        <Booked card={card} />
      </div>
    );
  }

  const p = card.proposal;
  return (
    <div className={`card proposal-card${expired || card.status === 'conflict' ? ' card--muted' : ''}`}>
      <div className="card__row">
        <div className="card__body">
          <div className="card__eyebrow">Confirm your booking</div>
          <h3>
            {p.roomName}, {p.floor}
          </h3>
          <dl className="proposal__grid">
            <dt>When</dt>
            <dd>{fmtWhen(p.start, p.end)}</dd>
            <dt>Agenda</dt>
            <dd>{p.agenda}</dd>
            <dt>People</dt>
            <dd>{p.participants}</dd>
            <dt>For</dt>
            <dd>{p.requester}</dd>
            <FormDetails p={p} />
          </dl>
        </div>
        {live && !expired && <Countdown seconds={seconds} />}
      </div>

      {card.status === 'conflict' && <div className="error-line">Someone booked it a moment ago. Ask the assistant for other options.</div>}
      {expired && <div className="error-line">This card expired. Check again to hold the room for another 3 minutes.</div>}
      {card.status === 'error' && <div className="error-line">{card.error ?? 'That did not go through. Please try again.'}</div>}

      <div className="btn-row">
        {expired || card.status === 'conflict' || card.status === 'error' ? (
          <button className="btn btn--small" onClick={() => void checkAgain(card)}>
            Check again
          </button>
        ) : (
          <>
            <button className="btn btn--primary" disabled={card.status === 'confirming'} onClick={() => void confirmProposal(card)}>
              {card.status === 'confirming' ? 'Booking…' : 'Confirm booking'}
            </button>
            <button
              className="btn btn--secondary"
              disabled={card.status === 'confirming'}
              onClick={() => dispatch({ type: 'composer', text: `Change the ${p.roomName} booking: ` })}
            >
              Change
            </button>
          </>
        )}
      </div>
    </div>
  );
}
