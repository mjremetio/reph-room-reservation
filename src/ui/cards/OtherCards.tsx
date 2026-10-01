'use client';

/** Cancel, draft message and hand-off cards (docs/spec/06-ui.md, Components). */
import { useState } from 'react';
import { mailtoLink, teamsChatLink } from '../../agent/links';
import { useActions } from '../actions';
import { firstName } from '../format';
import { useDispatch, type Card } from '../store';

export function CancelCard({ card }: { card: Extract<Card, { type: 'cancel' }> }) {
  const { confirmCancel } = useActions();
  const dispatch = useDispatch();
  const c = card.cancel;
  if (card.status === 'done') {
    return (
      <div className="card">
        <div className="card__eyebrow">Cancelled</div>
        <h3>{c.ticketNo}</h3>
        <div className="card__meta">{c.summary}</div>
        <div className="card__note">The room is free again on the map.</div>
      </div>
    );
  }
  if (card.status === 'kept') {
    return (
      <div className="card card--muted">
        <div className="card__eyebrow">Kept</div>
        <div className="card__meta">{c.summary}</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card__eyebrow">Cancel this booking?</div>
      <h3>{c.ticketNo}</h3>
      <div className="card__meta">{c.summary}</div>
      {card.status === 'expired' && <div className="error-line">This card expired. Ask the assistant again to cancel.</div>}
      {card.status === 'error' && <div className="error-line">{card.error ?? 'That did not go through. Please try again.'}</div>}
      {(card.status === 'open' || card.status === 'working') && (
        <div className="btn-row">
          <button className="btn btn--danger" disabled={card.status === 'working'} onClick={() => void confirmCancel(card)}>
            {card.status === 'working' ? 'Cancelling…' : 'Cancel booking'}
          </button>
          <button className="btn btn--secondary" onClick={() => dispatch({ type: 'update_card', id: card.id, patch: { status: 'kept' } })}>
            Keep it
          </button>
        </div>
      )}
    </div>
  );
}

/** The owner's address lives only inside the link the server built; rebuild it when the user edits the text. */
function recipient(link: string): string | null {
  try {
    if (link.startsWith('mailto:')) return decodeURIComponent(link.slice(7).split('?')[0] ?? '');
    return new URL(link).searchParams.get('users');
  } catch {
    return null;
  }
}

export function DraftMessageCard({ card }: { card: Extract<Card, { type: 'draft' }> }) {
  const [text, setText] = useState(card.text);
  const to = recipient(card.link);
  const teams = to ? teamsChatLink(to, text) : card.channel === 'teams' ? card.link : null;
  const email = to ? mailtoLink(to, 'About your room booking', text) : card.channel === 'email' ? card.link : null;
  return (
    <div className="card">
      <div className="card__eyebrow">Message to {firstName(card.to)}</div>
      <h3>{card.to}</h3>
      <label className="sr-only" htmlFor={`draft-${card.id}`}>
        Message text
      </label>
      <textarea id={`draft-${card.id}`} className="draft-text" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="btn-row">
        {teams && (
          <a className="btn btn--primary btn--small" href={teams} target="_blank" rel="noreferrer">
            Open in Teams
          </a>
        )}
        {email && (
          <a className="btn btn--secondary btn--small" href={email}>
            Email instead
          </a>
        )}
      </div>
      <div className="card__note">You send it; nothing is sent automatically.</div>
    </div>
  );
}

const HANDOFF_BUTTON: Record<string, string> = {
  visitor_office: 'Email Admin',
  hardware: 'Open ServiceNow',
  room_setup: 'Open the service desk',
  it_support: 'Call IT',
};

export function HandoffCard({ card }: { card: Extract<Card, { type: 'handoff' }> }) {
  const external = /^https?:/.test(card.link);
  return (
    <div className="card">
      <div className="card__eyebrow">Handled by another team</div>
      <div>{card.label}</div>
      <div className="btn-row">
        <a className="btn btn--secondary btn--small" href={card.link} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {HANDOFF_BUTTON[card.topic] ?? 'Open'}
        </a>
      </div>
    </div>
  );
}
