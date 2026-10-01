'use client';

/**
 * App state shared by the assistant panel and the map. UI events from the assistant (docs/spec/05-agent.md)
 * and the map's own search both land here, so the map reacts to events, never to the model's text.
 */
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { AlternativeView, ProposalView, RoomResultView, ScheduleView } from '../agent/context';
import type { AgendaType } from '../domain/types';
import type { CancelView } from '../services/prepareBooking';
import type { PublicBooking } from '../services/views';

export interface Slot {
  start: string;
  end: string;
}

export interface Results {
  flow: 'A' | 'B' | 'C' | 'none';
  agendaType: AgendaType;
  participants: number;
  results: RoomResultView[];
  alternatives: AlternativeView[];
  slot: Slot;
  source: 'assistant' | 'map';
  warnings?: string[];
}

export type ProposalStatus = 'open' | 'confirming' | 'booked' | 'expired' | 'conflict' | 'error';
export type CancelStatus = 'open' | 'working' | 'done' | 'kept' | 'expired' | 'error';

export type Card =
  | { id: string; type: 'results'; data: Results }
  | { id: string; type: 'proposal'; proposal: ProposalView; status: ProposalStatus; booking?: PublicBooking; error?: string }
  | { id: string; type: 'cancel'; cancel: CancelView; status: CancelStatus; error?: string }
  | { id: string; type: 'draft'; to: string; channel: 'teams' | 'email'; text: string; link: string }
  | { id: string; type: 'handoff'; topic: string; label: string; link: string }
  | { id: string; type: 'schedule'; schedule: ScheduleView };

export type Part = { kind: 'text'; text: string } | { kind: 'card'; card: Card };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: Part[];
  focus?: Slot;
  streaming?: boolean;
}

export interface Banner {
  kind: 'error' | 'info';
  text: string;
  retry?: string;
}

export type View = '2d' | '3d' | 'table';

export interface State {
  clockOffset: number | null;
  view: View;
  /** The assistant drawer is hidden (desktop: collapsed to the side; phone: shrunk to a bar). */
  chatHidden: boolean;
  /** A reply arrived while the drawer was hidden. */
  unread: boolean;
  messages: Message[];
  streaming: boolean;
  history: unknown[];
  confirmedTickets: string[];
  composer: string;
  banner: Banner | null;
  slot: Slot | null;
  floor: string;
  results: Results | null;
  selectedRoomId: string | null;
  sheetRoomId: string | null;
  bookingsOpen: boolean;
  newBookingOpen: boolean;
  assistantOpen: boolean;
  /** Messages with Admin: null = closed, ticketNo null = the list of threads, else that booking's thread. */
  inbox: { ticketNo: string | null } | null;
}

export type Action =
  | { type: 'clock'; offset: number; slot: Slot }
  | { type: 'user_message'; id: string; text: string }
  | { type: 'assistant_start'; id: string }
  | { type: 'text'; delta: string }
  | { type: 'focus'; slot: Slot }
  | { type: 'card'; card: Card }
  | { type: 'results'; results: Results }
  | { type: 'assistant_done'; history: unknown[] }
  | { type: 'assistant_error'; banner: Banner }
  | { type: 'update_card'; id: string; patch: Partial<Card> }
  | { type: 'confirmed'; ticketNo: string }
  | { type: 'banner'; banner: Banner | null }
  | { type: 'composer'; text: string }
  | { type: 'slot'; slot: Slot }
  | { type: 'floor'; floor: string }
  | { type: 'select'; roomId: string | null }
  | { type: 'sheet'; roomId: string | null }
  | { type: 'bookings'; open: boolean }
  | { type: 'inbox'; inbox: { ticketNo: string | null } | null }
  | { type: 'new_booking'; open: boolean }
  | { type: 'assistant_open'; open: boolean }
  | { type: 'clear_results' }
  | { type: 'view'; view: View }
  /** Select a room and bring it into view: its floor, optionally a time, and the map instead of the table. */
  | { type: 'show_room'; roomId: string; floor?: string; slot?: Slot; map?: boolean }
  | { type: 'chat_hidden'; hidden: boolean }
  /** "New chat": an empty conversation (the map and the time stay). */
  | { type: 'new_conversation' };

export const initial: State = {
  clockOffset: null,
  view: '2d',
  chatHidden: false,
  unread: false,
  messages: [],
  streaming: false,
  history: [],
  confirmedTickets: [],
  composer: '',
  banner: null,
  slot: null,
  floor: '2F',
  results: null,
  selectedRoomId: null,
  sheetRoomId: null,
  bookingsOpen: false,
  newBookingOpen: false,
  assistantOpen: false,
  inbox: null,
};

function lastIndex<T>(items: T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i] as T)) return i;
  return -1;
}

function updateLastAssistant(messages: Message[], fn: (m: Message) => Message): Message[] {
  const i = lastIndex(messages, (m) => m.role === 'assistant');
  if (i === -1) return messages;
  const copy = messages.slice();
  copy[i] = fn(copy[i] as Message);
  return copy;
}

function withCard(m: Message, card: Card): Message {
  return { ...m, parts: [...m.parts, { kind: 'card', card }] };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'clock':
      return { ...state, clockOffset: action.offset, slot: state.slot ?? action.slot };
    case 'user_message':
      return {
        ...state,
        banner: null,
        composer: '',
        chatHidden: false,
        unread: false,
        messages: [...state.messages, { id: action.id, role: 'user', parts: [{ kind: 'text', text: action.text }] }],
      };
    case 'assistant_start':
      return { ...state, streaming: true, messages: [...state.messages, { id: action.id, role: 'assistant', parts: [], streaming: true }] };
    case 'text':
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (m) => {
          const last = m.parts[m.parts.length - 1];
          if (last?.kind === 'text') return { ...m, parts: [...m.parts.slice(0, -1), { kind: 'text', text: last.text + action.delta }] };
          return { ...m, parts: [...m.parts, { kind: 'text', text: action.delta }] };
        }),
      };
    case 'focus': {
      // Request chips go under the user's message that asked for this time.
      const i = lastIndex(state.messages, (m) => m.role === 'user');
      const messages = state.messages.slice();
      if (i !== -1) messages[i] = { ...(messages[i] as Message), focus: action.slot };
      return { ...state, messages, slot: action.slot };
    }
    case 'card':
      return { ...state, messages: updateLastAssistant(state.messages, (m) => withCard(m, action.card)) };
    case 'results': {
      const top = action.results.results.find((r) => r.rank === 1) ?? action.results.results[0];
      return {
        ...state,
        results: action.results,
        slot: action.results.slot,
        floor: top?.floor ?? state.floor,
        selectedRoomId: null,
      };
    }
    case 'assistant_done':
      return {
        ...state,
        streaming: false,
        history: action.history,
        confirmedTickets: [],
        unread: state.chatHidden,
        messages: updateLastAssistant(state.messages, (m) => ({ ...m, streaming: false })),
      };
    case 'assistant_error':
      return {
        ...state,
        streaming: false,
        banner: action.banner,
        messages: updateLastAssistant(state.messages, (m) => ({ ...m, streaming: false })).filter((m) => m.role === 'user' || m.parts.length > 0),
      };
    case 'update_card':
      return {
        ...state,
        messages: state.messages.map((m) => ({
          ...m,
          parts: m.parts.map((p) => (p.kind === 'card' && p.card.id === action.id ? { kind: 'card', card: { ...p.card, ...action.patch } as Card } : p)),
        })),
      };
    case 'confirmed':
      return { ...state, confirmedTickets: [...state.confirmedTickets, action.ticketNo].slice(-5) };
    case 'banner':
      return { ...state, banner: action.banner };
    case 'composer':
      return { ...state, composer: action.text, ...(action.text && state.chatHidden ? { chatHidden: false, unread: false } : {}) };
    case 'slot':
      // A new time makes old search results stale: go back to plain free/taken colors.
      return { ...state, slot: action.slot, results: null };
    case 'floor':
      return { ...state, floor: action.floor };
    case 'select':
      return { ...state, selectedRoomId: action.roomId };
    case 'sheet':
      return { ...state, sheetRoomId: action.roomId, selectedRoomId: action.roomId ?? state.selectedRoomId };
    case 'bookings':
      return { ...state, bookingsOpen: action.open };
    case 'inbox':
      // A thread opened from My bookings replaces that sheet.
      return { ...state, inbox: action.inbox, ...(action.inbox ? { bookingsOpen: false } : {}) };
    case 'new_booking':
      return { ...state, newBookingOpen: action.open };
    case 'assistant_open':
      return { ...state, assistantOpen: action.open, ...(action.open ? { chatHidden: false, unread: false } : {}) };
    case 'clear_results':
      return { ...state, results: null };
    case 'view':
      return { ...state, view: action.view };
    case 'show_room': {
      const newSlot = action.slot && (action.slot.start !== state.slot?.start || action.slot.end !== state.slot?.end);
      return {
        ...state,
        selectedRoomId: action.roomId,
        floor: action.floor ?? state.floor,
        ...(newSlot ? { slot: action.slot, results: null } : {}),
        ...(action.map && state.view === 'table' ? { view: '2d' as const } : {}),
        bookingsOpen: false,
      };
    }
    case 'chat_hidden':
      return { ...state, chatHidden: action.hidden, unread: action.hidden ? state.unread : false };
    case 'new_conversation':
      if (state.streaming) return state; // the button is disabled while a reply streams
      return { ...state, messages: [], history: [], confirmedTickets: [], banner: null, composer: '', unread: false };
  }
}

const StateContext = createContext<State>(initial);
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <DispatchContext.Provider value={dispatch}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </DispatchContext.Provider>
  );
}

export const useAppState = () => useContext(StateContext);
export const useDispatch = () => useContext(DispatchContext);

/** The app's clock: the server's (demo) time, moving forward in real time. */
export function useNow(): () => Date {
  const { clockOffset } = useAppState();
  return useMemo(() => () => new Date(Date.now() + (clockOffset ?? 0)), [clockOffset]);
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
