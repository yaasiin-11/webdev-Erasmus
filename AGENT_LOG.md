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

