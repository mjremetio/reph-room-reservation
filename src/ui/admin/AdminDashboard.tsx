'use client';

/**
 * S13 Admin dashboard (docs/spec/06-ui.md): today at a glance: figures, the requests waiting for Admin (approve or turn
 * down here), today's bookings, this week by day and by status, unread messages and the latest activity.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { adminApi, type AdminBooking } from '../api';
import { ColumnChart, Donut, StatTile, STATUS_COLOURS } from '../charts/Charts';
import { fmtDay, fmtSpan, fmtTime, fmtWhen } from '../format';
import { ThreadRow } from '../Messages';
import { AdminBookingSheet } from './AdminBookingSheet';
import { ACTION_WORDS } from './AdminLogs';
import { pct, StatusChip, useAdminAction } from './shared';

function WaitingRow({ b, roomName, onOpen }: { b: AdminBooking; roomName: string; onOpen: () => void }) {
  const action = useAdminAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li className="admin-list__row">
      <button className="admin-list__main" onClick={onOpen}>
        <strong>{b.agenda}</strong>
        <span className="card__meta">
          {fmtWhen(b.start, b.end)} · {roomName} · {b.owner} · {b.participants} people{b.priority === 'Urgent' ? ' · Urgent' : ''}
        </span>
      </button>
      {rejecting ? (
        <form
          className="admin-list__reject"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(() => adminApi.act(b.ticketNo, 'reject', reason.trim()));
          }}
        >
          <input aria-label="Reason (the owner sees it)" placeholder="Reason (the owner sees it)" maxLength={500} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn--danger btn--small" type="submit" disabled={action.working || !reason.trim()}>
            Turn down
          </button>
          <button className="btn btn--secondary btn--small" type="button" onClick={() => setRejecting(false)}>
            Back
          </button>
        </form>
      ) : (
        <div className="btn-row">
          <button className="btn btn--primary btn--small" disabled={action.working} onClick={() => void action.run(() => adminApi.act(b.ticketNo, 'approve'))}>
            Approve
          </button>
          <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => setRejecting(true)}>
            Turn down…
          </button>
        </div>
      )}
      {action.error && <div className="error-line">{action.error}</div>}
    </li>
  );
}

export function AdminDashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview, refetchInterval: 30_000 });
  const { data: rooms = [] } = useQuery({ queryKey: ['admin', 'rooms'], queryFn: adminApi.rooms });
  const [open, setOpen] = useState<AdminBooking | null>(null);
  const roomName = (id: string) => {
    const r = rooms.find((x) => x.id === id);
    return r ? `${r.name}, ${r.floor}` : id;
  };
  if (isLoading) return <p className="card__meta admin-page">Loading…</p>;
  if (error || !data) return <div className="banner banner--error admin-page">I can&apos;t load the dashboard right now. Try again in a minute.</div>;
  const k = data.kpis;
  const now = new Date(data.now);
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>Dashboard</h1>
        <p className="card__meta">
          {fmtDay(now)}, {fmtTime(now)} PHT
        </p>
      </header>
      <div className="stats">
        <StatTile label="Waiting for Admin" value={k.waiting} tone={k.waiting ? 'warn' : 'good'} />
        <StatTile label="Bookings today" value={k.today} hint={`${k.todayHours} hours`} />
        <StatTile label="In use now" value={k.inUseNow} />
        <StatTile label="Checked in today" value={k.checkedInToday} tone="good" />
        <StatTile label="No-shows today" value={k.noShowsToday} tone={k.noShowsToday ? 'bad' : undefined} />
        <StatTile label="Utilisation" value={pct(k.utilisationToday)} hint={`today · ${pct(k.utilisationWeek)} this week`} />
        <StatTile label="Unread messages" value={k.unread} tone={k.unread ? 'warn' : undefined} />
        <StatTile label="Active accounts" value={k.activeUsers} />
      </div>

      <div className="admin-columns">
        <section className="card admin-card">
          <h2 className="admin-card__title">
            Waiting for Admin <span className="count-badge count-badge--muted">{k.waiting}</span>
          </h2>
          {data.waiting.length === 0 ? (
            <p className="card__meta">Nothing waiting. New requests show here.</p>
          ) : (
            <ul className="admin-list">
              {data.waiting.map((b) => (
                <WaitingRow key={b.ticketNo} b={b} roomName={roomName(b.roomId)} onOpen={() => setOpen(b)} />
              ))}
            </ul>
          )}
          {k.waiting > data.waiting.length && (
            <Link className="btn btn--link btn--small" href="/admin/bookings">
              See all {k.waiting} in Bookings
            </Link>
          )}
        </section>

        <section className="card admin-card">
          <h2 className="admin-card__title">Today</h2>
          {data.today.length === 0 ? (
            <p className="card__meta">No bookings today.</p>
          ) : (
            <ul className="admin-list admin-list--compact">
              {data.today.map((b) => (
                <li key={b.ticketNo} className="admin-list__row">
                  <button className="admin-list__main" onClick={() => setOpen(b)}>
                    <span className="dt-time">{fmtSpan(b.start, b.end)}</span>
                    <span>
                      {roomName(b.roomId)} · {b.owner} · {b.participants}
                    </span>
                    <StatusChip status={b.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="chart-grid">
        <ColumnChart title="This week" note="bookings per day" points={data.week.byDay.map((d) => ({ label: fmtDay(d.day + 'T12:00:00+08:00').split(',')[0] as string, value: d.count }))} />
        <Donut title="This week by status" parts={data.week.byStatus.map((s) => ({ label: s.key, value: s.count, colour: STATUS_COLOURS[s.key] ?? 'var(--line)' }))} />
      </div>

      <div className="admin-columns">
        <section className="card admin-card">
          <h2 className="admin-card__title">Unread messages</h2>
          {data.threads.length === 0 ? (
            <p className="card__meta">No unread messages.</p>
          ) : (
            <div className="thread-list">
              {data.threads.map((t) => (
                <ThreadRow key={t.ticketNo} t={t} admin href={`/admin/messages?t=${encodeURIComponent(t.ticketNo)}`} />
              ))}
            </div>
          )}
        </section>
        <section className="card admin-card">
          <h2 className="admin-card__title">Latest activity</h2>
          <ul className="admin-list admin-list--compact">
            {data.recent.map((e) => (
              <li key={e.id} className="admin-activity">
                <span className="dt-time">{fmtTime(e.at)}</span> <strong>{e.actorName || e.actor}</strong> {ACTION_WORDS[e.action]?.toLowerCase() ?? e.action}
                {e.target ? ` ${e.target}` : ''}
                {e.detail && <span className="dt-muted"> · {e.detail}</span>}
              </li>
            ))}
          </ul>
          <Link className="btn btn--link btn--small" href="/admin/logs">
            All activity
          </Link>
        </section>
      </div>
      {open && <AdminBookingSheet booking={open} rooms={rooms} others={[...new Map([...data.today, ...data.waiting].map((b) => [b.ticketNo, b])).values()]} onClose={() => setOpen(null)} />}
    </div>
  );
}
