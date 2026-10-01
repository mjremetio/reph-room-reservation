'use client';

/**
 * Live Admin pages (docs/spec/06-ui.md, Admin): asks GET /api/admin/changes every 3 seconds (and as soon as the tab is
 * visible again). When anything changed it refreshes every Admin view and the message threads, so a new booking shows
 * up at once, and it shows a short notice for what other people did: a booking, a cancellation, a check-in, a message.
 */
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminApi, type AuditView } from '../api';

export const LIVE_POLL_MS = 3000;
const NOTICE_MS = 10_000;

/** What a notice says and where it leads, for the actions worth telling Admin about. */
function noticeFor(e: AuditView): { text: string; href: string } | null {
  const who = e.actorName || e.actor;
  switch (e.action) {
    case 'booking.create':
      return { text: `New booking ${e.target} by ${who}${e.detail ? `: ${e.detail}` : ''}`, href: '/admin/bookings' };
    case 'booking.cancel':
      return { text: `${who} cancelled ${e.target}`, href: '/admin/bookings' };
    case 'booking.checkin':
      return { text: `${who} checked in to ${e.target}`, href: '/admin/bookings' };
    case 'booking.release':
      return { text: `${e.target} released: nobody checked in${e.detail ? ` (${e.detail})` : ''}`, href: '/admin/bookings' };
    case 'message.send':
      return { text: `New message from ${who} about ${e.target}`, href: `/admin/messages?t=${encodeURIComponent(e.target ?? '')}` };
    default:
      return null;
  }
}

export function AdminLive({ me }: { me: string }) {
  const client = useQueryClient();
  const [notices, setNotices] = useState<Array<{ id: number; text: string; href: string }>>([]);

  useEffect(() => {
    let last: number | null = null;
    let busy = false;
    const tick = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await adminApi.changes(last ?? undefined);
        // A restarted server starts its log again: catch up and refresh.
        const changed = last !== null && (r.entries.length > 0 || r.last < last);
        last = r.last;
        if (!changed) return;
        void client.invalidateQueries({ queryKey: ['admin'] });
        void client.invalidateQueries({ queryKey: ['messages'] });
        const fresh = r.entries
          .filter((e) => e.actor.toLowerCase() !== me.toLowerCase())
          .map((e) => ({ id: e.id, ...noticeFor(e) }))
          .filter((n): n is { id: number; text: string; href: string } => !!n.text);
        if (fresh.length) setNotices((list) => [...list, ...fresh].slice(-4));
      } catch {
        // offline or signed out (api.ts handles 401): try again on the next tick
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), LIVE_POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, me]);

  useEffect(() => {
    if (notices.length === 0) return;
    const t = setTimeout(() => setNotices((list) => list.slice(1)), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notices]);

  return (
    <div className="admin-toasts no-print" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className="admin-toast">
          <span className="admin-toast__text">{n.text}</span>
          <Link className="btn btn--link btn--small" href={n.href} onClick={() => setNotices((list) => list.filter((x) => x.id !== n.id))}>
            Open
          </Link>
          <button className="admin-toast__close" aria-label="Dismiss" onClick={() => setNotices((list) => list.filter((x) => x.id !== n.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
