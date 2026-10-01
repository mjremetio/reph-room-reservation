# 08 · Integration

## Room Reservation Tool
The app reads and writes reservations only through `ReservationGateway` (`src/gateway/ReservationGateway.ts` [Built]). Today: `MockGateway` (`src/gateway/mockGateway.ts`) with the demo scenario. When IT confirms how to connect, add one class with the same interface and select it with `RESERVATION_GATEWAY` in `getGateway()`.

### Contract (`src/gateway/ReservationGateway.ts`)
```ts
export interface NewBooking {
  roomId: string;
  start: Date;
  end: Date;
  agenda: string;
  agendaType: AgendaType;
  participants: number;
  requester: Person;
  priority?: Priority;
  trainingType?: TrainingType;
  specialInstructions?: string;
  hardwareRequirements?: string[];
  /** Book every date of the series, or none (ConflictError lists the clashes). */
  recurrence?: Recurrence;
}

/** Someone who can be chosen as "Name of Requestor": the tool's employee list. `login` is the tool's user name. */
export type Requestor = Person & { email: string; login: string };

/** The owner, or an Admin: `role: 'admin'` is set only by requireAdmin for /api/admin/* (never by the assistant or MCP). */
export type Actor = Person & { login?: string; role?: Role };
export interface BookingChanges { roomId?: string; start?: Date; end?: Date; participants?: number; agenda?: string; agendaType?: AgendaType; priority?: Priority }
export interface RoomChanges { name?: string; capacity?: number | null; av?: AV; selfBookable?: boolean; notes?: string | null }

export interface ReservationGateway {
  listRooms(site?: Site): Promise<Room[]>;
  listPeople(): Promise<Requestor[]>;
  getBookings(query: { roomIds?: string[]; from: Date; to: Date }): Promise<Booking[]>;
  getBooking(ticketNo: string): Promise<Booking | null>;
  listMyBookings(email: string, from: Date, to?: Date): Promise<Booking[]>;
  createBooking(req: NewBooking): Promise<Booking>;
  cancelBooking(ticketNo: string, by: Actor, comment?: string): Promise<void>;
  checkIn(ticketNo: string, by: Actor): Promise<Booking>;
  releaseNoShows(): Promise<Booking[]>;
  moveBooking(ticketNo: string, toRoomId: string, by: Actor): Promise<Booking>;
  approveBooking(ticketNo: string, by: Actor, comment?: string): Promise<Booking>;
  rejectBooking(ticketNo: string, by: Actor, comment: string): Promise<Booking>;
  updateBooking(ticketNo: string, changes: BookingChanges, by: Actor): Promise<Booking>;
  swapRooms(ticketA: string, ticketB: string, by: Actor): Promise<[Booking, Booking]>;
  updateRoom(roomId: string, changes: RoomChanges, by: Actor): Promise<Room>;
  blockRooms(block: RoomBlock, by: Actor, cancel: readonly string[]): Promise<{ blocks: Booking[]; cancelled: Booking[] }>;
  bulkBook(req: BulkBooking, by: Actor, cancel: readonly string[]): Promise<{ created: Booking[]; cancelled: Booking[] }>;
}
```
Error classes (same file), all extending `Error` with `name` set to the class name:
- `ConflictError(conflicts: Booking[], kind = 'room')`: message "The room is no longer free for that time." (kind `requester`: "You already have a room booked at that time."); `conflicts` = the blocking bookings in the way.
- `NotAllowedError(message)` and `NotFoundError(message)`: the message is shown to the user as-is (04, gateway errors).

| Method | Behaviour | Errors |
|---|---|---|
| `listRooms(site?)` | All rooms (03 Room), filtered by site when given; copies | – |
| `listPeople()` | The tool's employee list (the form's Name of Requestor options), the default first; used by `scripts/ask.ts` and the evals (the app's requestor is the signed-in account) | – |
| `getBookings({ roomIds?, from, to })` | Bookings overlapping `[from, to)` (`start < to && from < end`), **any status**; callers filter with `isBlocking()` | – |
| `getBooking(ticketNo)` | One booking or `null` | – |
| `listMyBookings(email, from, to?)` | The owner's bookings (email compared case-insensitively) overlapping `[from, to)`, any status, sorted by start; without `to`, every one ending after `from` (My bookings uses this, so requests waiting for Admin and bookings far ahead all show) | – |
| `createBooking(NewBooking)` | Creates through the tool's own rules (approval, .ics, reminders, auto-cancel still happen). With `recurrence`, books every date of the series or none, and returns the first date's booking | `ConflictError` (lists every clash on every date), `NotAllowedError`, `NotFoundError` |
| `cancelBooking(ticketNo, by, comment?)` | Owner, or Admin (then `modifiedBy` and the comment as Admin comments) | `NotAllowedError`, `NotFoundError` |
| `checkIn(ticketNo, by)` | Owner or Admin, Approved or In Progress, inside the window | `NotAllowedError`, `NotFoundError` |
| `releaseNoShows()` | Cancels every booking nobody checked in to by the end of its window (`shouldAutoRelease`) and returns the ones released now (02 F34). The real tool may release rooms itself (RULES question 3): its adapter then returns what the tool released since the last call | – |
| `moveBooking(ticketNo, toRoomId, by)` | Same time, other room; for swaps the owner agreed to | `ConflictError`, `NotFoundError` |
| `approveBooking(ticketNo, by, comment?)` | Admin only; In Progress → Approved; `modifiedBy`, Admin comments | `NotAllowedError` ("Admin only.", "Only requests waiting for Admin can be approved. RM-… is Approved."), `NotFoundError` |
| `rejectBooking(ticketNo, by, comment)` | Admin only; In Progress → Cancelled with the reason | as approve ("… can be turned down.") |
| `updateBooking(ticketNo, changes, by)` | Admin only; undefined fields keep their value; the room must exist and be free (not counting the booking itself) and, when the time moves, the owner must hold no other room then; Cancelled or Completed can't change. Rules are checked before by `prepareAdminChange` | `ConflictError` (`room` or `requester`), `NotAllowedError`, `NotFoundError` |
| `swapRooms(ticketA, ticketB, by)` | Admin only; two open bookings in different rooms exchange rooms in one step, each keeping its time; each must fit the other's room against every other booking | `ConflictError`, `NotAllowedError`, `NotFoundError` |
| `updateRoom(roomId, changes, by)` | Admin only; name, capacity, AV, self-service, notes (null clears); id, site, building, floor and kind stay | `NotAllowedError`, `NotFoundError` |
| `blockRooms({ roomIds, start, end, reason }, by, cancel)` | Admin only; each room gets a booking with status Blocked for the time (02 F35). The bookings already there are cancelled first if they are in `cancel` (the tickets Admin saw), with "Cancelled by Admin: the room is blocked (<reason>)."; any other stops it. All or none | `ConflictError` (the bookings not agreed to), `NotAllowedError` ("Admin only.", end before start, another block in the way: "RM-… already blocks that room then (<reason>). Lift that block first."), `NotFoundError` |
| `bulkBook({ roomIds, …NewBooking }, by, cancel)` | Admin only; every room on every date of the recurrence, Approved, for `requester`; each room must take the type and the group (`roomIssues`); one person may hold them all. Bookings in the way as for `blockRooms` ("Cancelled by Admin: the room is needed for \"<agenda>\"."). All or none | as `blockRooms` |

A room block is only lifted: `updateBooking`, `swapRooms` and `moveBooking` refuse it with `blockIsFixed` ("RM-… is a room block: lift it, then block the room again for the new time.").

In the real tool each Admin method must go through the tool's own Admin functions (its approval, .ics updates and reminders) [OPEN: RULES questions 2, 6 and 19]; until that is confirmed a read-only or requests-only adapter leaves them out and the Admin pages show the error.

### Factory (`src/gateway/index.ts`)
- `getGateway()`: a module-level singleton. `RESERVATION_GATEWAY` (default `mock`) picks the class; `mock` builds `new MockGateway({ now, scenario })` where `now` is the app clock (below) and `scenario` is `DEMO_SCENARIO` when `MOCK_SCENARIO` is `demo` or unset, otherwise `undefined` (random sample bookings). Any other `RESERVATION_GATEWAY` value throws `RESERVATION_GATEWAY="<value>" is not implemented yet. See docs/spec/08-integration.md.`
- `resetGateway()`: evals and tests only; forgets the singleton so the next call starts from the scenario again.
- The singleton lives in server memory: restarting the server or replacing the container (09 Deployment, 11) resets the demo week, and a second instance would have its own copy, so run one, or configure Redis: then every instance loads and saves the mock's rooms, bookings and next ticket number through `snapshot()` / `restore()` (09, Shared state).

### Mock gateway (`MockGateway`)
An in-memory stand-in for the tool that follows its rules: no overlaps, owner-only changes.

Options (`MockOptions`): `now?: () => Date` (default real time; used for conflicts and check-in), `scenario?: Scenario` (03 Demo scenario), `withSamples?: boolean` (default true; tests pass `false` for an empty gateway), `seed?: number` (default 7), `sampleDays?: number` (default 7).

On construction:
- **Rooms:** the room list (`ROOMS`, 03) with `capacity = room.capacity ?? scenario.capacityOverrides[id] ?? null`: a real capacity always wins; the scenario only fills unknown ones.
- **People:** with a scenario, `[scenario.demoUser, ...scenario.people]`, deduplicated by email (case-insensitive), so the demo user is first; without one, the five placeholder owners below. `listPeople()` drops anyone without an email and adds `login` = the email's part before `@`, upper-cased (`markjoseph.remetio@example.com` → `MARKJOSEPH.REMETIO`); the real tool supplies its own login.
- **Bookings:** with a scenario, a copy of its bookings with `priority` defaulted to `Normal` and `createdBy` defaulted to the owner's login (the tool fills both). Without a scenario and `withSamples !== false`, random sample bookings (below).

Methods:
- `listRooms(site?)` and `getBookings` return copies (dates cloned). `getBookings` keeps the internal order (scenario order, then creation order), unsorted.
- `createBooking(req)`:
  1. Unknown room → `NotFoundError('Unknown room "<id>".')`; a room with `selfBookable: false` → `NotAllowedError('<Room name> is booked through Admin.')`.
  2. Dates = `expandRecurrence(req, req.recurrence)` (at most 100) for a series, else `[{ start, end }]`.
  3. Clashes = for every date, `conflictsFor(roomId, date, bookings, now())` (blocking bookings that overlap, half-open intervals). Any → `ConflictError(clashes)`.
  4. One booking per date: `ticketNo` = `"RM-0" + n` with `n` a counter starting at **130001** (so `RM-0130001`, `RM-0130002`, …; every date of a series gets its own ticket), status **`In Progress`** (guidelines 3.5: waiting for Admin), `agenda`, `agendaType`, `participants`, `owner` = a copy of `requester`, `priority` (default `Normal`), `trainingType`, `specialInstructions`, `hardwareRequirements` (only when non-empty), `recurrence` (the whole pattern on each date), `createdBy` = the requester's login, `createdAt` = `now()`. Returns the first.
- `cancelBooking(ticketNo, by)`: unknown → `NotFoundError('Booking <ticketNo> not found.')`; not the owner → `NotAllowedError('Only the person who made the booking can do this.')`; sets status `Cancelled` (any current status; the "already cancelled or completed" check is in `prepareCancellation`, 04).
- `checkIn(ticketNo, by)`: unknown → `NotFoundError`; not the owner → the same `NotAllowedError`; status other than Approved or In Progress → `NotAllowedError('This booking is <status>.')`; outside `checkInWindow` (from start − 60 min until start + 15 min, end exclusive) → `NotAllowedError('Check-in is open from <formatManila(start of window)> until <formatManila(end of window)>.')`, e.g. "Check-in is open from Tue, Sep 29, 2:00 PM until Tue, Sep 29, 3:15 PM."; otherwise status → `Checked-In` and returns a copy.
- `releaseNoShows()`: every Approved or In Progress booking with `now ≥ start + RULES.checkInGraceMinutes` (`shouldAutoRelease`) → status `Cancelled`, `releasedAt` = now, `modifiedBy` = `SYSTEM`, `adminComments` = "Released: nobody checked in within 15 minutes of the start."; returns copies of those (none the second time).
- `moveBooking(ticketNo, toRoomId, by)`: unknown ticket → `NotFoundError`; unknown room → `NotFoundError('Unknown room "<id>".')`; clashes in the new room at the same time (other bookings, blocking at now) → `ConflictError`; otherwise changes `roomId`. The mock trusts the caller (no owner check): in the real tool the owner must agree or make the change.

**Random sample bookings** (`MOCK_SCENARIO` other than `demo`): deterministic, from `mulberry32(seed)`:
```ts
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
For each of `sampleDays` days from Manila midnight of today, for each self-bookable room: `floor(rand() × 4)` bookings (0–3). Each starts at the day's 7:00 AM + `floor(rand() × 26) × 30` minutes (7:00 AM to 7:30 PM), lasts one of [30, 60, 60, 90, 120] minutes (picked with `rand()`), and is skipped if it overlaps an earlier sample in that room. Tickets `RM-0120001`, `RM-0120002`, …; status `Approved`; agenda from ["Team sync", "Weekly touchpoint meeting", "Client call prep", "1:1 coaching", "Q4 planning", "New Doc Process – Content Analysis"]; agenda type Training for training rooms, Multi-purpose for halls, else Meeting; participants `max(1, min(capacity ?? 8, 2 + floor(rand() × 7)))`; owner one of the placeholder owners:

| Name | Email | Division |
|---|---|---|
| Tester, Alpha | alpha.tester@example.com | Operations |
| Tester, Bravo | bravo.tester@example.com | HR |
| Tester, Charlie | charlie.tester@example.com | Learning |
| Tester, Delta | delta.tester@example.com | Sales |
| Tester, Echo | echo.tester@example.com | Technology |

(Random draws, in this exact order: the count once per room and day; then per booking the start and the length; a booking that overlaps is skipped right there, without further draws and without using a ticket number; otherwise the agenda, the participants and the owner.)

### Swaps (`src/gateway/swap.ts`) [Built, not wired to the UI; Admin swaps use `swapRooms`]
`swapBookings(gw, ownerTicketNo, ownerNewRoomId, requesterBooking: NewBooking, actingFor: Person)`: reads the owner's booking (missing → `Error('Booking <ticket> not found.')`), moves it to `ownerNewRoomId` with `moveBooking`, then `createBooking(requesterBooking)` for the freed room. If that second step throws, it moves the owner's booking back to its old room and rethrows. Returns `{ owner, requester }`.

Planned flow [P3]:
1. The requester sends the drafted message (P1).
2. The owner agrees and opens a link from the message: `/swap/{token}` shows both bookings and **Accept swap**. The token is single-use, expires in 24 hours, and is bound to both tickets.
3. On accept, run `swapBookings` as the owner. Both get updated Outlook invites.
4. If the real tool supports doing both changes in one transaction, use that instead.
[OPEN] Can the app move an owner's booking after they accept, or must they do it themselves in the tool?

### Clock (`src/lib/clock.ts`)
```ts
const bootedAt = Date.now();
export function now(): Date {
  const demo = process.env.DEMO_NOW;
  if (!demo) return new Date();
  const start = new Date(demo).getTime();
  if (Number.isNaN(start)) return new Date();
  return new Date(start + (Date.now() - bootedAt));
}
```
- `bootedAt` is the moment the module is first loaded (server start). With `DEMO_NOW` set, the app's time starts there and then runs normally, so the demo week always looks the same. `DEMO_NOW` is read on every call; an empty or invalid value means real time.
- Every route, service and the mock use `now()`, never `new Date()`. The browser follows it through `/api/health` (06).
- Per server instance: two instances (or a restart) start the demo time again (09 Deployment).
- Empty `DEMO_NOW` is the default since v0.10 (29 Sep 2026): the real time, which the UI always shows in Asia/Manila. The mock then loads the demo week moved into the current Manila week (`scenarioInWeekOf`, 03 Demo scenario); `/api/health` says which clock runs (`clock: "demo" | "real"`).

### Options for the real tool, best first
1. **API with a service account.** Implement each method with the tool's endpoints.
2. **Database access.** Reads through read-only views are fine. Writes through stored procedures or endpoints the tool's owners provide, never direct table inserts (those would skip approvals and notifications).
3. **Replace the tool.** The app becomes the system of record: PostgreSQL with an exclusion constraint on `(room_id, tstzrange(start, end))` for blocking statuses. Needs Admin approval and data migration.

Avoid screen-scraping the tool's pages; it breaks when the screens change. To check quickly whether the tool already uses JSON endpoints: open it in Chrome, DevTools → Network → Fetch/XHR, and change the calendar week.

### Adapter checklist [P3]
- Map the tool's room names to `Room.id` with `toolName` (e.g. "Batanes 3F" → `batanes`). Unknown names: log and skip, never guess.
- Map every list and form field one to one (03, Mapping to the Room Reservation Tool): Ticket No → `ticketNo`, Agenda → `agenda`, Employee/Name of Requestor → `owner.name`, Division → `owner.division`, Category/Type of Agenda → `agendaType`, Room → `roomId`, Starts At/Ends At → `start`/`end`, Status → `status`, Priority → `priority`, Type of Training → `trainingType`, Special Instructions → `specialInstructions`, Hardware Requirements → `hardwareRequirements` (map the tool's option values; the app's list is a placeholder), Recurrence → `recurrence` (Daily/Weekly/Monthly/Yearly, every N, weekdays, day or nth weekday, Ends at date), Number of Participants → `participants`, Created By → `createdBy`, Created Date → `createdAt`, Modified By → `modifiedBy`, Admin Comments → `adminComments`. `createBooking` sends `NewBooking` (requester, agenda, type, priority, training type, special instructions, hardware, recurrence, participants, room, start, end). Decide whether a series goes to the tool as one recurring reservation (one submit, like the form) or as one reservation per date.
- `listPeople()` reads the tool's employee list (the form's Name of Requestor options): name "Last, First", division, login, email.
- Convert Manila local times to UTC on read, back on write.
- Map statuses one to one (In Progress, Approved, Checked-In, Completed, Cancelled). Unknown status: treat as blocking and log.
- Cache: rooms 1 hour; bookings 30 seconds per room and day; bust the cache on every write.
- Retries: reads retry twice with backoff (200 ms, 800 ms); writes never retry automatically.
- Idempotency: pass the proposal id if the tool supports it, so a double click can't create two bookings.
- Errors: map the tool's errors to `ConflictError`, `NotAllowedError`, `NotFoundError`; anything else → 503 `UNAVAILABLE`.
- **Contract tests**: one shared test file that runs the same cases against `MockGateway` and the real adapter (against the tool's test environment). Start from `src/gateway/__tests__/mockGateway.test.ts` (double booking, owner-only cancel, check-in window, Admin-only rooms, swap and swap rollback, demo capacities).

### Read-only launch
If write access takes longer, ship with a gateway whose write methods throw `NotAllowedError("Finish booking in the Room Reservation Tool")`, and have the booked card link to the tool with the room and time pre-selected (if its URL supports that). Search, the map, directions and contacting owners all still work.

## Outlook invites (Microsoft Graph) [P3]
Replace manual .ics forwarding. After a booking is confirmed:
- Create a calendar event on the requester's calendar with subject = agenda, location = "Batanes, 3F, Bldg. H", start and end in `Asia/Manila`, attendees from the user's input, body with the ticket number and a link to directions.
- Delegated permission `Calendars.ReadWrite` for the signed-in user (or a shared mailbox if IT prefers [OPEN]).
- On cancel: cancel the event. On swap: update the location for both.
- Store the event id with the ticket in the app's audit log.
- Until then (P1–P2): **Add to calendar** downloads an .ics file (06).

## Teams and email links [P1 links, P4 bot]
- `src/agent/links.ts` [Built]:
  - `teamsChatLink(email, message)` = `https://teams.microsoft.com/l/chat/0/0?users=<encodeURIComponent(email)>&message=<encodeURIComponent(message)>`: opens a chat with a pre-filled message.
  - `mailtoLink(email, subject, body)` = `mailto:<email>?subject=<encodeURIComponent(subject)>&body=<encodeURIComponent(body)>` (the email itself is not encoded).
  - Built only on the server by the `draft_owner_message` tool (05) from the booking owner's email in the gateway (email subject "About your room booking"), so the recipient never comes from the model or the browser. Confirm with IT that the Teams format works in the company tenant.
- Phase 4: a Teams bot (and a Copilot agent) that uses the same agent and tools; cards become Adaptive Cards. Already in Phase 1: any MCP app (Claude, ChatGPT, Claude Code, Cursor, VS Code; Copilot agents that support MCP) can use the tools through `/api/mcp` (05, MCP).

## Company sign-in (Microsoft Entra ID) [P3]
Phase 1–2 have a **demo sign-in**: three accounts with a username and a scrypt-hashed password (`src/config/accounts.ts`), and a signed `reph-session` cookie (`src/lib/session.ts`, 04 Session). The signed-in account is the Name of Requestor. Fine for the demo, not for real bookings (passwords handed out by hand, no reset, no MFA; 09 Security). Phase 3:
- OpenID Connect with the company tenant, replacing `authenticate()` and the accounts list; keep the session cookie (HttpOnly, Secure, SameSite=Lax) or the OIDC library's own.
- Map claims to `Person`: `name` = "Surname, GivenName" (the tool's style), `email` = the user principal name or mail, `division` = department.
- `requestor()` / `requireRequestor()` already return the signed-in person and every route calls them: only their source changes. Add a Name of Requestor choice only if Admin allows booking for someone else (RULES open question 10), and then check that permission on the server.
- Admin role from an Entra group, replacing `role` in the account store (P1-39): the same `requireAdmin` guards `/admin`, `/api/admin/*` and S5.
- **AI apps (MCP)**: the consent screen (`/oauth/authorize`) signs people in with the same sign-in, so it moves to Entra ID with it; our OAuth server keeps issuing the MCP tokens (05, MCP). Alternatively Entra ID itself can be the MCP authorization server (the resource metadata then names the tenant), if IT prefers; the MCP tools stay the same.

## Questions for the tool's owners and IT
1. Is there an API? Documentation, a test environment, a service account?
2. If not, can we get read-only views plus stored procedures for create, cancel, check-in and move?
3. Can the app read the employee list behind the form's Name of Requestor (name, division, login)?
4. Does the tool or the database send approval emails, .ics files, reminders and auto-cancel?
5. Where is the room master data (capacity, type, VC or BYOD, floor, photos)?
6. Rate limits or maintenance windows?
7. OpenAI data settings (retention, tracing) or Azure OpenAI? Who approves?
8. Graph permissions for creating events on the user's behalf?
9. Does the Teams deep-link format work in the tenant?
10. Which AI apps may people connect over MCP (Claude, ChatGPT, Copilot, …), and under which data terms (RULES open question 16)?
