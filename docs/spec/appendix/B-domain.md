# Appendix B · Domain and service logic

Every exported function and constant of `src/domain` (except `routing.ts`, see 07) and `src/services`, with its exact behaviour, so the logic can be rebuilt without the codebase. Types and fields are in 03; data in appendix A. Strings in "quotes" are verbatim. All times are UTC `Date` values; "Manila" means UTC+8 all year (no daylight saving). Intervals are half-open `[start, end)`.

Layer rules: `src/domain` is pure (no I/O, no framework imports) and every change there needs a test in `src/domain/__tests__/`. `src/services` combines the domain with the `ReservationGateway`.

- B1 Time (`time.ts`) and people (`people.ts`)
- B2 Rules (`rules.ts`)
- B3 Availability (`availability.ts`)
- B4 Ranking (`ranking.ts`)
- B5 Swap options (`alternatives.ts`)
- B6 Recurrence (`recurrence.ts`)
- B7 Room search (`src/services/searchRooms.ts`)
- B8 Preparing bookings and cancellations (`src/services/prepareBooking.ts`, with `src/agent/proposals.ts`)
- B9 Views and the privacy filter (`src/services/views.ts`)
- B10 Acceptance checks (the domain and service tests)
- B11 Room schedule (`src/services/roomSchedule.ts`)

## B1 Time and people
`src/domain/time.ts`:
| Export | Behaviour |
|---|---|
| `MANILA_TZ = 'Asia/Manila'` | |
| `addMinutes(d, minutes)` | `new Date(d + minutes × 60 000 ms)` |
| `minutesBetween(from, to)` | `Math.round((to − from) / 60 000)` |
| `manila(year, month, day, hour = 0, minute = 0)` | The UTC instant of a Manila wall-clock time; `month` is 1–12. `Date.UTC(y, m − 1, d, h, min) − 8 h` |
| `manilaMinuteOfDay(d)` | Minutes since Manila midnight, 0–1439 |
| `manilaStartOfDay(d)` | The instant of Manila midnight that starts `d`'s Manila calendar day |
| `manilaStartOfWeek(d)` | Manila midnight on the Monday of `d`'s Manila week: `manilaStartOfDay(d)` minus `(weekday + 6) % 7` days, where `weekday` is the Manila day of the week (0 = Sunday). Used by `scenarioInWeekOf` (appendix A2) |
| `formatManila(d)` | `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })` → "Mon, Sep 28, 3:00 PM" |
| `formatRange(start, end)` | "Mon, Sep 28, 3:00 PM – 4:00 PM" (space, en dash, space). The end shows only its time when `end − 1 min` is on the same Manila day as `start`; otherwise the full date: "Mon, Sep 28, 10:00 PM – Tue, Sep 29, 2:00 AM". Time-only format: `{ timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }` |

`src/domain/people.ts`: `sameEmail(a, b)` = both present (non-empty) and equal ignoring case. The one identity comparison in the app; a missing email never matches (so a viewer email of `''` owns nothing).

## B2 Rules
`src/domain/rules.ts`. Source comment: "Room Reservation Guidelines" v3.0 (Corporate Services – Admin, Jan 2025) and the current reservation form; anything OPEN must be confirmed with Admin (RULES.md).

### `RULES`
| Key | Value | Source / note |
|---|---|---|
| `maxDaysAhead` | `{ Meeting: 10, Training: 90, 'Multi-purpose': 90, Pantry: null, 'Lactation Room': null }` (`null` = no limit known) | Guidelines p.11 (meetings 10) vs form note (90) [OPEN]; the stricter 10 until Admin confirms |
| `checkInGraceMinutes` | 15 | Guidelines p.6, p.11: released 15 min after the start |
| `checkInOpensMinutesBefore` | 60 | Guidelines p.6 reminder 1 h before [OPEN: when check-in opens] |
| `mphMinParticipants` | 51 | Guidelines p.10: halls for groups exceeding 50 |
| `trainingShifts` | `[{ label: '6 AM–2 PM', startMin: 360, endMin: 840 }, { label: '2 PM–10 PM', startMin: 840, endMin: 1320 }, { label: '10 PM–6 AM', startMin: 1320, endMin: 1800 }]` (minutes from midnight; the night shift runs past 24:00) | Guidelines p.11 |
| `startGraceMinutes` | 5 | App rule: a request may start up to 5 min ago |
| `proposalHoldMinutes` | 3 | App rule: how long a proposal waits for Confirm |
| `linkProposalHoldMinutes` | 15 | App rule: how long a proposal an AI app prepared over MCP waits (the person opens its confirm link from that app); it holds no room |
| `maxSeriesDates` | 100 | App rule: dates in one recurring request |
| `windowAppliesToEveryDate` | true | [OPEN] the booking window applies to every date of a series |
| `oneRoomPerPersonAtATime` | true | App rule (the owner's request, 28 Sep 2026) [OPEN]: a requestor can't hold two rooms at overlapping times |

### Issues
`IssueCode` = `END_BEFORE_START`, `IN_PAST`, `TOO_FAR_AHEAD`, `NO_PARTICIPANTS`, `AGENDA_MISSING`, `AGENDA_TOO_GENERIC`, `MPH_SMALL_GROUP`, `TRAINING_SHIFT`, `NOT_SELF_BOOKABLE`, `WRONG_SITE`, `URGENT_NOT_ALLOWED`. `Issue = { code, message, blocking }` (`blocking: false` = warn and continue).

`FormField` = `agenda`, `participants`, `time`, `priority`, `room`, `hardware`, `recurrence` (the form part to mark red; there is no requestor field any more: the requestor is the signed-in person). `ISSUE_FIELD`: END_BEFORE_START, IN_PAST, TOO_FAR_AHEAD, TRAINING_SHIFT → `time`; NO_PARTICIPANTS, MPH_SMALL_GROUP → `participants`; AGENDA_MISSING, AGENDA_TOO_GENERIC → `agenda`; URGENT_NOT_ALLOWED → `priority`; NOT_SELF_BOOKABLE, WRONG_SITE → `room`.

### `checkAgendaTitle(title?)` → `Issue | null`
`t = (title ?? '').trim().toLowerCase()` with trailing `.`, `!`, `?` and spaces removed (`/[.!?\s]+$/`).
- empty → `AGENDA_MISSING`, blocking: "Add the title of the meeting or training, for example "Weekly touchpoint meeting"."
- `t` in `GENERIC_TITLES` = `meeting, meetings, mtg, training, trainings, meeting room, training room, room, reservation, booking, test, n/a, na, tbd` → `AGENDA_TOO_GENERIC`, blocking: ""Meeting" or "Training" on its own is not accepted. Use the actual title, for example "New Doc Process – Content Analysis"."
- else `null`.

### `fitsOneTrainingShift(start, end)` → boolean
```
duration = minutesBetween(start, end); if duration <= 0: false
s = manilaMinuteOfDay(start); if s < 360: s += 1440      // 00:00–05:59 belongs to last night's 10 PM shift
shift = first of trainingShifts with startMin <= s < endMin
return shift exists and s + duration <= shift.endMin
```
E.g. 9 AM–1 PM true; 1–3 PM false; 10 PM–6 AM true; 5:00–6:30 AM false.

### `validateRequest(req, now, opts = {})` → `Issue[]`
`opts = { forBooking?, room?, priority? }`. Checks, in this order (all that apply are returned):
1. `end <= start` → `END_BEFORE_START`, blocking: "The end time must be after the start time."
2. `start < now − startGraceMinutes` → `IN_PAST`, blocking: "That time has already passed."
3. `maxDays = maxDaysAhead[agendaType]`; if not null and `start − now > maxDays × 24 h` → `TOO_FAR_AHEAD`, blocking: "`<agendaType>` bookings can be made up to `<maxDays>` days ahead." (e.g. "Meeting bookings can be made up to 10 days ahead.")
4. participants not a whole number ≥ 1 → `NO_PARTICIPANTS`, blocking: "Add the number of participants."
5. `agendaType === 'Multi-purpose'` and `participants < 51` → `MPH_SMALL_GROUP`, **not** blocking: "The multi-purpose hall is meant for groups over 50. A meeting or training room may fit better."
6. `agendaType === 'Training'` and not `fitsOneTrainingShift` → `TRAINING_SHIFT`, blocking: "Training bookings must fit within one shift: 6 AM–2 PM, 2 PM–10 PM or 10 PM–6 AM."
7. with `opts.room`: not `selfBookable` → `NOT_SELF_BOOKABLE`, blocking: "`<room.name>` is booked through Admin, not self-service."; `room.site !== req.site` → `WRONG_SITE`, blocking: "`<room.name>` is in `<room.site>`, not `<req.site>`."
8. with `opts.forBooking`: `checkAgendaTitle(req.agenda)` if it returns an issue.
9. `opts.priority === 'Urgent'` and not `urgentAllowed(agendaType, start, now)` → `URGENT_NOT_ALLOWED`, blocking: "Urgent is only for training that starts in less than two weeks, or a meeting within the next 24 hours. Use Normal."

Searches call it without `opts` (no agenda check); bookings call it with `{ forBooking: true, room, priority }`.

### Other rules
- `urgentAllowed(agendaType, start, now)`: `hours = (start − now) / 1 h`; `hours < 0` → false; Training → `hours < 336` (14 days); Meeting → `hours <= 24`; any other type → false. [OPEN: "12–24 business hours" in a 24/7 office; plain hours used.]
- `checkInWindow(b)` → `{ start: b.start − 60 min, end: b.start + 15 min }` (half-open: open while `start <= now < end`).
- `shouldAutoRelease(b, now)` → status is Approved or In Progress and `now >= b.start + 15 min`. (Exact at 10:15 for a 10:00 booking; a Checked-In booking is never released.) Not scheduled yet (P3).
- `bookableFrom(now)`: the earliest start a booking can have now. `quarter = 15 min`; `floor = now` rounded down to the quarter; if `now − floor <= RULES.startGraceMinutes` (5 min) → `floor`, else `floor + 15 min` (9:00 → 9:00, 9:04 → 9:00, 9:06 → 9:15, 23:51 → 0:00 the next day). Free times shown to people start here (B11).

## B3 Availability
`src/domain/availability.ts`.
- `isBlocking(b, now)`: Cancelled, Completed → false; Held → `holdExpiresAt` set and `> now`; In Progress, Approved, Checked-In → true.
- `overlaps(a, b)` = `a.start < b.end && b.start < a.end` (back-to-back does not overlap).
- `conflictsFor(roomId, want, bookings, now)`: bookings in that room that block and overlap `want`, sorted by start.
- `ownConflicts(email, want, bookings, now)`: bookings of that owner (`sameEmail`) in **any** room that block and overlap `want`, sorted by start (`RULES.oneRoomPerPersonAtATime`). Back-to-back and cancelled bookings don't count.
- `freeIntervals(roomId, window, bookings, now, minMinutes = 15)`:
  ```
  busy = conflictsFor(roomId, window, …)                 // sorted by start
  cursor = window.start; free = []
  for b in busy:
    bs = max(b.start, window.start); be = min(b.end, window.end)
    if bs > cursor: free.push([cursor, bs])
    cursor = max(cursor, be)                              // overlapping bookings merge
  if cursor < window.end: free.push([cursor, window.end])
  return free with minutesBetween(start, end) >= minMinutes   // slivers under 15 min dropped
  ```
- `Availability` = `{ kind: 'available' }` | `{ kind: 'partial', free: Interval[], conflicts: Booking[] }` | `{ kind: 'unavailable', conflicts: Booking[] }`.
- `availabilityFor(roomId, want, bookings, now, minMinutes = 15)`: no conflicts → available; else free parts (as above) non-empty → partial, else unavailable. So a room busy 2:10–3:00 PM for a 2:00–3:00 PM request is **unavailable** (the 10-minute sliver is ignored).
- `nearestFreeSlots(roomId, want, bookings, now, { stepMinutes = 15, searchHours = 8, limit = 3 })`: the same room at nearby times with the same length:
  ```
  length = minutesBetween(want.start, want.end); found = []
  for offset = step; offset <= searchHours × 60 and found.length < limit; offset += step:
    for direction in [+1, −1]:                            // later first, then earlier
      if found.length >= limit: break
      start = want.start + direction × offset; if start < now: continue
      candidate = [start, start + length]
      if candidate overlaps any found: continue
      if no conflicts for candidate: found.push(candidate)
  return found
  ```

## B4 Ranking
`src/domain/ranking.ts`.
- `ROOM_KINDS_FOR`: Meeting → Meeting, Collaboration, Huddle; Training → Training; Multi-purpose → Multi-purpose; Pantry → Pantry; Lactation Room → Lactation Room.
- `Fit` = `'right size' | 'roomy' | 'oversized' | 'unknown size'`. `Scored = { room, score, fit, reasons: string[] }`.
- `scoreRoom(room, req, walkSeconds?)` → `Scored | null`:
  ```
  null if !room.selfBookable or room.site != req.site or room.kind not in ROOM_KINDS_FOR[req.agendaType]
       or (room.capacity != null and room.capacity < req.participants)
  score = 100
  if capacity == null: score −= 25; fit 'unknown size'; reason "capacity not on file"
  else: spare = capacity − participants; ratio = spare / capacity
    spare <= 1        → fit 'right size'; reason "right size"
    ratio <= 0.5      → fit 'roomy'; score −= ratio × 30; reason "<spare> spare seats"
    else              → fit 'oversized'; score −= 30 + ratio × 30; reason "seats <capacity>, much bigger than needed"
  if req.needsVC: av == 'VC' → reason "has video conferencing"; else score −= 20, reason "no video conferencing kit"
  if walkSeconds given: score −= min(30, walkSeconds / 10);
       reason walkSeconds < 60 ? "under 1 min away" : "about <round(walkSeconds / 60)> min away"
  score = round(score × 10) / 10
  ```
  Walking times are not passed anywhere yet (P2, routing).
- `rankRooms(rooms, req, walkSecondsTo?)`: `scoreRoom` each, drop nulls, sort by score descending, then room name `localeCompare` ascending (so equal scores are alphabetical: Amsterdam, Bacolod, Batanes, Cape Town, Coron …).

## B5 Swap options
`src/domain/alternatives.ts`. `SAME_FLOOR_BONUS = 5`.

`swapOptionsFor(blocking, rooms, bookings, now, limit = 3)`: rooms that could host the **owner's** booking instead (flows B and C), so the assistant can offer a swap.
```
current = room of blocking; if none: []
ownerNeeds = { site: current.site, agendaType: blocking.agendaType, start, end, participants: blocking.participants }   // no VC need
candidates = rooms except current, fully available for [blocking.start, blocking.end)
ranked = rankRooms(candidates, ownerNeeds)
  then on the same floor as current: score += 5 and reason "same floor" appended
sort by score descending, then name; take the first `limit`
```

## B6 Recurrence
`src/domain/recurrence.ts` (the tool form's Recurrence, Guidelines 3.6, p.6–7).
- `WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']`, `WEEK_OF_MONTH = ['First', 'Second', 'Third', 'Fourth', 'Last']`.
- `Recurrence`: `{ freq: 'Daily', every, until }` | `{ freq: 'Weekly', every, days: Weekday[], until }` | `{ freq: 'Monthly', every, on: { day } | { week, weekday }, until }` | `{ freq: 'Yearly', every, until }`. `RecurrenceJson` is the same with `until` an ISO string; `toRecurrenceJson` / `fromRecurrenceJson` convert only `until`.

`expandRecurrence(first, rec, max = 100)` → `Interval[]`, in order, first date included **only if it matches the pattern**. Works on Manila calendar dates; every date keeps the first date's Manila start hour and minute and the first interval's length.
```
start = Manila date and time of first.start; length = first.end − first.start
firstKey = key(start date); untilKey = key(Manila date of rec.until)       // key = Date.UTC(y, m−1, d)
every = max(1, floor(rec.every)); keys = []
push(k): if firstKey <= k <= untilKey and keys.length < max: keys.push(k)
Daily:   for k = firstKey; k <= untilKey and keys.length < max; k += every days: push(k)
Weekly:  days = rec.days as weekday indexes, sorted (empty → the first date's weekday)
         for w = Sunday of the first week; w <= untilKey and keys.length < max; w += every × 7 days:
           for i in days: push(w + i days)
Monthly: for n = 0, every, 2×every …  while keys.length < max:
           (y, m) = start month + n; if key(y, m, 1) > untilKey: stop
           on.day:  if day <= daysInMonth(y, m): push(key(y, m, day))        // a missing day 31 skips the month
           on.week: d = first `weekday` of the month
                    Last → keep adding 7 while still in the month; First…Fourth → d + index × 7
                    if d <= daysInMonth: push
Yearly:  for y = start.y; key(y, 1, 1) <= untilKey and keys.length < max; y += every:
           if start.d <= daysInMonth(y, start.m): push(key(y, start.m, start.d))   // Feb 29 only in leap years
dates = keys → manila(y, m, d, start.hour, start.minute) with end = start + length
```
`describeRecurrence(rec)` (cards, tables, CSV): `until` as `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })` → "Nov 25, 2026".
| freq | every = 1 | every = N > 1 |
|---|---|---|
| Daily | "Daily until Oct 2, 2026" | "Every N days until …" |
| Weekly | "Weekly on Wednesday until Nov 25, 2026" (days joined with ", ", in the given order) | "Every N weeks on Monday, Wednesday until …" |
| Monthly | "Monthly on day 31 until …" / "Monthly on the third Thursday until …" (week lower-case) | "Every N months on the third Thursday until Mar 1, 2027" |
| Yearly | "Yearly until …" | "Every N years until …" |

## B7 Room search
`src/services/searchRooms.ts`, the one search used by the `find_rooms` tool, `POST /api/search` and the map.
- `SEARCH_LIMITS = { fullyFree: 5, partlyFree: 3, taken: 3, alternativeRooms: 3, alternativesPerRoom: 2 }`.
- `RoomMatch = Scored & { availability }`; `Alternative = { room, start, end }`; `Flow = 'A' | 'B' | 'C' | 'none'`; `SearchResult = { ok, problems: string[], warnings: string[], request, flow, fullyFree, partlyFree, taken, alternatives }`.

`searchRooms(gw, req, now, requesterEmail?)`:
```
issues = validateRequest(req, now)                    // no agenda check, no room
problems = blocking messages; warnings = non-blocking messages (e.g. MPH_SMALL_GROUP)
if problems: return { ok: false, problems, warnings, flow: 'none', request: req, all lists empty }
rooms = gw.listRooms(req.site)
bookings = gw.getBookings({ roomIds: all those rooms, from: req.start − 12 h, to: req.end + 12 h })
matches = rankRooms(rooms, req) each with availability = availabilityFor(room, req, bookings, now)   // ranked order kept
fullyFree  = matches with 'available',   first 5
partlyFree = matches with 'partial',     first 3
taken      = matches with 'unavailable', first 3
alternatives = fullyFree non-empty ? [] :
   for the first 3 matches (any availability): nearestFreeSlots(room, req, bookings, now, { limit: 2 }) → { room, start, end }
flow = fullyFree ? 'A' : partlyFree ? 'B' : taken ? 'C' : 'none'    // 'none' = no suitable room at the site (e.g. Iloilo)
if requesterEmail and flow != 'none':                  // one room per person
   for each line of ownBookingClashes(gw, requesterEmail, [req], now):
      warnings.push(line + " One room per person at a time: cancel it first, or pick another time.")
return { ok: true, problems (empty), warnings, request, flow, fullyFree, partlyFree, taken, alternatives }
```

## B8 Preparing bookings and cancellations
`src/services/prepareBooking.ts`, the only place proposals are prepared (the assistant's `propose_booking` / `request_cancellation` and `POST /api/proposals`). It never books; the button calls `POST /api/proposals/{id}`.

`BookingDraft = { roomId, agendaType, agenda, start, end, participants, priority?, trainingType?, specialInstructions?, hardwareRequirements?: string[], recurrence? }`.
`Prepared<T> = { ok: true, value: T } | { ok: false, code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_ALLOWED', problems: string[], fields?: FormField[] }`.
`dateLabel(d)` = `formatManila(d)` without the time: "Tue, Oct 6".

`prepareBooking(gw, user, draft, now, holdMinutes = RULES.proposalHoldMinutes)` → `Prepared<{ proposal: ProposalView, summary: string }>`:
1. Room = `gw.listRooms()` (all sites) by id; missing → `NOT_FOUND`, "Unknown room "`<id>`".", fields `['room']`.
2. `req = { site: room.site, ...draft }`; `priority = draft.priority ?? 'Normal'`; blocking issues of `validateRequest(req, now, { forBooking: true, room, priority })` → `INVALID`, problems = their messages, fields = the distinct `ISSUE_FIELD`s.
3. Any hardware not in `HARDWARE_OPTIONS` → `INVALID`, "Unknown hardware option: `<a, b>`.", fields `['hardware']`.
4. Dates = `expandRecurrence(req, recurrence, 101)` or the single interval. None → `INVALID`, "The repeat pattern gives no dates before the end date.", `['recurrence']`. More than 100 → `INVALID`, "A repeating booking can have at most 100 dates.", `['recurrence']`.
5. A series with `windowAppliesToEveryDate`: `validateRequest({ ...req, ...date }, now)` (no forBooking) for every date; blocking ones as "`<dateLabel>`: `<message>`" (first 5) → `INVALID`, `['recurrence']`.
6. Bookings of the room from the first start to the last end; for every date `availabilityFor` (not available → "`<dateLabel>`: taken by `<owner names joined ", ">`"). Any clash → `CONFLICT`: a series → problems "`<room.name>` is not free on `<n>` of `<total>` dates." then the first 5 clash lines, fields `['room', 'recurrence']`; a single booking → "`<room.name>` is no longer free for that whole time.", fields `['room', 'time']`.
7. One room per person: `ownBookingClashes(gw, user.email, dates, now)` (below). Any line → `CONFLICT`: a series → "One room per person at a time: you already have a room on `<n>` of `<total>` dates." then the first 5 lines, fields `['time', 'recurrence']`; a single booking → "`<line>` One room per person at a time.", fields `['time']`.
8. Clean-up: `trainingType` = Training ? (`draft.trainingType ?? 'On-Site'`) : dropped; `specialInstructions` trimmed, empty → dropped; `hardwareRequirements` empty → dropped.
9. `createProposal({ kind: 'book', userEmail: user.email, booking: { ...draft, priority, trainingType, specialInstructions, hardwareRequirements, requester: user } }, now, holdMinutes)` (the agent tools pass `ctx.proposalHoldMinutes`: 15 over MCP, else the default 3).
10. `summary` = "`<room.name>`, `<floor>` · `<formatRange(start, end)>` · `<agenda>`" plus for a series " · `<n>` dates, `<describeRecurrence>`". `proposal` (`ProposalView`) = `{ id, requester: user.name, roomId, roomName, floor, start, end (ISO), agendaType, agenda, participants, priority }` plus `trainingType`, `specialInstructions`, `hardwareRequirements` when kept, plus for a series `recurrence` (JSON) and `dates` (ISO start of every date), plus `expiresAt` (ISO). The view is also stored on the proposal as `view = { kind: 'book', proposal }` (confirm links).

`ownBookingClashes(gw, email, dates, now)` → `string[]` (exported; also used by `searchRooms`): `[]` when `RULES.oneRoomPerPersonAtATime` is off or there are no dates. Else `mine = gw.listMyBookings(email, first date's start, last date's end)` (none → `[]`) and, for every date, each `ownConflicts(email, date, mine, now)` becomes "You already have `<room.name>`, `<floor>` on `<formatRange(start, end)>` (`<ticketNo>`)." (room id when the room is unknown), e.g. "You already have Tokyo, 2F on Mon, Sep 28, 10:00 AM – 11:00 AM (RM-0129902)."

`prepareCancellation(gw, user, ticketNo, now, holdMinutes = RULES.proposalHoldMinutes)` → `Prepared<CancelView>`:
- booking missing or not the user's (`sameEmail`) → `NOT_ALLOWED`, "I can only cancel your own bookings." (no fields)
- status Cancelled or Completed → `INVALID`, "This booking is already `<status lower-case>`."
- else `createProposal({ kind: 'cancel', userEmail, ticketNo }, now, holdMinutes)` and `CancelView = { proposalId, ticketNo, summary: "<agenda> · <room.name>, <floor> · <formatRange>" (room id if the room is unknown), expiresAt }`, also stored as the proposal's `view = { kind: 'cancel', cancel }`.

Proposal store (`src/agent/proposals.ts`, in memory): `createProposal(p, now, holdMinutes = 3)` adds `id` (random UUID) and `expiresAt = now + holdMinutes`. `peekProposal(id, userEmail, now)`: the proposal without removing it, only for the same user (`sameEmail`) before it expires, else null (`GET /api/proposals/{id}`). `takeProposal(id, userEmail, now)`: unknown id → null; a different user (`sameEmail`) → null and the proposal **stays**; the same user → removed, returned if `expiresAt > now`, else null (single use either way).

## B9 Views and the privacy filter
`src/services/views.ts`, shared by the agent tools and the routes so every surface sees the same data. Dates become ISO strings.
- `roomView(r)` = `{ id, name, toolName, site, building, floor, kind, av, capacity, selfBookable }` (no `notes`).
- `publicBooking(b, viewerEmail)`, **the privacy filter**: `mine = sameEmail(b.owner.email, viewerEmail)`; always `{ ticketNo, roomId, start, end, status, owner: <name>, division: <division or null>, participants, mine }`; only when `mine`, also `agenda, agendaType, priority, trainingType, specialInstructions, hardwareRequirements, recurrence (JSON), createdBy, createdAt (ISO), modifiedBy, adminComments`. Never an email.
- `searchResultViews(result, viewerEmail)` → `{ results: RoomResultView[], alternatives: AlternativeView[] }`: results = fully free with `rank` 1…n, then partly free, then taken (no rank). Each `RoomResultView = { roomId, name, floor, availability: kind, rank?, reasons, free? (partial only: [{ start, end }]), conflicts? (not for available: [{ ticketNo, start, end, owner: name, division, participants, status, mine: sameEmail(owner email, viewerEmail) }]) }`. `AlternativeView = { roomId, name, floor, start, end }`.
- `scheduleView(result)` (an ok `ScheduleResult`, B11) → `ScheduleView = { start, end (ISO), rooms: [{ roomId, name, floor, bookings (PublicBooking[]), free: [{ start, end }] }], more, freeRooms: [{ roomId, name, floor }] }`.

## B10 Acceptance checks
The domain and service tests; a rebuild should pass the same checks. Test clock for rules and availability: Sat, Sep 26, 2026, 9:00 AM Manila; demo-scenario tests: Mon, Sep 28, 9:00 AM.

Rules (`rules.test.ts`):
- "Meeting", "training ", "MEETING.", "Training!" → AGENDA_TOO_GENERIC; "" and undefined → AGENDA_MISSING; "Q4 pipeline review" → null.
- Training shift: Mon 9 AM–1 PM true; 1–3 PM false; Mon 10 PM–Tue 6 AM true; Tue 5:00–6:30 AM false.
- A Meeting on Thu, Oct 8 is TOO_FAR_AHEAD (from Sat, Sep 26); Mon, Sep 28 is not; a Training on Oct 8 is not.
- Multi-purpose for 20 → MPH_SMALL_GROUP, not blocking.
- No agenda: no AGENDA_MISSING for a search, yes with `forBooking`; a Visitor Office room → NOT_SELF_BOOKABLE.
- `end == start` → END_BEFORE_START; Fri, Sep 25 → IN_PAST.
- Tokyo 10:00–11:00: check-in window 9:00–10:15; `shouldAutoRelease` false at 10:14, true at 10:15, false when Checked-In at 10:30.
- `urgentAllowed`: Training Mon Oct 5 true, Mon Oct 12 false; Meeting Sun Sep 27 8:00 AM true, Mon Sep 28 3 PM false. Urgent booking for a meeting 6 hours away passes; 2 days away → URGENT_NOT_ALLOWED; Normal never triggers it.

Availability (`availability.test.ts`): 3–4 PM and 4–5 PM don't overlap, 3:30–4:30 does; Cancelled and expired Held don't block, a live Held does; `ownConflicts` for Alpha (any case) at 3–4 PM finds only Tokyo 3:30–4:30 (not Cape Town 2–3 back to back, not a cancelled Jolo, not Bravo's Rio), and nothing for an unknown email; Central Park 2–4 PM against a 3:00–4:30 booking → partial, free 2–3 PM, conflict owner "Tester, Alpha"; a hall 12–6 PM covers 1–5 PM → unavailable; a 2:10–3:00 booking makes 2–3 PM unavailable (sliver); a 10 PM–6 AM booking blocks 1–2 AM next day; 9:30–10:30 and 10:00–11:00 merge → free 9:00–9:30 and 11:00–1:00 PM; nearest slots (limit 2) are free and don't overlap each other.

Ranking (`ranking.test.ts`, 5 people Mon 3–4 PM, walk seconds Cape Town 40, Amsterdam 60, Batanes 120, Central Park 45, London 70): order Cape Town, Amsterdam, Batanes, Central Park, London (London "oversized"); Binondo (4 seats), Snowdon (training) and a visitor office are excluded, Cape Town at site Iloilo is excluded; Paris (unknown capacity) ranks below Cape Town with fit "unknown size"; asking for VC lowers Cape Town (BYOD).

Recurrence (`recurrence.test.ts`, first date Mon, Sep 28, 3–4 PM): Daily until Sep 30 → Sep 28, 29, 30 at 3:00 PM, 1 hour each; Weekly every 2 on Monday, Wednesday until Oct 14 → Sep 28, Sep 30, Oct 12, Oct 14; Weekly on Thursday until Oct 8 → Oct 1, Oct 8; Monthly day 31 from Sun, Jan 31, 2027 9 AM until May 31 → Jan 31, Mar 31, May 31; Monthly third Thursday until Dec 31 → Oct 15, Nov 19, Dec 17; Monthly last Friday until Nov 30 → Oct 30, Nov 27; Yearly until Dec 31, 2029 → 4 dates; Daily with max 10 → 10 dates; `describeRecurrence` Weekly on Wednesday until Nov 25, 2026 → "Weekly on Wednesday until Nov 25, 2026".

Swaps (`alternatives.test.ts`): for Central Park 3:00–4:30 PM (5 people, Cape Town busy from 4 PM): 1–3 options, never Central Park, Cape Town or Binondo, all fully free, the first on 2F.

Search on the demo scenario (`searchRooms.test.ts`):
- Flow A, 5 people Mon 3–4 PM: flow A; ranks 1–3 Amsterdam, Bacolod, Batanes (then Cape Town, Coron); Central Park, London, Paris, Hyde Park not fully free; no alternatives.
- Flow B, 8 people Mon 2–4 PM: flow B; nothing fully free; Central Park partial, free 2–3 PM, conflict "Tester, Alpha"; Mactan partial; alternatives present. Swap options for RM-0129908 are all on 2F and seat at least 4.
- Flow C, hall for 60 Fri Oct 2, 1–5 PM: flow C; taken = MPH 1 and MPH 2; an MPH 2 alternative 5:00–9:00 PM; swap options for RM-0129914 (24 people, Training) = Denali and Snowdon (Mt. Apo and Mt. Mayon seat 20; Mt. Mayon is also taken); none for RM-0129913 (80 people).
- A Meeting on Tue, Oct 20 → `ok: false`, first problem mentions "10 days"; Iloilo → flow `none`.
- One room per person: the demo user (Tokyo Mon 10–11 AM) searching Mon 10:30–11:30 AM gets a warning with "You already have Tokyo, 2F" and "RM-0129902"; 11 AM–12 PM gives none (back to back); `prepareBooking` for Amsterdam 10:30–11:30 → `CONFLICT`, fields `['time']`, "You already have Tokyo, 2F … One room per person at a time."

Exact `searchRooms` output on the demo scenario at Mon, Sep 28, 9:00 AM (checked 26 Sep 2026; useful to verify a rebuild):
- Flow A (Meeting, 5, Mon 3–4 PM): fully free Amsterdam, Bacolod, Batanes, Cape Town, Coron (all score 100, alphabetical); partly free New York, Mactan; taken Paris, Central Park, Hyde Park (London is also taken but ranks lower, "oversized", and falls outside the 3 taken slots); no alternatives.
- Flow B (Meeting, 8, Mon 2–4 PM): nothing fully free; partly free Central Park, Mactan; taken Hyde Park, Tagaytay, London; alternatives (top 3 ranked rooms × 2, in this order): Central Park "Mon, Sep 28, 1:00 PM – 3:00 PM" and "4:30 PM – 6:30 PM", Hyde Park "4:00 PM – 6:00 PM" and "12:00 PM – 2:00 PM", Mactan "3:30 PM – 5:30 PM" and "11:30 AM – 1:30 PM".
- Flow C (Multi-purpose, 60, Fri Oct 2, 1–5 PM): taken MPH 1, MPH 2; alternatives MPH 1 "6:00 PM – 10:00 PM" and "8:00 AM – 12:00 PM", MPH 2 "5:00 PM – 9:00 PM" and "9:00 AM – 1:00 PM".

Rules (`rules.test.ts`, 28 Sep 2026): `bookableFrom` 9:00 → 9:00, 9:04 → 9:00, 9:06 → 9:15, 23:51 → 0:00 the next day.

Room schedule (`roomSchedule.test.ts`, demo scenario, Mon Sep 28, 9:00 AM): see B11.

## B11 Room schedule
`src/services/roomSchedule.ts`, used by the assistant's `room_schedule` tool: who has which room when, with the free times. `SCHEDULE_LIMITS = { maxDays: 7, rooms: 12 }`.

`key(s)` (how people name rooms) = lower case; `mount` → `mt`; the words `the`, `room`, `2f`, `3f` removed; everything but `a–z0–9` removed. `matchRooms(rooms, query)`: `q = key(query)`; empty → `[]`; the rooms whose id, name or tool name has `key == q` (exact); if none, the rooms where one of those keys contains `q`. Examples: "Batanes 3F" and "the batanes room" → Batanes; "huddle 7" → Huddle Room 7; "Mount Apo" → Mt. Apo; "rio" → Rio De Janeiro (id); "park" → Hyde Park and Central Park; "room" and "Atlantis" → none.

`roomSchedule(gw, { site, room?, floor?, start, end, viewerEmail }, now)` → `ScheduleResult`:
```
if end <= start: { ok: false, problem: "The end time must be after the start time." }
if end − start > 7 days: { ok: false, problem: "Ask for at most 7 days at a time." }
onFloor = gw.listRooms(site) filtered by floor (when given)
rooms = room ? matchRooms(onFloor, room) : onFloor
if rooms empty: { ok: false, problem: 'There is no room called "<room>"' + (floor ? " on <floor>" : "") + "." }
bookings = gw.getBookings({ roomIds, from: start, to: end }) that isBlocking at now
ahead = [max(start, bookableFrom(now)), end]           // bookings earlier in the window still show; free times only from now on
for each room: { room, bookings: its bookings by start → publicBooking(b, viewerEmail), free: ahead non-empty ? freeIntervals(room, ahead, bookings, now) : [] }
listed = room ? all : those with bookings
return { ok: true, window: [start, end], rooms: first 12 of listed, more: listed − 12 (≥ 0),
         freeRooms: room ? [] : rooms with no bookings that are selfBookable }
```

Checks (`roomSchedule.test.ts`): Central Park, Mon 12:00 AM–Tue 12:00 AM, viewer the demo user → one booking `RM-0129908` Tester, Alpha, Operations, 4, Approved, not mine, no agenda; free 9:00 AM–3:00 PM and 4:30 PM–12:00 AM; no `freeRooms`. Tokyo → the demo user's booking, mine, agenda "Weekly touchpoint meeting". Cape Town → no bookings (RM-0129911 is cancelled). Floor 3F → rooms Mactan and Tagaytay (Tagaytay In Progress), Batanes among `freeRooms`, every free room on 3F and self-bookable, `more` 0. "Atlantis" → `{ ok: false, problem: 'There is no room called "Atlantis".' }`; end before start → not ok; Mon to Tue Oct 6 → "Ask for at most 7 days at a time.".
