'use client';

/**
 * S15 Admin messages (docs/spec/06-ui.md; flows F29): every conversation with the people who booked, unread first in
 * the badge, newest first in the list. Open one to read and reply. ?t=<ticket> opens that booking's thread.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useThreads } from '../api';
import { Thread, ThreadRow } from '../Messages';

export function AdminMessages() {
  const { data, isLoading, error } = useThreads();
  // The open thread is the URL's ?t=, so a notice's Open link switches it even while this page is showing.
  const ticketNo = useSearchParams().get('t');
  const router = useRouter();
  const pick = (t: string) => router.replace(`/admin/messages?t=${encodeURIComponent(t)}`, { scroll: false });
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>Messages</h1>
        <p className="card__meta">Conversations with the people who booked, one per booking. To start one, open the booking in Bookings.</p>
      </header>
      {error && <div className="banner banner--error">I can&apos;t load the messages right now.</div>}
      <div className="admin-inbox">
        <div className="thread-list" aria-label="Conversations">
          {isLoading && <p className="card__meta">Loading…</p>}
          {data?.threads.length === 0 && <p className="card__meta">No conversations yet.</p>}
          {data?.threads.map((t) => (
            <ThreadRow key={t.ticketNo} t={t} admin active={t.ticketNo === ticketNo} onOpen={() => pick(t.ticketNo)} />
          ))}
        </div>
        <div className="admin-inbox__thread card">{ticketNo ? <Thread key={ticketNo} ticketNo={ticketNo} admin /> : <p className="card__meta">Pick a conversation.</p>}</div>
      </div>
    </div>
  );
}
