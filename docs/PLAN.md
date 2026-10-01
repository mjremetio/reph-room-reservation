# Build plan

One task at a time. For each task: read the listed spec sections, build, then run `npm test`, `npm run typecheck` and `npm run build`. Definition of done: `docs/spec/09-quality.md`. After every change, update the spec so the app can be rebuilt from it.

Size: S ≈ half a day, M ≈ 1–2 days, L ≈ 3–5 days (for one developer with Claude Code).

## Status (2026-10-01)
| Area | Status |
|---|---|
| P1-01 … P1-11, P1-13 … P1-52 | **Done**. 149 tests in 29 files pass (including the spec's verbatim check); evals in `evals/last-run.md` (58 conversations: 48 for the room assistant, 10 for the Admin assistant); typecheck and build pass; deployment on AWS: `docs/spec/11-deploy-aws.md` (ECS, EC2, or one EC2 server with the `deploy/ec2/` bundle, §8); the demo runs on Vercel on the real Asia/Manila clock (https://ai-booking-sooty.vercel.app, `docs/spec/09-quality.md`, Deployment; testing only, the hackathon runs on EC2); MCP server for Claude, ChatGPT and other AI apps at `/api/mcp` (05, MCP); Admin area at `/admin` with its own assistant (P1-39 … P1-46) |
| Checked in the browser against the real model (`gpt-5.6-luna`) | Flows A, B, C; booking and confirm; swap draft; map-only booking; New booking; table (pagination, row details); 3D; drawer; check-in; cancel; Name of Requestor without sign-in (P1-22, since replaced by sign-in, P1-31); traced 2F/3F plans in 2D and 3D; guideline questions (`npm run ask`); 1440 / 1024 / 390 px |
| Open inside done tasks | Card stories or component tests (P1-06); axe check (P1-08, needs P1-12) |
| Not started | **P1-12** end-to-end tests |
| Open questions | `docs/RULES.md` (Admin) and `docs/spec/08-integration.md` (IT) |

## Already in the starter [Built]
Domain logic (rules, availability, ranking, swap options, A* routing), room data, demo scenario, floor data, mock gateway, swap helper, shared `searchRooms` service, proposals store, 45 tests. Reference code for the agent, tools and two API routes (it matched `@openai/agents` 0.18 without changes).

---

## Phase 1 · Working assistant on the demo scenario

### P1-01 · Set up the app (S) — Done
Spec: 01 Stack · 09 Configuration. Reproducible steps:
1. Node.js 22 or newer (`nvm install 22 && nvm use 22`; the machine's default may be older).
2. In the starter folder: `npm install` (keeps `package.json` scripts), then
   `npm install next react react-dom @openai/agents zod@4 @tanstack/react-query three @react-three/fiber`
   `npm install -D typescript tsx @types/node@22 @types/react @types/react-dom @types/three`
   Installed versions: next 16.3.6, react 19.3.0, @openai/agents 0.18.0, zod 4.6.5, @tanstack/react-query 5.103.3, three 0.186.1, @react-three/fiber 9.8.1, typescript 6.0.3, tsx 4.23.15, @types/node 22.20.4.
3. `tsconfig.json`: add `"types": ["node"]` (TypeScript 6 no longer loads `@types/*` automatically). `next build` then sets `jsx: react-jsx` and adds `.next/dev/types/**/*.ts` to `include`.
4. Don't run a generator that replaces `package.json`, `tsconfig.json` or `src/`. Create `src/app/layout.tsx` (Open Sans 400–800 and Barlow Condensed 500–700 via `next/font/google`, variables `--font-open-sans`, `--font-barlow-condensed`; imports the styles) and `src/app/page.tsx`.
5. `cp .env.example .env.local`; add `OPENAI_API_KEY`; `OPENAI_MODEL=gpt-5.6-luna`.
6. `next dev` appends a "This is NOT the Next.js you know" block to `CLAUDE.md` (and re-adds it); keep it committed.
Done when: `npm test`, `npm run typecheck`, `npm run build` pass; `npm run dev` serves the page.

### P1-02 · Make the agent run (M) — Done
Spec: 05 · 04 POST /api/assistant
- Agent, tools and route checked against `@openai/agents` 0.18; tracing off unless `OPENAI_TRACING=true`; 90 s run timeout; history trimming (`src/agent/history.ts`).
- Instructions: defaults, search first, time ranges, workshop = Meeting (05 Instructions).
- `scripts/ask.ts` (`npm run ask -- "…"`) prints tool calls, UI events and the reply.
Done when: the three demo requests give flows A, B, C and `ask` prints `room_results`. ✔

### P1-03 · API routes (M) — Done
Spec: 04 all
- `_schemas.ts` (zod), `_http.ts` (errors, same-origin, rate limit, gateway errors), routes: rooms, availability, search (same shape as `room_results`), proposals (book with the form fields, or cancel), proposals/{id}, bookings (the tool's list), bookings/mine, check-in, health, people. (`/api/me` was removed in P1-22.)
- Privacy filter `publicBooking()` and result views in `src/services/views.ts`; `prepareBooking.ts` shared with the agent tools; `sameEmail` in `src/domain/people.ts`.
Done when: route tests cover 200/400/403/404/409/410, the privacy filter and the form fields. ✔

### P1-04 · App shell and tokens (S) — Done
Spec: 06 S1 layout, Design tokens, Responsive
- `App.tsx` (TanStack Query provider, store, clock sync, top bar), styles in `src/ui/styles/` (base, shell, cards, map, sheets, table, responsive), phone bottom sheet.
Done when: layout works at 1440, 1024 and 390 px. ✔

### P1-05 · Chat panel with streaming (M) — Done
Spec: 06 Assistant drawer · 04 SSE
- SSE client (fetch + reader) for `text`, `ui`, `done`, `error`; `history`, `confirmedTickets`; chips; typing indicator; error banner with **Try again**; React context + `useReducer` store.
Done when: replies stream; UI events reach the map. ✔

### P1-06 · Cards (M) — Done (stories open)
Spec: 06 Cards · 02 F2–F5, F8, F9
- Results (A), partly free (B), who has the rooms (C), other times, proposal (countdown, form details), booked (flip), cancel, draft message, hand-off.
Open: a story or component test per card.

### P1-07 · Confirm flow (S) — Done
Spec: 02 F5 · 04 POST /api/proposals/{id}
- 200 booked card / 409 / 410 with **Check again** (re-proposes); single flight; `confirmedTickets`; **Add to calendar** (.ics). ✔

### P1-08 · Floor map v1 (L) — Done (axe open)
Spec: 06 Room states, 2D floor map · 07 2D rendering
- `FloorMap` with states, rank badges, owner line, halos, keyboard access; floor tabs with counts; legend (`MapLegend`: status counts per floor, hover/click highlight on the 2D map and 3D labels, plan key); Table view as the list alternative.
Open: axe check (P1-12).

### P1-09 · Timeline, time picker and browsing (M) — Done
Spec: 02 F11 · 06 Map side, Timeline, Room sheet
- Search bar (`TimeFields`, people, type, **Find rooms**), office-day timeline with shifts and holder names, room sheet with **Book this room**. Works with OpenAI off. ✔

### P1-10 · My bookings, check-in, cancel (M) — Done
Spec: 02 F6–F8 · 04 bookings routes
- My bookings sheet with the tool's fields; check-in in the window; two-step cancel (`useBookingOps`). ✔

### P1-11 · Agent evals (M) — Done
Spec: 05 Evals
- `scripts/evals.ts` (`npm run evals`, `-- --tag`, `-- --only`) runs `evals/phrases.json` (41 conversations then, 46 since P1-31) against the real model on a fresh mock gateway per item with the demo clock; prints ✓/✗ with reasons; exits non-zero below 90% overall or below 100% on `safety`; a full run writes `evals/last-run.md`.
- Instructions tuned from 34/41 to 41/41 in that task's last full run; one miss per run can still happen (history in 05 Evals and appendix D).

### P1-12 · End-to-end tests (M) — Not started
Spec: 09 Testing · 02 acceptance criteria
- Add `@playwright/test` (dev) and `@axe-core/playwright`; `playwright.config.ts` starts `npm run dev` with `DEMO_NOW`; record one SSE stream per demo flow and replay it with `page.route` (no model calls in CI).
- Tests for sign-in (wrong password, Sign out, a 401 back to sign-in), flows A, B, C, confirm, 409 (room taken, and one room per person), 410, cancel, check-in, hand-off, the schedule card, suggestions, New booking, table filters, pagination, row details and CSV, drawer, 3D fallback; axe on S1–S3, S7–S9.
Done when: `npm run e2e` passes headless.

### P1-13 · Demo polish (S) — Done
Reduced motion, empty and error states, OpenAI-missing banner, "capacity not on file", Iloilo disabled, readable type scale (nothing under 13 px, darker muted text).

### P1-14 · Table view (M) — Done
Spec: 02 F14 · 06 Table view
- Rooms and Bookings tabs, search, filters, sort, row actions, **Clear filters**, **Export CSV** (`csv.ts`, `download.ts`), pagination; Bookings in the tool's column order (the Refresh button was removed in P1-28: the data refreshes every minute). Tests: `csv.test.ts`.

### P1-15 · New booking (S) — Done
Spec: 02 F13 · 06 New booking
- Top-bar **+ New booking** → sheet with the form fields and time → shared search → **Book** → proposal card.

### P1-16 · 3D view (L) — Done (first version of P4)
Spec: 02 F15 · 06 3D view · 07 3D model
- `Building3D.tsx` (lazy), `building3d/Scene.tsx`, `layout.ts` (tested), `textures.ts`: realistic cutaway, state colours, seated figures, DOM labels, animations, AO and soft shadows, demand rendering.

### P1-17 · Assistant drawer (S) — Done
Spec: 02 F16 · 06 Assistant drawer
- Collapse, reopen tab, top-bar toggle, unread dot, auto-open, phone bar; remembered per browser.

### P1-18 · Who holds a room (S) — Done
Spec: 02 F17 · 03 View models (`reservedBy`)
- Holder on the 2D map, 3D labels, timeline blocks, table **Reserved by**.

### P1-19 · Align with the Room Reservation Tool's fields (M) — Done
Spec: 03 Mapping to the Room Reservation Tool · 06 Reservation form fields · RULES
- `Priority`, `TrainingType`, created/modified/admin fields on `Booking`; Urgent rule enforced; `BookingFields` in the room sheet and New booking; the tool's list columns in the Bookings table and CSV. Tests: rules (Urgent), routes (fields round trip, privacy). Completed by P1-23.

### P1-20 · Clean architecture pass (S) — Done
- YAGNI: removed unused `motion` and `gsap`, the unused `LOG_CONTENT` setting, dead CSS and one-file helpers. DRY: `sameEmail`, `prepareBooking`, `searchResultViews` for search and events, `show_room`, `useBookingOps`, `Sheet`, `TimeFields`, `BookingFields`, `saveFile`. KISS: `/api/search` returns the `room_results` shape; CSS split by area; layer rules in 01.

### P1-21 · Guidelines in the assistant (S) — Done
Spec: 05 Guidelines knowledge, Tools · RULES
- `src/agent/guidelines.ts`: a paraphrase of the Room Reservation Guidelines (no names, no room mailboxes; numbers from `RULES`) appended to the instructions; `list_rooms` tool; `it_support` hand-off (IT line, "Call IT"); 6 `guidelines` evals. Tests: `instructions.test.ts`.

### P1-22 · Name of Requestor instead of sign-in (S) — Done (replaced by P1-31)
Spec: 02 F18 · 04 Name of Requestor · 06 Name of Requestor · 09 Security
- No login and nothing in the top bar. `src/lib/requestor.ts` (`requestor`, `requireRequestor`, `rateKey`), `X-Requestor` header, `GET /api/people`, `gateway.listPeople()`; browsing works without a name, acting needs one. Browser: `requestor.ts` (`useRequestor`, `RequestorSync`, `reph-requestor`), `RequestorField` in the form, My bookings and the assistant's `need_requestor` card; the agent's `user` may be null. `DEMO_USER_*` and `/api/me` removed; `ASK_AS` for `npm run ask`. Tests: routes (browse vs act, header), instructions (no name).

### P1-23 · Every field of the tool (M) — Done
Spec: 03 Mapping, Recurrence · 04 GET /api/bookings, POST /api/proposals · 06 Reservation form fields, Table view, Booking details
- The full form in its order (ticket, Name of Requestor, division, agenda, type, priority, type of training, special instructions, participants, hardware, building, room, Starts at / Ends at, recurrence, status / admin comments / modified by; P1-28 later trimmed the form to the fields the user decides, and the read-only ones show in Booking details); recurrence (`src/domain/recurrence.ts`, all or none); hardware (`src/config/hardware.ts`); bookings created In Progress; `GET /api/bookings` (the tool's list and search panel); Bookings tab on it with the tool's columns, pagination on both tabs, row → details (`BookingDetails`); cards and My bookings show hardware and recurrence. Rooms checked against the appendix layouts: Bacolod and the lactation room added, Mt. Apo and Mt. Mayon seat 20. Tests: recurrence, routes (list, series, hardware).

### P1-24 · Floor plans traced from the guidelines layout (M) — Done
Spec: 07 Floor plans, 2D rendering, 3D model · 06 2D floor map, 3D view
- `scripts/trace-floors.py` writes `data/floors/manila-bldg-h.json` from pixel boxes on the appendix layouts: outline, every room and area (offices, core, restrooms, service rooms, amenities, open areas, unlisted yellow rooms), workstations, tables and chairs, approximate corridors; four bookable rooms not on the layout are "unplaced". `src/ui/floorLayout.ts` expands the furniture for the 2D map and the 3D model (instanced). Tests: `floorLayout.test.ts`, routing (unplaced).

### P1-25 · Legend, New booking modal, scope guardrail (S) — Done
Spec: 06 Map card (legend), Sheets · 05 Scope guardrail · 09 Deployment
- `MapLegend.tsx`: status counts per floor, hover/click highlight on the 2D map and 3D labels, plan key. New booking as a centred wide modal (`Sheet wide`, two columns), starting at the next bookable half hour (`RULES.startGraceMinutes`).
- `src/agent/guardrails.ts`: `scopeGuardrail` (quick check, then a classifier; blocks before the model) plus the instructions' scope and safety rules; 8 `scope` evals. Tests: `guardrails.test.ts`.

### P1-26 · Deployment: container image + AWS ECS/EC2 steps (11) (S) — Done
Spec: 11 Deploy on AWS · 09 Deployment
- `next.config.ts` (`output: 'standalone'`), a multi-stage `Dockerfile` (Node 22 Alpine, non-root, health check on `/api/health`) and `.dockerignore` (no secrets in the image); `docs/spec/11-deploy-aws.md`: ECR, ECS Fargate (one task) behind an ALB with a 120 s idle timeout, `OPENAI_API_KEY` from Secrets Manager, EC2 as the alternative, update and roll back, and the smoke test after every deploy (propose → confirm → My bookings → cancel). Done: the image builds and runs locally (26 Sep 2026: health check healthy, pages and API answer, non-root, no `.env` inside). Not yet done: running the AWS steps, which needs the company's AWS account (run them in a sandbox account first).

### P1-27 · Assistant QA, New chat, form errors (S) — Done
Spec: 05 Evals, Instructions · 06 Assistant drawer, Form errors · 04 Conventions (error `fields`)
- **+ New chat** in the assistant header (`new_conversation`; disabled while streaming). Tests: `store.test.ts`.
- Form errors mark fields red: `precheckBooking`, `formErrorOf`, `FormErrorBox`, `invalid` on `BookingFields`; the API returns `fields` (`ISSUE_FIELD`). Tests: routes ("errors name the form fields to mark red").

### P1-28 · UI cleanup, QA fixes, spec sync (S) — Done
Spec: 06 (every screen), 02, 04 Conventions and routes, 05 Style, 10 §9, appendix H
- **Less text on every screen.** Top bar: no Hide assistant button (the drawer's ‹ and the reopen tab do it), the clock without its label (tooltip). Assistant: one-line welcome, three chips, no composer hint. Map: no "Showing …" note, short result notes; the legend is one row of status chips with counts and a **Key** toggle (closed by default) for the plan key; generic area names (Office, Service room, Room, Workstations) are no longer written on the plan; "Location to confirm" and "You" on the map. Timeline: date (and room) only, shifts as Morning / Afternoon / Night. Table: no count line, no Refresh, no first/last page buttons.
- **Forms trimmed.** No ticket line, Building, read-only status block or help paragraphs; Division under the name; Type of training only for Training; People and Room side by side; Repeat instead of Recurrence; the Urgent rule as a tooltip; a one-line hardware note. Room sheet: one meta line, no owner lines (the day list has them), "Free all day". My bookings: no "Filed by", check-in shown only while still ahead. New booking: no subtitle.
- **Assistant replies**: one or two sentences, no repeating the cards; hand-offs call `get_handoff` first.
- **API fixes**: a time without an offset is a 400 (was a 500) on `/api/availability` and `/api/bookings`; the proposal body is keyed on `action`, so a bad field is named. Tests: routes ("bad input answers 400 with a message that names the field").
- **Spec sync**: `scripts/spec-verbatim.ts`, `npm run spec:sync` / `spec:check`, `<!-- verbatim: <path> -->` markers on every full-file copy in the docs, and `src/__tests__/spec.test.ts` so `npm test` fails when a copy drifts (10 §9).

### P1-29 · 2D zoom and pan, 3D grab-and-move, appendix I (S) — Done
Spec: 06 2D floor map, 3D view · 07 · 10 §2, §9 · appendix I, H
- 2D map zoom and pan (`src/ui/mapZoom.ts`, pure): + / − / fit buttons, wheel at the pointer, pinch, drag to pan once zoomed, `+` `−` `0` and arrow keys; the view resets when the floor changes. 3D: the grab cursor, left drag or one finger moves the building, right drag rotates, wheel or pinch zooms. Tests: `mapZoom.test.ts`.
- Appendix I copies every other source and test file, plus `README.md` and `CLAUDE.md`, verbatim, so a rebuild retypes nothing. Cold-read fixes across the spec: form fields and the Urgent rule as coded, the rendered instructions, counts and the fence rule.

### P1-30 · Turn the map (S) — Done
Spec: 02 F24 · 06 2D floor map, 3D view · 07 2D zoom, pan and turn, Controls · appendix F, G, I, H
- 2D: `View.angle` (quarter turns) in `mapZoom.ts` (`turnView`, `rotatedBox`, `turnTransform`; the frame keeps the floor's shape); Turn left / Turn right buttons and R / Shift+R; names, icons, badges and "You" stay upright (`upright()` in `FloorMap.tsx`); Whole floor (0) resets zoom and turn; a floor change keeps the turn. Map keys ignore Ctrl/⌘/Alt.
- 3D: the same `TurnButtons` at the top right and R / Shift+R turn the building 45°, eased (`shared.turn` in `CameraRig`).
- Tests: `mapZoom.test.ts` (5).

### P1-31 · Sign-in, one room per person, who has the room, suggestions (M) — Done
Spec: 02 F18, F25–F27 · 03 Account, Invariants · 04 Session, POST /api/proposals · 05 Tools (`room_schedule`), Instructions · 06 Sign-in, Cards, Suggestions · 09 Security, Deployment (Vercel) · RULES · appendix B11, C, D, H
- **Demo sign-in** (the owner asked for it on 28 Sep 2026, with three accounts: Remetio, Mark Joseph; Sandoval, Jeremiah; Lagunoy, Lili): `src/config/accounts.ts` (scrypt hashes only; `npm run hash-password`), `src/lib/passwords.ts`, `src/lib/session.ts` (signed `reph-session` cookie, `SESSION_SECRET`, 12 h), `src/lib/requestor.ts` from the session; `GET/POST/DELETE /api/session`; every other data route answers 401 without a session; `/api/people` and the `X-Requestor` header removed. Browser: `Gate`, `SignIn.tsx`, `session.ts` (`useMe`, `forgetUser`, `useSignOut`), user menu and **Sign out**; the forms show the Name of Requestor read-only; the name picker (`RequestorField`, `requestor.ts`), the `need_requestor` card and the store's `requestor` removed; the agent's `user` is always set.
- **One room per person at a time** (`RULES.oneRoomPerPersonAtATime` [OPEN]): `ownConflicts`, `ownBookingClashes` in `prepareBooking` (409), the search warning, and `MockGateway.createBooking` at Confirm (`ConflictError` kind `requester`). Rooms still never double-book.
- **Who has the room**: the `room_schedule` tool (`src/services/roomSchedule.ts`, `matchRooms`, `bookableFrom`), the `room_schedule` event and `ScheduleCard`; `status` and `mine` on every other-person booking; partly free cards list every free part and every booking, and a "Who has the other rooms" / "Taken the whole time" card.
- **Suggestions**: grouped chips (Book a room, Who has it, My bookings, Questions) on the welcome and in an Ideas panel behind a lightbulb button.
- Deploy: Vercel (`vercel --prod`, `SESSION_SECRET` added to the project's production variables); GitHub.
- Tests: routes (sign-in, forged cookies, cookie attributes, accounts, one room per person), availability (`ownConflicts`), rules (`bookableFrom`), gateway (one room per person), searchRooms (warning and refusal), roomSchedule (5), instructions (signed-in user, schedule and one-room rules), store. Evals: 5 new items (`schedule-*`, `one-room-per-person`); 45/46 in the latest full run.

### P1-32 · One EC2 server, VPS style: Docker Compose and Caddy (S) — Done
Spec: 11 §8 · 10 §2–§4, §8–§9 · 09 Deployment · 01 Tech stack
- `deploy/ec2/`: `compose.yaml` (app from the `Dockerfile`, Caddy `caddy:2-alpine` in front, only Caddy publishes ports, logs capped), `Caddyfile` (automatic HTTPS for `SITE_ADDRESS`, `:80` = plain HTTP; gzip/zstd; nosniff, referrer policy, no Server header), `env.example`, `deploy.sh` (idempotent; installs Docker with Compose and Buildx on Ubuntu 22.04/24.04 or Amazon Linux 2023, 2 GB swap on small instances, settings in `/etc/reph-rooms/.env` with a generated `SESSION_SECRET`, `SITE_ADDRESS` defaulting to `<ip>.sslip.io`, asks for the OpenAI key; tags `previous`, builds, starts, checks health; `rollback`), `package.sh` (`npm run package:ec2` → `dist/reph-rooms-<commit>.tar.gz` from the last commit). `dist/` git- and docker-ignored.
- Tested 29 Sep 2026: first deploy, update and rollback on a fresh Ubuntu 24.04 machine (OrbStack, arm64) behind Caddy on HTTP, sign-in through the proxy; the Amazon Linux 2023 install path in an `amazonlinux:2023` container. Not yet run on a real EC2 instance (needs an AWS account and a public address for Let's Encrypt).

### P1-33 · Map colours that show availability at a glance (S) — Done
Spec: 06 Room states, Legend, 3D view, Design tokens · 07 2D rendering · appendix E, F.6, G
- Traffic-light availability, blue kept for "yours": free green (tint, 1.5 px edge, green dot), fits a stronger green (2.5 px edge, green rank badges), partly free orange (half clock), taken red hatch with a red edge, not suitable grey dashed. Tokens `--green`, `--green-tint`, `--green-fill`, `--red`, `--red-tint`, `--red-hatch` (the grey `--taken` is gone). The legend, the 3D carpets, strips and label dots, the floor-tab counts, the chat's rank circles, the schedule card's Free tag and the table's status chips use the same colours. Checked in the browser (2D at 3–4 PM on the demo Monday: four red, one orange, the rest green; 3D the same).

### P1-34 · Real Asia/Manila clock (S) — Done
Spec: 01 Glossary · 03 Demo scenario · 04 GET /api/health · 06 Top bar, Clock · 08 Clock · 09 Configuration · appendix A2, B1
- The owner asked to "change the timestamp to Asia/Manila": the top-bar clock showed the frozen demo time. `DEMO_NOW` is now empty by default (`.env.example`, `deploy/ec2/env.example`; removed from Vercel production): the app runs on the real time, always shown in Asia/Manila, and the clock reads e.g. "Tue, Sep 29, 9:05 PM PHT" (tooltip "Now in Asia/Manila, UTC+8"). On the real clock the mock loads the demo week moved into the current Manila week (`scenarioInWeekOf`, `manilaStartOfWeek`), so the map is never empty. `GET /api/health` reports `clock: "demo" | "real"`. The scripted demo, tests and evals still pin `DEMO_NOW`.
- Tests: data (`scenarioInWeekOf`, `manilaStartOfWeek`), routes (health `clock`).

### P1-35 · 3D: turn all the way round (S) — Done
Spec: 02 F15 (steps 6–8, AC-24.6, AC-24.8) · 06 3D view · 07 Controls · appendix G
- Drag (one finger) turns the building a full 360° and tilts it from straight down to just above eye level (polar 0.05 → 1.42); Shift-, Ctrl-, ⌘- or right-drag (two fingers) moves it; the wheel zooms. **360°** button (or S) keeps it turning, one turn in 24 s, until pressed again or dragged; **compass** button (or 0) glides back to the starting direction, tilt, zoom and position, and its needle always points to the top of the 2D plan. The room sheet's state dot uses the map's colours. Checked in the browser (drag, spin, reset, tilt) on 29 Sep 2026.

### P1-36 · MCP server for Claude, ChatGPT and other AI apps, with OAuth 2.1 (M) — Done
Spec: 05 MCP · 04 MCP and sign-in for AI apps, GET /api/proposals/{id} · 09 MCP and OAuth threat model · 06 Connect an AI app · 02 F28 · appendix I
- `POST /api/mcp` (Streamable HTTP, stateless JSON-RPC; `src/mcp/server.ts`): the assistant's own tools (minus `draft_owner_message`) for the token's person; `propose_booking` / `request_cancellation` return a `confirm_url` (15-minute proposals, `RULES.linkProposalHoldMinutes`); the person confirms in the app (`ConfirmLink`, `GET /api/proposals/{id}`, `showCancel`).
- OAuth 2.1 (`src/mcp/oauth.ts`, `src/lib/tokens.ts`): metadata (RFC 9728, 8414), dynamic client registration (RFC 7591), consent screen `/oauth/authorize` (`Consent.tsx`), PKCE S256, audience-bound 1-hour access tokens, rotated 14-day refresh tokens, signed stateless tokens with per-kind keys; open CORS only on these endpoints; security headers on every path (`next.config.ts`), HSTS in the EC2 Caddyfile.
- **AI apps** in the user menu → `ConnectAI` (URL, steps for Claude, ChatGPT, Claude Code, Cursor, VS Code). No new dependencies (hand-written, `node:crypto`).
- Tests: `src/mcp/__tests__/mcp.test.ts` (9). Checked 29 Sep 2026 over real HTTP on the production build: metadata, registration, the consent page (Allow), code → tokens with PKCE, `initialize`, `tools/list`, `room_schedule`, `propose_booking`, and the confirm link opening the booking card. Not yet tried from Claude or ChatGPT themselves (needs the public URL).
- Limits (09): no server-side revocation of one connection; codes, refresh rotation and proposals in one server's memory, so run one instance (EC2). Since P1-51 they live in Redis when it is configured.

### P1-37 · 3D start view fits the window (S) — Done
Spec: 06 3D view · 07 Start view · appendix G
- The user found the 3D view "super large". The camera now starts 15% farther out (`START_OUT`) and far enough that the floor's width plus 15% (`FIT_MARGIN`) fits the canvas; zoom out to 25 × VIEW (was 15); fog 26 → 50 × VIEW (was 18 → 38); the compass returns to this view. Checked in the browser on 29 Sep 2026.

### P1-38 · My bookings shows every upcoming booking (S) — Done
Spec: 02 F6 (AC-6.1) · 04 GET /api/bookings/mine · 05 my_bookings · 06 S3 · 08 gateway
- The owner asked that a booking appear in My bookings even before Admin approves it. In Progress requests were already listed, but only for the next 14 days, so a Training or MPH booking further out (they go 90 days ahead; Pantry has no limit) never showed. `GET /api/bookings/mine` and `my_bookings` (`days_ahead: null`) now have no end (`listMyBookings(email, from, to?)`); the sheet's subtitle says "Everything coming up, including requests waiting for Admin". Tests: routes 6 and 22.

### P1-39 … P1-46 · Admin area (L) — Done (30 Sep 2026)
Spec: 01 layers · 02 F29–F33 · 03 App-owned data · 04 Admin, Messages, Session · 05 Admin assistant · 06 S13–S22 · 08 gateway · 09 Security, Audit · RULES (app rules, questions 17–19)
The owner asked for an Admin dashboard to run the system (bookings, reports, charts, exports, logs, chat with people about their bookings, swaps and changes, users with account resets, room details) and for Admin to have an AI assistant too. Decisions (the plan's defaults): app data in memory behind `AppStore` (PostgreSQL in P3-06), the owner's account is Admin, in-app threads polled every 15 s, SVG charts, no new dependencies.
- **P1-39 Foundations.** `Role` on accounts (`src/config/accounts.ts` seeds the store); `src/store/` (`AppStore`, `MemoryStore`, `getStore`): accounts, audit log, message threads. Sessions read the store; disabled accounts and "sign out everywhere" (`sessionsValidAfter`, also for MCP tokens) end sessions at once. `requireAdmin`; `GET /api/session` returns `role` and `mustChangePassword`. `src/lib/audit.ts`: sign-ins and every write are logged (never message text or passwords).
- **P1-40 Table and chart kits.** `src/ui/table/kit.tsx` (sorting, paging, toolbar, debounce, CSV) shared by the Table view and `DataGrid` (column-driven search, sort, pages, row selection, CSV of the filtered or selected rows); `src/ui/charts/Charts.tsx` (stat tiles, bars, columns, donut, heatmap; each with a data table).
- **P1-41 Bookings.** Gateway `approveBooking`, `rejectBooking`, `updateBooking`, `swapRooms` (admin actor); `adminChangeIssues` and `RULES.adminMayOverride`; `prepareAdminChange`, `prepareAdminSwap`, `prepareAdminAction`; `/api/admin/bookings…`; `/admin/bookings` with bulk approve and CSV; `AdminBookingSheet` (approve, turn down, change, swap, cancel, check in, thread).
- **P1-42 Messages.** `src/services/messages.ts`, `/api/messages…`; Messages in the top bar (unread badge), Message Admin in My bookings, `/admin/messages`; automatic notes on Admin actions.
- **P1-43 Users.** `src/lib/accounts.ts`, `/api/admin/users…`, `/admin/users` (add with a temporary password, edit, disable, reset account, sign out everywhere), `POST /api/session/password` and the Choose a new password screen.
- **P1-44 Rooms.** `updateRoom`, `/api/admin/rooms…`, `/admin/rooms`; `/api/rooms` is no longer cached for 5 minutes.
- **P1-45 Dashboard and reports.** `src/domain/reports.ts` (`buildReport`, `waitingForAdmin`, `manilaToday`), `/api/admin/overview`, `/api/admin/reports`, `/admin` and `/admin/reports` (range presets, charts, CSV per section, print to PDF).
- **P1-46 Logs, Admin assistant, docs.** `/admin/logs` (filters, CSV); the Admin assistant (`src/agent/adminAgent.ts`, `adminTools.ts`, `adminScopeGuardrail`, `POST /api/admin/assistant`, `AdminAssistant` panel with cards whose buttons call `/api/admin/*`); `streamAgent` shared by both assistants; 10 Admin evals.
- Tests: `src/app/api/__tests__/admin.test.ts` (7), `src/domain/__tests__/reports.test.ts` (2), rules (+1), gateway (+3). Checked in the browser on 30 Sep 2026 against the dev server (demo clock): dashboard, the assistant preparing and the card approving a request, bookings (range, change with a clash refused and a valid change with the owner's note), reports, adding a person, logs, the user's Messages badge and reply, the Choose a new password screen.
- Initial page JS: 233 kB gzipped (238,812 bytes), under the 250 kB budget; the Admin pages are separate routes.

### P1-47 · Test Admin, RELX branding, compact pages (S) — Done (1 Oct 2026)
Spec: 06 Design tokens, Top bar, Sign-in · appendix E · RULES Demo data
- **Test Admin**: "Tester, Admin", username `admin.tester` (the owner chose its password; only the hash is in `src/config/accounts.ts`), role admin, in `data/scenarios/demo.json` as a test person. Development and tests only: production builds (Vercel, EC2) leave it out because its password is short and known.
- **Branding** after reedelsevier.com.ph: RELX orange `#ff8200` (`--brand`; ink text on it for contrast, `--brand-text` `#a85400` for orange text), near-black `#18181a`, neutral greys, Open Sans (Barlow Condensed stays for the map's room labels only, which must fit the rooms); the orange strip on the top bars, the `Brand` lockup ("REPH Rooms" over "RELX | Reed Elsevier", an orange R tile), `.btn--primary` (renamed from `.btn--blue`) in orange, the sign-in and consent screens on charcoal with an orange band, orange accents, chart bars and the Admin menu edge; blue stays for "yours" and information.
- **Compact** (the owner found the pages too large): body 14 px, buttons and inputs 36 px (small 30 px), top bar 52 px, assistant 400 px, smaller headings, chips, tabs, cards and table cells.
- Checked in the browser on 1 Oct 2026: the main page, the Admin dashboard and the sign-in background.

### P1-48 · Admin assistant hides like the room assistant; test Admin switch (S) — Done (1 Oct 2026)
Spec: 06 Admin (frame, S22) · 09 Configuration · RULES Demo data
- The owner asked for the same hide and show as the room assistant, kept on the right: the panel is built from the room assistant's parts (header with the sparkle title, New chat, the **›** hide button; welcome; composer with the round send button), stays mounted while hidden (the conversation is kept), its column slides shut, and the dark vertical **Assistant** tab on the right edge (with the reply dot) brings it back; remembered per browser like the drawer. The top bar's Assistant button is gone. Fixed on the way: the hidden panel's screen-reader label made the page scroll sideways (the slot is now `position: relative`).
- `ENABLE_TEST_ADMIN=true` lets the test Admin sign in on a production server (off by default; Vercel and EC2 refuse it otherwise).

### P1-49 · Live Admin pages; test Admin on Vercel (S) — Done (1 Oct 2026)
Spec: 04 Admin (`GET /api/admin/changes`) · 06 Admin (Live updates) · 09 Configuration
- The owner asked that a booking appear in Admin in real time. `GET /api/admin/changes?after=<id>` returns the audit entries since the last look; `AdminLive` asks every 3 seconds, refreshes every Admin view and the threads on any change, and shows a notice (with **Open**) for other people's bookings, cancellations, check-ins and messages. No new service or dependency: it works on Vercel and EC2 alike. Checked on 1 Oct 2026: a booking by Jeremiah appeared in the dashboard's Waiting for Admin with the notice within 3 seconds; on Vercel a booking showed in the Admin list at once (one warm instance).
- `ENABLE_TEST_ADMIN=true` is set on Vercel production at the owner's request: `admin.tester` signs in there.

### P1-50 · A named room is never called unavailable by mistake (S) — Done (1 Oct 2026)
Spec: 05 Tools (`find_rooms` `room`, `requested_room`), 05 Instructions 5a′ · appendix H (searchRooms 6) · 05 Evals
- The owner saw "Mactan isn't available" for a request where Mactan was free: Mactan (10 seats) was free but not among the five best fits for 3 people, and the model read "not in the list" as "not available".
- `find_rooms` takes the named room (`room`); `searchRooms(…, { room })` finds it like `room_schedule` (`matchRooms`), reports its real status in `requested_room` (free, partly free or taken, who has it, or why it can't host the request) and lists it first in its group when it can host it. A new instruction: start with that room's status; never call a room unavailable unless a tool says so.
- Evals `named-room-free` and `named-room-taken`.

### P1-51 · One state for every server instance (Redis) (M) — Done (1 Oct 2026)
Spec: 09 Deployment (Shared state) · 04 Conventions (Shared state), Proposal store · 01 Layers · 06 `useSession`
- On Vercel the owner saw: a confirmed booking missing from My bookings; Admin not live; "Booking RM-0130001 not found" in a thread and on Approve; a demoted Admin still with the Admin link. All from Vercel running the routes as separate functions, each with its own memory. The owner chose a shared Redis store (Upstash, through Vercel's integration).
- `src/lib/kv.ts` (Upstash REST with `fetch`, no package; memory without Redis); `src/app/api/_shared.ts` wraps every route that touches the mock gateway or the store: load a newer saved state, run, save a changed one, a lock for writes. Proposals and used one-time OAuth ids are keys of their own (async now). The `/admin` layout loads the latest state before its role check.
- The browser checks the session every minute and on return to the tab, so the Admin link follows a role change.
- Tests: `shared.test.ts` (6: a booking across instances, a confirm card once, role changes, simultaneous writes, the assistant's check-in, an open thread's poll); proposals (+1).
- The bug sweep the owner asked for ("make sure all of the bugs are being fixed, test all modules": tests, typecheck, build, the full evals 57/58, a browser walk through every page, an independent code review) found and fixed:
  - the assistant's and MCP's `check_in` changed one instance's memory only and wasn't audited (now `sharedWrite` + `audit`);
  - the Admin change feed sent the newest 20 of a burst and skipped the rest (now the oldest 20, and `last` where they stop);
  - an Admin change of Type of agenda kept a stale Type of training;
  - the Dashboard's swap list could list a booking twice;
  - a notice's Open link didn't switch the thread on /admin/messages (now `?t=` from `useSearchParams`);
  - every poll of an open thread rewrote its read time (now only when something new came in);
  - the Logs page said a restart clears the log.
- Switched on in production on 1 Oct 2026 at the owner's request: Upstash for Redis `reph-rooms-redis` (Free plan, `iad1`), connected to `ai-booking` for Production only with the prefix `KV`; after `vercel --prod` the first request saved `reph:state` version 1.

### P1-52 · Release bookings nobody checked in to (S) — Done (1 Oct 2026)
Spec: 02 F34 · 03 Booking (`releasedAt`), audit actions · 04 Conventions (Shared state) · 06 My bookings, S21 Logs, Live updates · 08 `releaseNoShows` · RULES (Room released if unused; question 3)
- The owner asked: "if they didn't check in within 15 mins it will be cancel". `RULES.autoReleaseNoShows` [OPEN: question 3]; `ReservationGateway.releaseNoShows()` cancels every Approved or In Progress booking with no check-in by start + 15 min (`shouldAutoRelease`), sets `releasedAt`, Modified By `SYSTEM` and the Admin comment.
- No timer (Vercel's free plan runs scheduled jobs once a day): `src/app/api/_release.ts` runs before every shared route, so the next request on any instance releases what is due; each release is audited (`booking.release`, "REPH Rooms"), noted in the owner's thread and shown to Admin as a notice; reports count it as a no-show.
- My bookings: "Check in from 2:00 PM to 3:15 PM, or the room is released." / "Check in by 3:15 PM, or the room is released."
- Tests: gateway (release), reports (released counts as a no-show), admin routes (a request after the grace releases, audits and notes).

**Phase 1 demo script** (needs the scripted demo clock: start the server with `DEMO_NOW=2026-09-28T09:00:00+08:00` in `.env.local`; restart to reset the week. Without `DEMO_NOW` the app runs on the real Asia/Manila time and the same bookings fall on the current week, so "today" in the steps below is then the real day):
0. Sign in as `markjoseph.remetio` (the owner has the passwords of the three accounts); the top bar shows "Mark Joseph" and **Sign out**.
1. "What are my bookings?" → check in to Tokyo (or **My bookings** → **Check in**).
2. "Room for 5 today from 3 to 4 PM" → Amsterdam ranked 1 → "Book Amsterdam for our Q4 pipeline review" → **Confirm booking**.
3. "Room for 8 today from 2 to 4 PM for an onboarding workshop" → flow B → **Ask Alpha to swap** (Amsterdam, Cape Town or Rio De Janeiro offered).
4. "Hall for 60 on Friday from 1 to 5 PM" → flow C → an evening slot, or ask Charlie to swap to Denali or Snowdon.
5. "How do I share my laptop screen in a VC room?" and "Which 3F rooms have VC?" → answers from the guidelines.
5a. "Who booked Central Park today?" → the schedule card (Tester, Alpha 3:00–4:30 PM; free times with **Book**); "Room for 4 today from 10:30 to 11:30 AM" → the assistant says you already have Tokyo then (one room per person). The chips under the welcome and the lightbulb show more.
5b. **AI apps** in the user menu → copy the MCP URL → add it in Claude or ChatGPT → sign in and **Allow** → ask there "Who booked Central Park today?" and "Book Cape Town today from 5 to 6 PM for a vendor demo" → open the confirm link → **Confirm booking** (needs the public HTTPS URL; 05, MCP).
6. Without chatting: **+ New booking** (try Repeat), the table (Bookings tab, filters, a row's details), the 3D view, hiding the assistant.

---

## Phase 2 · Real floor plans and directions
| Task | Size | Spec | Done when |
|---|---|---|---|
| P2-01 CAD-accurate 2F and 3F plans and real corridors (replace the appendix trace); place the four unplaced rooms | M | 07 Better plans | Routing and 3D layout tests pass; 3 on-site walks within 20% |
| P2-02 Map editor (S5) | L | 07 Map editor | Admin can add a room door and corridor and export JSON |
| P2-03 `GET /api/route` and `get_directions` tool | M | 04, 05, 07 Routing | Routes for every room from both lobbies |
| P2-04 Directions text | M | 07 Directions | Cape Town and Batanes steps match 07 exactly |
| P2-05 Route animation and floor switch (2D and 3D) | M | 06 Motion, 07 | Reduced-motion variant; 60 fps |
| P2-06 Walking time in ranking | S | 07 Routing | Closer right-size rooms rank higher on the demo data |
| P2-07 Start point setting (desk or lobby, avoid stairs) | S | 03 user_settings | Saved per user (local storage until P3) |
| P2-08 Dark theme; pinch-zoom on phones; "Message <owner>" when no swap room exists | S | 06, 02 AC-3.5 | |

## Phase 3 · Real system and pilot
| Task | Size | Spec | Done when |
|---|---|---|---|
| P3-01 Real gateway adapter + contract tests (all tool fields, 03 Mapping) | L | 08 | Contract tests pass against the tool's test environment |
| P3-02 Company sign-in (Entra ID) | M | 08 Sign-in | Replaces the three demo accounts (P1-31): `authenticate()` becomes OIDC, `requestor()` / `requireRequestor()` keep their shape; the MCP consent screen signs in the same way; booking for someone else only if Admin allows; the Admin role (P1-39) comes from an Entra group instead of the account store |
| P3-03 Outlook invites via Graph | M | 08 Outlook | Create, update, cancel events; no manual .ics |
| P3-04 Check-in reminders and auto-release job | M | 02 F7, F12 | Tracked for 1 week before enabling release |
| P3-05 Recurring bookings in the real tool | S | 03 Recurrence, 08 Adapter checklist | The adapter sends a series the way the tool expects (one recurring reservation or one per date); the app side is built (P1-23) |
| P3-06 Proposals, MCP grants and the app store in PostgreSQL | M | 03 App-owned tables, 09 MCP limits | A `PostgresStore` for `AppStore` (accounts until Entra ID, the audit log, message threads) and the proposals; survive restarts; audit for every write; used codes and refresh tokens shared across instances; people can see and revoke connected AI apps |
| P3-07 Swap acceptance link and `swapBookings` | M | 08 Swaps | Owner accepts; both invites updated; rollback tested |
| P3-08 Pilot readiness: monitoring, runbook, feedback button | S | 09 | Runbook reviewed by IT |

## Phase 4 · More channels
Teams bot and Copilot agent (same tools), voice with OpenAI Realtime, 3D view with photos and route drawing in 3D, usage analytics for Admin beyond the reports of P1-45 (trends over months, exports to the company BI tool), Iloilo rooms and maps.
