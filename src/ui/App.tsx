'use client';

/**
 * S1 home (docs/spec/06-ui.md): the sign-in screen until someone is signed in (and a new password after a reset), then
 * the top bar, assistant panel and map, plus the room sheet, My bookings and Messages. Admins also get a link to /admin.
 */
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { addMinutes, formatManila } from '../domain/time';
import { useActions } from './actions';
import { api, ApiError, useHealth, useSession, useThreads, whenSignedOut } from './api';
import { ChatPanel } from './ChatPanel';
import { ConnectAI } from './ConnectAI';
import { firstName } from './format';
import { MapPanel } from './MapPanel';
import { MessagesSheet } from './Messages';
import { MyBookings } from './MyBookings';
import { NewBooking } from './NewBooking';
import { RoomSheet } from './RoomSheet';
import { forgetUser, useMe, useSignOut } from './session';
import { SetPassword } from './SetPassword';
import { SignIn } from './SignIn';
import { StoreProvider, useAppState, useDispatch, useNow } from './store';
import { Brand } from './Brand';

/** Syncs the app clock with the server (so DEMO_NOW works in the browser) and sets the default slot: now, rounded to 30 minutes, for 1 hour. */
function ClockSync() {
  const { data } = useHealth();
  const dispatch = useDispatch();
  useEffect(() => {
    if (!data) return;
    const server = new Date(data.now);
    const offset = server.getTime() - Date.now();
    const start = new Date(Math.floor(server.getTime() / 1_800_000) * 1_800_000);
    dispatch({ type: 'clock', offset, slot: { start: start.toISOString(), end: addMinutes(start, 60).toISOString() } });
  }, [data, dispatch]);
  return null;
}

function TopBar() {
  const dispatch = useDispatch();
  const now = useNow();
  const { data: health } = useHealth();
  const me = useMe();
  const signOut = useSignOut();
  const { data: inbox } = useThreads();
  const [connectOpen, setConnectOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="topbar">
      <a className="skip-link" href="#composer">
        Skip to the assistant
      </a>
      <Brand />
      <label className="site-pill">
        <span className="sr-only">Site</span>
        <select defaultValue="Manila" aria-label="Site">
          <option value="Manila">Manila · Bldg. H</option>
          <option value="Iloilo" disabled>
            Iloilo (room list coming)
          </option>
        </select>
      </label>
      <div className="topbar__spacer" />
      {health && (
        <span className="demo-clock" title={health.clock === 'demo' ? 'Demo time (the demo week), Asia/Manila, UTC+8' : 'Now in Asia/Manila, UTC+8'}>
          {formatManila(now())} <abbr className="demo-clock__zone">PHT</abbr>
        </span>
      )}
      <button className="btn btn--secondary btn--small" onClick={() => dispatch({ type: 'bookings', open: true })}>
        My bookings
      </button>
      <button className="btn btn--secondary btn--small topbar__messages" onClick={() => dispatch({ type: 'inbox', inbox: { ticketNo: null } })}>
        Messages
        {!!inbox?.unread && (
          <span className="count-badge" aria-label={`${inbox.unread} unread`}>
            {inbox.unread}
          </span>
        )}
      </button>
      <button className="btn btn--primary btn--small topbar__new" onClick={() => dispatch({ type: 'new_booking', open: true })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        New booking
      </button>
      <div className="user-menu">
        <span className="user-menu__name" title={[me.name, me.division].filter(Boolean).join(' · ')}>
          <span className="user-menu__avatar" aria-hidden>
            {firstName(me.name).charAt(0)}
          </span>
          <span className="user-menu__label">{firstName(me.name)}</span>
        </span>
        {me.role === 'admin' && (
          <a className="btn btn--link btn--small" href="/admin">
            Admin
          </a>
        )}
        <button className="btn btn--link btn--small" onClick={() => setConnectOpen(true)} title="Use REPH Rooms from Claude, ChatGPT or another MCP app">
          AI apps
        </button>
        <button className="btn btn--link btn--small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {connectOpen && <ConnectAI onClose={() => setConnectOpen(false)} />}
    </header>
  );
}

/** Opens the card behind a confirm link (?confirm=<id>) that an AI app gave over MCP, once someone is signed in. */
function ConfirmLink() {
  const { showProposal, showCancel } = useActions();
  const dispatch = useDispatch();
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('confirm');
    if (!id) return;
    url.searchParams.delete('confirm');
    window.history.replaceState(null, '', url);
    api
      .proposal(id)
      .then((v) => (v.kind === 'book' ? showProposal(v.proposal) : showCancel(v.cancel)))
      .catch((err) => dispatch({ type: 'banner', banner: { kind: 'error', text: err instanceof ApiError ? err.message : 'That confirm link did not open.' } }));
    // Once per page load.
  }, []);
  return null;
}

const CHAT_KEY = 'reph-chat-hidden';

/** Remembers whether the assistant drawer is hidden (per browser, a convenience only). */
function ChatDrawerMemory() {
  const { chatHidden } = useAppState();
  const dispatch = useDispatch();
  const loaded = useRef(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAT_KEY) === '1') dispatch({ type: 'chat_hidden', hidden: true });
    } catch {
      // storage unavailable: start open
    }
    loaded.current = true;
  }, [dispatch]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(CHAT_KEY, chatHidden ? '1' : '0');
    } catch {
      // ignore
    }
  }, [chatHidden]);
  return null;
}

/** Brings the hidden assistant back: a tab on the left edge (desktop) or a bar at the bottom (phone). */
function ChatReopen() {
  const { chatHidden, unread, streaming } = useAppState();
  const dispatch = useDispatch();
  if (!chatHidden) return null;
  return (
    <button className="chat-reopen" onClick={() => dispatch({ type: 'chat_hidden', hidden: false })} aria-controls="assistant" aria-expanded="false">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path d="M3 4.5A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5v6a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 013 10.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="chat-reopen__label">Assistant</span>
      {(unread || streaming) && <span className="chat-reopen__dot" aria-label={streaming ? 'replying' : 'new reply'} />}
    </button>
  );
}

function Shell() {
  const state = useAppState();
  return (
    <div className="app">
      <ClockSync />
      <ConfirmLink />
      <ChatDrawerMemory />
      <TopBar />
      <div className={`main${state.chatHidden ? ' main--chat-hidden' : ''}`}>
        <ChatPanel />
        <MapPanel />
        <ChatReopen />
      </div>
      {state.sheetRoomId && <RoomSheet />}
      {state.bookingsOpen && <MyBookings />}
      {state.newBookingOpen && <NewBooking />}
      {state.inbox && <MessagesSheet />}
    </div>
  );
}

/**
 * Sign-in first. A 401 from any call (the session ended) goes back to the sign-in screen. The store is keyed by the
 * person, so the next person never sees the last one's chat.
 */
function Gate() {
  const client = useQueryClient();
  const { data: user, isPending, isError, refetch } = useSession();
  useEffect(() => whenSignedOut(() => forgetUser(client, null)), [client]);
  if (isPending) return <div className="app-loading" aria-busy="true" />;
  // A failed re-check keeps the last answer; only a first check that fails shows this.
  if (isError && user === undefined) {
    return (
      <main className="signin">
        <div className="signin__card" role="alert">
          <p>Can&apos;t reach the app server. Check your connection and try again.</p>
          <button className="btn btn--primary" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!user) return <SignIn />;
  if (user.mustChangePassword) return <SetPassword user={user} />;
  return (
    <StoreProvider key={user.login}>
      <Shell />
    </StoreProvider>
  );
}

export function App() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <Gate />
    </QueryClientProvider>
  );
}
