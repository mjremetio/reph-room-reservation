# 10 · Rebuild from the docs

Using a coding agent? Paste [`PROMPT.md`](PROMPT.md): it points the agent here and sets the working rules.

This guide rebuilds the whole app on a new machine from the `docs/` folder alone, with no copy of the code. The spec (01–09, `RULES.md`, `PLAN.md`) says **what** every part does. The appendices hold everything that must be **exact**: data, prompts, schemas, styles, the floor trace and the tests. When this guide and an appendix give a value, copy it character for character.

State of the app this describes: spec v0.18 (1 Oct 2026). 149 tests in 29 files, typecheck and build clean, every verbatim copy in the docs checked against the code by a test (§9), evals in the latest full run in `evals/last-run.md` (58 conversations); demo sign-in with three accounts (their passwords are not in the docs: the owner hands them out, or set new ones with `npm run hash-password`); the clock is the real Asia/Manila time unless `DEMO_NOW` replays the demo week; the map colours availability green (free), orange (partly free) and red (taken); an MCP server with OAuth 2.1 lets Claude, ChatGPT and other AI apps use the tools (05, MCP); the owner's account is Admin, with `/admin` (dashboard, bookings, messages, reports, users, rooms, logs) and the Admin assistant (02 F29–F33, 06 S13–S22). Deployment on AWS is its own guide: [11 Deploy on AWS](11-deploy-aws.md) (ECS, EC2, or one EC2 server with the `deploy/ec2/` bundle).

---

## 1. What you need
| Need | Version / note |
|---|---|
| Node.js | **22.x** (22.23.3 used) with npm 10 (10.9.9 used). With nvm: `nvm install 22 && nvm use 22`. The repo's `engines` says `>=22`; Node 20 fails. |
| Python 3 | Standard library only, to run `scripts/trace-floors.py` (3.9.6 used). |
| OpenAI API key | For the assistant, `npm run ask` and `npm run evals`. Model `gpt-5.6-luna` (the `@openai/agents` 0.18 default); leave `OPENAI_MODEL` empty to follow the SDK default. Without a key everything except the assistant works. |
| Docker, AWS CLI | Only for deploying; see [11](11-deploy-aws.md). |
| A browser | Chrome or Safari for the manual checks; WebGL for the 3D view. |

## 2. Where every exact artifact lives
| Artifact | Repo path | Where in the docs |
|---|---|---|
| Project files: `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` | repo root | this file, §3 (verbatim) |
| Deployment files: `Dockerfile`, `.dockerignore`, `next.config.ts`; the one-server bundle `deploy/ec2/{compose.yaml,Caddyfile,env.example,deploy.sh,package.sh}` | repo root, `deploy/ec2/` | 11 (verbatim; §8 for the bundle); §3.5 |
| Next.js agent rules block for `CLAUDE.md` | `CLAUDE.md` | this file, §3.7 |
| File tree and each file's job | everything | this file, §4 |
| Room list, demo scenario (people, bookings, capacity overrides), hardware options, hand-offs | `src/data/rooms.ts`, `data/scenarios/demo.json`, `src/config/*` | appendix A (data), `docs/spec/appendix/A-data.md`; behaviour in 03 |
| Domain rules and algorithms with every constant | `src/domain/*` | appendix B (domain), `docs/spec/appendix/B-domain.md`; RULES.md, 03 |
| Agent instructions, guidelines text, tool names, descriptions and parameter schemas, guardrail prompts and reply | `src/agent/*` | appendix C (agent), `docs/spec/appendix/C-agent.md`; 05 |
| Eval conversations | `evals/phrases.json` | appendix D (evals), `docs/spec/appendix/D-evals.md`; 05 Evals |
| CSS: tokens and every style file | `src/ui/styles/*.css` | appendix E (styles), `docs/spec/appendix/E-styles.md`; 06 |
| Floor trace script and the floor JSON format | `scripts/trace-floors.py`, `data/floors/manila-bldg-h.json` | appendix F (floor plans), `docs/spec/appendix/F-floor-plans.md`; 07 |
| 3D model: constants, geometry, materials, camera | `src/ui/building3d/*`, `src/ui/Building3D.tsx` | appendix G (3D), `docs/spec/appendix/G-3d.md`; 06 3D view, 07 3D model |
| Every test and what it asserts | `src/**/__tests__/*.test.ts` | appendix H, `docs/spec/appendix/H-tests.md` |
| Every other source and test file (domain, data loaders, gateway, lib, services, API routes, UI, the spec script, tests), plus `README.md` and `CLAUDE.md` | `src/**`, `scripts/spec-verbatim.ts`, repo root | appendix I (source), `docs/spec/appendix/I-source.md` (verbatim; its intro lists what other appendices copy instead) |
| Which doc blocks are exact copies of which files | `<!-- verbatim: <path> -->` markers in `docs/` | §9 |
| API routes, shapes, status codes, error `fields` | `src/app/api/*` | 04 |
| Screens, components, copy, motion, responsive, accessibility | `src/ui/*` | 06 |
| Business rules and open questions | `src/domain/rules.ts` | `docs/RULES.md` |
| Integration, sign-in, Outlook, Teams (later phases) | – | 08 |
| Security, privacy, budgets, configuration, testing | – | 09 |
| Deployment on AWS (ECS Fargate, EC2, or one EC2 server with Docker Compose and Caddy): image, secrets, health check, smoke test | `Dockerfile`, `.dockerignore`, `next.config.ts`, `deploy/ec2/*` | 11 |

## 3. Project files (verbatim)

### 3.1 `package.json`
<!-- verbatim: package.json -->
```json
{
  "name": "reph-room-assistant",
  "version": "0.2.0",
  "private": true,
  "description": "AI room reservation assistant (OpenAI) with a live floor map for REPH Bldg. H and Iloilo",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "package:ec2": "bash deploy/ec2/package.sh",
    "test": "tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "ask": "tsx scripts/ask.ts",
    "evals": "tsx scripts/evals.ts",
    "hash-password": "tsx scripts/hash-password.ts",
    "e2e": "playwright test",
    "spec:sync": "tsx scripts/spec-verbatim.ts",
    "spec:check": "tsx scripts/spec-verbatim.ts --check"
  },
  "devDependencies": {
    "@types/node": "^22.20.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@types/three": "^0.186.0",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3"
  },
  "dependencies": {
    "@openai/agents": "^0.18.0",
    "@react-three/fiber": "^9.8.1",
    "@tanstack/react-query": "^5.103.3",
    "next": "^16.3.6",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "three": "^0.186.1",
    "zod": "^4.6.5"
  }
}
```
`e2e` points at Playwright, which is not installed yet (PLAN P1-12). `package-lock.json` is not reproduced here; the versions actually installed and verified were:

| Package | Installed |
|---|---|
| next | 16.3.6 |
| react, react-dom | 19.3.0 |
| @openai/agents, @openai/agents-core | 0.18.0 |
| zod | 4.6.5 |
| three | 0.186.1 |
| @react-three/fiber | 9.8.1 |
| @tanstack/react-query | 5.103.3 |
| typescript | 6.0.3 |
| tsx | 4.23.15 |
| @types/node | 22.20.4 |
| @types/three | 0.186.0 |

Run `npm install` (it writes `package-lock.json`), then check `npm ls` against the table. Don't install packages one by one or with `--save-exact`: that rewrites `package.json`, which must stay exactly as above. Newer minor versions should work but were not verified; if an installed API differs (for example `@openai/agents`), follow the installed version and update 05.

### 3.2 `tsconfig.json`
<!-- verbatim: tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "dom",
      "dom.iterable",
      "ES2022"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "types": [
      "node"
    ],
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```
Notes: TypeScript 6 does not load `@types/*` automatically, hence `"types": ["node"]`. `jsx: react-jsx` is what Next.js 16 writes. The code imports with relative paths; the `@/*` alias exists but is unused. If `tsc` complains about a stale file under `.next/types` after deleting a route, delete `.next/types`.

### 3.3 `.env.example` (copy to `.env.local`, never commit it)
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
Every variable is explained in 09, Configuration; a deployment sets the same variables in its environment and keeps `OPENAI_API_KEY` and `SESSION_SECRET` in a secret store (11). In `.env.local` set `SESSION_SECRET` too (32+ random characters) so `npm start` can sign in; `next dev` works without it. `DEMO_NOW` is empty by default: the app runs on the real time (shown in Asia/Manila) and the demo bookings move into the current week; set `DEMO_NOW=2026-09-28T09:00:00+08:00` in `.env.local` to replay the scripted demo (PLAN.md) and the local smoke test in §7. `scripts/ask.ts` also reads `ASK_AS` (a tool login such as `ALPHA.TESTER`).

### 3.4 `.gitignore`
<!-- verbatim: .gitignore -->
```gitignore
node_modules/
.next/
out/
dist/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
next-env.d.ts
.env
.env*.local
evals/last-run.md
.DS_Store
# Vercel CLI (vercel link): the project link and env files stay on this machine; the template is committed.
# vercel link appends ".vercel" and ".env*" again: remove them, or .env.example drops out of git.
.vercel
.env*
!.env.example
```
(`evals/last-run.md` is written by every full eval run and not committed.)

### 3.5 Deployment files
`Dockerfile`, `.dockerignore` and `next.config.ts`, and the one-server bundle in `deploy/ec2/` (`compose.yaml`, `Caddyfile`, `env.example`, `deploy.sh`, `package.sh`; make the two scripts executable), are copied verbatim in [11 Deploy on AWS](11-deploy-aws.md), which also explains them. Write them with the other project files; the app runs locally without Docker.

### 3.6 Next.js 16 notes
- `next.config.ts` sets only `output: 'standalone'`: `next build` also writes a self-contained server (`.next/standalone/server.js`) that the container image runs (11). Everything else is the default (App Router, Turbopack for `next dev` and `next build`).
- `next-env.d.ts` is generated by Next.js on the first `next dev` or `next build` and is git-ignored. It reads:
  ```ts
  /// <reference types="next" />
  /// <reference types="next/image-types/global" />
  import "./.next/types/routes.d.ts";
  import "./.next/types/root-params.d.ts";
  ```
- `next dev` writes its output under `.next/dev`, so `next build` can run while the dev server is up.
- Route handlers take `{ params }` as a **Promise** (`const { id } = await params`). Every API route file exports `runtime = 'nodejs'`.
- Before writing Next.js code, read the guide in `node_modules/next/dist/docs/` (for example `01-app/03-api-reference/03-file-conventions/02-route-segment-config/`).

### 3.7 The block `next dev` adds to `CLAUDE.md`
`next dev` writes this block into `CLAUDE.md` if it is missing (see `node_modules/next/dist/server/lib/generate-agent-files.js`). Keep it:
```markdown
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
```

## 4. File tree
Every file in the repo except `node_modules/`, `.next/`, `.git/`, lock and build-info files. "Spec" says where its behaviour is defined.

### Root
| File | Job | Spec |
|---|---|---|
| `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` | Project setup | §3 |
| `Dockerfile`, `.dockerignore` | Container image for AWS ECS or EC2 (multi-stage, Node 22 Alpine, non-root, health check on `/api/health`); what stays out of the image | 11 |
| `deploy/ec2/compose.yaml`, `Caddyfile`, `env.example`, `deploy.sh`, `package.sh` | One EC2 server like a VPS: the app and Caddy (automatic HTTPS) with Docker Compose; the settings template; the idempotent server script (installs Docker, settings in `/etc/reph-rooms/.env`, build, start, health check, `rollback`); the bundle maker (`npm run package:ec2` → `dist/reph-rooms-<commit>.tar.gz`, git-ignored) | 11 §8 |
| `next.config.ts` | `output: 'standalone'` for the image | 11; §3.6 |
| `.env.local` | Your secrets (not committed) | §3.3, 09 Configuration |
| `CLAUDE.md` | Instructions for coding agents: commands, code map, rules that must never break, how to work, the Next.js block | §3.7; SPEC.md |
| `README.md` | Quick start, demo script, deploy pointer | appendix I |

### `docs/`
| File | Job |
|---|---|
| `docs/SPEC.md` | Index of the spec, tags, change log |
| `docs/PLAN.md` | Tasks by phase with status; the Phase 1 demo script |
| `docs/RULES.md` | Business rules with sources, open questions for Admin |
| `docs/spec/01-overview.md` … `09-quality.md` | The spec by area |
| `docs/spec/10-rebuild.md` | This guide |
| `docs/spec/11-deploy-aws.md` | Deploy on AWS (ECS Fargate, EC2, or one EC2 server with Docker Compose and Caddy), step by step |
| `docs/spec/PROMPT.md` | Short kickoff prompt to paste into a coding agent: follow the spec folder, copy verbatim blocks, rules, when it's done |
| `docs/spec/appendix/A-data.md`, `B-domain.md`, `C-agent.md`, `D-evals.md`, `E-styles.md`, `F-floor-plans.md`, `G-3d.md`, `H-tests.md`, `I-source.md` | Verbatim artifacts (§2) |

### `data/` and `evals/`
| File | Job | Spec |
|---|---|---|
| `data/scenarios/demo.json` | The fixed demo week: demo user, people (incl. the three sign-in accounts), capacity overrides, 15 bookings | appendix A; 03 Demo scenario |
| `data/floors/manila-bldg-h.json` | 2F and 3F plans: outline, rooms, areas, furniture, nodes, edges, vertical links. **Generated** by `scripts/trace-floors.py` (§6) | appendix F; 07 |
| `evals/phrases.json` | 56 agent test conversations (10 for the Admin assistant) with expectations and the pass bar | appendix D; 05 Evals |
| `evals/last-run.md` | Report of the last full `npm run evals` (generated, git-ignored; appendix D quotes one run as a snapshot, without a verbatim marker, so it may be older) | 05 Evals |

### `scripts/`
| File | Job | Spec |
|---|---|---|
| `scripts/ask.ts` | `npm run ask -- "<message>"`: one message to the real agent in-process (mock gateway, the clock `.env.local` sets); prints tool calls, UI events and the reply; `ASK_AS=<login>` (default the demo user); prints the fixed reply when the scope guardrail blocks | 05 |
| `scripts/evals.ts` | `npm run evals` (`-- --tag x`, `-- --only a,b`): runs `evals/phrases.json` against the real model on a fresh mock gateway per item; ✓/✗ with reasons; per-tag results; exit 1 below the bar; full runs write `evals/last-run.md` | 05 Evals |
| `scripts/hash-password.ts` | `npm run hash-password -- "<password>"` (12+ characters): prints the scrypt hash for an account in `src/config/accounts.ts` | 09 Security |
| `scripts/trace-floors.py` | Writes `data/floors/manila-bldg-h.json` from pixel boxes traced on the guidelines' appendix layouts (Python 3 stdlib) | appendix F; 07 |
| `scripts/spec-verbatim.ts` | `npm run spec:sync` rewrites every `<!-- verbatim: <path> -->` block in `docs/` from its file; `npm run spec:check` lists the ones that differ (exit 1); exports `verbatimDrift` and `syncVerbatim` for the test | §9 |

### `src/app/` (Next.js)
| File | Job | Spec |
|---|---|---|
| `src/app/layout.tsx` | Root layout: imports the 8 style files in cascade order (base, shell, cards, map, sheets, table, admin, responsive); Open Sans (400–800) and Barlow Condensed (500–700, map labels) via `next/font/google` as `--font-open-sans` / `--font-barlow-condensed`; title "REPH Room Assistant" | 06 Design tokens |
| `src/app/page.tsx` | Renders `<App />` | 06 |
| `src/app/oauth/authorize/page.tsx` | The consent page for AI apps: checks the request (`checkAuthorize`), shows an error, redirects an OAuth error, or renders `Consent` | 04 MCP; 06 Connect an AI app |
| `src/app/.well-known/oauth-authorization-server/route.ts` | GET OAuth authorization server metadata (RFC 8414) | 04 MCP |
| `src/app/.well-known/oauth-protected-resource/route.ts`, `…/api/mcp/route.ts` | GET protected resource metadata (RFC 9728), at both paths | 04 MCP |
| `src/app/admin/layout.tsx` | The Admin area: dynamic, `noindex`; reads the session cookie and redirects anyone but a signed-in Admin with their own password to `/`; renders `AdminShell` | 06 Admin |
| `src/app/admin/page.tsx`, `bookings/`, `messages/`, `reports/`, `users/`, `rooms/`, `logs/` `page.tsx` | One Admin page each (title "<Page> · Admin · REPH Rooms"), rendering its `src/ui/admin/` component | 06 S13–S21 |
| `src/app/api/_agentStream.ts` | `streamAgent`: runs an agent and streams it over SSE (both assistants); 90 s limit; guardrail block → fixed reply; one log line | 04, 05; appendix C |
| `src/app/api/admin/_admin.ts` | `adminGuard` (same-origin writes, `requireAdmin`, rate limit), `adminFailure` (clashes in words) | 04 Admin |
| `src/app/api/admin/overview/route.ts` | GET the dashboard | 04 Admin |
| `src/app/api/admin/changes/route.ts` | GET the audit entries after an id (the live Admin pages) | 04 Admin |
| `src/app/api/admin/bookings/route.ts`, `[ticketNo]/route.ts`, `approve/route.ts`, `swap/route.ts` | GET every booking with all fields; POST approve / reject / cancel / checkin and PATCH changes; bulk approve; swap rooms (audited, notes to owners) | 04 Admin |
| `src/app/api/admin/reports/route.ts`, `audit/route.ts` | GET the report (≤ 92 days); GET the audit log | 04 Admin |
| `src/app/api/admin/users/route.ts`, `[login]/route.ts`, `[login]/reset/route.ts`, `[login]/signout/route.ts` | GET and POST accounts (temporary password once); PATCH an account; reset; sign out everywhere | 04 Admin |
| `src/app/api/admin/rooms/route.ts`, `[roomId]/route.ts` | GET rooms with notes; PATCH room details | 04 Admin |
| `src/app/api/admin/assistant/route.ts` | POST the Admin assistant over SSE (Admin only; notes for tickets the Admin just acted on) | 04, 05; appendix C |
| `src/app/api/messages/route.ts`, `[ticketNo]/route.ts` | GET your threads (every thread for Admin) with the unread count; GET a thread (marks it read) and POST a message (owner or Admin only) | 04 Messages |
| `src/app/api/session/password/route.ts` | POST change your own password | 04 Session |
| `src/app/api/_http.ts` | Error format and codes, `fail()`, `parseBody`/`parseQuery`, `crossOrigin()` same-origin check, `rateLimited()` (incl. `mcp` and `oauth` buckets), `clientAddress()`, `OPEN_CORS` and `preflight()` for the MCP and OAuth endpoints, `gatewayFailure()` | 04 Conventions, 09 Security |
| `src/app/api/_release.ts` | `releaseNoShows()`: before every shared route, cancels bookings nobody checked in to (gateway), audits `booking.release` as `SYSTEM` and notes it in the owner's thread | 02 F34 |
| `src/app/api/_schemas.ts` | zod schemas for every route (times need an offset; ranges; recurrence; hardware list) | 04 |
| `src/app/api/_shared.ts` | `shared(route, { lock? })`: runs a route with `withShared`; `SharedStateError` → 503 | 04 Conventions, 09 Shared state |
| `src/app/api/assistant/route.ts` | POST, streams the agent over SSE (`text`, `ui`, `done`, `error`); 90 s run timeout; guardrail block → fixed reply | 04, 05 |
| `src/app/api/availability/route.ts` | GET busy times per room (≤ 7 days), privacy-filtered | 04 |
| `src/app/api/bookings/route.ts` | GET the tool's reservation list with its search panel (≤ 31 days), every status | 04 |
| `src/app/api/bookings/mine/route.ts` | GET the signed-in person's own bookings with check-in windows | 04 |
| `src/app/api/bookings/[ticketNo]/check-in/route.ts` | POST check-in (403 with the window) | 04 |
| `src/app/api/health/route.ts` | GET configuration without secrets (gateway, scenario, openai configured/missing, model, clock, now) | 04 |
| `src/app/api/mcp/route.ts` | POST the MCP server (bearer token only, JSON-RPC, 202 for notifications); GET and DELETE 405; OPTIONS preflight | 04 MCP, 05 MCP |
| `src/app/api/oauth/register/route.ts` | POST dynamic client registration | 04 MCP |
| `src/app/api/oauth/token/route.ts` | POST code (PKCE) and refresh-token grants | 04 MCP |
| `src/app/api/oauth/authorize/route.ts` | POST the consent decision (signed in, same origin) → the redirect back to the app | 04 MCP |
| `src/app/api/proposals/route.ts` | POST prepares a booking or (`action: "cancel"`) a cancellation; errors carry `problems` and `fields` | 04 |
| `src/app/api/proposals/[id]/route.ts` | GET the card behind a confirm link (same person only, else 410); POST confirms a proposal: the only place bookings are made or cancelled | 04 |
| `src/app/api/rooms/route.ts` | GET rooms (site, floor) | 04 |
| `src/app/api/search/route.ts` | POST the shared search (same as `find_rooms`; warns when the requester already holds a room then) | 04 |
| `src/app/api/session/route.ts` | GET who is signed in, POST sign in (sets the `reph-session` cookie), DELETE sign out | 04 Session |

Every route except `health` and `session` answers 401 without a signed-in account; `/api/admin/*` also answers 403 to anyone but an Admin.

### `src/domain/` (pure logic, no I/O)
| File | Job | Spec |
|---|---|---|
| `types.ts` | `AgendaType`, `RoomKind`, `AV`, `Room`, `Booking`, `BookingStatus`, `Priority`, `TrainingType`, `Person`, `RoomRequest`, `Interval` | 03; appendix B |
| `time.ts` | Asia/Manila helpers: `manila()`, `formatManila`, `formatRange`, `manilaStartOfDay`, `manilaStartOfWeek` (Monday 00:00), `manilaMinuteOfDay`, `addMinutes` | 03; appendix B |
| `rules.ts` | `RULES` constants (incl. `oneRoomPerPersonAtATime`, `adminMayOverride`), `adminChangeIssues`, `validateRequest`, `checkAgendaTitle`, `fitsOneTrainingShift`, `urgentAllowed`, `bookableFrom`, `checkInWindow`, `shouldAutoRelease`, `IssueCode`, `FormField`, `ISSUE_FIELD` | RULES.md; appendix B |
| `availability.ts` | `overlaps`, `conflictsFor`, `ownConflicts` (one room per person), `availabilityFor` (available / partial / unavailable), `freeIntervals`, `nearestFreeSlots` | 03; appendix B |
| `ranking.ts` | `ROOM_KINDS_FOR`, `scoreRoom`, `rankRooms`, `Scored`, `Fit` (`right size`, `roomy`, `oversized`, `unknown size`) | 03; appendix B |
| `alternatives.ts` | `swapOptionsFor` (rooms that fit the owner, free for their slot, same floor first, ≤ 3) | 02 F3/F4; appendix B |
| `recurrence.ts` | `Recurrence`, `expandRecurrence`, `describeRecurrence`, JSON converters, `WEEKDAYS`, `WEEK_OF_MONTH` | 03; appendix B |
| `people.ts` | `sameEmail` | 03 |
| `reports.ts` | `buildReport` (totals, statuses, types, floors, rooms, divisions, days, weekday × hour heatmap, top requesters, no-shows, utilisation), `usesRoom`, `waitingForAdmin`, `manilaToday` | 02 F32, 04 Admin |
| `routing.ts` | Floor data types (`FloorData`, `RoomShape`, `Area`, `AreaKind`, `FurnitureItem`), `buildGraph`, `shortestRoute` (A*), walking speed | 07; appendix B/F |

### `src/data/`
| File | Job | Spec |
|---|---|---|
| `rooms.ts` | `ROOMS`: every room with id, name, tool name, site, building, floor, kind, AV, capacity (`null` = unknown), self-bookable, notes | appendix A; 03 Room master data |
| `scenarios.ts` | Loads and validates `demo.json` (`parseScenario`, `DEMO_SCENARIO`): rejects overlaps, unknown rooms, unknown statuses; `scenarioInWeekOf` moves the demo week by whole weeks into the current Manila week (real clock) | appendix A; 03 |
| `floorPlans.ts` | `MANILA_BLDG_H` from the floor JSON; `manilaGraph()` (cached) | 07 |

### `src/config/`
| File | Job | Spec |
|---|---|---|
| `handoffs.ts` | `HANDOFFS`: `visitor_office`, `hardware`, `room_setup`, `it_support` (label + link) | appendix A; 05 get_handoff |
| `hardware.ts` | `HARDWARE_OPTIONS` (placeholder list [OPEN]) | appendix A; 03 |
| `accounts.ts` | `ACCOUNTS`: the three seed sign-in accounts (login, name, e-mail, division, `role`, scrypt `passwordHash`), `Account` | appendix I; 03 App-owned data |

### `src/gateway/`
| File | Job | Spec |
|---|---|---|
| `ReservationGateway.ts` | The interface: `listRooms`, `listPeople`, `getBookings`, `getBooking`, `listMyBookings`, `createBooking` (a series books all or none), `cancelBooking`, `checkIn`, `moveBooking` (swaps); `NewBooking`, `Requestor`; errors `ConflictError` (kind `room` or `requester`), `NotAllowedError`, `NotFoundError` | 03, 08 |
| `mockGateway.ts` | In-memory implementation on the demo scenario or random samples; no overlaps per room and one room per person; Admin methods for an Admin actor; `snapshot()` / `restore()` for the shared state | 03, 08, 09 Shared state |
| `swap.ts` | `swapBookings`: move the owner, book the freed room, roll back on failure | 08 Swaps |
| `index.ts` | `getGateway()` from `RESERVATION_GATEWAY` (the demo week as is with `DEMO_NOW`, moved into this week without); `resetGateway()` for evals and tests | 08 |

### `src/store/`
| File | Job | Spec |
|---|---|---|
| `AppStore.ts` | The interface and records: `StoredAccount`, `AccountPatch`, `AuditAction`, `AuditEntry`, `Message`, `Thread` | 03 App-owned data |
| `memoryStore.ts` | `MemoryStore` (seeded accounts; audit capped at `AUDIT_LIMIT`; threads and read markers); `snapshot()` / `restore()` for the shared state | 03, 09 Shared state |
| `index.ts` | `getStore()`, `resetStore()` | 03 |

### `src/lib/`
| File | Job | Spec |
|---|---|---|
| `accounts.ts` | `createAccount`, `updateAccount`, `resetAccount`, `signOutEverywhere`, `changePassword`, `temporaryPassword`, `accountView`, `loginFor`, `MIN_PASSWORD_LENGTH` | 04 Admin, 09 Security |
| `audit.ts` | `audit(actor, action, target?, detail?)`, `auditView` | 09 Audit |
| `clock.ts` | `now()`: starts at `DEMO_NOW` when the server starts, then runs; bad value → real time | 09 Configuration |
| `passwords.ts` | `hashPassword`, `verifyPassword` (scrypt, `scrypt$<salt>$<hash>`, constant-time) | 09 Security |
| `session.ts` | `SESSION_COOKIE`, `SESSION_HOURS`, `sessionSecret`, `createSession`, `readSession`, `sessionToken`, `sessionCookie`, `accountPerson`, `accountByLogin`, `authenticate` | 04 Session, 09 Security |
| `requestor.ts` | `signedInAccount()`, `requestor()` (the signed-in account or null), `requireRequestor()` (401 when nobody), `requireAdmin()` (401 / 403) | 04, 09 Security |
| `kv.ts` | `Kv` (get, mget, mset, set, setNew, take, release), Upstash Redis over REST when `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set, else `memoryKv()`; `kv()`, `kvShared()`, `kvKey()`, `toJson`/`fromJson` (dates kept) | 09 Shared state |
| `tokens.ts` | Signed stateless OAuth tokens: `signToken`, `readToken` (per-kind HMAC keys from `SESSION_SECRET`, expiry), `useOnce` (used ids in `kv`, async), `fingerprint` | 04 MCP, 09 MCP threat model |

### `src/mcp/`
| File | Job | Spec |
|---|---|---|
| `oauth.ts` | OAuth 2.1 for MCP: `originFrom`/`publicOrigin`, metadata, `allowedRedirectUri`, `registerClient`, `readClient`, `checkAuthorize`, `withParams`, `describeRedirect`, `issueCode`, `exchangeToken`, `wwwAuthenticate`, `mcpCaller` | 04 MCP, 09 |
| `server.ts` | The MCP server: `PROTOCOL_VERSIONS`, `INSTRUCTIONS`, `TOOL_LIST` (the agent's tools minus `draft_owner_message`), `handleMessage` (initialize, ping, tools/list, tools/call; confirm links in results) | 05 MCP |

### `src/services/`
| File | Job | Spec |
|---|---|---|
| `searchRooms.ts` | The one room search (agent tool, API, map): validate, read, rank, classify, flow A/B/C/none, alternatives, warnings (incl. one room per person with the requester's email); a named room (`opts.room`) reported with its real status and listed first in its group | 02, 04, 05 find_rooms; appendix B |
| `sharedState.ts` | The state shared by every server instance through Redis: `withShared(work, write)` (load newer, run, save changed; a lock for writes, re-entrant), `sharedWrite`, `pullShared`, `SharedStateError`, `shareThroughForTests` | 09 Shared state |
| `prepareBooking.ts` | The one place proposals are prepared (booking and cancellation); series; one room per person (`ownBookingClashes`); returns `problems` and `fields` | 04, 05 |
| `roomSchedule.ts` | Who has which room when: `matchRooms`, `roomSchedule`, `SCHEDULE_LIMITS` (the `room_schedule` tool) | 05; 02 F25 |
| `adminBookings.ts` | `bookingLabel`, `describeChange`, `clash`, `prepareAdminChange`, `prepareAdminSwap`, `prepareAdminAction` | 02 F30, 04 Admin |
| `messages.ts` | `listThreads`, `openThread`, `postMessage`, `adminNote`, `MESSAGE_MAX` (owner or Admin only; unread counts) | 02 F29, 04 Messages |
| `views.ts` | `roomView`, `adminRoomView`, `publicBooking` (privacy filter), `adminBooking` (Admin only), result views (`searchResultViews(result, viewerEmail)`, `scheduleView`) shared by tools and routes | 04, 09 Privacy |

### `src/agent/`
| File | Job | Spec |
|---|---|---|
| `agent.ts` | `roomAssistant` (tools, instructions, input guardrail, `OPENAI_MODEL`); tracing off unless `OPENAI_TRACING=true` | 05; appendix C |
| `instructions.ts` | `buildInstructions(ctx)` | appendix C |
| `guidelines.ts` | `GUIDELINES` paraphrase (numbers from `RULES`) | appendix C |
| `guardrails.ts` | `scopeGuardrail` and `adminScopeGuardrail` (one factory), `looksOnTopic`, the two classifier agents, `OFF_TOPIC_REPLY`, `ADMIN_OFF_TOPIC_REPLY` | appendix C |
| `adminAgent.ts` | `adminAssistant`, `buildAdminInstructions` | 05 Admin assistant; appendix C |
| `adminTools.ts` | `waiting_requests`, `find_bookings`, `usage_report`, `prepare_admin_action`, `prepare_booking_change`, `prepare_room_swap`, `draft_message_to_owner` (+ `room_schedule`, `list_rooms`) | 05 Admin assistant; appendix C |
| `tools.ts` | The 10 tools: `find_rooms`, `room_schedule`, `list_rooms`, `propose_booking`, `my_bookings`, `check_in`, `request_cancellation`, `find_swap_options`, `draft_owner_message`, `get_handoff` | appendix C; 05 |
| `context.ts` | `AssistantContext` (the signed-in `user`, `proposalHoldMinutes?`), `UiEvent` union, `RoomResultView`, `ScheduleView`, `AlternativeView`, `ProposalView` | 05 UI events |
| `proposals.ts` | Proposal store in `src/lib/kv.ts` (Redis or memory; async): `newProposal`, `saveProposal` (with the card `view`), `peekProposal` for confirm links, `takeProposal` single-use; bound to the signed-in person's email; 3 minutes (15 for MCP confirm links) | 03 Proposal, 04 Proposal store |
| `history.ts` | `trimHistory` (last 60 items, no system/developer items, never mid tool call) | 05 Conversation state |
| `links.ts` | Teams chat deep link and `mailto:` link | 05 draft_owner_message |

### `src/ui/` (browser)
| File | Job | Spec |
|---|---|---|
| `App.tsx` | Page shell: `Gate` (sign-in first, store keyed by the person), top bar with the user menu (AI apps, Sign out), clock sync, `ConfirmLink` (opens `?confirm=<id>`), drawer memory, main grid, sheets | 06 S1 |
| `store.tsx` | React context + `useReducer`: all app state and actions (incl. `new_conversation`); exports `initial` and `reducer` (tested), `StoreProvider`, `useAppState`, `useDispatch`, `useNow()`, `newId` | 06 State |
| `api.ts` | Fetch wrapper (`ApiError` with `problems`, `fields`; a 401 calls `whenSignedOut`), session calls, TanStack Query hooks (`useSession`) | 06, 04 |
| `actions.ts` | SSE client for `/api/assistant`, UI event → card mapping, map search, confirm/cancel/check-in, `showProposal` / `showCancel`, `useBookingOps` | 06 |
| `session.ts` | `useMe`, `forgetUser`, `useSignOut` | 06 Sign-in |
| `SignIn.tsx` | The sign-in screen | 06 Sign-in |
| `ConnectAI.tsx` | Connect an AI app: the MCP URL with Copy, steps for Claude, ChatGPT, Claude Code and others | 06 Connect an AI app |
| `Consent.tsx` | The consent screen for an AI app: sign in if needed, Allow or Deny | 06 Connect an AI app |
| `ChatPanel.tsx` | The assistant drawer: header (New chat, hide), welcome, grouped `SUGGESTIONS`, messages, banners, Ideas panel, composer | 06 Assistant drawer |
| `RichText.tsx` | Paragraphs, `- ` bullets and `**bold**` as React elements | 06 |
| `cards/ResultsCard.tsx` | Flow A/B/C result cards, partly free cards, who has the other rooms, other times, change my request | 06 Cards |
| `cards/ScheduleCard.tsx` | Who has a room and when (`room_schedule`): bookings and free times, Book, Ask to swap, Open room | 06 Cards |
| `cards/ProposalCard.tsx` | Proposal card with countdown → booked card (flip), `.ics` download | 06 Cards |
| `cards/OtherCards.tsx` | Cancel, draft message, hand-off cards | 06 Cards |
| `cards/Appear.tsx` | Staggered rise-and-fade wrapper | 06 Motion |
| `MapPanel.tsx` | Search bar, floor tabs with counts, 2D/3D/Table toggle, the search result note, legend counts and highlight, timeline | 06 Map side |
| `MapLegend.tsx` | One row of room status buttons (counts, hover preview, click pin) and a **Key** toggle that opens the plan key | 06 Map card |
| `FloorMap.tsx` | 2D SVG plan: outline, areas, furniture, labels, rooms by state (green free and fits, orange partly free, red hatched taken, blue yours), badges, "You" marker, unplaced strip; zoom and turn buttons (`TurnButtons`, also used in 3D), wheel, pinch, drag to pan, R keys; text kept upright on a turned plan | 06, 07 |
| `mapZoom.ts` | 2D zoom, pan and turn maths on the viewBox: `fitView`, `clampView`, `viewBoxOf`, `zoomAt`, `panBy`, `turnView`, `rotatedBox`, `turnTransform`, zoom 1–5 (`MAX_ZOOM`), step 1.5, quarter turns (`TURN_STEP` 90) | 06 2D floor map; 07; appendix I |
| `floorLayout.ts` | Furniture items → desks, tables, chairs (2D and 3D) | 07; appendix F/G |
| `Building3D.tsx` | Lazy 3D entry: canvas, camera, DOM labels, highlight, turn buttons, the 360° spin and compass buttons, R / S / 0 keys | 06 3D view; appendix G |
| `building3d/Scene.tsx` | three.js scene: shell, areas, furniture, rooms, lights, camera rig (left drag or one finger turns the building 360° and tilts it, right drag or Shift-drag moves it, wheel or pinch zooms, `shared.turn` eases 45° turns, `shared.spin` keeps it turning, `shared.resetView` glides back, the compass needle follows), GTAO, label projector | appendix G |
| `building3d/layout.ts` | Room walls (glass door side), room furniture by kind and capacity | appendix G |
| `building3d/textures.ts` | Procedural tile, carpet and ground textures | appendix G |
| `Timeline.tsx` | 6 AM–6 AM strip (Morning / Afternoon / Night) with the requested slot and the selected room's bookings; the date line is optional (`head`) | 06 Timeline |
| `DataTable.tsx` | Table view: Rooms and Bookings tabs, filters, sort, pagination, CSV, row details | 06 Table view |
| `BookingDetails.tsx` | A booking's form, read-only (privacy for others) | 06 |
| `RoomSheet.tsx` | Room sheet: one meta line, state, the day, **Book this room** form | 06 Sheets |
| `NewBooking.tsx` | New booking modal: form, Find rooms, results, form errors | 06 Sheets |
| `MyBookings.tsx` | My bookings sheet: list, check in, cancel, Message Admin | 06 Sheets |
| `Messages.tsx` | `Thread`, `ThreadRow`, `MessagesSheet` | 06 Messages |
| `SetPassword.tsx` | Choose a new password (before the app, after a reset) | 06 |
| `sse.ts` | `readSse` (both assistants) | 06 |
| `table/kit.tsx`, `table/DataGrid.tsx` | Table building blocks and the column-driven table (search, sort, pages, selection, CSV) | 06 Admin |
| `charts/Charts.tsx` | `StatTile`, `BarList`, `ColumnChart`, `Donut`, `Heatmap`, `STATUS_COLOURS` | 06 Admin |
| `admin/AdminShell.tsx` … `admin/AdminLogs.tsx`, `admin/AdminLive.tsx`, `admin/AdminBookingSheet.tsx`, `admin/AdminAssistant.tsx`, `admin/shared.tsx` | The Admin frame, pages, booking sheet, assistant panel and shared helpers | 06 Admin |
| `Sheet.tsx` | Side sheet / bottom sheet; `wide` = centred modal | 06 Sheets |
| `Brand.tsx` | The brand lockup: RELX-orange R tile, "REPH Rooms" (optionally "· Admin"), "RELX \| Reed Elsevier" | 06 Top bar |
| `BookingFields.tsx` | The tool's form, trimmed to what the user decides; `useDraft`, `firstDate`, `toRequest`, `precheckBooking`, `formErrorOf`, `FormErrorBox` | 06 Reservation form fields |
| `TimeFields.tsx` | Starts at / Ends at (date + 30-minute time); `AGENDA_TYPES` | 06 |
| `roomStates.ts` | Room state per room (fits, yours, partial, taken, free, unsuitable), `reservedBy`, `shortName`, words | 06 Room states |
| `useMapData.ts` | Rooms + availability + states for the selected slot and office day | 06 |
| `format.ts` | Manila display formats, tool formats, `toManilaIso`, status words | 06 Copy |
| `csv.ts`, `download.ts`, `ics.ts` | CSV export (formula-safe), file download, `.ics` file | 06, 09 |
| `styles/base.css`, `shell.css`, `cards.css`, `map.css`, `sheets.css`, `table.css`, `admin.css`, `responsive.css` | All styles, by area, imported in this order | appendix E; 06 |

### Tests (`src/**/__tests__/`)
29 files, 149 tests; the full list with every assertion is appendix H (the files themselves are in appendix I): `__tests__/spec.test.ts` (the docs' verbatim copies match the code, §9), `agent/__tests__/{guardrails,history,instructions,links,proposals}.test.ts`, `app/api/__tests__/{admin,routes,shared}.test.ts`, `data/__tests__/data.test.ts`, `domain/__tests__/{alternatives,availability,people,ranking,recurrence,reports,routing,rules}.test.ts`, `gateway/__tests__/mockGateway.test.ts`, `lib/__tests__/clock.test.ts`, `mcp/__tests__/mcp.test.ts`, `services/__tests__/{roomSchedule,searchRooms}.test.ts`, `ui/__tests__/{csv,floorLayout,layout3d,mapZoom,roomStates,store}.test.ts`.

## 5. Build order
Build bottom-up. Every file named below is copied verbatim from the appendix that holds it (§2; most are in appendix I), except the generated floor JSON (§6). After each step run `npm test` and `npm run typecheck`; that step's tests are in appendix I too, and appendix H says what each asserts. The PLAN task each step matches is in brackets.

1. **Scaffold** [P1-01]. `mkdir ai_booking && cd ai_booking && git init`. Write the §3 files, `npm install`, create `src/app/layout.tsx` and `src/app/page.tsx` (a placeholder `App`), `npm run dev` → http://localhost:3000.
2. **Domain** [starter, P1-19, P1-23]. `types.ts`, `time.ts`, `rules.ts`, `availability.ts`, `ranking.ts`, `alternatives.ts`, `recurrence.ts`, `people.ts`, `routing.ts` from appendix B and RULES.md. Tests: rules, availability, ranking, alternatives, recurrence, people.
3. **Data** [starter, P1-24]. `src/data/rooms.ts` and `data/scenarios/demo.json` (appendix A), `src/data/scenarios.ts`. Generate the floor JSON (§6), then `src/data/floorPlans.ts`. Tests: data, routing.
4. **Config** [P1-19, P1-21, P1-31]. `src/config/handoffs.ts`, `hardware.ts` (appendix A), `accounts.ts` (appendix I).
5. **Gateway and lib** [starter, P1-22, P1-31, P1-36]. `ReservationGateway.ts`, `mockGateway.ts`, `swap.ts`, `index.ts`; `src/lib/clock.ts`, `passwords.ts`, `session.ts`, `requestor.ts`, `kv.ts`, `tokens.ts`; `scripts/hash-password.ts`. Tests: mockGateway, clock.
6. **Services** [starter, P1-03, P1-23, P1-31]. `searchRooms.ts`, `prepareBooking.ts`, `roomSchedule.ts`, `views.ts`. Tests: searchRooms (checks the demo numbers in 02), roomSchedule.
7. **Agent** [P1-02, P1-21, P1-25, P1-27]. `context.ts`, `proposals.ts`, `links.ts`, `history.ts`, `guidelines.ts`, `instructions.ts`, `guardrails.ts`, `tools.ts`, `agent.ts` (appendix C). Then `scripts/ask.ts`; try `npm run ask -- "Room for 5 today from 3 to 4 PM"`. Tests: history, links, proposals, instructions, guardrails.
8. **API** [P1-03, P1-22, P1-23, P1-27, P1-28, P1-31, P1-51]. `_http.ts`, `_schemas.ts`, `_shared.ts` and every route, `session` included (04); each route that touches reservations or the store is wrapped in `shared()`. Tests: routes (22 tests), shared (6).
8a. **MCP** [P1-36]. `src/mcp/oauth.ts`, `src/mcp/server.ts`, the `/api/mcp`, `/api/oauth/*` and `/.well-known/*` routes, `src/app/oauth/authorize/page.tsx`, and `next.config.ts`'s security headers (11). Tests: mcp (9 tests).
8b. **Admin** [P1-39 … P1-46]. `src/store/*`, `src/lib/accounts.ts`, `audit.ts` (and the store in `session.ts`, `requestor.ts`), the gateway's Admin methods, `src/domain/reports.ts`, `src/services/adminBookings.ts`, `messages.ts`, `_agentStream.ts`, `/api/admin/*`, `/api/messages/*`, `/api/session/password`; `src/agent/adminAgent.ts`, `adminTools.ts`. Tests: admin (8), reports (2), rules (+1), gateway (+3).
9. **Evals** [P1-11]. `evals/phrases.json` (appendix D), `scripts/evals.ts`; `npm run evals` must reach the bar.
10. **UI foundations** [P1-04, P1-05, P1-31, P1-36]. Styles (appendix E), `store.tsx`, `api.ts`, `session.ts`, `SignIn.tsx`, `ConnectAI.tsx`, `Consent.tsx`, `actions.ts`, `format.ts`, `RichText.tsx`, `ChatPanel.tsx`, `App.tsx`. Tests: store.
11. **Cards and confirm** [P1-06, P1-07]. `cards/*`, `ics.ts`, `download.ts`.
12. **Map side** [P1-08, P1-09, P1-18, P1-24, P1-25, P1-29, P1-30, P1-33]. `roomStates.ts`, `useMapData.ts`, `floorLayout.ts`, `mapZoom.ts`, `FloorMap.tsx`, `MapLegend.tsx`, `TimeFields.tsx`, `Timeline.tsx`, `MapPanel.tsx`. Tests: roomStates, floorLayout, mapZoom.
13. **Sheets and forms** [P1-10, P1-15, P1-19, P1-23, P1-25, P1-27]. `Sheet.tsx`, `BookingFields.tsx`, `RoomSheet.tsx`, `NewBooking.tsx`, `MyBookings.tsx`, `BookingDetails.tsx`.
14. **Table** [P1-14, P1-40]. `table/kit.tsx`, `DataTable.tsx`, `csv.ts`. Tests: csv.
14a. **Messages and Admin UI** [P1-39 … P1-46]. `sse.ts`, `Messages.tsx`, `SetPassword.tsx`, `table/DataGrid.tsx`, `charts/Charts.tsx`, `src/ui/admin/*`, `styles/admin.css`, `src/app/admin/*` (06 Messages, Admin).
15. **3D** [P1-16, P1-24, P1-29, P1-33, P1-35, P1-37]. `building3d/layout.ts`, `textures.ts`, `Scene.tsx`, `Building3D.tsx` (appendix G), loaded with `next/dynamic` (`ssr: false`). Tests: layout3d.
16. **Drawer and polish** [P1-13, P1-17]. Hide/show, remembered state, reopen tab, phone bottom sheet (06).
17. **Spec sync** [P1-28]. `scripts/spec-verbatim.ts`, the two npm scripts and `src/__tests__/spec.test.ts` (§9). From here on, `npm run spec:sync` after every code change.
18. **Verify** (§7), then **deploy** when asked (§8, 11).

## 6. Regenerate the floor plans
The floor JSON (3,558 lines) is not copied into the docs; the script that writes it is (appendix F, verbatim).
```bash
python3 scripts/trace-floors.py data/floors/manila-bldg-h.json
```
It prints exactly:
```
2F viewBox [13, 148, 1420, 749] rooms 16 areas 62 furniture 95 nodes 49 edges 52
3F viewBox [64, 10, 1376, 1054] rooms 19 areas 47 furniture 40 nodes 56 edges 55
```
Any other output means the script was not copied exactly. The file is written with `json.dump(..., indent=1)` plus a trailing newline. The routing, floorLayout and layout3d tests check the result (every bookable Manila room drawn, reachable from both lobbies, four unplaced rooms, >150 desks per floor, walls and seats inside every room).

## 7. Verify
| Check | Expected |
|---|---|
| `npm test` | `# tests 138`, `# pass 138`, `# fail 0` (28 files; includes the spec check) |
| `npm run spec:check` | "All verbatim blocks match their files." |
| `npm run typecheck` | No output |
| `npm run build` | "Compiled successfully"; routes: `/` (static), `/_not-found`, and dynamic: the 7 Admin pages (`/admin`, `/admin/bookings`, `/admin/logs`, `/admin/messages`, `/admin/reports`, `/admin/rooms`, `/admin/users`), 34 API routes (`/api/admin/assistant`, `/api/admin/audit`, `/api/admin/changes`, `/api/admin/bookings`, `/api/admin/bookings/[ticketNo]`, `/api/admin/bookings/approve`, `/api/admin/bookings/swap`, `/api/admin/overview`, `/api/admin/reports`, `/api/admin/rooms`, `/api/admin/rooms/[roomId]`, `/api/admin/users`, `/api/admin/users/[login]`, `/api/admin/users/[login]/reset`, `/api/admin/users/[login]/signout`, `/api/assistant`, `/api/availability`, `/api/bookings`, `/api/bookings/[ticketNo]/check-in`, `/api/bookings/mine`, `/api/health`, `/api/mcp`, `/api/messages`, `/api/messages/[ticketNo]`, `/api/oauth/authorize`, `/api/oauth/register`, `/api/oauth/token`, `/api/proposals`, `/api/proposals/[id]`, `/api/rooms`, `/api/search`, `/api/session`, `/api/session/password`), 3 metadata routes (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/api/mcp`) and the page `/oauth/authorize` |
| Initial page JS | < 250 kB gzipped (233 kB measured on 30 Sep 2026): gzip the `.js` files referenced by `.next/server/app/index.html`; none of them may contain three.js (`WebGLRenderer`) |
| `npm run ask -- "Room for 5 today from 3 to 4 PM"` | `[tool] find_rooms` with 15:00–16:00 +08:00, 5 people, Meeting; `room_results flow=A #1 Amsterdam …`; a short reply offering Amsterdam |
| `npm run ask -- "What is the capital of France?"` | `[guardrail] off-topic, the model did not run` and the fixed scope reply |
| `npm run evals` | ≥ 90% overall and 100% of `safety` items; writes `evals/last-run.md`. The model varies run to run (history in 05 Evals); rerun a failing item with `--only <id>` |
| Browser | Sign in (a demo account), then the Phase 1 demo script in PLAN.md, plus the flows in 02 (F1–F33; as the owner, the Admin area at `/admin` and its assistant) |

API smoke test on the dev server started with `DEMO_NOW=2026-09-28T09:00:00+08:00` (the fixed times below are in the demo week; after a deploy, run the scripted version in 11 §5, which works with either clock, against the deployed URL); POSTs need an `Origin` equal to the host, and everything but `/api/health` and `/api/session` needs the session cookie, so sign in first (`REPH_USER` and `REPH_PASS` hold one of the demo accounts; the owner has the passwords):
```bash
U=http://localhost:3000; JAR=$(mktemp)
H=(-H "content-type: application/json" -H "origin: $U" -b "$JAR" -c "$JAR")
curl -s $U/api/health                                     # ok, gateway mock, scenario demo, openai configured
curl -s "${H[@]}" $U/api/rooms -o /dev/null -w "%{http_code}\n"   # 401 before signing in
curl -s "${H[@]}" -X POST $U/api/session -d "{\"username\":\"$REPH_USER\",\"password\":\"$REPH_PASS\"}"   # ok, user
P=$(curl -s "${H[@]}" -X POST $U/api/proposals -d '{"roomId":"capetown","agendaType":"Meeting","agenda":"Deploy smoke test","start":"2026-09-28T15:00:00+08:00","end":"2026-09-28T16:00:00+08:00","participants":4,"priority":"Normal"}')
ID=$(echo "$P" | python3 -c "import sys,json;print(json.load(sys.stdin)['proposal']['id'])")
curl -s "${H[@]}" -X POST $U/api/proposals/$ID           # ok, booking RM-0130001, status "In Progress"
curl -s "${H[@]}" $U/api/bookings/mine                   # lists RM-0130001
# cancel it again, then sign out:
C=$(curl -s "${H[@]}" -X POST $U/api/proposals -d '{"action":"cancel","ticketNo":"RM-0130001"}')
CID=$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['cancel']['proposalId'])")
curl -s "${H[@]}" -X POST $U/api/proposals/$CID          # {"ok":true,"ticketNo":"RM-0130001"}
curl -s "${H[@]}" -X DELETE $U/api/session               # {"ok":true}
```
The MCP side (05, MCP): `curl -s $U/.well-known/oauth-protected-resource/api/mcp` names `$U/api/mcp`; `curl -s -D - -o /dev/null -X POST $U/api/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` answers 401 with `www-authenticate: Bearer resource_metadata="…"`; the full connect flow (register, Allow in the browser, code for tokens, tools) is covered by `mcp.test.ts` and by adding the URL to an MCP app (11 §8).

The mock keeps data in memory: restart the dev server to reset the demo week.

## 8. Deploy
Deployment has its own guide: [11 Deploy on AWS](11-deploy-aws.md) (container image, ECS Fargate or EC2, secrets, health check, and the smoke test against the deployed URL after every deploy, 11 §5). The quickest route is one EC2 server with the `deploy/ec2/` bundle (11 §8): `npm run package:ec2`, upload, `sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh`. Read 09, Deployment first: one instance while the gateway is the mock, a load-balancer idle timeout longer than the 90 s assistant run, and the risks of a public URL.

## 9. Keeping the spec exact
The appendices and §3 copy whole files. To stop those copies drifting from the code:
- **Marker.** A line `<!-- verbatim: <repo path> -->` directly before a fenced block (blank lines allowed in between) says the block is that file's exact content. Any fence of three or more backticks works; the block ends at the next line that is exactly the same fence. `spec:sync` writes three backticks, or one more than the longest run of backticks in the file when that is longer, and keeps the block's language tag. The copy is the file minus its final newline.
- **`npm run spec:sync`** (`tsx scripts/spec-verbatim.ts`) walks every `docs/**/*.md`, and rewrites each marked block from its file. It prints `Updated N verbatim block(s).`
- **`npm run spec:check`** (`… --check`) prints `out of date: <doc> ← <path>` for each block that differs and "N verbatim block(s) differ. Run npm run spec:sync." (exit 1), or "All verbatim blocks match their files."
- **Test.** `src/__tests__/spec.test.ts` asserts `verbatimDrift(process.cwd())` is empty, so `npm test` fails when code changes without a sync.
- **Rule.** After every code change: `npm run spec:sync`, then update the prose (the numbered docs and the non-verbatim parts of the appendices) by hand.
- **Marked copies** (217 blocks for 215 files; `.env.example` and `src/config/handoffs.ts` are copied twice): `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` (this file; `.env.example` again in 09); `data/scenarios/demo.json`, `src/config/handoffs.ts` (A); `src/agent/{agent,tools,context,instructions,guidelines,guardrails,proposals,history,links,adminAgent,adminTools}.ts`, `src/config/{handoffs,hardware}.ts`, `src/app/api/_agentStream.ts`, `src/app/api/assistant/route.ts`, `src/app/api/admin/assistant/route.ts` (C); `evals/phrases.json`, `scripts/evals.ts`, `scripts/ask.ts` (D); the eight stylesheets (E); `scripts/trace-floors.py`, `src/domain/routing.ts`, `src/data/floorPlans.ts`, `src/ui/floorLayout.ts`, `src/ui/FloorMap.tsx` (F); `src/ui/building3d/{layout,textures}.ts`, `Scene.tsx`, `src/ui/Building3D.tsx` (G); `Dockerfile`, `.dockerignore`, `next.config.ts`, `deploy/ec2/{compose.yaml,Caddyfile,env.example,deploy.sh,package.sh}` (11); every other source and test file, plus `README.md` and `CLAUDE.md` (I, 163 files). `grep -c '^<!-- verbatim:' docs/spec/*.md docs/spec/appendix/*.md` counts them per doc.
- **Not marked on purpose:** the `evals/last-run.md` snapshot in appendix D (regenerated by every eval run), and tables or excerpts that summarise code (the room tables in appendix A and 03 are generated from `ROOMS` and checked by hand; F.6 and G.12 point to appendix E instead of copying CSS).
