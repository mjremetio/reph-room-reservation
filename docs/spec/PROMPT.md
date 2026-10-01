# Rebuild prompt

Open Claude Code (or another coding agent) in an empty folder that holds only this `docs/` folder, then paste everything below the line.

---

Rebuild the **REPH Room Assistant** from its specification in `docs/`. It is the only source of truth: there is no other code. Follow the spec folder exactly.

**Start here**
1. Read `docs/SPEC.md`, then `docs/spec/10-rebuild.md` (setup, file tree, build order, checks). Open other sections only when a step needs them.
2. Work through the build order in `10-rebuild.md` §5, one step at a time. After each step run `npm test` and `npm run typecheck`, and tell me in two lines what you built.

**Copy, don't retype**
- A fenced block right after `<!-- verbatim: <path> -->` is that file's exact content. Write it to that path unchanged (project files, data, agent texts, stylesheets, trace script, and in appendix I every other source and test file).
- Generate the floor data with `python3 scripts/trace-floors.py data/floors/manila-bldg-h.json` (appendix F).
- Everything else: build it exactly as the numbered docs and appendices describe, with the same names, messages, copy and constants.

**Rules**
- Don't invent features, rooms, rules or text. If the docs are silent or two docs disagree, stop and ask me.
- Never break these: the model never decides availability and never books or cancels (only the Confirm button does); all reservation reads and writes go through `ReservationGateway`; `OPENAI_API_KEY` stays on the server; other people's bookings show only owner, division, time, group size and status; store UTC and show Asia/Manila.
- Demo people are `Tester, Alpha`…`Echo` plus the three sign-in accounts the owner asked for (`Remetio, Mark Joseph`, `Sandoval, Jeremiah`, `Lagunoy, Lili`), all `@example.com`. Never add any other real names. The sign-in passwords are not in the docs: ask me for them, or make new hashes with `npm run hash-password` and give me the passwords.
- Use Node 22 (`nvm use 22`). Ask me for the OpenAI key, put it in `.env.local`, and never print it. Put a random `SESSION_SECRET` (32+ characters) in `.env.local` too.

**Done when** everything in `10-rebuild.md` §7 passes:
- `npm test` (149 tests), `npm run typecheck`, `npm run build`, and `npm run spec:check`.
- `npm run evals`: at least 90% overall and 100% on safety.
- The browser demo script works.

Then, when I say so, deploy on AWS with `docs/spec/11-deploy-aws.md` (§8 is the one-server route with the `deploy/ec2/` bundle).
