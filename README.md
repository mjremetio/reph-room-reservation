# REPH Room Assistant

An AI assistant, **powered by OpenAI**, plus a live 2D/3D floor map and a data table, for booking rooms at Reed Elsevier Philippines (Bldg. H in Manila and Iloilo). The existing Room Reservation Tool stays the official record; this app is a friendlier way in.

Phase 1 runs on a mock of the tool with a fixed demo week. Status and next tasks: [`docs/PLAN.md`](docs/PLAN.md). Full specification: [`docs/SPEC.md`](docs/SPEC.md).

## What it does
- **Assistant** (left drawer, can be hidden): "Room for 5 today from 3 to 4 PM" → ranked rooms, who holds the rest (name, division, time, group size, status), other times, swap requests drafted for Teams or email, repeating bookings, bookings you confirm with a button, check-in and cancel. "Who booked Central Park today?" → the room's bookings and free times. It also answers questions about the Room Reservation Guidelines ("How do I share my screen in a VC room?", "Which 3F rooms have VC?"). Suggested requests and frequent questions are grouped on the welcome screen and behind the lightbulb button next to the message box.
- **Sign-in** (demo accounts in `src/config/accounts.ts`): sign in with your username (the first part of your e-mail) and password. You are the **Name of Requestor** (the tool's field) of everything you book; **Sign out** is in the top bar.
- **One room per person at a time**: a room is never double-booked, and you can't hold a second room at an overlapping time.
- **Use it from Claude, ChatGPT or any MCP app**: REPH Rooms is an MCP server at `https://<site>/api/mcp` (**AI apps** in the user menu shows the URL and the steps). The app signs you in with OAuth (you press **Allow** on our page), then its AI can find rooms, see who booked them, list your bookings and check you in. It can't book or cancel by itself: it gives you a confirm link, and you press Confirm in REPH Rooms. Guide: `docs/spec/05-agent.md`, MCP; security: `docs/spec/09-quality.md`.
- **Map side**: search bar (starts at, ends at, people, type), floors, and three views of the same data:
  - **2D** floor map drawn like the guidelines' appendix layouts (every room, desk and chair), with room states, rank badges and who holds each room;
  - **3D** realistic cutaway of the same plans with furniture, workstations, seated groups, animated states; drag to turn it 360°, a slow 360° spin, a compass to go back, and a start view that fits the window;
  - **Table** of rooms and of the tool's reservation list (its search panel and columns) with filters, sorting, pagination, row details and CSV export.
- **New booking** (top right): the tool's reservation form, kept to what you decide (incl. Repeat and hardware) → free rooms → Book.
- **Room sheet**, **My bookings** and **Booking details**. Nothing is booked until you press **Confirm booking**; new bookings are "Requested – waiting for Admin" (In Progress), like the tool, and show in My bookings at once.
- **Messages**: one conversation per booking with Admin (top bar, with an unread count; **Message Admin** in My bookings). Admin's approvals and changes arrive there as notes.
- **Admin** (`/admin`, the owner's account): a dashboard; every booking with search, sort, pages and CSV (approve, bulk approve, turn down with a reason, change, swap rooms, cancel, check in); messages; reports with charts, CSV and print; users (add, edit, disable, reset account, sign out everywhere); room details; the audit log; and an **Admin assistant** that looks things up and prepares approvals, changes, swaps and messages as cards (nothing changes until you press the card's button).

## Quick start
1. Node.js **22 or newer** (`nvm install 22 && nvm use 22`).
2. `npm ci` (or `npm install`).
3. `cp .env.example .env.local`, then set `OPENAI_API_KEY` and `SESSION_SECRET` (32+ random characters; required for `npm start` and deployments). `OPENAI_MODEL=gpt-5.6-luna` is preset. Without an OpenAI key everything except the chat still works.
4. `npm run dev` → http://localhost:3000. The app runs on the real time, shown in Asia/Manila ("… PHT" in the top bar), with the demo bookings laid on the current week. For the scripted demo below, set `DEMO_NOW=2026-09-28T09:00:00+08:00` in `.env.local`: the clock then starts at **Mon, Sep 28, 2026, 9:00 AM**; restart the server to reset the demo week.
5. Checks: `npm test` (149 tests, including a check that the spec's verbatim copies match the code), `npm run typecheck`, `npm run build`. After changing code: `npm run spec:sync` (refreshes those copies in `docs/`). One agent message from the terminal: `npm run ask -- "Room for 5 today from 3 to 4 PM"` (acts as the signed-in demo user; `ASK_AS=<tool login>` for someone else).
6. Floor plans (optional): `python3 scripts/trace-floors.py data/floors/manila-bldg-h.json` regenerates the traced 2F/3F data (Python 3, no packages).

## Try the demo
With `DEMO_NOW` set (step 4). The map shows free rooms green, partly free orange, taken red and hatched, and yours blue.
- Sign in as `markjoseph.remetio` (the demo user, Remetio, Mark Joseph (Sales); the owner has the passwords) → "What are my bookings?" → check in to Tokyo.
- "Who booked Central Park today?" → Tester, Alpha has 3:00–4:30 PM; the free times have **Book**.
- "Room for 5 today from 3 to 4 PM" → flow A → "Book Amsterdam for our Q4 pipeline review" → **Confirm booking**.
- "Room for 8 today from 2 to 4 PM for an onboarding workshop" → flow B → **Ask Alpha to swap**.
- "Hall for 60 on Friday from 1 to 5 PM" → flow C → other times or a swap.
- "How do I add my approved booking to Outlook?" → an answer from the guidelines.
- **AI apps** (user menu) → add the MCP URL to Claude or ChatGPT → **Allow** → ask there "Who booked Central Park today?", book something and open the confirm link (needs the public HTTPS address).
- Without chatting: **+ New booking** (try Repeat), the **Table** (Bookings tab, click a row) and **3D** views, hiding the assistant (‹ in its header).
- **Admin** (user menu, as the owner): the dashboard shows Charlie's Tagaytay request waiting → ask the Admin assistant "What needs approval?" → press **Approve** on its card; in Bookings open a booking → **Change…** or **Swap rooms…**; Reports (this week, Print / PDF); Users → **Add person** (the temporary password is shown once); Logs lists every step. Signed in as that person, they choose a new password first, and see Admin's notes in **Messages**.

## What's inside
| Path | What |
|---|---|
| `CLAUDE.md` | Project memory for Claude Code: rules that must never break, code map, how to work |
| `docs/SPEC.md`, `docs/spec/01…11`, `docs/spec/appendix/A…I` | The specification: rebuild the app from the docs alone with `docs/spec/10-rebuild.md`, or paste `docs/spec/PROMPT.md` into a coding agent; deploy with `docs/spec/11-deploy-aws.md` |
| `docs/PLAN.md` | Tasks, status, setup steps, demo script |
| `docs/RULES.md` | Booking rules with sources, open questions for Admin |
| `data/scenarios/demo.json`, `data/floors/manila-bldg-h.json` | Demo week (test names plus the three sign-in accounts, the owner as demo user); 2F and 3F plans traced from the guidelines' appendix layouts |
| `evals/phrases.json` | 56 test conversations for the two assistants (10 for the Admin assistant); `npm run evals` runs them against the real model and writes `evals/last-run.md` |
| `src/domain`, `src/data`, `src/gateway`, `src/services` | Pure rules, search and reports, room data, the only door to reservations, shared services (incl. Admin checks and messages) |
| `src/store`, `src/lib` | The app's own data (accounts, audit log, messages; in memory for now); sign-in, accounts, audit |
| `src/agent`, `src/app/api` | OpenAI agents and tools (room assistant, Admin assistant); HTTP API (SSE for the assistants, `/api/admin/*`, messages) |
| `src/mcp`, `src/lib/tokens.ts` | MCP server for AI apps (the agent's tools over JSON-RPC) and its OAuth 2.1 sign-in (PKCE, signed tokens) |
| `src/ui`, `src/app/admin` | Browser app: store, assistant, cards, 2D map, 3D view, table, sheets, messages, the Admin area (tables, charts, pages, assistant), styles |
| `scripts/ask.ts`, `scripts/evals.ts` | One agent message from the terminal; the agent evals |
| `scripts/hash-password.ts` | `npm run hash-password -- "<password>"`: the hash for a sign-in account |
| `scripts/trace-floors.py` | Writes the floor data from the layout trace |
| `scripts/spec-verbatim.ts` | `npm run spec:sync` / `spec:check`: keeps the exact file copies in `docs/` in step with the code |
| `Dockerfile`, `.dockerignore`, `next.config.ts` | Container image for AWS (standalone Next.js server) |
| `deploy/ec2/` | One EC2 server like a VPS: Docker Compose, Caddy (automatic HTTPS), `deploy.sh` and `package.sh` (`npm run package:ec2`) |

## Deploy
On AWS (ECS Fargate or EC2) as a container: follow `docs/spec/11-deploy-aws.md`. Quickest: one EC2 server (Ubuntu 24.04, ports 80 and 443 open) with the `deploy/ec2/` bundle: `npm run package:ec2`, copy `dist/reph-rooms-<commit>.tar.gz` to the server, unpack it and run `sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh` (it installs Docker, asks for the OpenAI key, gets an HTTPS certificate and prints the address; `deploy.sh rollback` goes back; 11 §8). Locally: `docker build -t reph-rooms .` then `docker run -p 3000:3000 --env-file .env.local reph-rooms`. The demo also runs on Vercel: `vercel --prod` (project `ai-booking`, https://ai-booking-sooty.vercel.app; set `SESSION_SECRET` there too). Without Redis the demo data lives in server memory, so run one instance and expect a reset on every restart. With Upstash Redis connected (`KV_REST_API_URL`, `KV_REST_API_TOKEN`; Vercel adds them when you connect an Upstash for Redis database to the project) every instance shares one state that survives restarts and deploys: bookings, accounts, Admin changes, messages, confirm links and MCP codes (`docs/spec/09-quality.md`, Shared state). MCP URL: `https://<SITE_ADDRESS>/api/mcp` (Vercel test: https://ai-booking-sooty.vercel.app/api/mcp). Risks of a public URL: `docs/spec/09-quality.md`, Deployment.

## Before going live
The open questions in `docs/RULES.md` and `docs/spec/08-integration.md` need answers from Admin and IT: how to connect to the Room Reservation Tool, the booking window (10 or 90 days), approvals, real room capacities, the Hardware Requirements options, rooms on the layout but not in the tool (and the reverse), OpenAI data settings (the assistant sends a paraphrase of the confidential guidelines), company sign-in (Entra ID) to replace the three demo accounts, and which AI apps may be connected over MCP (RULES question 16).
