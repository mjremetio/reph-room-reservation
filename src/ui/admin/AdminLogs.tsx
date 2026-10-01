'use client';

/**
 * S21 Admin logs (docs/spec/06-ui.md): the audit log, newest first: sign-ins, bookings, Admin actions, account and
 * room changes and messages sent (never their text or any password). Filter, search, sort, page, export CSV.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { adminApi, type AuditView } from '../api';
import { fmtTool } from '../format';
import { DataGrid, type Column } from '../table/DataGrid';

export const ACTION_WORDS: Record<string, string> = {
  'session.signin': 'Signed in',
  'session.signin_failed': 'Sign-in failed',
  'session.signout': 'Signed out',
  'session.password': 'Changed password',
  'booking.create': 'Booked',
  'booking.cancel': 'Cancelled',
  'booking.checkin': 'Checked in',
  'booking.release': 'Released (no check-in)',
  'booking.approve': 'Approved',
  'booking.reject': 'Turned down',
  'booking.update': 'Changed booking',
  'booking.swap': 'Swapped rooms',
  'user.create': 'Added person',
  'user.update': 'Changed person',
  'user.reset': 'Reset account',
  'user.signout': 'Signed someone out',
  'room.update': 'Changed room',
  'message.send': 'Sent message',
};

export function AdminLogs() {
  const { data: entries = [], isLoading, error } = useQuery({ queryKey: ['admin', 'audit'], queryFn: adminApi.audit, refetchInterval: 30_000 });
  const [action, setAction] = useState('');
  const [area, setArea] = useState('');
  const rows = useMemo(() => entries.filter((e) => (!action || e.action === action) && (!area || e.action.startsWith(`${area}.`))), [entries, action, area]);
  const columns: Column<AuditView>[] = [
    { key: 'at', label: 'Time', value: (e) => e.at, csv: (e) => fmtTool(e.at), render: (e) => <span className="dt-time">{fmtTool(e.at)}</span> },
    { key: 'who', label: 'Who', value: (e) => e.actorName || e.actor, render: (e) => <>{e.actorName || <span className="dt-muted">{e.actor}</span>}</> },
    { key: 'login', label: 'Username', value: (e) => e.actor.toLowerCase(), csvOnly: true },
    { key: 'action', label: 'Action', value: (e) => ACTION_WORDS[e.action] ?? e.action, render: (e) => <span className={`dt-chip log-${e.action.split('.')[0]}`}>{ACTION_WORDS[e.action] ?? e.action}</span> },
    { key: 'target', label: 'On', value: (e) => e.target, className: 'dt-mono' },
    { key: 'detail', label: 'Details', value: (e) => e.detail, render: (e) => <span className="dt-muted">{e.detail ?? ''}</span> },
  ];
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>Logs</h1>
        <p className="card__meta">Every change and sign-in, newest first. The latest 5,000 are kept.</p>
      </header>
      {error && <div className="banner banner--error">I can&apos;t load the log right now.</div>}
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(e) => String(e.id)}
        noun="entries"
        defaultSort={{ key: 'at', dir: 'desc' }}
        loading={isLoading}
        exportName="audit-log"
        filters={
          <>
            <label className="dt-field">
              Area
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">All</option>
                <option value="booking">Bookings</option>
                <option value="session">Sign-in</option>
                <option value="user">People</option>
                <option value="room">Rooms</option>
                <option value="message">Messages</option>
              </select>
            </label>
            <label className="dt-field">
              Action
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">All</option>
                {Object.entries(ACTION_WORDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />
    </div>
  );
}
