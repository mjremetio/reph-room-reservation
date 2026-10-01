# REPH Room Assistant – Specification

Version 0.18 · 1 October 2026 · Status: Phase 1 built except end-to-end tests (P1-12); demo sign-in with three accounts and an Admin area; one shared state for every server instance through Redis when configured; an MCP server with OAuth 2.1 for Claude, ChatGPT and other AI apps; real Asia/Manila clock; deployment on AWS in [11](spec/11-deploy-aws.md) (ECS, EC2, or one EC2 server with the `deploy/ec2/` bundle), the demo runs on Vercel (09, Deployment)

An AI assistant, powered by OpenAI, plus a live floor map for booking rooms at Reed Elsevier Philippines (REPH): Bldg. H in Manila (2F, 3F) and Iloilo. The existing Room Reservation Tool stays the system of record.

Start with [`PLAN.md`](PLAN.md). Every task there links to the spec sections it needs, so read only what the current task needs.

**Rebuilding from scratch (no codebase)**: this folder alone is the blueprint. To hand it to a coding agent, paste [`spec/PROMPT.md`](spec/PROMPT.md). By hand, start with [`spec/10-rebuild.md`](spec/10-rebuild.md): prerequisites, the exact `package.json`, `tsconfig.json` and env files, the complete file tree with each file's job, the build order and the checks that prove the rebuild matches (tests, evals, browser script, the smoke test against the deployed URL). [`spec/11-deploy-aws.md`](spec/11-deploy-aws.md) then deploys it on AWS. The numbered documents say what every part does; the appendices hold what can't be reinvented and must be copied exactly: data, prompts and texts, eval phrases, the floor trace script, the stylesheets, the 3D constants, the test inventory and every other source and test file. Where the docs and a rebuilt app disagree, the docs win; where two docs disagree, stop and ask.

| # | Document | What it covers |
|---|---|---|
| 01 | [Overview](spec/01-overview.md) | Problem, goals, users, scope, architecture, glossary |
| 02 | [User flows](spec/02-flows.md) | Every journey step by step, with testable acceptance criteria (Admin: F29–F33) |
| 03 | [Data model](spec/03-data-model.md) | Entities, fields, statuses, invariants, view models, mapping to the Room Reservation Tool's list and form, room master data, demo data |
| 04 | [HTTP API](spec/04-api.md) | Endpoints, request and response shapes, errors, streaming, the session (demo sign-in), messages, the Admin API, MCP and its OAuth sign-in for AI apps |
| 05 | [AI agent](spec/05-agent.md) | OpenAI setup, instructions, guidelines knowledge, tools, UI events, privacy, evals; the Admin assistant; MCP: using REPH Rooms from Claude, ChatGPT and other AI apps |
| 06 | [UI](spec/06-ui.md) | Screens (sign-in, assistant drawer with suggestions, 2D / 3D / Table, sheets, New booking, booking details, Messages, the Admin area), components, states, form fields, design tokens, motion, responsive, accessibility, files |
| 07 | [Map and routing](spec/07-map-routing.md) | Floor plans traced from the guidelines layout, data format, furniture, corridor graph, routes, directions, 2D rendering, 3D model |
| 08 | [Integration](spec/08-integration.md) | Room Reservation Tool, people directory, Outlook, Teams, company sign-in |
| 09 | [Quality](spec/09-quality.md) | Security (incl. the MCP and OAuth threat model), privacy, performance, config, deployment notes, testing, definition of done |
| 10 | [Rebuild guide](spec/10-rebuild.md) | Rebuild from the docs alone: setup files verbatim, file tree, build order, verification |
| 11 | [Deploy on AWS](spec/11-deploy-aws.md) | Deploy on AWS (ECS Fargate or EC2), step by step, autonomous; one EC2 server like a VPS with Docker Compose and Caddy (§8) |

**Appendices** (exact artifacts, copied verbatim from the working app on 26 Sep 2026):

| | Appendix | What it holds |
|---|---|---|
| A | [Data](spec/appendix/A-data.md) | Every room with every field, the demo scenario JSON, hardware options, hand-off links, scenario rules |
| B | [Domain logic](spec/appendix/B-domain.md) | Every rule, formula, message and algorithm in `src/domain` and `src/services` |
| C | [Agent](spec/appendix/C-agent.md) | Instructions template, guidelines text, every tool's schema and output, guardrail, UI event types |
| D | [Evals](spec/appendix/D-evals.md) | The eval phrases JSON, the runner, `npm run ask`, latest results |
| E | [Styles](spec/appendix/E-styles.md) | Design tokens and every stylesheet |
| F | [Floor plans](spec/appendix/F-floor-plans.md) | The trace script (regenerates the floor JSON), floor data types, furniture layout, routing, 2D renderer |
| G | [3D view](spec/appendix/G-3d.md) | Every constant, material, light and animation of the 3D model |
| H | [Tests](spec/appendix/H-tests.md) | Every test file and test case with what it asserts |
| I | [Source files](spec/appendix/I-source.md) | Every source and test file not copied in another appendix, plus `README.md` and `CLAUDE.md` |

Also in this repo:
- [`RULES.md`](RULES.md) – business rules from the guidelines, with sources, and open questions for Admin.
- `data/scenarios/demo.json` – demo week that reproduces flows A, B and C.
- `data/floors/manila-bldg-h.json` – 2F and 3F plans traced from the guidelines' appendix layouts (rooms, areas, furniture, corridor graph), written by `scripts/trace-floors.py`.
- `evals/phrases.json` – test conversations for the agent (41), run with `npm run evals`; last report in `evals/last-run.md`.

## Tags used in the spec
| Tag | Meaning |
|---|---|
| **[Built]** | Exists and is covered by tests (task status in `PLAN.md`). |
| **[Ref]** | Reference code written before the SDK or Next.js was installed (all verified in P1-02). |
| **[P1]**–**[P4]** | Build in that phase. |
| **[OPEN]** | Waiting for an answer from Admin or IT. Build it configurable, never hard-wired. |

## Change log
| Version | Date | Change |
|---|---|---|
| 0.1 | Sep 2026 | Architecture, prototype, starter code |
| 0.2 | Sep 2026 | Full spec, demo scenario, floor data, routing, shared search service |
| 0.3 | 26 Sep 2026 | Phase 1 built: API, agent, UI (2D, 3D, table, New booking, drawer), fields aligned with the Room Reservation Tool, readability pass, clean-architecture pass; spec updated to match the code |
| 0.4 | 26 Sep 2026 | Every field of the tool's form (recurrence, hardware, In Progress on submit), the tool's reservation list (`GET /api/bookings`) with pagination and booking details; no sign-in: Name of Requestor (`X-Requestor`, `GET /api/people`, `/api/me` and `DEMO_USER_*` removed); guidelines knowledge, `list_rooms` and the IT hand-off in the assistant; floor plans traced from the guidelines' appendix layouts with every room, desk and chair in 2D and 3D; Bacolod and the lactation room added; demo people renamed to test names; 89 tests |
| 0.5 | 26 Sep 2026 | New booking as a centred wide modal (two columns; starts at the next bookable half hour); map legend with per-floor status counts, highlight and a plan key; scope guardrail and scope rules for the assistant; first public deployment; evals runner (40–41/41 per run, safety 9/9), New chat, red form-error marks (`fields` in API errors); 93 tests |
| 0.6 | 26 Sep 2026 | The spec is the full blueprint: rebuild guide (10) and appendices A–H (data, domain logic, agent, evals, styles, floor plans, 3D, tests) with the exact artifacts; `<!-- verbatim: <path> -->` markers kept in sync by `npm run spec:sync` and checked by a test; UI cleanup (less text on every screen, legend Key toggle, trimmed forms, shorter assistant replies); API 400 fixes (no-offset times, named proposal fields); evals 41/41; 95 tests |
| 0.7 | 26 Sep 2026 | 2D map zoom and pan (buttons, wheel, pinch, drag, + − 0 keys) and grab-to-move in 3D; appendix I with every other source and test file verbatim, so nothing is retyped; cold-read fixes (form fields and the Urgent rule as coded, rendered instructions, counts, fence rule); deployment on AWS (ECS Fargate or EC2) from a container image: 11, `Dockerfile`, `.dockerignore`, `next.config.ts` (`output: 'standalone'`); 98 tests |
| 0.8 | 26 Sep 2026 | Turning the map: 2D quarter turns (Turn left / Turn right, R / Shift+R; names stay upright; Whole floor undoes the turn) and 45° turn buttons in 3D; map keys leave Ctrl/⌘/Alt shortcuts to the browser; 100 tests |
| 0.9 | 28 Sep 2026 | Demo sign-in (P1-31): three accounts (Remetio, Mark Joseph; Sandoval, Jeremiah; Lagunoy, Lili; added at the owner's request), scrypt password hashes, a signed `reph-session` cookie (`SESSION_SECRET`), `GET/POST/DELETE /api/session`, 401 on every other data route, sign-in screen and Sign out; the signed-in person is the Name of Requestor (`X-Requestor`, `GET /api/people`, the name picker and the `need_requestor` card removed). One room per person at a time (`RULES.oneRoomPerPersonAtATime`: search warning, 409 when preparing and at Confirm). The assistant's `room_schedule` tool and schedule card (who has a room, when, and the free times), status and `mine` on every other-person booking, richer partly-free and "who has the other rooms" cards, grouped suggestions and an Ideas panel. Vercel deployment notes. Evals 46 (45/46), 113 tests |
| 0.10 | 29 Sep 2026 | One EC2 server like a VPS (P1-32): `deploy/ec2/` with Docker Compose, Caddy (automatic HTTPS; `<ip>.sslip.io` without a domain), an idempotent `deploy.sh` (installs Docker, settings in `/etc/reph-rooms/.env`, health check, `rollback`) and `npm run package:ec2`; 11 §8. Map colours (P1-33): availability as a traffic light, green free and fits, orange partly free, red hatched taken, blue yours, in 2D, 3D, the legend, the table and the cards (tokens `--green*`, `--red*`; `--taken` removed). Real Asia/Manila clock (P1-34): `DEMO_NOW` empty by default, the demo week moves into the current week (`scenarioInWeekOf`), `clock` in `/api/health`, "PHT" after the top-bar time; the smoke test in 11 §5 works with either clock. 114 tests 3D view turns all the way round (P1-35): drag turns 360° and tilts, Shift- or right-drag moves, a 360° spin button (S) and a compass that shows the heading and glides back to the start view (0) |
| 0.11 | 29 Sep 2026 | MCP server for Claude, ChatGPT and any MCP app (P1-36): `POST /api/mcp` (Streamable HTTP, stateless JSON-RPC) runs the assistant's own tools (minus `draft_owner_message`) for the signed-in person; bookings and cancellations only through a 15-minute confirm link opened in the app (`GET /api/proposals/{id}`, `ConfirmLink`); OAuth 2.1 hand-written (`src/mcp/oauth.ts`, `src/lib/tokens.ts`): metadata (RFC 9728, 8414), dynamic client registration, consent screen `/oauth/authorize`, PKCE S256, audience-bound 1-hour access tokens, rotated 14-day refresh tokens; **AI apps** in the user menu (`ConnectAI`); security headers on every path, HSTS on EC2; threat model in 09; 3D start view fitted to the window and 15% farther out, zoom out to 25 × VIEW (P1-37); 123 tests |
| 0.12 | 30 Sep 2026 | My bookings shows every upcoming booking (P1-38): no 14-day cutoff in `GET /api/bookings/mine` and `my_bookings` (`listMyBookings` takes an optional `to`), so In Progress requests waiting for Admin and bookings up to 90 days ahead (Training, MPH) always appear; 124 tests |
| 0.13 | 30 Sep 2026 | Admin area (P1-39 … P1-46): an Admin role (the owner), the app store `src/store/` (accounts, audit log, message threads; in memory until P3-06); `/admin` with Dashboard, Bookings (approve, bulk approve, turn down with a reason, change, swap rooms, cancel, check in; search, sort, pages, CSV), Messages (one thread per booking with its owner; Messages and Message Admin for everyone), Reports (charts, CSV, print), Users (add, edit, disable, reset account, sign out everywhere; Choose a new password), Rooms (edit details) and Logs (audit, CSV); the Admin assistant (its own tools and guardrail; it prepares cards, the Admin's button acts); shared table and chart kits; 137 tests, 56 evals |
| 0.14 | 1 Oct 2026 | Test Admin account `admin.tester` (development and tests only, P1-47); RELX \| Reed Elsevier branding (RELX orange `--brand`, Open Sans, the `Brand` lockup, orange top strip and primary buttons `.btn--primary`, charcoal sign-in with an orange band) and a compact scale (14 px body, 36 px controls, 52 px top bar) |
| 0.15 | 1 Oct 2026 | The Admin assistant hides and comes back like the room assistant's drawer, on the right (› in its header, the Assistant tab on the right edge, the conversation kept; P1-48); `ENABLE_TEST_ADMIN` lets the test Admin sign in on a production server |
| 0.16 | 1 Oct 2026 | Live Admin pages (P1-49): `GET /api/admin/changes` and `AdminLive` (a 3-second change check that refreshes every Admin view and shows notices for new bookings, cancellations, check-ins and messages); readable booking entries in the log; the test Admin enabled on Vercel; 138 tests |
| 0.17 | 1 Oct 2026 | A named room is reported with its real status (`find_rooms` `room`, `requested_room`; P1-50); one state for every server instance (P1-51): `src/lib/kv.ts` (Upstash Redis over REST, or memory), `src/app/api/_shared.ts` (every route loads a newer state and saves a changed one; a lock for writes), proposals and used OAuth ids in Redis, the session re-checked every minute; bug sweep fixes (the assistant's check-in saved and audited, the change feed's oldest-first paging, Type of training follows the agenda type, the thread link on /admin/messages); 146 tests |
| 0.18 | 1 Oct 2026 | Bookings nobody checked in to are released 15 minutes after the start (P1-52, 02 F34): `releaseNoShows` in the gateway, run first by every API route; audited, noted to the owner, counted as no-shows; My bookings shows the check-in deadline; 149 tests |
