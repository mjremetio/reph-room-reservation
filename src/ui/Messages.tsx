'use client';

/**
 * Messages between a person and Admin about their bookings (docs/spec/06-ui.md, S14 Messages; flows F29): one thread
 * per booking. `Thread` is shared by the Messages sheet here and the Admin pages. Threads refresh every 15 seconds.
 */
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { api, ApiError, useThread, useThreads, type ThreadSummary } from './api';
import { fmtDay, fmtTime, STATUS_WORDS } from './format';
import { Sheet } from './Sheet';
import { useAppState, useDispatch } from './store';

const MAX = 2000;
const stamp = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;

/** One booking's conversation and a box to write in. `admin`: the reader is Admin (shows the owner's name). */
export function Thread({ ticketNo, admin = false }: { ticketNo: string; admin?: boolean }) {
  const client = useQueryClient();
  const { data, isLoading, error } = useThread(ticketNo);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const count = data?.messages.length ?? 0;

  // Opening the thread marked it read on the server: refresh the unread counts.
  useEffect(() => {
    if (data) void client.invalidateQueries({ queryKey: ['messages'], exact: true });
  }, [client, data, count]);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setProblem(null);
    try {
      await api.sendMessage(ticketNo, message);
      setText('');
      await client.invalidateQueries({ queryKey: ['messages'] });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not go through. Please try again.');
    } finally {
      setSending(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  if (isLoading) return <p className="card__meta">Loading…</p>;
  if (error || !data) return <div className="banner banner--error">{error instanceof ApiError ? error.message : "I can't load this conversation right now."}</div>;
  return (
    <div className="thread">
      <div className="thread__about">
        <strong>{data.booking.agenda}</strong>
        <span className="card__meta">
          {[data.booking.label, data.ticketNo, STATUS_WORDS[data.booking.status] ?? data.booking.status, admin ? data.owner : null].filter(Boolean).join(' · ')}
        </span>
      </div>
      <ol className="thread__list" aria-live="polite">
        {data.messages.length === 0 && <li className="card__meta">{admin ? `No messages yet. Write to ${data.owner} below.` : 'No messages yet. Ask Admin anything about this booking.'}</li>}
        {data.messages.map((m) => (
          <li key={m.id} className={`thread-msg${m.mine ? ' thread-msg--mine' : ''}${m.system ? ' thread-msg--system' : ''}`}>
            <div className="thread-msg__head">
              {m.system ? 'Admin · automatic note' : m.mine ? 'You' : m.admin ? `${m.name} · Admin` : m.name} · {stamp(m.at)}
            </div>
            <div className="thread-msg__text">{m.text}</div>
          </li>
        ))}
      </ol>
      <div className="thread__compose">
        <label className="sr-only" htmlFor={`msg-${ticketNo}`}>
          Message
        </label>
        <textarea
          id={`msg-${ticketNo}`}
          rows={3}
          maxLength={MAX}
          value={text}
          placeholder={admin ? `Write to ${data.owner}…` : 'Write to Admin…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {problem && <div className="error-line">{problem}</div>}
        <div className="btn-row">
          <button className="btn btn--primary btn--small" disabled={sending || !text.trim()} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          <span className="card__meta">Ctrl + Enter sends</span>
        </div>
      </div>
    </div>
  );
}

/** A row in a list of threads: the booking, the last message and the unread count. A link with `href`, else a button. */
export function ThreadRow({ t, onOpen, href, admin = false, active = false }: { t: ThreadSummary; onOpen?: () => void; href?: string; admin?: boolean; active?: boolean }) {
  const className = `thread-row${t.unread ? ' thread-row--unread' : ''}${active ? ' thread-row--active' : ''}`;
  const body = (
    <>
      <span className="thread-row__title">
        {admin ? `${t.owner} · ` : ''}
        {t.booking?.agenda ?? t.ticketNo}
        {t.unread > 0 && <span className="count-badge" aria-label={`${t.unread} unread`}>{t.unread}</span>}
      </span>
      <span className="card__meta">{[t.booking?.label, t.ticketNo].filter(Boolean).join(' · ')}</span>
      {t.last && (
        <span className="thread-row__last">
          {t.last.admin ? 'Admin' : t.last.name}: {t.last.text}
        </span>
      )}
    </>
  );
  return href ? (
    <Link className={className} href={href} aria-current={active || undefined}>
      {body}
    </Link>
  ) : (
    <button className={className} onClick={onOpen}>
      {body}
    </button>
  );
}

/** The top bar's Messages sheet: your threads with Admin, or one of them. */
export function MessagesSheet() {
  const dispatch = useDispatch();
  const { inbox } = useAppState();
  const { data, isLoading, error } = useThreads();
  const ticketNo = inbox?.ticketNo ?? null;
  const close = () => dispatch({ type: 'inbox', inbox: null });
  return (
    <Sheet title="Messages" subtitle={ticketNo ? `With Admin about ${ticketNo}` : 'With Admin, about your bookings'} onClose={close}>
      {ticketNo ? (
        <>
          <button className="btn btn--link btn--small" onClick={() => dispatch({ type: 'inbox', inbox: { ticketNo: null } })}>
            ‹ All messages
          </button>
          <Thread ticketNo={ticketNo} />
        </>
      ) : (
        <>
          {isLoading && <p className="card__meta">Loading…</p>}
          {error && <div className="banner banner--error">I can&apos;t load your messages right now. Try again in a minute.</div>}
          {data?.threads.length === 0 && <p className="card__meta">No messages yet. To ask Admin about a booking, open My bookings and press Message Admin.</p>}
          <div className="thread-list">
            {data?.threads.map((t) => (
              <ThreadRow key={t.ticketNo} t={t} onOpen={() => dispatch({ type: 'inbox', inbox: { ticketNo: t.ticketNo } })} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
