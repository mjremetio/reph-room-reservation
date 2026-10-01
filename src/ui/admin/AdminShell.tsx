'use client';

/**
 * The Admin area's frame (docs/spec/06-ui.md, Admin): its own query client, a top bar (back to the rooms, the clock,
 * sign out), the side navigation and the Admin assistant on the right, which hides and comes back like the room
 * assistant's drawer (its header's ›, the Assistant tab on the right edge). The pages fetch everything from
 * /api/admin/*, which checks the Admin role on every call; a 401 or 403 sends the browser back to the home page.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatManila } from '../../domain/time';
import { api, useHealth, useSession, useThreads, whenSignedOut } from '../api';
import { firstName } from '../format';
import { AdminAssistant } from './AdminAssistant';
import { AdminLive } from './AdminLive';
import { useServerNow } from './shared';
import { Brand } from '../Brand';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/rooms', label: 'Rooms' },
  { href: '/admin/logs', label: 'Logs' },
] as const;

/** Remembers whether the assistant is hidden ('1') or shown ('0'), like the room assistant's drawer (per browser). */
const ASSISTANT_KEY = 'reph-admin-chat-hidden';

/** Brings the hidden assistant back: a tab on the right edge (a bar at the bottom on phones), as on the main page. */
function AssistantReopen({ onOpen, dot }: { onOpen: () => void; dot: 'replying' | 'new reply' | null }) {
  return (
    <button className="chat-reopen chat-reopen--right no-print" onClick={onOpen} aria-controls="admin-assistant" aria-expanded="false">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path d="M3 4.5A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5v6a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 013 10.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="chat-reopen__label">Assistant</span>
      {dot && <span className="chat-reopen__dot" aria-label={dot} />}
    </button>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useSession();
  const { data: health } = useHealth();
  const { data: inbox } = useThreads();
  const now = useServerNow();
  const [hidden, setHidden] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(false);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [, tick] = useState(0);
  useEffect(() => whenSignedOut(() => window.location.assign('/')), []);
  useEffect(() => {
    try {
      if (localStorage.getItem(ASSISTANT_KEY) === '1') setHidden(true);
    } catch {
      // storage blocked: start open
    }
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const hide = (on: boolean) => {
    setHidden(on);
    if (!on) setUnread(false);
    try {
      localStorage.setItem(ASSISTANT_KEY, on ? '1' : '0');
    } catch {
      // a convenience only
    }
  };
  const onReply = useCallback(() => setUnread(hiddenRef.current), []);
  if (me === null) {
    // Signed out in another tab: sign in on the home page first.
    window.location.assign('/');
    return null;
  }
  return (
    <div className={`admin${hidden ? ' admin--no-assistant' : ''}`}>
      <header className="topbar admin-topbar">
        <a className="skip-link" href="#admin-main">
          Skip to the page
        </a>
        <Link className="brand-link" href="/admin">
          <Brand area="Admin" />
        </Link>
        <a className="btn btn--link btn--small" href="/">
          ‹ Back to rooms
        </a>
        <div className="topbar__spacer" />
        {health && (
          <span className="demo-clock" title="Asia/Manila, UTC+8">
            {formatManila(now())} <abbr className="demo-clock__zone">PHT</abbr>
          </span>
        )}
        {me && (
          <div className="user-menu">
            <span className="user-menu__name" title={me.name}>
              <span className="user-menu__avatar" aria-hidden>
                {firstName(me.name).charAt(0)}
              </span>
              <span className="user-menu__label">{firstName(me.name)}</span>
            </span>
            <button
              className="btn btn--link btn--small"
              onClick={() =>
                void api
                  .signOut()
                  .catch(() => undefined)
                  .then(() => window.location.assign('/'))
              }
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      <nav className="admin-nav no-print" aria-label="Admin">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`admin-nav__link${path === n.href ? ' is-active' : ''}`} aria-current={path === n.href ? 'page' : undefined}>
            {n.label}
            {n.href === '/admin/messages' && !!inbox?.unread && (
              <span className="count-badge" aria-label={`${inbox.unread} unread`}>
                {inbox.unread}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <main id="admin-main" className="admin-main">
        {children}
      </main>
      <div className="no-print admin-assistant-slot">
        <AdminAssistant hidden={hidden} onHide={() => hide(true)} onStreaming={setStreaming} onReply={onReply} />
      </div>
      {me && <AdminLive me={me.login} />}
      {hidden && <AssistantReopen onOpen={() => hide(false)} dot={streaming ? 'replying' : unread ? 'new reply' : null} />}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <Frame>{children}</Frame>
    </QueryClientProvider>
  );
}
