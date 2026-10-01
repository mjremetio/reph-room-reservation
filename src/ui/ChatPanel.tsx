'use client';

/** The assistant panel (docs/spec/06-ui.md: ChatPanel, MessageBubble, SuggestionChips, RequestChips, Banner). */
import { useEffect, useRef, useState } from 'react';
import { useActions } from './actions';
import { useHealth } from './api';
import { ResultsCard } from './cards/ResultsCard';
import { ProposalCard } from './cards/ProposalCard';
import { CancelCard, DraftMessageCard, HandoffCard } from './cards/OtherCards';
import { ScheduleCard } from './cards/ScheduleCard';
import { fmtWhen } from './format';
import { RichText } from './RichText';
import { useAppState, useDispatch, type Card, type Message } from './store';
import { SuggestionGroups, type SuggestionGroup } from './Suggestions';

/** Suggested requests and frequent questions, by topic (docs/spec/06-ui.md, Suggestions). Each one works on the demo week. */
export const SUGGESTIONS: readonly SuggestionGroup[] = [
  {
    topic: 'Book a room',
    items: ['Room for 5 today from 3 to 4 PM', 'VC room for 8 tomorrow from 10 to 11 AM', 'Training room for 15 on Wednesday, 9 AM to 12 PM', 'Hall for 60 on Friday from 1 to 5 PM'],
  },
  {
    topic: 'Who has it',
    items: ['Who booked Central Park today?', 'Is Amsterdam free this afternoon?', "What's booked on 3F today?"],
  },
  {
    topic: 'My bookings',
    items: ['What are my bookings?', 'Check me in to my next meeting', 'Cancel my booking tomorrow'],
  },
  {
    topic: 'Questions',
    items: [
      'How far ahead can I book?',
      'When do I have to check in?',
      'Why is my booking "In Progress"?',
      'How do I share my screen in a VC room?',
      'Which 3F rooms have VC?',
      'How do I ask for extra equipment?',
    ],
  },
];

function CardView({ card }: { card: Card }) {
  switch (card.type) {
    case 'results':
      return <ResultsCard data={card.data} />;
    case 'proposal':
      return <ProposalCard card={card} />;
    case 'cancel':
      return <CancelCard card={card} />;
    case 'draft':
      return <DraftMessageCard card={card} />;
    case 'handoff':
      return <HandoffCard card={card} />;
    case 'schedule':
      return <ScheduleCard schedule={card.schedule} />;
  }
}

function MessageView({ m }: { m: Message }) {
  if (m.role === 'user') {
    const text = m.parts[0]?.kind === 'text' ? m.parts[0].text : '';
    return (
      <div className="msg msg--user">
        <div className="bubble">{text}</div>
        {m.focus && (
          <div className="request-chips" aria-label="Understood as">
            <span className="request-chip">Manila · Bldg. H</span>
            <span className="request-chip">{fmtWhen(m.focus.start, m.focus.end)}</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="msg msg--assistant">
      <div className="msg__who" aria-hidden>
        <span className="msg__avatar">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M7 1.5l1.4 3.1 3.1 1.4-3.1 1.4L7 10.5 5.6 7.4 2.5 6l3.1-1.4z" fill="currentColor" />
          </svg>
        </span>
        Room assistant
      </div>
      {m.parts.map((p, i) => (p.kind === 'text' ? <RichText key={i} text={p.text} /> : <CardView key={p.card.id} card={p.card} />))}
      {m.streaming && m.parts.length === 0 && (
        <div className="typing" aria-label="The assistant is typing">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}

/** Screen readers hear each finished reply once, not every streamed word. */
function useAnnouncement(messages: Message[], streaming: boolean): string {
  const last = messages[messages.length - 1];
  if (streaming || !last || last.role !== 'assistant') return '';
  return last.parts.map((p) => (p.kind === 'text' ? p.text.replace(/\*\*/g, '') : '')).join(' ');
}

export function ChatPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { send } = useActions();
  const { data: health } = useHealth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [ideas, setIdeas] = useState(false);
  const announcement = useAnnouncement(state.messages, state.streaming);
  const offline = health?.openai === 'missing';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages, ideas]);

  useEffect(() => {
    if (state.composer) inputRef.current?.focus();
  }, [state.composer]);

  const submit = () => {
    const text = state.composer.trim();
    if (text && !state.streaming) void send(text);
  };
  const pick = (text: string) => {
    setIdeas(false);
    void send(text);
  };

  return (
    <section
      id="assistant"
      className={`assistant${state.assistantOpen ? ' assistant--open' : ''}${state.chatHidden ? ' assistant--hidden' : ''}`}
      aria-label="Room assistant"
      data-focused={focused || undefined}
      inert={state.chatHidden}
    >
      <div className="assistant__head">
        <button
          className="assistant__title"
          onClick={() => dispatch({ type: 'assistant_open', open: !state.assistantOpen })}
          aria-label={state.assistantOpen ? 'Shrink the assistant' : 'Expand the assistant'}
        >
          <span className="msg__avatar" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M7 1.5l1.4 3.1 3.1 1.4-3.1 1.4L7 10.5 5.6 7.4 2.5 6l3.1-1.4z" fill="currentColor" />
            </svg>
          </span>
          Room assistant
          <span className="assistant__grip" aria-hidden />
        </button>
        {state.messages.length > 0 && (
          <button
            className="btn btn--secondary btn--small assistant__new"
            onClick={() => {
              dispatch({ type: 'new_conversation' });
              document.getElementById('composer')?.focus();
            }}
            disabled={state.streaming}
            title={state.streaming ? 'Wait for the reply to finish' : 'Clear this conversation and start a new one'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New chat
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'chat_hidden', hidden: true })}
          aria-label="Hide the assistant"
          aria-controls="assistant"
          aria-expanded="true"
          title="Hide the assistant"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="icon-btn__collapse">
            <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="assistant__scroll" ref={scrollRef}>
        {offline && (
          <div className="banner banner--info" role="status">
            <span className="banner__text">The assistant isn&apos;t set up yet (no OpenAI key). You can still browse and book from the map.</span>
          </div>
        )}
        {state.messages.length === 0 && (
          <div className="welcome">
            <h1>Book a room</h1>
            <p>Tell me when, how many people, and what it&apos;s for. Or ask who has a room, or anything about booking.</p>
            <SuggestionGroups groups={SUGGESTIONS} onPick={pick} disabled={offline} />
          </div>
        )}
        {state.messages.map((m) => (
          <MessageView key={m.id} m={m} />
        ))}
        {state.banner && (
          <div className={`banner banner--${state.banner.kind}`} role="alert">
            <span className="banner__text">{state.banner.text}</span>
            {state.banner.retry && (
              <button
                className="btn btn--secondary btn--small"
                onClick={() => {
                  const retry = state.banner?.retry;
                  dispatch({ type: 'banner', banner: null });
                  if (retry) void send(retry);
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {ideas && state.messages.length > 0 && (
          <div className="ideas" id="ideas">
            <SuggestionGroups groups={SUGGESTIONS} onPick={pick} disabled={offline || state.streaming} />
          </div>
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <form
        className="assistant__composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="composer">
          {state.messages.length > 0 && (
            <button
              type="button"
              className={`composer__ideas${ideas ? ' is-on' : ''}`}
              onClick={() => setIdeas((v) => !v)}
              aria-expanded={ideas}
              aria-controls="ideas"
              title="Suggestions and frequent questions"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path d="M9 2.5a4.5 4.5 0 00-2.6 8.2c.4.3.6.7.6 1.2V13h4v-1.1c0-.5.2-.9.6-1.2A4.5 4.5 0 009 2.5zM7 15.5h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">Suggestions</span>
            </button>
          )}
          <label htmlFor="composer" className="sr-only">
            Message the room assistant
          </label>
          <textarea
            id="composer"
            ref={inputRef}
            rows={1}
            maxLength={2000}
            placeholder={offline ? 'Assistant unavailable – use the map' : 'Room for 5 tomorrow, 3 to 4 PM…'}
            value={state.composer}
            disabled={offline}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => dispatch({ type: 'composer', text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="composer__send" type="submit" disabled={!state.composer.trim() || state.streaming || offline} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M9 15V3M4 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
