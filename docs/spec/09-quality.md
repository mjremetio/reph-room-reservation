# 09 · Quality: security, privacy, performance, testing, configuration, deployment

## Security
| Area | Requirement | Where |
|---|---|---|
| Secrets | `OPENAI_API_KEY` and gateway credentials only in server env vars (`.env.local` locally; in production the deployment's secret store, injected as env vars into the container, 11); never in the browser bundle, the container image, logs or git. `.env` and `.env*.local` are in `.gitignore` and `.dockerignore`. `/api/health` only says whether the key is `configured` or `missing` | route handlers only |
| Identity | **Demo sign-in** (Phase 1–2, 04 Session): the account store, seeded with three accounts (`src/config/accounts.ts`) that Admin can add to, username and password; passwords stored only as scrypt hashes (random 16-byte salt, constant-time compare), an unknown username still costs one scrypt; the session is a cookie `reph-session` with the login and a wall-clock expiry (12 h), HMAC-SHA256-signed with `SESSION_SECRET` (32+ characters, required in production; random per process in dev and tests), `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS; every API route except `/api/health` and `/api/session` answers 401 without it; identity never comes from a body or header. The signed-in person is the Name of Requestor; nobody books for someone else. **Limits**: temporary passwords are handed over by Admin in person; Admin can reset an account and sign someone out everywhere (per account, `sessionsValidAfter`), but there is no self-service reset, lockout beyond the rate limit or MFA; accounts added in the app live in memory until P3-06 (changing `SESSION_SECRET` still signs everyone out). Phase 3 replaces the accounts with Entra ID (08; RULES open question 10) | `src/lib/session.ts`, `src/lib/passwords.ts`, `src/lib/requestor.ts` |
| Authorization | Owner-only cancel and check-in checked in the gateway (email compare, case-insensitive); proposals bound to the signed-in person's email and single use (`takeProposal`); one room per person at a time (`prepareBooking`, `MockGateway.createBooking`); admin routes check the Admin group [P3] | `MockGateway`, `src/agent/proposals.ts`, `requireRequestor` |
| Admin | Role `admin` or `user` in the account store; `requireAdmin` reads it on **every** `/api/admin/*` request (401 signed out, 403 "Admin only."), so a role change or a disable applies at once; the role never comes from a body, header or the cookie. The `/admin` layout redirects non-admins home (a convenience: the pages hold no data). Only an actor built by `requireAdmin` carries `role: 'admin'` into the gateway; the assistants and MCP pass the person without a role, so they stay owner-only and prepare-only. An Admin can't demote or disable themselves, so an active Admin always remains | `src/lib/requestor.ts`, `src/app/api/admin/_admin.ts`, `MockGateway` (`assertAdmin`, `assertOwner`) |
| Accounts | Temporary passwords: 16 characters from `crypto.randomInt` over letters and digits without look-alikes, returned once in the Admin's response (`Cache-Control: no-store`), never logged; the person must choose their own (≥ 12 characters, not the same) before anything else. Reset and "Sign out everywhere" set `sessionsValidAfter`: every cookie and MCP token issued at or before it is refused. Disabled accounts can't sign in and their sessions end. Password changes are rate-limited like sign-in | `src/lib/accounts.ts`, `src/lib/session.ts`, `src/mcp/oauth.ts` |
| Audit | Every write and sign-in (including failed sign-ins with the username tried) goes to the audit log: who, what, on what, a short summary; never message text, passwords or hashes; the last 5 000 entries in memory, readable by Admin at `/admin/logs` (P3-06: PostgreSQL, kept longer) | `src/lib/audit.ts`, `src/store/memoryStore.ts` |
| Input | Every body and query validated with zod (04): sign-in username 1–120 and password 1–200 chars; message 1–2000 chars; history ≤ 1000 items, then trimmed to 60; `confirmedTickets` ≤ 5 of ≤ 32 chars; agenda ≤ 200; special instructions ≤ 500; participants 1–500; `roomId` ≤ 64; `ticketNo` ≤ 32; `floor` ≤ 10; `building` ≤ 40; `employee` ≤ 80; hardware from the fixed list (≤ 6); recurrence `every` 1–99, weekdays 1–7, at most 100 dates; times need an offset; availability range ≤ 7 days; bookings list any range ("to" after "from"), every booking without dates | `src/app/api/_schemas.ts`, `prepareBooking` |
| Conversation history | Untrusted: `system`/`developer` items from the browser are dropped; never starts inside a tool call; app notes about confirmed tickets come from the gateway, only for the signed-in person's own bookings | `src/agent/history.ts`, `/api/assistant` |
| CSRF | Same-origin POSTs (and `DELETE /api/session`) only: an `Origin` header must match `x-forwarded-host` / `host`, else 403. The session cookie is `SameSite=Lax` | `crossOrigin()` |
| Rate limits | 20/min on `/api/assistant`, 120/min on the other signed-in routes (per signed-in email), 90/min for the Admin pages' change check (`live`), 60/min on `/api/mcp` (per token's person), 10/min sign-in attempts and 30/min OAuth registration and token calls per client address (`x-forwarded-for`, else `unknown`), 30/min consent decisions per person; fixed one-minute windows in memory (per instance) | `rateLimited()`, `clientAddress()` |
| Prompt injection | Tool output (names, agendas) is data; no tool can book or cancel; the draft card's recipient comes only from the server-built link; the instructions' scope and safety rules (05) | agent tools, `DraftMessageCard`, `instructions.ts` |
| Off-topic use | The scope guardrail blocks clearly off-topic messages and jailbreaks before the model runs and answers with a fixed reply (05, Scope guardrail) | `src/agent/guardrails.ts` |
| Runaway runs | `maxTurns: 10`; 90 s per assistant run; the run stops when the browser disconnects | `/api/assistant` |
| CSV export | Cells starting with `=`, `+`, `-` or `@` get a leading `'` (formula injection); cells with `"`, `,`, CR or LF are quoted with `""` escaping; rows end with CRLF; the file starts with a UTF-8 BOM (`﻿`, type `text/csv;charset=utf-8`) | `src/ui/csv.ts` |
| Rendering | Assistant text is rendered as React elements from a tiny markdown subset (paragraphs, `- ` bullets, `**bold**`), never as HTML | `src/ui/RichText.tsx` |
| Dependencies | Run `npm audit` at setup; versions pinned by `package-lock.json`; new dependencies only when listed in `docs/PLAN.md`. The MCP server and its OAuth sign-in are hand-written (no MCP or OAuth library), so every check is in `src/mcp/oauth.ts` and `src/lib/tokens.ts` | |
| Framing and headers | Every path: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` (no page, least of all the consent screen, can be shown inside another site: clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. On EC2, Caddy also sends `Strict-Transport-Security: max-age=31536000` and drops the `Server` header | `next.config.ts`, `deploy/ec2/Caddyfile` |
| AI apps over MCP | See **MCP and OAuth threat model** below | `src/mcp/`, `src/lib/tokens.ts` |

### MCP and OAuth threat model
How the MCP server (05, MCP; 04, MCP and sign-in for AI apps) stays safe when anyone can point an AI app at it:
| Threat | Defence |
|---|---|
| Someone uses the tools without being a REPH account holder | Every `/api/mcp` request needs an OAuth access token; tokens are only issued after a demo account signed in and pressed **Allow** on `/oauth/authorize`. No token → 401 with `WWW-Authenticate` (RFC 9728) |
| A malicious web page borrows a signed-in person's session (CSRF) | `/api/mcp` reads only the `Authorization` header, never the cookie; the consent decision (`POST /api/oauth/authorize`) needs the cookie **and** a same-origin request (`crossOrigin`); the session cookie is `SameSite=Lax` |
| The consent screen is framed and clicked through (clickjacking) | `X-Frame-Options: DENY` and `frame-ancestors 'none'` on every page |
| An attacker's app steals the code on the way back | Authorization code + **PKCE S256 only** (`plain` refused); codes last 60 s, are single-use, and are bound to the client, the redirect URI, the PKCE challenge, the person and the resource |
| Redirects to an attacker's site (open redirect) | Clients register their redirect URIs (1–5); only `https`, `http` on localhost / 127.0.0.1 / [::1], or a native app's own scheme; `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `ftp:`, `ws:`, `wss:`, fragments and user info refused. An unknown client or an unregistered redirect URI is shown as an error on our page and **never** redirected; later problems go back as OAuth errors with `state` and `iss` (RFC 9207) |
| A look-alike app tricks the person ("I'm Claude") | The consent screen shows the app's name as the app calls itself **and** where it returns to (the https host, "an app on this computer" or "the <scheme> app"), what it may do, and "Only allow apps you trust" |
| Client secrets leaking | Public clients only (`token_endpoint_auth_method: none`); nothing secret is issued to the app except its tokens |
| A token for our server used elsewhere, or another server's token here | Access tokens carry the audience `<origin>/api/mcp` (RFC 8707) and are checked on every request (another host name → 401); only the `rooms` scope exists |
| A stolen token | Access tokens last 1 hour; refresh tokens 14 days and are **rotated** on every use (a used refresh token is refused and the app must reconnect) |
| Forged or confused tokens | Tokens are HMAC-SHA256-signed with a key per kind (`client`, `code`, `access`, `refresh`) derived from `SESSION_SECRET` and carry their kind, so a code can't pass as an access token, a refresh token can't call `/api/mcp`, and a client id can't be used as anything else; constant-time signature checks; tampered tokens → 401 |
| The AI app books or cancels on its own | It can't: `propose_booking` and `request_cancellation` only prepare and return a `confirm_url`; the person must open it signed in as themselves (another person gets 410) and press Confirm within 15 minutes (the usual single-use `POST /api/proposals/{id}`) |
| The model learns someone's e-mail | `draft_owner_message` (its link carries the owner's e-mail) is not offered over MCP; every result goes through the same privacy filter as the in-app assistant |
| Abuse and floods | Rate limits on registration, token, consent and `/api/mcp`; request bodies ≤ 100 kB (MCP) and ≤ 10 kB (OAuth); batches ≤ 20 messages; consent parameters ≤ 20 of ≤ 8000 characters |
| Cross-site calls to the API | CORS is open (`*`) only on the MCP and OAuth endpoints, which take no cookies; the app's own routes stay same-origin |
| Leaking data through logs | One line per tool call with the person, tool, ok and duration; never arguments or results; one line per Allow with the app's name |

**Known limits (Phase 1)**, accepted for the hackathon and to fix before a pilot:
- Tokens are stateless, so one connection can't be revoked on the server before it expires: the person removes the connector in their AI app; rotating `SESSION_SECRET` disconnects every app and signs everyone out. Phase 3: store grants (P3-06) so a person can see and revoke connected apps.
- Used codes, used refresh tokens and proposals are kept in `src/lib/kv.ts`: in Redis when it is configured (every instance sees them; Shared state, below), else in one server's memory, and then run exactly one instance (EC2, 11 §8). Without Redis a confirm link, a code replay or a reused refresh token can behave differently across instances.
- Client registration is open to anyone (as MCP clients expect); it grants nothing until a person presses Allow.
- The demo accounts themselves (no MFA, no reset) — Phase 3 moves sign-in to Entra ID, which then also signs AI apps in.

## Privacy
- Share others' bookings like the calendar: owner name, division, time, group size, status. Not agenda titles, category, priority, training type, notes, hardware, recurrence, created/modified by, admin comments or emails [OPEN: RULES question 7]. Enforced once, in `publicBooking()`; tested for every route that returns bookings. Admin's room blocks show to everyone, the Admin who made one included, as owner "Admin" with no division, reason or e-mail (`shownOwner`; search results and the assistant's "Admin (room blocked)" too); only `/api/admin/*` shows who blocked it and why. The Bookings table's Type of Agenda filter matches others' bookings by room kind, so it can't reveal their category.
- `GET /api/session` returns the signed-in person's login, name, division, role and whether a new password is needed, never the e-mail. Only `/api/admin/*` (for an Admin) sends e-mails and other people's form fields (`adminBooking`, `accountView`); every other route keeps the privacy filter.
- Messages: a booking's thread is readable only by its owner and Admin; the log records that a message was sent, never its text.
- The assistant gets others' names, divisions, times, group sizes and statuses from tools (`find_rooms`, `room_schedule`), never their agendas or emails (05). The Admin assistant also gets agenda titles, types, priorities and Admin comments, never e-mails (05, Admin assistant) [OPEN: RULES question 18].
- The 3D view shows group size as seated figures; no names are drawn into the scene.
- Logs: one JSON line per assistant run with request id, the signed-in user's email, tool names, duration and status; gateway errors log the error message. **Never** message text or tool payloads.
- Conversation history lives in the browser in Phase 1 (sent back with each message); server-side retention of 30 days in Phase 3 [OPEN].
- What goes to OpenAI: see 05 (Data sent to OpenAI), including the guidelines paraphrase on every request.
- Over MCP, the tool results (the same privacy-filtered data) go to the AI app the person connected (Anthropic, OpenAI or another vendor), and what the person types there never passes through us. The guidelines paraphrase is not sent over MCP. Which vendors may be used is an open question for IT and Legal (RULES question 16). Agents SDK tracing is **off** unless `OPENAI_TRACING=true` (needs IT approval).
- Demo data uses obvious test names ("Tester, Alpha" … "Tester, Echo", `@example.com`; the test Admin "Tester, Admin" in production only with `ENABLE_TEST_ADMIN=true`, since its password is known) plus the three sign-in accounts the project owner asked for on 28 Sep 2026: the owner as the demo user ("Remetio, Mark Joseph", Sales), "Sandoval, Jeremiah" and "Lagunoy, Lili" (`@example.com`, no division). Never add any other real employee names, e.g. from screenshots of the real tool or the guidelines. Use they/them for everyone. Sign-in passwords never go into the repo, the docs or logs; only their hashes.
- The *Room Reservation Guidelines* PDF is marked **confidential**. The repo holds only what the app needs from it: the rules (`src/domain/rules.ts`, RULES.md), a paraphrase without names or room mailboxes (`src/agent/guidelines.ts`), the room list, and floor geometry traced from its appendix layouts (`scripts/trace-floors.py`, `data/floors/`). The PDF itself and its images are not in the repo. The GitHub repo `mjremetio/ai_booking` is private; check its visibility before pushing.

## Performance budgets
| Measure | Target | Measured (Sep 2026, demo data) |
|---|---|---|
| `searchRooms` with the mock | < 50 ms | Not timed separately; `/api/availability` shows ~3 ms application time in the dev log |
| `searchRooms` with the real gateway | < 800 ms p95 (cache per 08) | P3 |
| First `ui` event after sending a message | < 2.5 s p50 (depends on the model) | ~2 s with `gpt-5.6-luna`; rare runs took minutes, hence the 90 s timeout |
| Map recolour after `room_results` | < 100 ms, 60 fps animation | CSS transitions |
| Initial page JS | < 250 kB gzipped | **233 kB** (238,812 bytes; build of 30 Sep 2026 with the Admin area, whose pages are separate routes and not in this budget) |
| 3D view JS | Lazy-loaded, not in the initial page | 259 kB gzipped (265,005 bytes, the one chunk that contains `WebGLRenderer`), loaded on first use of **3D** |
| 3D rendering | No frames while idle; smooth orbit | `frameloop="demand"`, merged geometry per room and material, instanced chairs, people, desks and tables |

How to measure the initial JS: `npm run build`, then gzip each `.js` file referenced by `.next/server/app/index.html` (`/_next/static/chunks/…` → `.next/static/chunks/…`) and add the sizes. None of them may contain three.js (search for `WebGLRenderer`).

## Reliability
- OpenAI down or key missing → banner; map search, room sheet, New booking and the table still book (`/api/search`, `/api/proposals`).
- A run longer than 90 s ends with the SSE `error` event; **Try again** resends.
- Gateway down → "I can't reach the booking system right now. Try again in a minute."; no guessing.
- A stream read error after `done` is ignored (the reply is complete).
- Proposals, bookings, rate-limit windows and the demo clock live in server memory: restarting the server resets the demo week. With Redis configured (Deployment, Shared state) the bookings, rooms, accounts, audit log, messages, proposals and used OAuth ids live there instead and survive restarts and deploys; Redis unreachable → 503 `UNAVAILABLE` "The app can’t reach its storage right now. Try again in a moment." (`SharedStateError`). From Phase 3 they live in the database and the real tool.

## Observability
- Structured JSON logs; `X-Request-Id` header on every assistant stream.
- Metrics [P3]: searches by flow, proposals created vs confirmed, 409s, time to confirm, check-ins, releases.
- Agent traces: only with `OPENAI_TRACING=true` after IT approval (`setTracingDisabled(process.env.OPENAI_TRACING !== 'true')` in `src/agent/agent.ts`); otherwise tool names and durations in the log line.

## Configuration
### Environment variables
| Variable | Default / example | Read by | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | – | `/api/assistant`, `/api/health`, the Agents SDK, `scripts/ask.ts`, `scripts/evals.ts` | Required for the assistant; without it everything else still works (assistant → 503, banner in the UI) |
| `OPENAI_MODEL` | `gpt-5.6-luna` in `.env.example` | `src/agent/agent.ts`, `src/agent/guardrails.ts`, `/api/health` | Empty = the SDK default |
| `OPENAI_TRACING` | `false` | `src/agent/agent.ts` | `true` sends SDK traces to OpenAI (IT approval) |
| `ENABLE_TEST_ADMIN` | empty | `src/config/accounts.ts` (read when the server starts) | Production only: `true` lets the test Admin `admin.tester` (a short, known password) sign in. Leave it empty on public servers unless that risk is accepted; development and tests always have the account |
| `RESERVATION_GATEWAY` | `mock` | `getGateway()`, `/api/health` | Only `mock` exists; later `api` or `db` (08) |
| `MOCK_SCENARIO` | `demo` | `getGateway()`, `/api/health` | `demo` (fixed week in `data/scenarios/demo.json`); any other value (e.g. `random`) gives seeded random bookings (08) |
| `SESSION_SECRET` | – (32+ random characters) | `src/lib/session.ts` | Signs the sign-in cookie. **Required in production** (without it sign-in answers 503 and nobody can use the app); in `next dev` and tests a random one per process. A secret like `OPENAI_API_KEY`: `.env.local` locally, the secret store in production (11, Vercel below). Changing it signs everyone out |
| `DEMO_NOW` | empty (real time) | `src/lib/clock.ts`, `getGateway()`, `/api/health` (`clock`) | Empty (the default since v0.10) or invalid = the real time, shown in Asia/Manila, and the demo bookings move into the current week (`scenarioInWeekOf`). `2026-09-28T09:00:00+08:00` replays the scripted demo: the app's clock starts there at server start, then runs normally. The browser follows the server's clock via `/api/health`; tests and evals set their own |
| `ASK_AS` | – | `scripts/ask.ts` only | The tool login to act as (default: the first person in the directory, the demo user); an unknown login stops the script |

There is no user setting: the old `DEMO_USER_*` variables are gone; people sign in with the demo accounts in `src/config/accounts.ts` (passwords only as hashes; `npm run hash-password -- "<password>"` makes a new one). The scripts load `.env.local` themselves (`process.loadEnvFile`) when it exists; Next.js loads it for the app. `scripts/evals.ts` always forces `RESERVATION_GATEWAY=mock`, and `MOCK_SCENARIO` and `DEMO_NOW` from `evals/phrases.json`.

`.env.example` (copy to `.env.local`), verbatim:
<!-- verbatim: .env.example -->
```bash
# Copy to .env.local and fill in. Never commit .env.local.

# OpenAI powers the assistant (server-side only)
OPENAI_API_KEY=
# Model for the assistant. gpt-5.6-luna is the @openai/agents 0.18 default and was verified with the demo flows.
# Leave empty to follow the SDK default; compare models with the evals (npm run evals).
OPENAI_MODEL=gpt-5.6-luna

# Signs the sign-in session cookie (src/lib/session.ts). Required in production: 32+ random characters, e.g.
# node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))". Changing it signs everyone out.
SESSION_SECRET=

# Reservation data: "mock" until IT confirms API or database access (docs/spec/08-integration.md)
RESERVATION_GATEWAY=mock
# "demo" = fixed demo week in data/scenarios/demo.json, "random" = generated sample bookings,
# "empty" = no bookings, only the sign-in accounts as people (data/scenarios/empty.json; for real use)
MOCK_SCENARIO=demo
# Empty = the real time (always shown in Asia/Manila); the demo week then moves into the current week.
# Set 2026-09-28T09:00:00+08:00 to replay the scripted demo (docs/PLAN.md): the clock starts there on every start.
DEMO_NOW=

# Production only: true lets the test Admin (admin.test@email.com, a short known password) sign in. Leave empty on any public
# server unless you accept that risk; development always has it.
ENABLE_TEST_ADMIN=

# Shared state for several server instances (Vercel, more than one ECS task): Upstash Redis over REST
# (docs/spec/09-quality.md, Shared state). Vercel's Upstash integration sets KV_REST_API_URL and KV_REST_API_TOKEN;
# UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN work too. Empty = everything in this server's memory.
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Send Agents SDK run traces to OpenAI. Keep false unless IT approves (docs/spec/09-quality.md)
OPENAI_TRACING=false
```

### Project files
- `package.json` scripts: `dev` = `next dev`, `build` = `next build`, `start` = `next start`, `test` = `tsx --test "src/**/*.test.ts"`, `typecheck` = `tsc --noEmit`, `ask` = `tsx scripts/ask.ts`, `evals` = `tsx scripts/evals.ts`, `hash-password` = `tsx scripts/hash-password.ts`, `e2e` = `playwright test` (P1-12; Playwright is not installed yet), `spec:sync` = `tsx scripts/spec-verbatim.ts`, `spec:check` = `tsx scripts/spec-verbatim.ts --check`. `"engines": { "node": ">=22" }`. The full file is verbatim in 10 §3.1. Dependency versions: 01 Stack.
- `next.config.ts`: `output: 'standalone'`, so `next build` writes a self-contained server for the container image (verbatim in 11).
- `tsconfig.json`: `target` ES2022, `lib` [dom, dom.iterable, ES2022], `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noFallthroughCasesInSwitch`, `noEmit`, `allowJs: false`, `skipLibCheck`, `types: ["node"]` (TypeScript 6 needs it), `esModuleInterop`, `module` esnext, `moduleResolution` bundler, `resolveJsonModule` (the floor and scenario JSON are imported), `isolatedModules`, `jsx: react-jsx`, `incremental`, plugin `next`, path alias `@/*` → `./src/*` (unused: imports are relative); `include` next-env.d.ts, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`; `exclude` node_modules.
- `.gitignore` and `.dockerignore`: verbatim in 10 §3 and 11. Local secrets (`.env*.local`), build output and `node_modules` never go into git or the container image.

## Deployment
Deploy on AWS (ECS Fargate or EC2) as a container: the steps, the `Dockerfile`, `.dockerignore`, `next.config.ts`, secrets, health check and smoke test are in [11 Deploy on AWS](11-deploy-aws.md). The quickest route is one EC2 server used like a VPS with the `deploy/ec2/` bundle (11 §8): Docker Compose runs the app and Caddy, which gets the HTTPS certificate on its own; `npm run package:ec2`, upload, `sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh` (settings in `/etc/reph-rooms/.env`, `deploy.sh rollback` to go back).

Settings that matter wherever it runs:
- **Sign-in needs `SESSION_SECRET`** in every deployment (production mode): set it in the secret store with `OPENAI_API_KEY`. Sessions are signed cookies, so they work across instances and restarts (unlike the demo data).
- **One instance while the gateway is the mock, unless Redis is configured** (Shared state, below): without it the mock gateway, proposals, rate limits and the demo clock live in server memory. They reset when the server restarts (with `DEMO_NOW` the clock starts there again; on the real clock the demo week is laid on the current week again), and two instances would disagree (a proposal made on one could not be confirmed on the other). Run exactly one task or container, or configure Redis (Shared state), until the real gateway (P3) replaces them.
- **The assistant's run** can take up to 90 s (`RUN_TIMEOUT_MS`) and streams Server-Sent Events: the load balancer's idle timeout must be longer than that (11).
- **AI apps over MCP** (05, MCP): the MCP URL is `https://<site>/api/mcp`. MCP codes, refresh-token rotation and confirm links need one server (EC2, 11 §8) or Redis (Shared state), which Vercel now has. The consent screen and tokens need `SESSION_SECRET` like sign-in.
- **Risks of a public URL**: only the three demo accounts can get past the sign-in screen, so strangers can no longer use the assistant on the owner's OpenAI key or see the plans traced from the confidential guidelines; the sign-in page itself is public (10 attempts a minute per client address). The signed-in limits stay (20 assistant messages a minute per person, the scope guardrail, 90 s per run). Before a pilot: company sign-in (P3), the company network, and an OpenAI usage limit.

### Vercel (the current demo)
The demo also runs on Vercel: project `ai-booking` (team `mjremetios-projects`, linked in `.vercel/`, git-ignored), production alias https://ai-booking-sooty.vercel.app, region `iad1`, Node 24, framework preset Next.js (it builds with `next build`; `output: 'standalone'` doesn't get in the way). The project is connected to GitHub (seen 1 Oct 2026): merging into the default branch `claude/fervent-brahmagupta-n0n9db` deploys production, and every pull request gets a preview deployment and a check. `vercel --prod` from the repo root deploys the working copy directly. Production environment variables (Settings → Environment Variables, or `vercel env add <NAME> production`): `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESERVATION_GATEWAY`, `MOCK_SCENARIO`, `OPENAI_TRACING`, `SESSION_SECRET`, `ENABLE_TEST_ADMIN` and, from the Upstash integration, `KV_REST_API_URL` and `KV_REST_API_TOKEN` (`DEMO_NOW` is not set since 29 Sep 2026, so production runs on the real Asia/Manila time); add them to Preview too if preview deployments must sign in. After a deploy run the smoke test in 11 §5 against the production URL (sign in first).
**Shared state on Vercel**: Vercel runs the API routes as separate serverless functions, each with its own memory, started and stopped as it likes. Without Redis a booking made in one was missing from My bookings or Admin in another ("Booking … not found"), and a role change reached only some (seen 1 Oct 2026). Connected on 1 Oct 2026: the Upstash for Redis database `reph-rooms-redis` (Free plan: 500 000 commands a month; primary region `iad1`; eviction off) is connected to `ai-booking` for **Production only** (previews keep their own memory, so they never touch the live data) with the prefix `KV`, which sets `KV_REST_API_URL`, `KV_REST_API_TOKEN` (and `KV_URL`, `KV_REDIS_URL`, `KV_REST_API_READ_ONLY_TOKEN`, unused), marked Sensitive. The dashboard's Storage → `reph-rooms-redis` → Browser shows the keys (`reph:state`, `reph:state:version`, …); delete `reph:state` and `reph:state:version` there to start again from the demo.

### Shared state (several instances)
With Upstash Redis configured, every server instance (Vercel functions, several ECS tasks) shares one state:
- **Settings**: `KV_REST_API_URL` and `KV_REST_API_TOKEN` (set by Vercel's Upstash integration), or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Without them everything stays in the server's memory as before (development, tests, one EC2 server). `src/lib/kv.ts` speaks Upstash's REST API with `fetch` (no package); without Redis the same `Kv` operations run in memory (`memoryKv`).
- **What is shared**: the mock gateway's rooms, bookings and next ticket number and the app store (accounts, audit log, message threads, read marks) as one JSON snapshot (`reph:state`; dates kept as `{"$date": "<ISO>"}`) with a version number (`reph:state:version`); proposals (`reph:proposal:<id>`, kept 16 minutes; the real expiry is `expiresAt`) and used one-time OAuth ids (`reph:once:<jti>`, until the token's expiry) as keys of their own.
- **How** (`src/services/sharedState.ts`; the routes through `shared(route)` in `src/app/api/_shared.ts`): every API route that touches them runs inside `withShared`: load the snapshot when Redis holds a newer version, run the route, save the snapshot as the next version when the route changed it. Writes (POST, PATCH, DELETE) hold a lock (`reph:state:lock`, 15 s, waited for up to 8 s, then 503 "The app is busy. Try again in a moment.") from before the load until after the save, so writes never interleave. A GET that changes something (opening a thread marks it read) locks only to save, and drops that change if another instance saved in between. The assistants, search, a new proposal, MCP and the token endpoint only read and prepare, so they don't hold the lock (`{ lock: false }`); their one tool that writes, `check_in`, takes it itself (`sharedWrite`: lock, load, check in and audit, save), because the assistant's reply streams after its route has returned. A write nested in a locked run uses that lock (AsyncLocalStorage) instead of waiting for it. Opening a thread marks it read only when something new came in, so polling an open thread writes nothing. The `/admin` layout loads the latest state before it checks the role (`pullShared()`). Health and the OAuth metadata and registration don't touch the state.
- **Per instance still**: the rate-limit windows (each instance counts its own) and the demo clock.
- **The data lasts** across restarts and deploys. The demo week is laid on the current week once, when the first instance saves; later weeks keep what people booked. To start again from the demo, delete the `reph:state` keys in the Upstash console (Data Browser). A new snapshot shape (`FORMAT` in `_shared.ts`) also starts again from the demo.
- **Cost**: every request reads the version (one Redis command); the snapshot (about 14 kB for the demo; the audit log, at most 5 000 entries, is what grows) moves only when it changed. P3-06 (PostgreSQL) and P3-01 (the real tool) replace it.

## Testing strategy
| Layer | Tool | Covers | Where | Status |
|---|---|---|---|---|
| Unit | Node test runner via `tsx --test` | Rules (incl. Urgent, `bookableFrom`), availability (incl. `ownConflicts`), ranking, alternatives, recurrence, routing (incl. unplaced rooms), people, clock, data validity | `src/domain`, `src/data`, `src/lib` `__tests__` | Built |
| Service | Node test runner | Flows A/B/C on the demo scenario, the one-room-per-person warning and refusal, the room schedule (name matching, privacy, free times from now, floors, errors) | `src/services/__tests__` | Built |
| Gateway | Node test runner | Mock gateway rules (incl. one room per person) and swaps; contract tests shared with the real adapter [P3] | `src/gateway/__tests__` | Mock built |
| Agent helpers | Node test runner | History trimming, proposals, links, instructions (guidelines knowledge follows `RULES`, no `@`, the signed-in user line, `room_schedule` and one-room rules), guardrail quick check | `src/agent/__tests__` | Built |
| API | Node test runner calling route handlers | Shared state across instances (`shared.test.ts`: a booking confirmed on one instance is in My bookings and Admin on others, a confirm card works once, role changes reach every instance, simultaneous writes take turns, the assistant's check-in stays and is logged, an open thread's poll writes nothing); status codes, validation (bad input names the field, never a 500), privacy filter, single-use proposals, form fields, Urgent rule, sign-in (401 everywhere without a session, forged cookies, wrong password, the cookie's attributes, sign out, accounts match the directory), one room per person (409 before and at Confirm, search warning, `mine`), the tool's reservation list and filters, weekly series all-or-none, error `fields` (04 Tests) | `src/app/api/__tests__/routes.test.ts` | Built |
| UI logic | Node test runner | Room states, 3D layout (walls, doors, seats ≤ capacity), plan furniture (benches, diagonal bands inside their box, tables; both floors traced), 2D zoom and pan maths, CSV escaping, store (New chat) | `src/ui/__tests__` | Built |
| MCP and OAuth | Node test runner calling route handlers | Metadata, 401 + `WWW-Authenticate`, the connect flow (register, Allow, PKCE code for tokens), `initialize`, notifications, `tools/list`, tools as the token's person, confirm links (15 min, owner only, Confirm books), single-use codes, refresh rotation, token kinds and audience, tampering, redirect URI rules, consent (sign-in, same origin, no redirect to unregistered addresses, Deny, PKCE `plain`, wrong resource), JSON-RPC errors and batches | `src/mcp/__tests__/mcp.test.ts` | Built |
| Agent evals | `scripts/evals.ts` with the real model (`npm run evals`) | Tool choice, arguments, flow, reply text, scope guardrail | `evals/phrases.json`; report `evals/last-run.md` (git-ignored, written by a full run) | Built: 58 conversations (10 for the Admin assistant); latest full run 57/58, safety 12/12, admin 10/10 (`evals/last-run.md`); history in 05 Evals |
| Spec copies | Node test runner (`src/__tests__/spec.test.ts`) | Every `<!-- verbatim: <path> -->` block in `docs/` equals its file (`scripts/spec-verbatim.ts`; 10 §9) | `src/__tests__` | Built |
| End to end | Playwright with `DEMO_NOW`, recorded SSE streams | F2–F19 in the browser | `e2e/` | P1-12 |
| Accessibility | axe in Playwright | S1–S3 and S7–S9 have no serious violations | `e2e/` | P1-12 |

Current count: **149 tests in 29 files, all passing** (`npm test`):
| File | Tests | File | Tests |
|---|---|---|---|
| `src/__tests__/spec.test.ts` | 1 | `src/domain/__tests__/people.test.ts` | 1 |
| `src/agent/__tests__/guardrails.test.ts` | 2 | `src/domain/__tests__/ranking.test.ts` | 4 |
| `src/agent/__tests__/history.test.ts` | 3 | `src/domain/__tests__/recurrence.test.ts` | 5 |
| `src/agent/__tests__/instructions.test.ts` | 5 | `src/domain/__tests__/routing.test.ts` | 6 |
| `src/agent/__tests__/links.test.ts` | 1 | `src/domain/__tests__/rules.test.ts` | 11 |
| `src/agent/__tests__/proposals.test.ts` | 3 | `src/gateway/__tests__/mockGateway.test.ts` | 12 |
| `src/app/api/__tests__/routes.test.ts` | 22 | `src/lib/__tests__/clock.test.ts` | 1 |
| `src/data/__tests__/data.test.ts` | 5 | `src/services/__tests__/roomSchedule.test.ts` | 5 |
| `src/domain/__tests__/alternatives.test.ts` | 1 | `src/services/__tests__/searchRooms.test.ts` | 6 |
| `src/domain/__tests__/availability.test.ts` | 9 | `src/ui/__tests__/csv.test.ts` | 2 |
| `src/mcp/__tests__/mcp.test.ts` | 9 | `src/ui/__tests__/floorLayout.test.ts` | 4 |
| `src/app/api/__tests__/admin.test.ts` | 9 | `src/domain/__tests__/reports.test.ts` | 3 |
| `src/app/api/__tests__/shared.test.ts` | 6 | `src/ui/__tests__/layout3d.test.ts` | 4 |
| | | `src/ui/__tests__/mapZoom.test.ts` | 5 |
| | | `src/ui/__tests__/roomStates.test.ts` | 3 |
| | | `src/ui/__tests__/store.test.ts` | 1 |

Gateway tests (`mockGateway.test.ts`, on an empty gateway with the clock at Mon, Sep 28, 9:00 AM Manila unless noted): double booking is rejected with the conflicting booking; only the owner can cancel, and cancelling frees the slot; check-in works for the owner from 1 hour before until 15 minutes after the start; one room per person at a time: a second room at an overlapping time is refused (`ConflictError` kind `requester`, naming the first booking), back to back is fine, and someone else can still take another room then; visitor offices can't be booked directly; a swap moves the owner and books the freed room; a failed swap puts the owner back (the blocker is a third tester, Bravo); with the demo scenario, unknown capacities get demo values (Paris 6) but real ones stay (Cape Town 5), and the demo user's bookings are RM-0129902 and RM-0129912. Clock test: `DEMO_NOW` starts the clock at the demo time, and a bad value falls back to real time. Proposal tests: a proposal can be confirmed once, only by its user; it expires after 3 minutes.

Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run evals` (real model, about 3 minutes, one item after another), `npm run spec:sync` / `npm run spec:check` (the docs' verbatim copies, 10 §9); `npm run e2e` is defined in `package.json` but its files arrive with P1-12.

## Definition of done (every task)
1. Acceptance criteria in the task are met and covered by tests.
2. `npm test`, `npm run typecheck` and `npm run build` pass.
3. Evals pass (`npm run evals`: ≥ 90% overall, 100% safety) when instructions, tools or model changed.
4. `npm run spec:sync` after the code change (the tests fail while a verbatim copy in `docs/` differs from its file), then the prose in `docs/` updated by hand (spec, PLAN status, RULES).
5. No new rule values hard-wired outside `src/domain/rules.ts`.
6. Spec updated if behaviour, fields, UI or config changed — the spec must stay good enough to rebuild the app from scratch.
7. Initial page JS still under 250 kB gzipped.
8. A short summary of what changed and how to try it.
