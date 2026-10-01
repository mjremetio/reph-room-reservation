import type { SuggestionGroup } from '../Suggestions';

/**
 * The Admin assistant's suggested questions, by topic (docs/spec/06-ui.md, Admin assistant). Each one is answered by
 * one of its tools (waiting_requests, find_bookings, room_schedule, usage_report), or starts a block or bulk booking
 * (the assistant asks for the rooms, time and reason, then shows the card), and passes the scope guardrail's keyword
 * check without the classifier (tested).
 */
export const ADMIN_SUGGESTIONS: readonly SuggestionGroup[] = [
  { topic: 'Approvals', items: ['What needs approval?', 'Which training requests are waiting?', 'Any hall requests waiting this week?'] },
  { topic: 'Today', items: ["What's booked today?", 'Any no-shows today?', 'Any cancellations today?'] },
  { topic: 'Rooms', items: ["What's booked on 3F today?", 'Who has Batanes tomorrow?', 'Which training rooms are free tomorrow afternoon?', 'Is MPH 2 free on Friday?'] },
  { topic: 'Reports', items: ['Which rooms were busiest this week?', 'How many no-shows this week?', 'How much were MPH 1 and MPH 2 used this month?', 'Who booked the most this month?'] },
  { topic: 'Blocks and bulk', items: ['Which rooms are blocked this week?', 'Block a room for maintenance', 'Book several rooms at once'] },
];
