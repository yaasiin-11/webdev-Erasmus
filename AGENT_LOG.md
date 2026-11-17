# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->
## 2026-10-19 · Gemini CLI Setup and MCP Debugging
- Goal: Verify Gemini CLI connectivity and test file explanation capabilities.
- Delegated: Asked Gemini CLI to inspect and explain the purpose of a project file.
- Checkpoints: Executed the command via terminal and reviewed the standard output and error messages.
- Went wrong: The tool failed to process the request because the required MCP server was not yet configured and mounted.
- Changed by hand: Temporarily disabled the MCP server integration in the configuration file so Gemini CLI could run standalone queries.

## 2026-10-19 · Lab Exercise 1 Implementation (Node.js)
- Goal: Complete Exercise 1 of the lab by understanding and implementing the required Node.js steps.
- Delegated: Provided the course prompts step-by-step to explain unfamiliar Node.js syntax, module workflows, and code logic.
- Checkpoints: Reviewed code explanations against course requirements, ran scripts locally with Node.js, and verified execution in the terminal.
- Went wrong: The initial agent outputs contained generic snippets that required adaptation to fit the lab's exact boilerplate and structure.
- Changed by hand: Manually wrote and integrated the Node.js code after reviewing the generated explanations, adjusting imports and variable names.

## 2026-10-19 · MCP Server Validation
- Goal: Verify that Gemini CLI correctly communicates with the newly deployed MCP server.
- Delegated: Repeated the previous file inspection prompt with the MCP server active to query workspace context.
- Checkpoints: Verified that the MCP server initialized without errors and inspected the returned file summary directly in the terminal output.
- Went wrong: None; the tool resolved the context and responded properly once the server was running.
- Changed by hand: Configured and mounted the MCP server endpoints before initiating the CLI session.

## Session 2026-10-20
- **Goal**: Plan and implement Slice 1 (database setup, local sign-in, and study groups listing) based on SPEC.md.
- **Prompt**: Asked the agent to read SPEC.md and AGENTS.md, provide a minimal implementation plan for Slice 1 strictly scoped to the acceptance criteria, and implement the database initialization, backend server, and frontend assets step by step.
- **Output**: The agent created `src/db.js` with SQLite schema definitions and initial seeded records, generated `src/server.js` with the authentication and study groups endpoints, established the `src/services/` structure, and created client-side views inside `public/`.
- **Verdict**: Accepted with manual verification. The database was populated at `data/studyhub.db` with seeded test accounts, and the login and group listing flows were verified against Slice 1 criteria.

## 2026-11-03 · Exercise 3 Plan
**Goal:** A written plan for the study group join/leave feature, no code.
**Autonomy:** The agent generates the plan and answers failure-case questions; no files are modified.
**Checkpoints:** Plan review before any code, verification that business rules live in services (not routes), and strict HTTP status code mapping (401 vs 403 vs 409).

 ## Plan: Study Group Membership & Capacity Management (Slice 2)

### 1. Files to Create or Change
- `migrations/002_add_capacity_and_memberships.sql`: Incremental migration to add `max_capacity` (integer, default 10) to `study_groups`, and ensure the `group_members` join table has a unique index on `(user_id, group_id)`.
- `src/services/groupService.js`: Business logic rules for `joinGroup(userId, groupId)` and `leaveGroup(userId, groupId)`.
- `src/routes/groups.js` (or `src/server.js`): REST endpoints (`POST /api/groups/:id/join` and `POST /api/groups/:id/leave`).
- `public/app.js`, `public/index.html`, `public/style.css`: UI screens supporting loading, empty, and error feedback states, alongside capacity counters and action buttons.
- `tests/slice2.test.js`: Direct service unit tests and API integration tests tagged by AC identifier.

### 2. Migration
- Create `migrations/002_add_capacity_and_memberships.sql` (leaving existing migration files unmodified):
  - Adds `max_capacity INTEGER NOT NULL DEFAULT 10` to `study_groups`.
  - Creates the `group_members` table if not already extracted, with columns `(id, user_id, group_id, joined_at)` and a `UNIQUE(user_id, group_id)` constraint.

### 3. Endpoints & Status Codes
- `POST /api/groups/:id/join`
  - `200 OK` / `201 Created`: Successfully joined the group.
  - `401 Unauthorized`: No active session exists (checked in auth middleware before invoking the service).
  - `404 Not Found`: Group ID does not exist in the database.
  - `409 Conflict`: Group has reached `max_capacity` (`AC-13`), or user is already an active member (`AC-15`).
- `POST /api/groups/:id/leave`
  - `200 OK`: Successfully removed from the group.
  - `401 Unauthorized`: No active session exists.
  - `404 Not Found`: Group ID does not exist, or the user is not an active member of this group.

### 4. Service Functions (Business Rules)
- `joinGroup(userId, groupId)`: Validates that the group exists (throws `NotFoundError` if missing), verifies the user is not already a member (throws `ConflictError` if present), checks whether current active members equal or exceed `max_capacity` (throws `ConflictError`), and persists the membership.
- `leaveGroup(userId, groupId)`: Validates the active membership record (throws `NotFoundError` if not found), deletes the membership row, and returns the updated member count.

### 5. Authorization Check
- Session check runs before the service function is invoked. Any request lacking a valid session cookie/token immediately halts with `401 Unauthorized` without querying the database or executing domain logic.

### 6. UI States
- **Loading State:** Displays a spinner or `"Loading study groups..."` while the `fetch` request is pending.
- **Empty State:** When no groups exist, renders a distinct prompt: `"No study groups available yet. Create or check back later."`
- **Error State:** In case of API failure (e.g., `409 Conflict`), displays a human-readable banner in red (e.g., `"This group is currently full."` or `"You have already joined this group."`).
- **Interactive Action Button:** Toggles between `"Join"`, `"Leave"`, and a disabled `"Full"` state reflecting `"X / 10 members"`.

### 7. Tests (Named after AC IDs)
- `tests/slice2.test.js`:
  - `test('AC-12 user successfully joins group with available spots')`
  - `test('AC-13 joining a full group is rejected with 409 Conflict')`
  - `test('AC-14 active member successfully leaves group')`
  - `test('AC-15 duplicate join attempts are rejected with 409 Conflict')`
  - `test('AC-16 groups display current capacity and member count')`
  - `test('AC-18 joining non-existent group returns 404')`
  - `test('AC-20 unauthenticated join/leave returns 401')`

### 8. Work Breakdown (Test-First Steps)
1. **Step 1 (Migration):** Create `migrations/002_add_capacity_and_memberships.sql` and verify it applies cleanly to an empty database.
2. **Step 2 (Service & Rule Tests):** Write the failing direct service unit tests for capacity limit (`AC-13`) and duplicates (`AC-15`). Verify `npm test` fails, then implement `joinGroup` and `leaveGroup` in `src/services/groupService.js` until tests pass.
3. **Step 3 (Endpoints & API Tests):** Write API integration tests checking status codes `200/201`, `409`, and `404`. Wire the route handlers to call the service layer and ensure `npm test` passes.
4. **Step 4 (Authorization):** Add an API test verifying that requests without an active session return `401 Unauthorized`. Apply the auth guard middleware to the route.
5. **Step 5 (UI Implementation):** Implement the client-side component in `public/app.js` and `public/index.html` covering the loading, empty, and readable error states.

---

Changed in review:
- Default group capacity changed from 5 to 10.
- Replaced 400 Bad Request with 409 Conflict for full groups (AC-13) and duplicate memberships (AC-15) to match state-based conflict semantics.
- Isolated database schema changes into a new standalone migration file (migrations/002_add_capacity_and_memberships.sql) instead of editing src/db.js directly.
- Added explicit UI requirements for loading, empty, and human-readable error feedback states.
- Reorganized the workflow into strict Test-First (TDD) order: writing failing unit/API tests before implementing service rules and route handlers.

## 2026-11-03 · Exercise 3 Implementation
**Goal:** Implement the study group join/leave feature in 5 sequential steps with tests.
**Autonomy:** The agent works within one specific step of the plan at a time. It cannot proceed to the next step without my approval.
**Checkpoints:** `npm test` green before each commit, manual `git diff` inspection, and strict permission prompts for any action in "Always ask before".

## What the agent did that I did not ask for
- Attempted to edit `src/db.js` directly instead of writing an isolated file in `migrations/`.
- Proposed `400 Bad Request` instead of `409 Conflict` for full group capacity and duplicate joins.
- Missed UI loading and empty state containers in the initial frontend markup.


## 2026-11-16 · Rebuild of the project for Exercises 3 and 4 (Claude coding agent)
- Goal: review the whole repository from the start and finish the project: Postgres instead of SQLite, sessions and Google sign-in, study session scheduling, the agenda feature, the MCP tools over the services, a new interface, tests for every criterion, the coverage gate and a Dockerfile.
- Autonomy: the agent planned and wrote code, tests and documentation on its own, committing after each working step; it stopped before anything that needs my accounts (Neon, Render, Google Cloud, the Gemini key) and before the parts I write myself (READINESS.md, DEFENSE.md, REVIEW.md, docs/UI.md).
- Plan: (1) data layer on Postgres with numbered migrations and pg-mem for tests; (2) services for auth, groups, study sessions and agenda, with every rule there and 100% branch coverage; (3) thin routes, signed session cookie, Google OAuth with state and PKCE, health check and one error handler; (4) MCP tools calling the same services and acting as the token's user; (5) browser UI with the four states on every screen; (6) Dockerfile, .env.example, SPEC.md and AGENTS.md updated.
- Checkpoints: `npm test` and `npm run coverage` after each step; `node mcp-server/check.mjs -- npm run --silent mcp`; the self-checks `checks/ex2.mjs` to `ex4.mjs`; the app run against a real Postgres 17 (not only pg-mem) with a scripted pass over join, full group, clash, 403s, delete and MCP tokens; screenshots at 1280 and 380 pixels in light and dark mode.
- Went wrong: pg-mem does not support correlated subqueries, so the group list query was rewritten with joins on grouped subqueries (works on both). The first MCP server answered calls out of order and did not exit when stdin closed; it now answers in order and closes the pool after the last reply. Inline `style` attributes in the skeleton rows were blocked by the Content-Security-Policy and became classes. The Docker image could not be built in the agent's sandbox (Docker Hub blocked), so the first real build is the CI job.
- Changed in review: full group answers 409 instead of 400; capacity check moved inside a transaction with a row lock; model fallback is a labelled template instead of an empty box; every project MCP tool needs a token.
- Changed by hand: to do after this session: read every file in the diff, rewrite the architecture note and the spec vs result note in my own words, and run the app myself.

## 2026-11-17 · Agenda times, group chat and forgotten password (Claude coding agent)
- Goal: fix the agenda suggestion, which always numbered its blocks from 00:00, and add a chat per group and a "Forgot your password?" flow.
- Autonomy: the agent planned and built all three, with migrations 004 and 005, services, routes, UI and tests, committing after each feature; it did not create a Brevo account or touch any secret.
- Plan: (1) the form sends the start time with the suggestion request and `renderAgenda` counts from it; (2) `group_messages` table, `chatService` (members only, 1 to 1000 characters, author or group creator may delete), `GET/POST /api/groups/:id/messages` with `?after=` and a chat panel that asks for new messages every 5 seconds; (3) `password_resets` table with hashed single-use tokens valid 30 minutes, `POST /api/auth/forgot` that answers the same whether the account exists, `POST /api/auth/reset` that signs out every other session, and a Brevo mailer that falls back to printing the email in the log in development.
- Checkpoints: `npm test` (95 tests), `npm run coverage` (100% of services), the self-checks, the new SQL run against a real Postgres, and a browser run with two accounts chatting and a full reset done from the link in the log.
- Went wrong: pg-mem has no `char_length`, used by the message length constraint; it is registered for the in-memory database only. In production without a mail provider the start-up line first claimed the email would be printed, which it is not; corrected.
- Changed in review: chat and email were non-goals, so SPEC.md now has slices 7 and 8 and narrower non-goals.
- Changed by hand: to do: create the Brevo account and verify the sender, then try a real reset email.

## 2026-11-17 · Better chat and new features (Claude coding agent)
- Goal: a better group chat with emoji, plus the features that help a study group most.
- Autonomy: the agent chose the features and built them end to end with tests, committing after each one; no new dependencies and no secrets.
- Plan: (1) migration 006 with `message_reactions` and `chat_reads`: reactions limited to 8 emoji, toggled by a second click, and an unread count per group in the list; (2) migration 007 with `session_rsvps`: "Going" or "Can't go" under every session, the organiser counted as going; (3) chat interface rebuilt: emoji picker in three sets, reactions with names, day separators, follow-up messages grouped, clickable https links, emoji-only messages shown large, a character counter near the limit, and screen reader announcements only for new messages from others; (4) "Copy invite link" on the group page, and signing in from an invite link now lands on that group.
- Checkpoints: 105 tests, 100% coverage of the services, the self-checks, the new SQL run on a real Postgres, and a browser run with two accounts on desktop and at 380 pixels.
- Went wrong: on touch screens the "+" for reactions sat under every message and cluttered the chat; it now appears on the message you tap. The browser script read the groups list while the skeleton rows were still showing (they share the `ledger` class), which looked like a missing unread count; the API itself was right.
- Changed in review: SPEC.md has slice 9 (AC-43 to AC-46); the invite link has no criterion because it only exists in the browser.
- Changed by hand: nothing yet.

## 2026-11-17 · Self-review, deployment files and UI evidence (Claude coding agent)
- Goal: do everything left that does not need my accounts or my own writing: review the project the way Exercise 5 will, prepare the Render deployment, a script that gathers READINESS evidence, and screenshots for docs/UI.md.
- Autonomy: the agent reviewed, fixed with tests and committed; it did not tick docs/UI.md, write READINESS.md, DEFENSE.md or REVIEW.md, and touched no account or secret.
- Findings of the self-review and what was done: (1) any signed-in user could read the meeting links of every group: the place is now shown to members only (AC-47); (2) one account could call the model without limit, create unlimited accounts or flood a chat: limits of 20 suggestions per hour, 10 accounts per address per hour and 30 messages per minute (AC-48); (3) every write route checked: all need a session and the services check ownership, already tested; (4) `npm audit`: 0 vulnerabilities. Left as known gaps: registration tells whether an email already has an account (409), and the rate limits live in memory, so they reset on restart and would not be shared between two instances.
- Added: `render.yaml` (Docker, Frankfurt, free plan, health check on /health, auto-deploy after CI passes, secrets asked at creation), `npm run readiness -- <url>` (`tools/readiness-check.mjs`), and screenshots in `docs/ui/`: the four states of the groups screen, the agenda suggestion thinking and falling back, 380 and 768 pixels, dark mode and keyboard focus.
- Checkpoints: 107 tests, coverage gates, self-checks 2 and 3, the readiness script against a local server.
- Changed by hand: to do: tick docs/UI.md myself, using the screenshots and my own checks on the live site.
