'use client';

/**
 * Everything the UI can do: talk to the assistant over SSE (docs/spec/04-api.md, POST /api/assistant),
 * press card buttons, and search from the map without the assistant.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ProposalView, UiEvent } from '../agent/context';
import type { AgendaType } from '../domain/types';
import type { CancelView } from '../services/prepareBooking';
import { api, ApiError } from './api';
import { forgetUser } from './session';
import { readSse } from './sse';
import { newId, useAppState, useDispatch, type Card, type Results, type Slot } from './store';

const ASSISTANT_DOWN = "The assistant isn't available right now. You can still browse and book from the map.";

export function useActions() {
  const state = useAppState();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  const refreshBookings = () => {
    void queryClient.invalidateQueries({ queryKey: ['availability'] });
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };

  async function send(text: string) {
    const message = text.trim();
    if (!message || state.streaming) return;
    dispatch({ type: 'user_message', id: newId('u'), text: message });
    dispatch({ type: 'assistant_start', id: newId('a') });
    let focus: Slot | null = state.slot;
    let finished = false;
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history: state.history, confirmedTickets: state.confirmedTickets }),
      });
      if (res.status === 401) return forgetUser(queryClient, null); // the session ended: back to the sign-in screen
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        dispatch({ type: 'assistant_error', banner: { kind: 'error', text: body.message ?? ASSISTANT_DOWN, retry: res.status === 429 ? undefined : message } });
        return;
      }
      for await (const { event, data } of readSse(res.body)) {
        if (event === 'text') dispatch({ type: 'text', delta: (data as { delta: string }).delta });
        else if (event === 'done') {
          finished = true;
          dispatch({ type: 'assistant_done', history: (data as { history: unknown[] }).history });
        } else if (event === 'error') {
          finished = true;
          dispatch({ type: 'assistant_error', banner: { kind: 'error', text: (data as { message?: string }).message ?? ASSISTANT_DOWN, retry: message } });
        } else if (event === 'ui') {
          const e = data as UiEvent;
          switch (e.type) {
            case 'focus_time':
              focus = { start: e.start, end: e.end };
              dispatch({ type: 'focus', slot: focus });
              break;
            case 'room_results': {
              const results: Results = { ...e, slot: focus ?? { start: '', end: '' }, source: 'assistant' };
              dispatch({ type: 'results', results });
              dispatch({ type: 'card', card: { id: newId('c'), type: 'results', data: results } });
              break;
            }
            case 'proposal':
              dispatch({ type: 'card', card: { id: newId('c'), type: 'proposal', proposal: e.proposal, status: 'open' } });
              dispatch({ type: 'select', roomId: e.proposal.roomId });
              break;
            case 'cancel_request':
              dispatch({ type: 'card', card: { id: newId('c'), type: 'cancel', cancel: { proposalId: e.proposalId, ticketNo: e.ticketNo, summary: e.summary, expiresAt: e.expiresAt }, status: 'open' } });
              break;
            case 'draft_message':
              dispatch({ type: 'card', card: { id: newId('c'), type: 'draft', to: e.to, channel: e.channel, text: e.text, link: e.link } });
              break;
            case 'handoff':
              dispatch({ type: 'card', card: { id: newId('c'), type: 'handoff', topic: e.topic, label: e.label, link: e.link } });
              break;
            case 'room_schedule': {
              const { type: _type, ...schedule } = e;
              dispatch({ type: 'card', card: { id: newId('c'), type: 'schedule', schedule } });
              const only = schedule.rooms.length === 1 ? schedule.rooms[0] : undefined;
              if (only) dispatch({ type: 'show_room', roomId: only.roomId, floor: only.floor });
              break;
            }
          }
        }
      }
      if (!finished) dispatch({ type: 'assistant_error', banner: { kind: 'error', text: ASSISTANT_DOWN, retry: message } });
    } catch {
      // A read error after `done` (e.g. the tab was frozen) loses nothing; the reply is complete.
      if (!finished) dispatch({ type: 'assistant_error', banner: { kind: 'error', text: ASSISTANT_DOWN, retry: message } });
    }
  }

  async function confirmProposal(card: Extract<Card, { type: 'proposal' }>) {
    if (card.status !== 'open') return; // single flight (AC-5.2)
    dispatch({ type: 'update_card', id: card.id, patch: { status: 'confirming' } });
    try {
      const res = await api.confirm(card.proposal.id);
      dispatch({ type: 'update_card', id: card.id, patch: { status: 'booked', booking: res.booking } });
      if (res.booking) dispatch({ type: 'confirmed', ticketNo: res.booking.ticketNo });
      dispatch({ type: 'select', roomId: card.proposal.roomId });
      refreshBookings();
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      const status = e?.status === 409 ? 'conflict' : e?.status === 410 ? 'expired' : 'error';
      dispatch({ type: 'update_card', id: card.id, patch: { status, error: e?.message ?? 'That did not go through. Please try again.' } });
      if (status === 'conflict') refreshBookings();
    }
  }

  /** Expired or conflicting card: prepare the same booking again (same rules as the assistant). */
  async function checkAgain(card: Extract<Card, { type: 'proposal' }>) {
    const p = card.proposal;
    try {
      const { roomId, agendaType, agenda, participants, priority, trainingType, specialInstructions, hardwareRequirements, recurrence } = p;
      const proposal = await api.proposeBooking({
        ...{ roomId, agendaType, agenda, participants, priority, trainingType, specialInstructions, hardwareRequirements, recurrence },
        start: new Date(p.start),
        end: new Date(p.end),
      });
      dispatch({ type: 'update_card', id: card.id, patch: { proposal, status: 'open', error: undefined } });
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      dispatch({ type: 'update_card', id: card.id, patch: { status: e?.status === 409 ? 'conflict' : 'error', error: e?.message } });
    }
  }

  async function confirmCancel(card: Extract<Card, { type: 'cancel' }>) {
    if (card.status !== 'open') return;
    dispatch({ type: 'update_card', id: card.id, patch: { status: 'working' } });
    try {
      await api.confirm(card.cancel.proposalId);
      dispatch({ type: 'update_card', id: card.id, patch: { status: 'done' } });
      dispatch({ type: 'confirmed', ticketNo: card.cancel.ticketNo });
      refreshBookings();
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      dispatch({ type: 'update_card', id: card.id, patch: { status: e?.status === 410 ? 'expired' : 'error', error: e?.message } });
    }
  }

  /** Map-only booking (F11): shows the same proposal card in the assistant panel. */
  function showProposal(proposal: ProposalView) {
    dispatch({ type: 'assistant_start', id: newId('a') });
    dispatch({ type: 'text', delta: `Here is your booking to confirm. Nothing is booked until you press **Confirm booking**.` });
    dispatch({ type: 'card', card: { id: newId('c'), type: 'proposal', proposal, status: 'open' } });
    dispatch({ type: 'assistant_done', history: state.history });
    dispatch({ type: 'select', roomId: proposal.roomId });
    dispatch({ type: 'assistant_open', open: true });
  }

  /** A cancellation prepared elsewhere (a confirm link from an MCP client): the cancel card in the assistant panel. */
  function showCancel(cancel: CancelView) {
    dispatch({ type: 'assistant_start', id: newId('a') });
    dispatch({ type: 'text', delta: 'Here is the cancellation to confirm. Nothing is cancelled until you press **Cancel booking**.' });
    dispatch({ type: 'card', card: { id: newId('c'), type: 'cancel', cancel, status: 'open' } });
    dispatch({ type: 'assistant_done', history: state.history });
    dispatch({ type: 'assistant_open', open: true });
  }

  /** The shared search without the assistant; the map, 3D view and table all show the result. */
  async function mapSearch(req: { agendaType: AgendaType; participants: number; slot: Slot }): Promise<Results> {
    const r = await api.search({ agendaType: req.agendaType, participants: req.participants, start: new Date(req.slot.start), end: new Date(req.slot.end) });
    const results: Results = { flow: r.flow, agendaType: r.agendaType, participants: r.participants, warnings: r.warnings, results: r.results, alternatives: r.alternatives, slot: req.slot, source: 'map' };
    dispatch({ type: 'results', results });
    return results;
  }

  return { send, confirmProposal, checkAgain, confirmCancel, showProposal, showCancel, mapSearch, refreshBookings };
}

/**
 * Check in to, or cancel, one of your own bookings (My bookings and the table's Bookings tab).
 * Cancelling is two steps like the cancel card: prepare a proposal, then confirm it.
 */
export function useBookingOps(ticketNo: string) {
  const dispatch = useDispatch();
  const { refreshBookings } = useActions();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'That did not go through. Please try again.' });
    } finally {
      setWorking(false);
    }
  };

  return {
    working,
    message,
    confirmingCancel: cancelId !== null,
    checkIn: () =>
      run(async () => {
        await api.checkIn(ticketNo);
        setMessage({ kind: 'ok', text: 'Checked in. Enjoy your meeting!' });
        refreshBookings();
      }),
    askCancel: () => run(async () => setCancelId((await api.proposeCancel(ticketNo)).proposalId)),
    confirmCancel: () =>
      run(async () => {
        if (!cancelId) return;
        await api.confirm(cancelId);
        dispatch({ type: 'confirmed', ticketNo });
        setCancelId(null);
        refreshBookings();
      }),
    keep: () => setCancelId(null),
  };
}
