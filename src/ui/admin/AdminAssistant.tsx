'use client';

/**
 * The Admin assistant panel (docs/spec/06-ui.md, S22; docs/spec/05-agent.md, Admin assistant): a chat with the Admin
 * agent over POST /api/admin/assistant (SSE). Its cards change nothing by themselves: each button calls the same
 * /api/admin/* route as the pages, and the next message tells the assistant what was done. The conversation stays
 * while moving between Admin pages and clears on reload or New chat.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { UiEvent } from '../../agent/context';
import { adminApi, api } from '../api';
import { fmtSpan } from '../format';
import { RichText } from '../RichText';
import { readSse } from '../sse';
import { SuggestionGroups } from '../Suggestions';
import { useAdminAction } from './shared';
import { ADMIN_SUGGESTIONS } from './suggestions';

const CARD_TYPES = ['admin_action', 'admin_change', 'admin_swap', 'admin_message', 'admin_block', 'admin_bulk', 'room_schedule'] as const;
type AdminCard = Extract<UiEvent, { type: (typeof CARD_TYPES)[number] }>;
const isCard = (e: UiEvent): e is AdminCard => (CARD_TYPES as readonly string[]).includes(e.type);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
type Part = { kind: 'text'; text: string } | { kind: 'card'; id: string; card: AdminCard };
interface Msg {
  id: string;
  role: 'user' | 'assistant';
  parts: Part[];
  streaming?: boolean;
}
interface State {
  messages: Msg[];
  history: unknown[];
  streaming: boolean;
  confirmed: string[];
  error: string | null;
}
type Action =
  | { type: 'send'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'card'; card: AdminCard }
  | { type: 'done'; history: unknown[] }
  | { type: 'error'; text: string }
  | { type: 'confirmed'; ticketNos: string[] }
  | { type: 'reset' };

let n = 0;
const id = () => `a${Date.now().toString(36)}${(n++).toString(36)}`;
const initial: State = { messages: [], history: [], streaming: false, confirmed: [], error: null };

function reducer(s: State, a: Action): State {
  const last = s.messages.at(-1);
  const withLast = (m: Msg) => [...s.messages.slice(0, -1), m];
  switch (a.type) {
    case 'send':
      return { ...s, streaming: true, error: null, messages: [...s.messages, { id: id(), role: 'user', parts: [{ kind: 'text', text: a.text }] }, { id: id(), role: 'assistant', parts: [], streaming: true }] };
    case 'delta': {
      if (!last) return s;
      const tail = last.parts.at(-1);
      const parts: Part[] = tail?.kind === 'text' ? [...last.parts.slice(0, -1), { kind: 'text', text: tail.text + a.text }] : [...last.parts, { kind: 'text', text: a.text }];
      return { ...s, messages: withLast({ ...last, parts }) };
    }
    case 'card':
      return last ? { ...s, messages: withLast({ ...last, parts: [...last.parts, { kind: 'card', id: id(), card: a.card }] }) } : s;
    case 'done':
      return { ...s, streaming: false, history: a.history, confirmed: [], messages: last ? withLast({ ...last, streaming: false }) : s.messages };
    case 'error':
      return { ...s, streaming: false, error: a.text, messages: last ? withLast({ ...last, streaming: false }) : s.messages };
    case 'confirmed':
      return { ...s, confirmed: [...new Set([...s.confirmed, ...a.ticketNos])] };
    case 'reset':
      return s.streaming ? s : initial;
  }
}

const DOWN = "The assistant isn't available right now. You can still do everything from the Admin pages.";

/** A card with one button that calls /api/admin/*; after it worked, it says so and can't be pressed again. */
function ActionCard<T>({ title, lines, button, doneText, danger, run, onDone, children }: {
  title: string;
  lines: string[];
  button: string;
  /** What the card says after the button worked, e.g. "Approved. Tester, Charlie gets a note in Messages." */
  doneText: string;
  danger?: boolean;
  run: () => Promise<T>;
  onDone: (result: T) => void;
  children?: ReactNode;
}) {
  const action = useAdminAction();
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="card card--admin">
      <div className="card__eyebrow">{title}</div>
      {lines.map((l) => (
        <div key={l} className="card__meta">
          {l}
        </div>
      ))}
      {children}
      {done ? (
        <div className="status-word status-word--done">{done}</div>
      ) : (
        <div className="btn-row">
          <button
            className={`btn btn--small ${danger ? 'btn--danger' : 'btn--primary'}`}
            disabled={action.working}
            onClick={async () => {
              const result = await action.run(run);
              if (result !== undefined) {
                setDone(doneText);
                onDone(result);
              }
            }}
          >
            {action.working ? 'Working…' : button}
          </button>
          <span className="card__meta">Nothing changes until you press it.</span>
        </div>
      )}
      {action.error && <div className="error-line">{action.error}</div>}
    </div>
  );
}

/** The bookings a block or bulk booking card would cancel. */
function AffectedLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <div className="card__meta">No bookings in the way.</div>;
  return (
    <div className="affected">
      <p>
        <strong>Cancels {plural(lines.length, 'booking')}</strong> in the way; each owner gets a message:
      </p>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function CardView({ card, onConfirmed }: { card: AdminCard; onConfirmed: (ticketNos: string[]) => void }) {
  const [text, setText] = useState(card.type === 'admin_message' ? card.text : '');
  switch (card.type) {
    case 'admin_action': {
      const words = {
        approve: ['Approve', 'Approve', 'Approved'],
        reject: ['Turn down', 'Turn down', 'Turned down'],
        cancel: ['Cancel', 'Cancel booking', 'Cancelled'],
        checkin: ['Check in', 'Check in', 'Checked in'],
      }[card.action];
      return (
        <ActionCard
          title={`${words[0]} ${card.ticketNo} · ${card.owner}`}
          lines={[card.summary, ...(card.comment ? [`Note to the owner: ${card.comment}`] : [])]}
          button={words[1] as string}
          doneText={`${words[2]}. ${card.owner} gets a note in Messages.`}
          danger={card.action === 'reject' || card.action === 'cancel'}
          run={() => adminApi.act(card.ticketNo, card.action, card.comment)}
          onDone={() => onConfirmed([card.ticketNo])}
        />
      );
    }
    case 'admin_change':
      return (
        <ActionCard
          title={`Change ${card.ticketNo} · ${card.owner}`}
          lines={[card.change, `After: ${card.summary}`]}
          button="Apply change"
          doneText={`Changed. ${card.owner} gets a note in Messages.`}
          run={() => adminApi.change(card.ticketNo, card.body)}
          onDone={() => onConfirmed([card.ticketNo])}
        />
      );
    case 'admin_swap':
      return <ActionCard title="Swap rooms" lines={card.summary} button="Swap rooms" doneText="Swapped. Both owners get a note in Messages." run={() => adminApi.swap(card.a, card.b)} onDone={() => onConfirmed([card.a, card.b])} />;
    case 'admin_message':
      return (
        <ActionCard title={`Message to ${card.owner} · ${card.ticketNo}`} lines={[card.summary]} button="Send" doneText="Sent." run={() => api.sendMessage(card.ticketNo, text.trim())} onDone={() => onConfirmed([])}>
          <textarea className="card__textarea" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        </ActionCard>
      );
    case 'admin_block': {
      const n = card.cancel.length;
      return (
        <ActionCard
          title={card.title}
          lines={card.lines}
          button={n ? `Block and cancel ${plural(n, 'booking')}` : 'Block'}
          doneText={`Blocked. Nobody else can book ${card.body.roomIds.length === 1 ? 'the room' : 'these rooms'} then.${n ? ` ${plural(n, 'booking')} cancelled; each owner gets a message.` : ''}`}
          danger={n > 0}
          run={() => adminApi.block(card.body, card.cancel)}
          onDone={(r) => onConfirmed(r.blocks.slice(0, 5).map((b) => b.ticketNo))}
        >
          <AffectedLines lines={card.affected} />
        </ActionCard>
      );
    }
    case 'admin_bulk': {
      const n = card.cancel.length;
      return (
        <ActionCard
          title={card.title}
          lines={card.lines}
          button={n ? `Book ${card.count} and cancel ${plural(n, 'booking')}` : `Book ${card.count}`}
          doneText={`Booked ${plural(card.count, 'booking')} for ${card.owner}, Approved.${n ? ` ${plural(n, 'booking')} cancelled; each owner gets a message.` : ''}`}
          danger={n > 0}
          run={() => adminApi.bulk(card.body, card.cancel)}
          onDone={(r) => onConfirmed(r.created.slice(0, 5).map((b) => b.ticketNo))}
        >
          <AffectedLines lines={card.affected} />
        </ActionCard>
      );
    }
    case 'room_schedule':
      return (
        <div className="card card--admin">
          <div className="card__eyebrow">Room schedule</div>
          {card.rooms.map((r) => (
            <div key={r.roomId} className="card__meta">
              <strong>
                {r.name}, {r.floor}
              </strong>
              : {r.bookings.length ? r.bookings.map((b) => `${fmtSpan(b.start, b.end)} ${b.mine ? 'you' : b.owner}`).join('; ') : 'free'}
              {r.free.length > 0 && r.bookings.length > 0 && ` · free ${r.free.map((f) => fmtSpan(f.start, f.end)).join(', ')}`}
            </div>
          ))}
          {card.freeRooms.length > 0 && <div className="card__meta">Free the whole time: {card.freeRooms.map((r) => r.name).join(', ')}</div>}
        </div>
      );
  }
}

/**
 * The panel works like the room assistant's drawer, on the right: the header's › hides it (the column slides shut,
 * the conversation stays), and the Assistant tab on the right edge (`AdminShell`) brings it back.
 */
export function AdminAssistant({ hidden, onHide, onStreaming, onReply }: {
  hidden: boolean;
  onHide: () => void;
  /** While a reply streams (the reopen tab shows a dot). */
  onStreaming: (streaming: boolean) => void;
  /** A reply finished (unread while the panel is hidden). */
  onReply: () => void;
}) {
  const [s, dispatch] = useReducer(reducer, initial);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const wasStreaming = useRef(false);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' }); // newer browsers return a Promise here; an effect must not
  }, [s.messages]);
  useEffect(() => {
    onStreaming(s.streaming);
    if (wasStreaming.current && !s.streaming) onReply();
    wasStreaming.current = s.streaming;
  }, [s.streaming, onStreaming, onReply]);

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || s.streaming) return;
    setText('');
    dispatch({ type: 'send', text: m });
    let finished = false;
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: m, history: s.history, confirmedTickets: s.confirmed.slice(-5) }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        return dispatch({ type: 'error', text: body.message ?? DOWN });
      }
      for await (const { event, data } of readSse(res.body)) {
        if (event === 'text') dispatch({ type: 'delta', text: (data as { delta: string }).delta });
        else if (event === 'ui') {
          const e = data as UiEvent;
          if (isCard(e)) dispatch({ type: 'card', card: e });
        } else if (event === 'done') {
          finished = true;
          dispatch({ type: 'done', history: (data as { history: unknown[] }).history });
        } else if (event === 'error') {
          finished = true;
          dispatch({ type: 'error', text: (data as { message?: string }).message ?? DOWN });
        }
      }
      if (!finished) dispatch({ type: 'error', text: DOWN });
    } catch {
      if (!finished) dispatch({ type: 'error', text: DOWN });
    }
  };

  return (
    <section id="admin-assistant" className="admin-assistant" aria-label="Admin assistant" inert={hidden}>
      <div className="assistant__head">
        <div className="assistant__title">
          <span className="msg__avatar" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M7 1.5l1.4 3.1 3.1 1.4-3.1 1.4L7 10.5 5.6 7.4 2.5 6l3.1-1.4z" fill="currentColor" />
            </svg>
          </span>
          Admin assistant
        </div>
        {s.messages.length > 0 && (
          <button
            className="btn btn--secondary btn--small assistant__new"
            onClick={() => {
              dispatch({ type: 'reset' });
              document.getElementById('admin-composer')?.focus();
            }}
            disabled={s.streaming}
            title={s.streaming ? 'Wait for the reply to finish' : 'Clear this conversation and start a new one'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New chat
          </button>
        )}
        <button className="icon-btn" onClick={onHide} aria-label="Hide the assistant" aria-controls="admin-assistant" aria-expanded="true" title="Hide the assistant">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M7 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="assistant__scroll" aria-live="polite">
        {s.messages.length === 0 && (
          <div className="welcome">
            <h1>Manage bookings</h1>
            <p>Ask about requests, bookings, rooms or usage. I prepare approvals, changes, swaps, room blocks, bulk bookings and messages as cards; nothing changes until you press a card&apos;s button.</p>
            <SuggestionGroups groups={ADMIN_SUGGESTIONS} onPick={(q) => void send(q)} />
          </div>
        )}
        {s.messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg--user">
              <div className="bubble">{m.parts[0]?.kind === 'text' ? m.parts[0].text : ''}</div>
            </div>
          ) : (
            <div key={m.id} className="msg msg--assistant">
              <div className="msg__who" aria-hidden>
                <span className="msg__avatar">
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M7 1.5l1.4 3.1 3.1 1.4-3.1 1.4L7 10.5 5.6 7.4 2.5 6l3.1-1.4z" fill="currentColor" />
                  </svg>
                </span>
                Admin assistant
              </div>
              {m.parts.map((p, i) => (p.kind === 'text' ? <RichText key={`t${i}`} text={p.text} /> : <CardView key={p.id} card={p.card} onConfirmed={(t) => dispatch({ type: 'confirmed', ticketNos: t })} />))}
              {m.streaming && m.parts.length === 0 && (
                <div className="typing" aria-label="The assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          ),
        )}
        {s.error && <div className="banner banner--error">{s.error}</div>}
        <div ref={end} />
      </div>
      <form
        className="assistant__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="composer">
          <label className="sr-only" htmlFor="admin-composer">
            Message the Admin assistant
          </label>
          <textarea
            id="admin-composer"
            rows={1}
            maxLength={2000}
            value={text}
            placeholder="Ask about a request, a booking or a room…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <button className="composer__send" type="submit" disabled={s.streaming || !text.trim()} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M9 15V3M4 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
