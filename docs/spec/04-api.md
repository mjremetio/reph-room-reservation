# 04 · HTTP API

Next.js route handlers under `src/app/api/` (App Router). Every route exports `runtime = 'nodejs'`. Everything runs server-side; the browser never talks to OpenAI or the Room Reservation Tool directly. Every read and write of reservations goes through `getGateway()` (08).

## Route overview
| Method and path | File | Same-origin check | Signed-in account | Rate limit (bucket, key) | Cache |
|---|---|---|---|---|---|
| `GET /api/health` | `health/route.ts` (`dynamic = 'force-dynamic'`) | – | ignored | none | none |
| `GET /api/session` | `session/route.ts` (`dynamic = 'force-dynamic'`) | – | read (null when none) | none | `Cache-Control: no-store` |
| `POST /api/session` | `session/route.ts` | yes | – (signs in) | `signin`, client address | `Cache-Control: no-store` |
| `DELETE /api/session` | `session/route.ts` | yes | – (signs out) | none | `Cache-Control: no-store` |
| `POST /api/session/password` | `session/password/route.ts` | yes | **required** | `signin`, requestor email | `Cache-Control: no-store` |
| `GET /api/rooms` | `rooms/route.ts` | – | **required** | `default`, requestor email | `Cache-Control: private, no-cache` |
| `GET /api/availability` | `availability/route.ts` | – | **required** | `default`, requestor email | none |
| `GET /api/bookings` | `bookings/route.ts` | – | **required** | `default`, requestor email | none |
| `POST /api/search` | `search/route.ts` | yes | **required** | `default`, requestor email | none |
| `POST /api/assistant` | `assistant/route.ts` | yes | **required** | `assistant`, requestor email | SSE headers (below) |
| `GET /api/bookings/mine` | `bookings/mine/route.ts` | – | **required** | `default`, requestor email | none |
| `POST /api/bookings/{ticketNo}/check-in` | `bookings/[ticketNo]/check-in/route.ts` | yes | **required** | `default`, requestor email | none |
| `POST /api/proposals` | `proposals/route.ts` | yes | **required** | `default`, requestor email | none |
| `GET /api/proposals/{id}` | `proposals/[id]/route.ts` | – | **required** | `default`, requestor email | `Cache-Control: no-store` |
| `POST /api/proposals/{id}` | `proposals/[id]/route.ts` | yes | **required** | `default`, requestor email | none |
| `GET /api/messages` | `messages/route.ts` | – | **required** | `default`, requestor email | `Cache-Control: no-store` |
| `GET`, `POST /api/messages/{ticketNo}` | `messages/[ticketNo]/route.ts` | POST | **required** (owner or Admin) | `default`, requestor email | GET `no-store` |
| `GET /api/admin/overview`, `/bookings`, `/reports`, `/audit`, `/users`, `/rooms` | `admin/…/route.ts` | – | **Admin** | `default`, Admin email | `no-store` |
| `GET /api/admin/changes` | `admin/changes/route.ts` | – | **Admin** | `live` (90 a minute), Admin email | `no-store` |
| `POST`, `PATCH /api/admin/bookings/{ticketNo}`; `POST /api/admin/bookings/approve`, `/swap`; `POST /api/admin/users`; `PATCH /api/admin/users/{login}`; `POST /api/admin/users/{login}/reset`, `/signout`; `PATCH /api/admin/rooms/{roomId}` | `admin/…/route.ts` | yes | **Admin** | `default`, Admin email | users: `no-store` |
| `POST /api/admin/assistant` | `admin/assistant/route.ts` | yes | **Admin** | `default` then `assistant`, Admin email | SSE headers (below) |
| `POST /api/mcp` | `mcp/route.ts` (`dynamic = 'force-dynamic'`) | – (bearer token, open CORS) | **OAuth access token** (never the cookie) | `mcp`, the token's person | `Cache-Control: no-store` |
| `GET`, `DELETE /api/mcp` | `mcp/route.ts` | – | – | none | 405 |
| `POST /api/oauth/register` | `oauth/register/route.ts` | – (open CORS) | – | `oauth`, client address | `Cache-Control: no-store` |
| `POST /api/oauth/token` | `oauth/token/route.ts` | – (open CORS) | – (code or refresh token) | `oauth`, client address | `Cache-Control: no-store`, `Pragma: no-cache` |
| `POST /api/oauth/authorize` | `oauth/authorize/route.ts` | yes | **required** (cookie) | `oauth`, requestor email | `Cache-Control: no-store` on Allow |
| `GET /.well-known/oauth-protected-resource` and `…/api/mcp` | `src/app/.well-known/oauth-protected-resource/route.ts`, `…/api/mcp/route.ts` | – (open CORS) | – | none | `public, max-age=300` |
| `GET /.well-known/oauth-authorization-server` | `src/app/.well-known/oauth-authorization-server/route.ts` | – (open CORS) | – | none | `public, max-age=300` |

Order of checks in every handler (each can end the request): same-origin check (POSTs) → session (401 when nobody is signed in; for `/api/admin/*` also 403 `NOT_ALLOWED` "Admin only." for anyone but an Admin, `adminGuard` in `admin/_admin.ts`) → rate limit → validation of the query or body → the work. `/api/assistant` then also checks `OPENAI_API_KEY`. Methods a route doesn't export get Next's own 405. The MCP and OAuth endpoints (below, MCP and sign-in for AI apps) take no cookie and answer `OPTIONS` preflights with `OPEN_CORS`.

The page `/oauth/authorize` (`src/app/oauth/authorize/page.tsx`, dynamic) is the consent screen for AI apps (below and 06). Every path gets these headers from `next.config.ts` (`headers()`): `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

The page `/` (`src/app/page.tsx`) renders `<App />` from `src/ui/App.tsx` and is prerendered as static; the browser shows the sign-in screen until `GET /api/session` returns a user (06). `src/app/layout.tsx`: `<html lang="en">` with the font variables on it; metadata title "REPH Room Assistant", description "Book rooms at REPH Bldg. H and Iloilo with an AI assistant and a live floor map."; fonts from `next/font/google`: Open Sans (weights 400, 600, 700, 800, CSS variable `--font-open-sans`) and Barlow Condensed (500, 600, 700, `--font-barlow-condensed`, for the map labels only), both `subsets: ['latin']`, `display: 'swap'`; global CSS imported in this order: `base.css`, `shell.css`, `cards.css`, `map.css`, `sheets.css`, `table.css`, `admin.css`, `responsive.css` (06). The Admin pages `/admin`, `/admin/bookings`, `/admin/messages`, `/admin/reports`, `/admin/users`, `/admin/rooms` and `/admin/logs` are dynamic: `src/app/admin/layout.tsx` reads the session cookie and sends anyone who is not a signed-in Admin with their own password to `/` (a convenience; the data comes from `/api/admin/*`, which checks every request).

## Conventions
| Topic | Rule | Code |
|---|---|---|
| Bodies | JSON. Every body and query is validated with zod 4 | `src/app/api/_schemas.ts` |
| Times in requests | ISO 8601 **with an offset**, e.g. `2026-09-28T15:00:00+08:00` (`z.iso.datetime({ offset: true })`, then turned into a `Date`). Without an offset → 400 "`<field>`: Invalid ISO datetime" | `isoTime` |
| Times in responses | ISO 8601 UTC with milliseconds (`2026-09-28T07:00:00.000Z`, `toISOString()`). The browser shows them in Asia/Manila | |
| Numbers in queries and bodies | `participants` uses `z.coerce.number().int().min(1).max(500)`, so `"8"` is accepted; a missing value reads as NaN ("participants: Invalid input: expected number, received NaN") | |
| Identity | The signed `reph-session` cookie only, never a body field or header (see Session) | `src/lib/requestor.ts`, `src/lib/session.ts` |
| Clock | `now()` from `src/lib/clock.ts`, never `new Date()`, so `DEMO_NOW` works everywhere (08, Clock) | |
| Privacy | Other people's bookings carry only `ticketNo`, `roomId`, `start`, `end`, `status`, `owner` (name), `division`, `participants`, `mine: false`. Never their agenda, category, priority, training type, special instructions, hardware, recurrence, created or modified by, admin comments or email. The viewer is the signed-in person | `publicBooking()` in `src/services/views.ts` |

### Errors
Every error is JSON: `{ "ok": false, "code": "…", "message": "…" }`, sometimes with `problems: string[]` (every problem, the first one is also `message`) and `fields: FormField[]` (the form fields at fault, so the form can mark them red, 06). `message` is plain English that the UI shows as-is. Built by `fail(status, code, message, extra)` in `_http.ts`.

| Code | HTTP | When |
|---|---|---|
| `INVALID` | 400 | Body or query fails validation; a booking rule blocks the request |
| `UNAUTHORIZED` | 401 | Nobody signed in (no, a bad or an expired session cookie): "Sign in to continue."; `POST /api/session` with a wrong username or password: "Wrong username or password." |
| `NOT_ALLOWED` | 403 | Not the owner; outside the check-in window or wrong status for check-in; cross-origin POST |
| `NOT_FOUND` | 404 | Unknown room (proposal) or ticket (check-in, confirm) |
| `CONFLICT` | 409 | Room taken (for a series: on at least one date); or the requester already holds another room at that time (one room per person at a time, RULES) |
| `EXPIRED` | 410 | Proposal unknown, expired, already used, or prepared for another person |
| `RATE_LIMITED` | 429 | Too many requests in the current minute |
| `UNAVAILABLE` | 503 | `/api/assistant` without `OPENAI_API_KEY`; `POST /api/session` without `SESSION_SECRET` in production ("Sign-in isn't set up on this server yet.") |
| `INTERNAL` | 500 | Any other gateway error |

**Validation errors** (`parseBody` / `parseQuery`): a body that isn't JSON → 400 "The request body must be JSON." (no `problems`). Otherwise zod issues become `problems`, each `"<path>: <zod message>"` (joined with `.`), or the bare message when the issue has no path; `message` is the first. Examples: "site: Invalid option: expected one of "Manila"|"Iloilo"", "from: Invalid ISO datetime", "message: Type a message.", "The range can be at most 7 days.". `ProposalBody` is keyed on `action`: a body without `action` is read as a booking (`z.preprocess` adds `action: "book"`), then `z.discriminatedUnion('action', [BookProposal, CancelProposal])` checks it, so a bad field is named: "hardwareRequirements.0: Invalid option: expected one of "Projector"|"Speakerphone"|"Webcam"|"Extra monitor"|"Laptop"|"HDMI adapter"", "roomId: Invalid input: expected string, received undefined", "ticketNo: Invalid input: expected string, received undefined" (a cancel without a ticket), "action: Invalid discriminator value. Expected 'book' | 'cancel'", and for a body that isn't an object "Invalid input: expected object, received string". Queries are read with `Object.fromEntries(new URL(url).searchParams)`: every value arrives as a string.

**Gateway errors** (`gatewayFailure(error, what)`):
| Error | Response |
|---|---|
| `ConflictError` (kind `room`) | 409 `CONFLICT` "Someone booked it a moment ago. Ask the assistant for other options." |
| `ConflictError` (kind `requester`) | 409 `CONFLICT` "You already have another room booked at that time. One room per person at a time." |
| `NotAllowedError` | 403 `NOT_ALLOWED`, `message` = the error's message |
| `NotFoundError` | 404 `NOT_FOUND`, `message` = the error's message |
| anything else | 500 `INTERNAL` "That did not go through. Please try again.", and one log line `{"level":"error","msg":"<what> failed","error":"<message>"}` (`what` is e.g. "List rooms", "Availability", "Search", "Prepare proposal", "Confirm proposal", "My bookings", "Check-in", "Bookings") |

**Booking rule problems** (from `validateRequest` in `rules.ts`, in this order; 03 and RULES own the rules). Blocking ones make a 400; the form field comes from `ISSUE_FIELD`:
| Issue code | Message (verbatim) | Field |
|---|---|---|
| `END_BEFORE_START` | The end time must be after the start time. | `time` |
| `IN_PAST` | That time has already passed. (start more than `RULES.startGraceMinutes` = 5 min before now) | `time` |
| `TOO_FAR_AHEAD` | `<Type> bookings can be made up to <N> days ahead.` (N from `RULES.maxDaysAhead`: Meeting 10, Training 90, Multi-purpose 90; Pantry and Lactation Room have no limit) | `time` |
| `NO_PARTICIPANTS` | Add the number of participants. (not reachable through the API: zod requires 1–500) | `participants` |
| `MPH_SMALL_GROUP` | The multi-purpose hall is meant for groups over 50. A meeting or training room may fit better. (**warning, not blocking**: returned in `warnings` by `/api/search`) | `participants` |
| `TRAINING_SHIFT` | Training bookings must fit within one shift: 6 AM–2 PM, 2 PM–10 PM or 10 PM–6 AM. | `time` |
| `NOT_SELF_BOOKABLE` | `<Room name> is booked through Admin, not self-service.` | `room` |
| `WRONG_SITE` | `<Room name> is in <site>, not <site>.` (not reachable from the API: proposals use the room's own site) | `room` |
| `AGENDA_MISSING` | Add the title of the meeting or training, for example "Weekly touchpoint meeting". (bookings only) | `agenda` |
| `AGENDA_TOO_GENERIC` | "Meeting" or "Training" on its own is not accepted. Use the actual title, for example "New Doc Process – Content Analysis". (bookings only; the title, lower-cased and without trailing `.!?` or spaces, is one of: meeting, meetings, mtg, training, trainings, meeting room, training room, room, reservation, booking, test, n/a, na, tbd) | `agenda` |
| `URGENT_NOT_ALLOWED` | Urgent is only for training that starts in less than two weeks, or a meeting within the next 24 hours. Use Normal. (when `priority` is Urgent and `urgentAllowed` says no) | `priority` |

### Rate limits
`rateLimited(key, bucket)` in `_http.ts`: fixed one-minute windows in a module-level `Map`, keyed `"<bucket>:<key lower-cased>"`. The first request opens a window of 60 s (on the app clock); each request counts; over the limit → 429 `RATE_LIMITED` "Too many requests. Wait a minute and try again." Limits: `assistant` 20 per minute, `default` 120 per minute, `signin` 10 per minute, `mcp` 60 per minute, `oauth` 30 per minute, `live` 90 per minute (the Admin pages' change check, every 3 s). The key is the signed-in person's email (for `/api/mcp`, the token's person); for `POST /api/session`, `POST /api/oauth/register` and `POST /api/oauth/token` it is `clientAddress(request)`: the first address in `x-forwarded-for` (trimmed), else `unknown`. In memory: per server instance, reset on restart.

**Shared state** (`src/app/api/_shared.ts` over `src/services/sharedState.ts`, 09 Deployment, Shared state): every route that reads or writes reservations or the app's store is exported as `shared(route)` (`export const GET = shared(async function get(request) { … })`; the read-and-prepare POSTs — `/api/assistant`, `/api/admin/assistant`, `/api/search`, `/api/proposals`, `/api/mcp`, `/api/oauth/token` — as `shared(route, { lock: false })`). Each route first releases the bookings nobody checked in to (`releaseNoShows` in `_release.ts`, 02 F34). Without Redis it then only calls the route. With Redis it loads a newer saved state first and saves a changed one after (the `check_in` tool, which writes while the assistant streams, saves under the lock itself); a write that can't get the lock within 8 s → 503 `UNAVAILABLE` "The app is busy. Try again in a moment."; Redis unreachable → 503 `UNAVAILABLE` "The app can’t reach its storage right now. Try again in a moment." `health`, `.well-known/*` and `oauth/register` don't use it.

### Same-origin POSTs (CSRF)
`crossOrigin(request)`: when the request has an `Origin` header, its host must equal `x-forwarded-host`, else `host`, else the request URL's host; otherwise 403 `NOT_ALLOWED` "Requests must come from this app." A malformed `Origin` is refused the same way. Requests without `Origin` (scripts, tests, curl) pass. Used by every POST.

### Session (demo sign-in)
- **Accounts** (the account store, 03 App-owned data; seeded from `src/config/accounts.ts`: three people with a tool login, name, e-mail, division, `role` and a scrypt `passwordHash`; the owner is `admin`; in development and tests (`NODE_ENV !== 'production'`), or on a production server with `ENABLE_TEST_ADMIN=true`, also the test Admin `ADMIN.TESTER`, "Tester, Admin", whose password is short and known). Admin adds, edits, disables and resets accounts (Admin below). Company sign-in (Entra ID, P3-02) replaces them; the routes stay.
- **Signing in** (`authenticate(username, password)` in `src/lib/session.ts`): the username is trimmed and matched case-insensitively against each account's login or e-mail; the password is checked with `verifyPassword` (scrypt, constant-time compare); a disabled account can't sign in. An unknown username still runs one scrypt against a throwaway hash, so the time taken doesn't reveal which usernames exist.
- **The cookie** `reph-session` = `base64url({"login","exp"})` + `.` + base64url(HMAC-SHA256 of that payload with `SESSION_SECRET`). `exp` is wall-clock milliseconds (`Date.now()` + 12 hours, `SESSION_HOURS`), not the demo clock, because the browser's `Max-Age` is wall-clock too. Attributes: `Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`, plus `Secure` when the request URL is `https:` or `x-forwarded-proto` is `https`. Signing out sets it empty with `Max-Age=0`. No session store: any server instance can check it.
- **`SESSION_SECRET`** (`sessionSecret()`): used when it has 32 or more characters. Missing in production (`NODE_ENV=production`) → no sessions: `POST /api/session` answers 503 and every cookie counts as signed out. In development and tests a random secret is made once per process (sessions end on restart).
- **Lookup** (`src/lib/requestor.ts`): `requestor(request)` reads the cookie from the `Cookie` header (`sessionToken`), checks the signature (constant-time) and expiry (`readSession`), and returns the account as a `Requestor` (login, name, email, division; never the hash or the role) or `null` (no cookie, a bad signature, expired, a login that is no longer an account, a disabled account, or a cookie issued at or before the account's `sessionsValidAfter`: a reset or "Sign out everywhere"; the issue time is `exp − 12 h`). `accountByLogin(login, issuedAt)` applies the same checks to MCP tokens (`iat`). `requireAdmin(request)` returns the person with `role: 'admin'`, 401 when nobody is signed in, or 403 "Admin only."; the role is read from the account store on every request. `requireRequestor(request)` turns `null` into 401 `UNAUTHORIZED` "Sign in to continue."
- The signed-in person is the Name of Requestor of everything the app prepares; nobody books for someone else. No route reads identity from a body or a header other than `Cookie`.

## Shared JSON shapes
Built in `src/services/views.ts`, `src/services/prepareBooking.ts` and `src/agent/context.ts`; fields in 03 (View models). Optional fields are left out of the JSON when unset.

- **RoomView** (`roomView`): `{ id, name, toolName?, site, building, floor, kind, av, capacity, selfBookable }`. `av` is `"VC"`, `"BYOD"` or `null`; `capacity` a number or `null`.
- **PublicBooking** (`publicBooking(b, viewerEmail)`): `{ ticketNo, roomId, start, end, status, owner, division, participants, mine }` (`division` is `null` when unknown). When `mine` (owner email equals the viewer's, case-insensitive) also `agenda, agendaType, priority?, trainingType?, specialInstructions?, hardwareRequirements?, recurrence?` (RecurrenceJson), `createdBy?, createdAt?, modifiedBy?, adminComments?`.
- **RecurrenceJson**: `{ freq: "Daily", every, until }` · `{ freq: "Weekly", every, days: Weekday[], until }` · `{ freq: "Monthly", every, on: { day } | { week, weekday }, until }` · `{ freq: "Yearly", every, until }`; `until` an ISO string; `Weekday` is Sunday…Saturday, `week` is First, Second, Third, Fourth or Last (03 Recurrence).
- **RoomResultView**: `{ roomId, name, floor, availability: "available"|"partial"|"unavailable", rank?, reasons: string[], free?: [{ start, end }], conflicts?: [{ ticketNo, start, end, owner, division?, participants, status, mine }] }`. `rank` 1..n for fully free rooms only; `free` only for partial; `conflicts` for partial and unavailable. `reasons` come from `scoreRoom` (03 Ranking): "right size", "N spare seats", "seats N, much bigger than needed", "capacity not on file", "has video conferencing", "no video conferencing kit".
- **AlternativeView**: `{ roomId, name, floor, start, end }`: the same room at a nearby free time.
- **ProposalView**: `{ id, requester, roomId, roomName, floor, start, end, agendaType, agenda, participants, priority, trainingType?, specialInstructions?, hardwareRequirements?, recurrence?, dates?, expiresAt }`. `requester` is the requestor's name; `dates` lists the start of every date of a series; `trainingType` only for Training.
- **CancelView**: `{ proposalId, ticketNo, summary, expiresAt }`; `summary` = "`<agenda> · <Room>, <floor> · <range>`", e.g. "Client call prep · Batanes, 3F · Tue, Sep 29, 2:00 PM – 3:00 PM" (`formatRange`: "Mon, Sep 28, 3:00 PM – 4:00 PM", with the end date when it crosses midnight).

## Proposal store (`src/agent/proposals.ts`)
The only way to book or cancel is to confirm a proposal. Proposals are prepared by `prepareBooking` / `prepareCancellation` (the agent tools and `POST /api/proposals` share them) and kept in `src/lib/kv.ts`: Redis when it is configured (every server instance sees them; 09, Shared state), else this server's memory. Every call is async.
- `newProposal({ kind: 'book'|'cancel', userEmail, booking?, ticketNo? }, now, holdMinutes = RULES.proposalHoldMinutes)`: `id` = `crypto.randomUUID()`, `expiresAt` = now + `holdMinutes`: 3 minutes for the app's cards, `RULES.linkProposalHoldMinutes` (15) for proposals an AI app prepares over MCP. A book proposal keeps the full `NewBooking` (requester = the requestor), a cancel proposal the ticket. Nothing is kept yet.
- `saveProposal(p)`: `prepareBooking` / `prepareCancellation` add the card as `view` (`{ kind: 'book', proposal: ProposalView }` or `{ kind: 'cancel', cancel: CancelView }`) and save it under `reph:proposal:<id>` as JSON with dates kept (`toJson`), for `RULES.linkProposalHoldMinutes` + 1 minutes; the real expiry is `expiresAt` on the app's clock.
- `peekProposal(id, userEmail, now)`: the proposal without using it up, only for the same person (case-insensitive) and before `expiresAt`; else `null` (`GET /api/proposals/{id}`).
- `takeProposal(id, userEmail, now)`: unknown id → `null`; another user's email (case-insensitive compare) → `null` **and the proposal stays** for its owner; otherwise the proposal is **removed** (`take` = Redis `GETDEL`, so only one Confirm wins even on two instances) and returned only when `expiresAt > now`. Expired proposals are removed when taken, and Redis forgets the rest.
- Phase 3: pass the id to the real tool as an idempotency key.

---

## GET /api/health
Configuration at a glance, no secrets. Not rate limited; needs no sign-in (health checks use it). The browser uses `now` to run its clock on the server's time (real, or the replayed demo time) and shows it in Asia/Manila.
```json
{ "ok": true, "gateway": "mock", "scenario": "demo", "openai": "configured", "model": "gpt-5.6-luna", "clock": "real", "now": "2026-09-29T13:05:22.448Z" }
```
`gateway` = `RESERVATION_GATEWAY` or `"mock"`; `scenario` = `MOCK_SCENARIO` or `"demo"`; `openai` = `"configured"` when `OPENAI_API_KEY` is set, else `"missing"`; `model` = `OPENAI_MODEL` or `"SDK default"`; `clock` = `"demo"` when `DEMO_NOW` is set (the clock replays the demo week), else `"real"`; `now` = `now().toISOString()` (UTC on the wire, like every time in the API; 13:05 UTC is 9:05 PM in Manila).

## GET /api/session
Who is signed in. Never 401: `{ "ok": true, "user": { "login": "MARKJOSEPH.REMETIO", "name": "Remetio, Mark Joseph", "division": "Sales", "role": "admin", "mustChangePassword": false } }`, or `{ "ok": true, "user": null }` when nobody is (no e-mail; `division` `null` when the account has none; `mustChangePassword` after a reset or for a new account: the app asks for a new password first). Header `Cache-Control: no-store`.

## POST /api/session
Signs in. Body (`SignInBody`): `username` (string, trimmed, 1–120; "Enter your username.") and `password` (1–200; "Enter your password."). Checks in order: cross-origin → 403; rate limit (`signin`, 10 per minute per client address) → 429; invalid body → 400; no `SESSION_SECRET` in production → 503 "Sign-in isn't set up on this server yet." (and one log line `{"level":"error","msg":"SESSION_SECRET is missing: sign-in is off"}`); wrong username or password (or a disabled account) → 401 `UNAUTHORIZED` "Wrong username or password." (the same for all, no cookie; audited as `session.signin_failed` with the username tried). Success: `lastSignInAt` set, audited `session.signin`, 200 `{ "ok": true, "user": { login, name, division, role, mustChangePassword } }` with `Set-Cookie: reph-session=…` (Session above) and `Cache-Control: no-store`.

## DELETE /api/session
Signs out: 200 `{ "ok": true }` with `Set-Cookie: reph-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` (+ `Secure` over HTTPS); audited `session.signout` when someone was signed in. Cross-origin → 403. Works without a session.

## POST /api/session/password
The signed-in person changes their own password. Body (`PasswordBody`): `current` (1–200, "Enter your current password."), `next` (1–200, "Enter a new password."). Checks: cross-origin → 403; not signed in → 401; rate limit (`signin`, per e-mail) → 429; invalid body → 400; `changePassword` (`src/lib/accounts.ts`): wrong current password → 403 "Your current password is not right."; `next` under 12 characters (`MIN_PASSWORD_LENGTH`) → 400 "Use at least 12 characters."; the same as `current` → 400 "Choose a password different from the current one." Success: the new scrypt hash, `mustChangePassword: false`, audited `session.password`, 200 `{ "ok": true }`; the session stays.

## GET /api/rooms
Query (`RoomsQuery`): `site` (`Manila`|`Iloilo`, optional: all sites when absent), `floor` (string ≤ 10, e.g. `2F`, optional).
Response: `{ ok: true, rooms: RoomView[] }` in the room list's order (03 Room master data), header `Cache-Control: private, no-cache` (Admin can change rooms, so the browser always asks again). No data notes (`notes` stay with Admin). Includes the Admin-only visitor offices (`selfBookable: false`). Capacities include the demo values from the scenario's `capacityOverrides` when `MOCK_SCENARIO=demo`.
```json
{ "ok": true, "rooms": [ { "id": "siargao", "name": "Siargao", "toolName": "Siargao 3F", "site": "Manila", "building": "Bldg. H", "floor": "3F", "kind": "Meeting", "av": "BYOD", "capacity": 4, "selfBookable": true } ] }
```
Errors: not signed in → 401; invalid site → 400 "site: Invalid option: expected one of "Manila"|"Iloilo""; rate limit → 429; gateway → 500.

## GET /api/availability
Busy times for the map, 3D view, timeline and the Rooms table.
Query (`AvailabilityQuery`): `site` (default `Manila`), `floor` (optional, ≤ 10), `from`, `to` (ISO with offset). A time without an offset → 400 "from: Invalid ISO datetime" (or `to: …`). `to` must be after `from` → else 400 ""to" must be after "from"."; the range can be at most 7 days → else 400 "The range can be at most 7 days.". The two range checks come from `inRange(days)` in `_schemas.ts`, which only compares when both times parsed to `Date`s (zod still runs object refinements after a field failed).
Response: one entry per room of the site (and floor), even rooms with nothing booked, in the room list's order:
```json
{ "ok": true, "rooms": [
  { "roomId": "johannesburg", "busy": [] },
  { "roomId": "tokyo", "busy": [ { "ticketNo": "RM-0129902", "roomId": "tokyo", "start": "2026-09-28T02:00:00.000Z", "end": "2026-09-28T03:00:00.000Z",
      "status": "Approved", "owner": "Remetio, Mark Joseph", "division": "Sales", "participants": 4, "mine": true,
      "agenda": "Weekly touchpoint meeting", "agendaType": "Meeting", "priority": "Normal", "createdBy": "MARKJOSEPH.REMETIO" } ] },
  { "roomId": "centralpark", "busy": [ { "ticketNo": "RM-0129908", "roomId": "centralpark", "start": "2026-09-28T07:00:00.000Z", "end": "2026-09-28T08:30:00.000Z",
      "status": "Approved", "owner": "Tester, Alpha", "division": "Operations", "participants": 4, "mine": false } ] } ] }
```
`busy` = the gateway's bookings overlapping `[from, to)` that are blocking at `now()` (`isBlocking`: In Progress, Approved, Checked-In, and Held while its hold hasn't expired; not Cancelled or Completed), sorted by start, privacy-filtered. The browser asks for one "office day": 6:00 AM to 6:00 AM (Manila) around the selected time.

## GET /api/bookings
**The Room Reservation Tool's reservation list** and its search panel (Guidelines step 2: reservation date, type of agenda, site, building, room, employee name), plus status. Used by the table's Bookings tab.

| Query (`BookingsQuery`) | Rule |
|---|---|
| `from`, `to` | Required, ISO with offset (without → 400 "from: Invalid ISO datetime"); `to` after `from` (""to" must be after "from".") and at most 31 days ("The range can be at most 31 days."), both via `inRange(31)` |
| `site` | `Manila`\|`Iloilo`, optional |
| `building` | String ≤ 40, e.g. `Bldg. H`, optional: exact match on `room.building` |
| `roomId` | String ≤ 64, optional: exact match |
| `agendaType` | Optional. The viewer's own bookings match by their `agendaType`. Other people's match by the **kind of room** (`ROOM_KINDS_FOR[agendaType]` contains the room's kind), so their category is never revealed |
| `employee` | Trimmed, ≤ 80, optional; case-insensitive substring of the owner's name |
| `status` | `Held`, `In Progress`, `Approved`, `Checked-In`, `Completed`, `Cancelled`; optional |

Response: `{ ok: true, bookings: PublicBooking[] }`: every status (Cancelled and Completed too, like the tool), filtered by all given filters, sorted by start, privacy-filtered.
```json
{ "ok": true, "bookings": [ { "ticketNo": "RM-0129911", "roomId": "capetown", "start": "2026-09-28T03:00:00.000Z", "end": "2026-09-28T04:00:00.000Z",
  "status": "Cancelled", "owner": "Tester, Bravo", "division": "HR", "participants": 5, "mine": false } ] }
```

## POST /api/search
The same `searchRooms` the agent uses. Called by the map's search bar (**Find rooms**) and **New booking**, and works when OpenAI is off. The result also drives the 3D view and the table, which read it from the browser store.
Body (`SearchBody`):
```json
{ "site": "Manila", "agendaType": "Meeting", "start": "2026-09-28T14:00:00+08:00", "end": "2026-09-28T16:00:00+08:00", "participants": 8, "needsVC": false }
```
`site` defaults to `Manila`; `agendaType` one of Meeting, Training, Pantry, Lactation Room, Multi-purpose; `participants` 1–500; `needsVC` optional boolean.

Response: **the same payload as the assistant's `room_results` event** plus `warnings`, so the UI has one result format:
```json
{
  "ok": true, "flow": "B", "agendaType": "Meeting", "participants": 8, "warnings": [],
  "results": [
    { "roomId": "centralpark", "name": "Central Park", "floor": "2F", "availability": "partial", "reasons": ["2 spare seats"],
      "free": [{ "start": "2026-09-28T06:00:00.000Z", "end": "2026-09-28T07:00:00.000Z" }],
      "conflicts": [{ "ticketNo": "RM-0129908", "start": "2026-09-28T07:00:00.000Z", "end": "2026-09-28T08:30:00.000Z", "owner": "Tester, Alpha", "division": "Operations", "participants": 4, "status": "Approved", "mine": false }] },
    { "roomId": "mactan", "name": "Mactan", "floor": "3F", "availability": "partial", "reasons": ["2 spare seats"],
      "free": [{ "start": "2026-09-28T07:30:00.000Z", "end": "2026-09-28T08:00:00.000Z" }],
      "conflicts": [{ "ticketNo": "RM-0129904", "start": "2026-09-28T05:30:00.000Z", "end": "2026-09-28T07:30:00.000Z", "owner": "Tester, Bravo", "division": "HR", "participants": 5, "status": "Approved", "mine": false }] }
  ],
  "alternatives": [{ "roomId": "centralpark", "name": "Central Park", "floor": "2F", "start": "…", "end": "…" }]
}
```
- **`results` order:** fully free rooms ranked 1..n (at most 5), then partly free (at most 3), then taken (at most 3) (`SEARCH_LIMITS` in `searchRooms.ts`). `alternatives` only when nothing is fully free: for the best 3 rooms, up to 2 nearest free slots each.
- **`flow`:** `A` some room fully free; `B` none fully free but some partly free; `C` all suitable rooms taken; `none` no suitable room at the site (02).
- **Rule problems** (the time rules above, without the agenda check) → 400 `INVALID` with every problem in `problems` (no `fields`), e.g. "That time has already passed.". Non-blocking issues go to `warnings`.
- **One room per person** (`searchRooms(gw, req, now, requesterEmail)`, the route passes the signed-in person): when the flow is not `none` and the requester already holds a room that overlaps the time, each such booking adds a warning "You already have Tokyo, 2F on Mon, Sep 28, 10:00 AM – 11:00 AM (RM-0129902). One room per person at a time: cancel it first, or pick another time." (no warning when no room of the type is listed at the site, e.g. Iloilo).
- **`mine`** on each conflict (`searchResultViews(result, viewerEmail)`): true for the viewer's own booking, so the cards say "you" and offer no swap with yourself.

## POST /api/proposals
Prepares a booking or a cancellation without the assistant (room sheet, New booking, My bookings, table). Same rules as the agent tools: both call `src/services/prepareBooking.ts`. Nothing changes until `POST /api/proposals/{id}`. **Needs a signed-in account**; the proposal is bound to that person's email.

**Book** (the reservation form's fields, `BookProposal`):
```json
{ "roomId": "jolo", "agendaType": "Meeting", "agenda": "Sprint planning",
  "start": "2026-09-29T09:00:00+08:00", "end": "2026-09-29T10:00:00+08:00", "participants": 3,
  "priority": "Normal", "trainingType": "On-Site", "specialInstructions": "U-shape seating",
  "hardwareRequirements": ["Webcam"],
  "recurrence": { "freq": "Weekly", "every": 1, "days": ["Tuesday"], "until": "2026-10-06T23:59:00+08:00" } }
```
| Field | Rule |
|---|---|
| `action` | Optional; `"book"` (added when missing) |
| `roomId` | String 1–64 |
| `agendaType` | Meeting, Training, Pantry, Lactation Room, Multi-purpose |
| `agenda` | Trimmed, ≤ 200 (an empty string passes zod and then fails the `AGENDA_MISSING` rule) |
| `start`, `end` | ISO with offset; for a series, the first date's times |
| `participants` | 1–500 |
| `priority` | `Normal` (default) or `Urgent` |
| `trainingType` | `On-Site` or `Virtual`, optional; kept for Training only (default On-Site), dropped for other types |
| `specialInstructions` | Optional, trimmed, ≤ 500; empty becomes unset |
| `hardwareRequirements` | Optional array (≤ 6 items) of `HARDWARE_OPTIONS`: Projector, Speakerphone, Webcam, Extra monitor, Laptop, HDMI adapter (`src/config/hardware.ts`, placeholders [OPEN]); empty becomes unset |
| `recurrence` | Optional, RecurrenceJson: `freq` `Daily`\|`Weekly`\|`Monthly`\|`Yearly`; `every` 1–99; Weekly needs `days` (1–7 of Sunday…Saturday); Monthly needs `on: { day: 1–31 }` or `on: { week: First…Last, weekday }`; `until` = the last date (ISO with offset, any time that day) |

What `prepareBooking` does, in order (the first failure answers):
1. Unknown room → 404 `NOT_FOUND` "Unknown room "atlantis"." `fields: ["room"]`.
2. `validateRequest(…, { forBooking: true, room, priority })`: blocking problems → 400 `INVALID` with every problem and the matching `fields` (deduplicated), e.g. an empty agenda for an Urgent training from 1 to 3 PM three weeks out → problems [TRAINING_SHIFT, AGENDA_MISSING, URGENT_NOT_ALLOWED messages], `fields: ["time","agenda","priority"]`.
3. Hardware outside the list → 400 "Unknown hardware option: X." `fields: ["hardware"]` (only reachable from the agent tool; through the API the zod check answers first with "hardwareRequirements.0: Invalid option: …", no `fields`).
4. A series: the dates are `expandRecurrence(first, recurrence, 101)`. None → 400 "The repeat pattern gives no dates before the end date."; more than 100 (`RULES.maxSeriesDates`) → 400 "A repeating booking can have at most 100 dates."; both with `fields: ["recurrence"]`.
5. A series with `RULES.windowAppliesToEveryDate` (true): each date is checked with the time rules; every problem becomes "`<Ddd, Mmm D>: <message>`", the first 5 are returned → 400, `fields: ["recurrence"]`. Example: "Fri, Oct 9: Meeting bookings can be made up to 10 days ahead.".
6. Availability of every date against the gateway's bookings (blocking at now) → 409 `CONFLICT`. One date: "Jolo is no longer free for that whole time." `fields: ["room","time"]`. A series: "Jolo is not free on 2 of 2 dates." then up to 5 lines "Tue, Sep 29: taken by Remetio, Mark Joseph", `fields: ["room","recurrence"]`.
7. One room per person at a time (`RULES.oneRoomPerPersonAtATime`, `ownBookingClashes`: the requester's own bookings from `listMyBookings` that still block and overlap a date) → 409 `CONFLICT`. One date: "You already have Tokyo, 2F on Mon, Sep 28, 10:00 AM – 11:00 AM (RM-0129902). One room per person at a time." `fields: ["time"]`. A series: "One room per person at a time: you already have a room on N of M dates." then up to 5 lines "You already have <Room>, <floor> on <range> (<ticket>).", `fields: ["time","recurrence"]`.
8. Otherwise a proposal is stored and returned.

→ 200 `{ ok: true, proposal: ProposalView }`:
```json
{ "ok": true, "proposal": { "id": "9e3a4916-0c0b-443b-97cb-62953a8b9443", "requester": "Remetio, Mark Joseph", "roomId": "jolo", "roomName": "Jolo", "floor": "3F",
  "start": "2026-09-29T01:00:00.000Z", "end": "2026-09-29T02:00:00.000Z", "agendaType": "Meeting", "agenda": "Sprint planning", "participants": 3,
  "priority": "Normal", "specialInstructions": "U-shape seating", "hardwareRequirements": ["Webcam"],
  "recurrence": { "freq": "Weekly", "every": 1, "days": ["Tuesday"], "until": "2026-10-06T15:59:00.000Z" },
  "dates": ["2026-09-29T01:00:00.000Z", "2026-10-06T01:00:00.000Z"], "expiresAt": "2026-09-28T01:03:00.432Z" } }
```

**Cancel** your own booking (`CancelProposal`): `{ "action": "cancel", "ticketNo": "RM-0129912" }` (`ticketNo` 1–32 characters) →
```json
{ "ok": true, "cancel": { "proposalId": "35972922-384e-48d2-ab92-d3532b01fe4e", "ticketNo": "RM-0129912",
  "summary": "Client call prep · Batanes, 3F · Tue, Sep 29, 2:00 PM – 3:00 PM", "expiresAt": "2026-09-28T01:03:00.435Z" } }
```
Errors: unknown ticket or not yours → 403 `NOT_ALLOWED` "I can only cancel your own bookings."; already Cancelled or Completed → 400 "This booking is already cancelled." / "…completed.". Both with `problems`, without `fields`.

The status for a prepared failure comes from its code: `INVALID` 400, `NOT_ALLOWED` 403, `NOT_FOUND` 404, `CONFLICT` 409; the message is the first problem (fallback "That can not be booked."). Not signed in → 401.

## GET /api/proposals/{id}
The card behind a **confirm link** (`/?confirm=<id>`) that an AI app got from `propose_booking` or `request_cancellation` over MCP (05, MCP). **Needs a signed-in account**; nothing changes.

| Status | Body |
|---|---|
| 200 | `{ ok: true, kind: 'book', proposal: ProposalView }` or `{ ok: true, kind: 'cancel', cancel: CancelView }` (`peekProposal`), `Cache-Control: no-store` |
| 401 | "Sign in to continue." |
| 410 | `EXPIRED` "This confirm link has expired or was made for someone else. Ask the AI app to prepare it again." (unknown, expired, already used, another person's, or a proposal without a stored card) |

## POST /api/proposals/{id}
The user pressed **Confirm booking** or **Cancel booking**. **This is the only place bookings are created or cancelled.** No body. **Needs a signed-in account.** `takeProposal(id, requestor email, now())` (see Proposal store); a double click books once.

| Status | Body |
|---|---|
| 200 (book) | `{ ok: true, booking: PublicBooking, dates }`: `gateway.createBooking(proposal.booking)`; `booking` is the first date's booking (own, so every field; status **In Progress**, guidelines 3.5); `dates` = `expandRecurrence(booking, recurrence).length` for a series, else 1 |
| 200 (cancel) | `{ ok: true, ticketNo }` after `gateway.cancelBooking(ticketNo, requestor)` |
| 400 | "Unknown action." (a malformed stored proposal; not reachable) |
| 401 | "Sign in to continue." |
| 403 | `NOT_ALLOWED` from the gateway, e.g. "<Room> is booked through Admin." or "Only the person who made the booking can do this." |
| 404 | `NOT_FOUND` from the gateway, e.g. "Unknown room "x"." or "Booking RM-x not found." |
| 409 | `CONFLICT` "Someone booked it a moment ago. Ask the assistant for other options." (taken since the proposal was prepared), or "You already have another room booked at that time. One room per person at a time." (the requester confirmed another room for that time since) |
| 410 | `EXPIRED` "This card has expired. Ask the assistant to check again." (unknown id, expired, already used, or another person's) |

Example (confirming the series above):
```json
{ "ok": true, "dates": 2, "booking": { "ticketNo": "RM-0130001", "roomId": "jolo", "start": "2026-09-29T01:00:00.000Z", "end": "2026-09-29T02:00:00.000Z",
  "status": "In Progress", "owner": "Remetio, Mark Joseph", "division": "Sales", "participants": 3, "mine": true,
  "agenda": "Sprint planning", "agendaType": "Meeting", "priority": "Normal", "specialInstructions": "U-shape seating", "hardwareRequirements": ["Webcam"],
  "recurrence": { "freq": "Weekly", "every": 1, "days": ["Tuesday"], "until": "2026-10-06T15:59:00.000Z" },
  "createdBy": "MARKJOSEPH.REMETIO", "createdAt": "2026-09-28T01:00:00.433Z" } }
```

## GET /api/bookings/mine
**Needs a signed-in account.** Query (`MyBookingsQuery`): `from`, `to`, both optional ISO with offset (defaults: now − 60 min and **no end**, so every upcoming booking shows however far ahead it is, e.g. a Training 90 days out; no check that `to` is after `from`). Returns `gateway.listMyBookings(email, from, to)` (sorted by start, any status: requests still **In Progress**, waiting for Admin, show like Approved ones) **without Cancelled** ones (Completed stay), each with its check-in window:
```json
{ "ok": true, "bookings": [ { "ticketNo": "RM-0129902", "roomId": "tokyo", "start": "2026-09-28T02:00:00.000Z", "end": "2026-09-28T03:00:00.000Z",
  "status": "Approved", "owner": "Remetio, Mark Joseph", "division": "Sales", "participants": 4, "mine": true,
  "agenda": "Weekly touchpoint meeting", "agendaType": "Meeting", "priority": "Normal", "createdBy": "MARKJOSEPH.REMETIO",
  "checkIn": { "start": "2026-09-28T01:00:00.000Z", "end": "2026-09-28T02:15:00.000Z", "open": true } } ] }
```
`checkIn` = `checkInWindow`: from start − 60 min (`RULES.checkInOpensMinutesBefore`) to start + 15 min (`RULES.checkInGraceMinutes`); `open` is true only for Approved or In Progress bookings when `window.start ≤ now < window.end`. Errors: bad `from`/`to` → 400 "from: Invalid ISO datetime".

## POST /api/bookings/{ticketNo}/check-in
**Needs a signed-in account.** No body. Calls `gateway.checkIn(ticketNo, requestor)`.
- 200 `{ ok: true, booking: PublicBooking }` with status `Checked-In`.
- 403 "Only the person who made the booking can do this." (not yours); "This booking is Checked-In." (or Cancelled, Completed, Held: any status other than Approved and In Progress); "Check-in is open from Tue, Sep 29, 2:00 PM until Tue, Sep 29, 3:15 PM." (outside the window; `formatManila` of both ends).
- 404 "Booking RM-1 not found.".

## POST /api/assistant
Streams the assistant's reply as Server-Sent Events. **Needs a signed-in account**: the agent's `context.user` is that person (05).

Request (`AssistantBody`):
| Field | Rule |
|---|---|
| `message` | Trimmed, 1–2000 characters ("Type a message." / "Messages can be up to 2000 characters.") |
| `history` | Array (≤ 1000) of objects: the `history` from the previous `done` event; default `[]`. The server trims it with `trimHistory`: drops items with role `system` or `developer`, keeps the last 60, then starts at the first user message (type absent or `message`); no user message → empty |
| `confirmedTickets` | Array (≤ 5) of strings ≤ 32; default `[]`: tickets confirmed or cancelled since the last message. Only for bookings the signed-in person owns: the server reads each from the gateway and adds a system item "App note: RM-0130001 is now In Progress (Sprint planning, Tue, Sep 29, 9:00 AM – 10:00 AM)." Client text is never trusted |

Before streaming (plain JSON errors, not a stream): cross-origin → 403; not signed in → 401; rate limit (20 per minute) → 429; invalid body → 400; no `OPENAI_API_KEY` → 503 `UNAVAILABLE` "The assistant is not available right now. You can still browse and book from the map.".

The run (`streamAgent` in `src/app/api/_agentStream.ts`, shared with `POST /api/admin/assistant`): input = trimmed history + app notes + `{ role: 'user', content: message }`; `run(roomAssistant, input, { stream: true, context, maxTurns: 10, signal })` with `context = { user, now: now(), defaultSite: 'Manila', emit }`; `signal` = the request's abort signal combined with `AbortSignal.timeout(90_000)` (`RUN_TIMEOUT_MS`), so a browser disconnect or 90 s stops the run.

Response headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Request-Id: <uuid>`. Each event is written as `event: <name>\ndata: <JSON>\n\n`. Events:
| Event | Data | When |
|---|---|---|
| `ui` | a `UiEvent` (05): `focus_time`, `room_results`, `room_schedule`, `proposal`, `cancel_request`, `draft_message`, `handoff` (the Admin assistant: `room_schedule`, `admin_action`, `admin_change`, `admin_swap`, `admin_message`) | Whenever a tool calls `ctx.emit()`, usually before the text |
| `text` | `{ "delta": "Amsterdam, 2F is…" }` | Every `output_text_delta` of the model stream |
| `done` | `{ "history": [...] }` | Once, at the end of a successful run: `result.history` (the full input plus the new items). The browser stores it and sends it back next time |
| `error` | `{ "code": "UNAVAILABLE", "message": "The assistant is not available right now. You can still browse and book from the map." }` | Instead of `done` when the run fails or times out; text already streamed stays. Then the stream closes |

**Scope guardrail** (05): when the input guardrail trips (`InputGuardrailTripwireTriggered`, before the model runs), the server sends one `text` event with the whole fixed reply "I can only help with rooms at REPH: finding, booking, checking in to or cancelling a room, and questions about the Room Reservation Guidelines. Try "Room for 5 today from 3 to 4 PM"." and then `done` with the **request's `history` unchanged**, so the off-topic turn is not remembered.

Writes after the browser has gone away are dropped quietly. Each run logs one JSON line with `console.log`: `{ "route": "assistant" (or "admin-assistant"), "requestId", "user", "tools": [names in call order], "ms", "status": "ok"|"off_topic"|"error", "error"? }`. `user` is the signed-in person's email; no message text and no tool payloads are logged.

---

## Messages
One thread per booking between its owner and Admin (02 F29; `src/services/messages.ts`). The reader is the signed-in account with `admin: role === 'admin'`.
- **`GET /api/messages`** → `{ ok, threads: ThreadSummary[], unread }`: the reader's threads (every thread for an Admin), newest message first. `ThreadSummary` = `{ ticketNo, owner, booking: { label: "Cape Town, 2F · Tue, Sep 29, 10:00 AM – 11:00 AM", status, agenda, start } | null, last: { at, name, text (≤ 140), admin } | null, unread }`. Unread = messages after the reader last opened the thread, not written by the reader, from the other side (for the owner: Admin's messages and notes; for an Admin: the owner's).
- **`GET /api/messages/{ticketNo}`** → `{ ok, thread: { ticketNo, owner, booking: { label, status, agenda }, messages: MessageView[] } }` and marks the thread read for the reader. `MessageView` = `{ id, at, name, admin, system, text, mine }`. Unknown booking → 404; not the owner and not Admin → 403 "Only the person who made the booking and Admin can see this conversation."
- **`POST /api/messages/{ticketNo}`** `{ text }` (`MessageBody`: trimmed, 1–2000; "Write a message.") → `{ ok, message }`; same 404/403 ("…can write here."); audited `message.send` with the ticket only (never the text). An Admin who owns the booking writes as its owner.
- Automatic notes (`adminNote`): every Admin action on a booking posts `{ admin: true, system: true }` in its thread: "Admin approved this booking." / "Admin turned down this request." / "Admin cancelled this booking." (each + " Note: <comment>" when given), "Admin checked you in.", "Admin changed this booking: <change>. Now: <label>.", "Admin moved this booking to another room: <label>."

## Admin
Every route under `/api/admin/` starts with `adminGuard(request, write)` (`src/app/api/admin/_admin.ts`): same-origin check for writes, `requireAdmin` (401 / 403 "Admin only."), rate limit `default` per Admin e-mail. Gateway errors go through `adminFailure`: a `ConflictError` becomes 409 `CONFLICT` with the clash in words (`clash` in `src/services/adminBookings.ts`): room clash "The room is taken then. <owner> has <room>, <floor> · <range> (<ticket>)." with `fields: ["room","time"]`; owner clash "The owner already has another room then (one room per person at a time). …" with `fields: ["time"]`; `problems` lists up to five clashes. Other errors as `gatewayFailure`. Every write is audited (03 App-owned data). Bookings are returned as `AdminBooking` = `PublicBooking` + every form field + `ownerEmail` (`adminBooking` in `src/services/views.ts`); only these routes send other people's e-mails and form fields.

### GET /api/admin/overview
The dashboard. `{ ok, now, kpis: { waiting, today, todayHours, inUseNow, checkedInToday, noShowsToday, utilisationToday, utilisationWeek, unread, activeUsers }, waiting: AdminBooking[] (≤ 20, soonest first: In Progress and not ended, next 92 days), today: AdminBooking[] (the Manila day, by start), week: { from, byDay, byStatus } (Monday–Sunday), threads: ThreadSummary[] (≤ 5 unread), recent: AuditView[] (12) }`. Figures from `buildReport` (src/domain/reports.ts) for today and this week.

### GET /api/admin/changes?after=<id>
What happened since the Admin pages last looked, so a booking shows up in Admin at once (the pages ask every 3 seconds, `AdminLive` in 06). `ChangesQuery`: `after` (a whole number ≥ 0, optional). → `{ ok, last, entries: AuditView[] }`: `entries` = the entries with an id above `after`, oldest first, at most 20 (none without `after`); `last` = the newest audit id (0 for an empty log), or, when more than 20 are new, the id of the last entry sent, so the next look gets the rest and no notice is skipped. Rate limit bucket `live` (90 a minute per Admin), so the checks don't eat the `default` budget. A booking's `booking.create` entry has a readable `detail`: `bookingLabel` ("Paris, 2F · Tue, Sep 29, 8:00 AM – 9:00 AM", + " · N dates" for a series).

### GET /api/admin/bookings?from&to[&status]
`AdminBookingsQuery`: `from`, `to` (ISO with offset, `to` after `from`, ≤ 92 days), `status` optional (one of the six statuses). Every booking overlapping the range (any status unless filtered), by start: `{ ok, bookings: AdminBooking[] }`.

### POST /api/admin/bookings/{ticketNo}
`AdminActionBody` (by `action`): `approve` (`comment` ≤ 500 optional) → `approveBooking`: only In Progress (else 403 "Only requests waiting for Admin can be approved. RM-… is Approved."); `reject` (`comment` 1–500 required: "Say why the request is turned down.") → `rejectBooking`: only In Progress, → Cancelled with the comment as Admin comments; `cancel` (`comment` optional) → `cancelBooking` as Admin (any status; the comment as Admin comments); `checkin` → `checkIn` as Admin (inside the window, Approved or In Progress). Each sets `modifiedBy`, is audited (`booking.approve`, `booking.reject`, `booking.cancel` "by Admin.", `booking.checkin` "by Admin") and posts the automatic note. → `{ ok, booking: AdminBooking }`. Unknown ticket → 404.

### PATCH /api/admin/bookings/{ticketNo}
`AdminChangeBody`: any of `roomId`, `start`, `end` (ISO with offset), `participants` (1–500), `agenda` (1–200), `agendaType`, `priority` (at least one; else 400 "Nothing to change."). `prepareAdminChange` first: unknown booking or room → 404; Cancelled or Completed → 403; no real change → 400 "Nothing to change."; rule problems → 400 with `problems` and `fields` (`adminChangeIssues`: `validateRequest` without `RULES.adminMayOverride`, and a start that did not move may be in the past); a clash → 409 (above). Then `updateBooking` (the gateway checks the clashes again), audited `booking.update` with `describeChange` ("room Amsterdam, 2F → Paris, 2F; people 4 → 6"), and the note. → `{ ok, booking }`.

### POST /api/admin/bookings/approve
`BulkApproveBody`: `ticketNos` (1–100; "Pick at least one request."), `comment` optional. Each ticket once, each on its own: `{ ok, approved: string[], failed: [{ ticketNo, message }] }` (e.g. "Only requests waiting for Admin can be approved. RM-0129902 is Approved.", "Booking RM-9 not found.").

### POST /api/admin/bookings/swap
`SwapBody` `{ a, b }`. `prepareAdminSwap`: both exist (404), differ (400 "Pick two different bookings."), are open (403), in different rooms (400 "Both bookings are in the same room."), and each room is free for the other booking's time, not counting the pair (409). Then `swapRooms` (one step), audited `booking.swap` (`target` "RM-A ⇄ RM-B"), a note to both owners. → `{ ok, bookings: [a, b] }` in the order asked.

### GET /api/admin/reports?from&to
`ReportQuery` (≤ 92 days). `{ ok, report }` = `buildReport` with ISO `from`/`to`: `totals { bookings, hours, people, waiting, approved, checkedIn, cancelled, noShows, utilisation, avgLeadDays }`, `byStatus`, `byAgendaType`, `byFloor` (with `utilisation`), `byRoom` (`roomId, name, floor, selfBookable, count, hours, utilisation, noShows`, most hours first), `byDivision`, `byDay` (every Manila day, `YYYY-MM-DD`), `heatmap` (7 × 24 booked hours, Monday first), `topRequesters` (10). Definitions in 02 F32 and `src/domain/reports.ts`.

### GET /api/admin/audit?from&to&actor&action
`AuditQuery` (all optional). `{ ok, entries: AuditView[] }`, newest first; `AuditView` = `{ id, at, actor, actorName, action, target, detail }`.

### Users
- `GET /api/admin/users` → `{ ok, users: AccountView[] }`; `AccountView` = `{ login, name, email, division, role, disabled, mustChangePassword, createdAt, lastSignInAt }` (never the hash).
- `POST /api/admin/users` `NewUserBody`: `name` ("Last, First": "Write the name as \"Last, First\", like the tool."), `email`, `division` optional, `role` (`user` default). The login is the upper-case e-mail name; a login or e-mail already used → 409 "There is already an account for …". → `{ ok, user, password }` with a 16-character temporary password (letters and digits without 0, O, 1, l, I) and `mustChangePassword: true`; audited `user.create` (name and role, never the password).
- `PATCH /api/admin/users/{login}` `UserPatchBody`: `name`, `division` (null clears), `role`, `disabled` (at least one). Your own role or access → 403 "You can't remove your own Admin role." / "You can't disable your own account."; unknown → 404. Audited `user.update` with what changed.
- `POST /api/admin/users/{login}/reset` → `{ ok, user, password }`: a new temporary password, `mustChangePassword: true`, `sessionsValidAfter` now (signed out everywhere, AI apps too); a disabled account stays disabled; audited `user.reset`.
- `POST /api/admin/users/{login}/signout` → `{ ok, user }`: `sessionsValidAfter` now; audited `user.signout`.

### Rooms
- `GET /api/admin/rooms` → `{ ok, rooms: AdminRoomView[] }` (`RoomView` + `notes`).
- `PATCH /api/admin/rooms/{roomId}` `RoomPatchBody`: `name` (1–60), `capacity` (1–500 or null = not known), `av` (`VC`, `BYOD` or null), `selfBookable`, `notes` (≤ 500, null clears); at least one. `updateRoom` (the id, site, building, floor and kind stay); unknown → 404; audited `room.update` ("capacity 5 → 6; notes – → New screen"). → `{ ok, room }`.

### POST /api/admin/assistant
The Admin assistant (05, Admin assistant): the body and SSE events of `POST /api/assistant`, streamed by the same `streamAgent`. `confirmedTickets` become app notes for any booking ("App note: the Admin pressed a card's button; RM-… is now Approved (<owner>, <label>)."). Off-topic → `ADMIN_OFF_TOPIC_REPLY`; no `OPENAI_API_KEY` → 503 "The assistant is not available right now. You can still do everything from the Admin pages."

## MCP and sign-in for AI apps
The MCP server and its OAuth 2.1 sign-in (05, MCP; security in 09). `<origin>` is `publicOrigin(request)` = `originFrom(headers, requestUrl)`: protocol from the first `x-forwarded-proto`, else the request URL's, else `http` on localhost / 127.0.0.1 / [::1] and `https` anywhere else; host from the first `x-forwarded-host`, else `host`, else the URL's (Caddy and Vercel set both). The page `/oauth/authorize` uses `originFrom(await headers())`. MCP URL = `<origin>/api/mcp`; OAuth errors are `{ error, error_description }` (RFC 6749), not the app's `{ ok: false, … }` shape.

**CORS** (`OPEN_CORS` in `_http.ts`) on these endpoints only: `Access-Control-Allow-Origin: *`, `-Methods: GET, POST, OPTIONS`, `-Headers: Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id`, `-Expose-Headers: WWW-Authenticate, Mcp-Session-Id`, `-Max-Age: 600`; `OPTIONS` → 204 (`preflight()`). Safe because they read no cookies.

### GET /.well-known/oauth-protected-resource (also …/api/mcp)
RFC 9728: `{ resource: "<origin>/api/mcp", authorization_servers: ["<origin>"], scopes_supported: ["rooms"], bearer_methods_supported: ["header"], resource_name: "REPH Room Assistant" }`.

### GET /.well-known/oauth-authorization-server
RFC 8414: `{ issuer: "<origin>", authorization_endpoint: "<origin>/oauth/authorize", token_endpoint: "<origin>/api/oauth/token", registration_endpoint: "<origin>/api/oauth/register", response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["rooms"] }`.

### POST /api/oauth/register
RFC 7591 dynamic client registration. JSON body (≤ 10 000 characters; unreadable counts as empty): `redirect_uris` (1–5 strings, each allowed by `allowedRedirectUri`: ≤ 500 characters, a valid URL with no fragment and no user or password, and `https:`, or `http:` on `localhost`, `127.0.0.1` or `[::1]`, or a native app's own scheme matching `^[a-z][a-z0-9+.-]*:$` except `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `ftp:`, `ws:`, `wss:`), optional `client_name` (trimmed, first 80 characters; default "An AI app"), `token_endpoint_auth_method` (only `none`), `grant_types` (only `authorization_code` and `refresh_token`).

| Status | Body |
|---|---|
| 201 | `{ client_id, client_id_issued_at, client_name, redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "rooms" }`. `client_id` is a signed token of kind `client` holding `{ uris, name }` (no expiry), so nothing is stored |
| 400 | `invalid_redirect_uri` "Give 1 to 5 redirect URIs: https, http on localhost, or the app’s own scheme."; `invalid_client_metadata` "Only public clients are supported: token_endpoint_auth_method "none", with PKCE." or "Supported grant types: authorization_code and refresh_token." |
| 503 | `temporarily_unavailable` "Sign-in isn't set up on this server yet (SESSION_SECRET)." |

### GET /oauth/authorize (page)
Query: `response_type`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method`, `state`, `resource` (and anything else, ignored; only string values are read). `checkAuthorize(params, origin)`:
1. `client_id` must be a valid client token, else the page shows **Can't connect this app** "This app is not registered here. Remove the connector in the AI app and add it again." (no redirect).
2. `redirect_uri` must be one of the client's URIs (if left out, the client's only URI), else "The app asked to return to an address it did not register." (no redirect).
3. From here problems redirect back (`redirect()`, 307) to `redirect_uri` with `error`, `error_description`, `state` (≤ 500 characters, else dropped) and `iss` = origin: `response_type` ≠ `code` → `unsupported_response_type`; `code_challenge_method` ≠ `S256` or `code_challenge` not 43–128 characters of `[A-Za-z0-9_-]` → `invalid_request` "PKCE is required: code_challenge with code_challenge_method=S256."; `resource` given and not `<origin>/api/mcp` (trailing slashes ignored) → `invalid_target`.
4. Otherwise the page renders the consent screen (06): the client's name, where it returns to (`describeRedirect`: the https host name, "an app on this computer" for http on localhost, "the <scheme> app" for an app's own scheme) and the query, for the person to Allow or Deny.

### POST /api/oauth/authorize
The consent screen's decision. **Same-origin and signed-in (cookie).** Body `ConsentBody`: `{ params: Record<string, string> (keys ≤ 40 characters, values ≤ 8000, at most 20), allow: boolean }`. Checks `params` again with `checkAuthorize`.

| Status | Body |
|---|---|
| 200 | `{ ok: true, redirect }`: Allow → `redirect_uri?code=<code>&state=…&iss=<origin>`; Deny → `…?error=access_denied&error_description=The person did not allow access.&state=…&iss=…`; a problem after step 2 → the same OAuth error redirect as the page. One log line on Allow: `{ route: 'oauth', user, client, event: 'allowed' }` |
| 400 | `INVALID` with the step 1–2 message (never a redirect) |
| 401, 403 | not signed in; cross-origin |
| 503 | `UNAVAILABLE` "Sign-in isn't set up on this server yet." |

The code is a signed token of kind `code`, **60 seconds**, holding `{ cid: fingerprint(client_id), uri: redirect_uri, cc: code_challenge, sub: login, aud: "<origin>/api/mcp", scope: "rooms" }` (`fingerprint` = the first 22 characters of base64url SHA-256).

### POST /api/oauth/token
Form-encoded (JSON accepted too; body ≤ 10 000 characters). Answers `{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope: "rooms" }` with `Cache-Control: no-store`, or 400 with an OAuth error:
- `grant_type=authorization_code` with `code`, `client_id`, `redirect_uri` (if sent, must equal the code's), `code_verifier` (43–128 of `[A-Za-z0-9._~-]`; base64url SHA-256 must equal the code's challenge, constant-time), `resource` (if sent, must equal the code's audience). Checks in order: code valid and unexpired ("The code is invalid or has expired."), same client ("The code was issued to another app."), redirect URI, verifier ("code_verifier is missing or malformed.", "The PKCE check failed."), resource (`invalid_target`), **first use** ("The code was already used."; used ids kept in memory until they expire), account still exists.
- `grant_type=refresh_token` with `refresh_token`, `client_id`, optional `resource`: valid and unexpired, same client, same audience, first use (a used one is refused: "The refresh token was already used. Connect the app again."), account exists. Each use returns a **new** pair (rotation).
- Other grant types → `unsupported_grant_type`. Access tokens (kind `access`) last `ACCESS_SECONDS` = 3600, refresh tokens (kind `refresh`) `REFRESH_SECONDS` = 14 days; both hold `{ cid, sub, aud, scope }`.

### POST /api/mcp
`mcpCaller(request, origin)` reads **only** `Authorization: Bearer <token>`: no header → 401 `{ error: "unauthorized", error_description: "Sign in: connect this app to REPH Rooms." }`; a token that isn't a valid, unexpired access token for `<origin>/api/mcp` → 401 `invalid_token`; without the `rooms` scope → 403 `insufficient_scope`; an account that no longer exists → 401. Every 401/403 carries `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/api/mcp", scope="rooms"` (plus `error` and `error_description` when a token was given). Then: rate limit (`mcp`), `MCP-Protocol-Version` check (unsupported → 400 JSON-RPC error −32600), body ≤ 100 000 characters (413), JSON (−32700), 1–20 messages (400), and each message through `handleMessage` (05, MCP: protocol, tools and results). Only notifications → 202 with no body; otherwise the reply (or the array of replies for a batch), `Cache-Control: no-store`. `GET` and `DELETE` → 405, `Allow: POST, OPTIONS`.

## Not built yet
- `GET /api/route` [P2]: `?from=2F-lobby&to=batanes&avoidStairs=false` → `{ ok, route: { nodeIds, seconds, meters, floors, usesStairs }, steps: string[], points: { floor, x, y }[] }` (07).
- [P3] `POST /api/jobs/release` (auto-release every minute, shared-secret header).

## Tests
`src/app/api/__tests__/routes.test.ts` (22 tests) and `admin.test.ts` (8 tests, Admin and Messages, appendix H) set `DEMO_NOW=2026-09-28T09:00:00+08:00`, `RESERVATION_GATEWAY=mock`, `MOCK_SCENARIO=demo`, imports the handlers and calls them with `Request` objects on `http://localhost:3000`. Requests are signed in as the demo user by default (`AS_DEMO_USER = as('MARKJOSEPH.REMETIO')`, where `as(login)` is a `cookie: reph-session=<createSession(login)>` header); pass `{}` for nobody; POSTs also send `host: localhost:3000`. Covered:
- **rooms:** list, floor filter, invalid site 400.
- **availability:** privacy filter (only owner, division, time, size and status of others), 7-day limit.
- **search:** flow B on the demo scenario, rule problems 400.
- **proposals:** 400 generic agenda, 404 unknown room, 409 taken; single-use confirm then 410 (AC-5.1, AC-5.2); another signed-in person can't confirm (AC-5.3); cancellation only through a proposal and only for your own bookings (AC-8.1); form fields round trip and the Urgent rule; `In Progress` after confirm; other people's bookings never carry private fields.
- **sign-in:** every data route answers 401 without a session (browsing too) and `GET /api/session` gives `user: null`; a forged, tampered, garbage or non-account cookie counts as nobody; a wrong password and an unknown username get the same 401 message and no cookie; an empty body 400; signed in, the session names the person without e-mail, Lagunoy, Lili has no bookings, and someone else's agendas stay private; `DELETE` clears the cookie.
- **signing in:** with a known test password swapped in for Sandoval, Jeremiah (the e-mail as username, any case) → 200, the user, and `Set-Cookie: reph-session=<payload>.<signature>; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`; that cookie works for `GET /api/session`.
- **accounts:** exactly the three logins; each is in the demo employee list with the same name, e-mail and division, the login is the upper-case e-mail name, and only a scrypt hash is stored.
- **one room per person:** two proposals for the same hour in different rooms both show; the first Confirm books, the second gets 409 "…One room per person at a time"; a third proposal is refused at once (409, "You already have Rio De Janeiro, 2F …", `fields: ["time"]`); the search warns, marks the requester's own conflict `mine: true` (and `false` for someone else), and gives no warning for Iloilo (`flow: none`).
- **check-in:** open window 200; outside 403 with the window; not yours 403.
- **bookings list:** every status, room, employee and type filters, privacy, 31-day limit.
- **weekly series:** all dates or none, clashing dates listed, bad hardware 400.
- **errors name fields:** clash → `room`, `time`; generic agenda → `agenda`; past → `time`.
- **bad input names the field:** a time without an offset on `/api/availability` and `/api/bookings` → 400 whose message starts "from: "; a booking body (no `action`) with hardware `Jetpack` → 400 whose message starts "hardwareRequirements.0: ".
- **also:** cross-origin POST 403; health without secrets (`clock: "demo"` under the test's `DEMO_NOW`).

`src/mcp/__tests__/mcp.test.ts` (9 tests, same environment) covers the MCP server and its sign-in through the route handlers: metadata; 401 with `WWW-Authenticate` without a token, with only the session cookie or with a bad token, and 405 for `GET`; the whole connect flow (register, Allow, code for tokens) then `initialize`, a notification (202), `tools/list` (the 9 tools, no `draft_owner_message`, read-only hints), `find_rooms` without the optional arguments, `room_schedule` (no e-mail addresses, no `shown_to_user`), `my_bookings` as the token's person; `propose_booking` → a 15-minute `confirm_url` that another person can't open (410) and that the owner confirms with the usual `POST /api/proposals/{id}`; codes single-use and bound to the verifier, client and redirect URI; refresh rotation, and tokens that can't pass as another kind or for another host name, and a tampered token; registration refusing unsafe redirect URIs and confidential clients while taking loopback, `cursor://` and claude.ai URIs; consent needing sign-in and same origin, never redirecting to an unregistered address, Deny → `access_denied`, `plain` PKCE → `invalid_request`, another resource → `invalid_target`; JSON-RPC edges (unknown method −32601, unknown tool −32602, bad arguments `isError`, a batch with a notification answers two replies). Appendix H lists each assertion.
