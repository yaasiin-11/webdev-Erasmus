# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
StudyHub is a collaborative platform designed for university students, civil service candidates, and independent learners to form study groups and organize shared revision sessions. Full functional requirements, architecture, and acceptance criteria are documented in [SPEC.md](SPEC.md).

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: npm install
- Run: npm start (reads `.env`; `DATABASE_URL=memory` starts an in-memory database with demo accounts)
- Test: npm test
- Coverage: npm run coverage
- Migrate: npm run migrate
- Seed demo data: npm run seed
- MCP server: npm run --silent mcp

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->
- Source code lives in `src/`, the browser code and assets in `public/` (ES modules in `public/js/`, no build step).
- Business rules live in `src/services/`; they throw the errors from `src/services/errors.js` and know nothing about HTTP or MCP.
- SQL lives only in `src/data/`. A schema change is a new numbered file in `migrations/`; never edit one that already ran.
- Route handlers in `src/routes/` read the request, call one service function and send its result. `errorHandler` in `src/http/middleware.js` maps errors to status codes: ValidationError 422, AuthenticationError 401, ForbiddenError 403, NotFoundError 404, ConflictError 409.
- Errors reach the client as `{ "error": "<one sentence a person can read>", "code": "<MachineCode>" }`.
- Every service receives `now()` so tests can control the clock.

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler (`src/routes/`) → service (`src/services/`) → data access (`src/data/`) → database
- MCP tool (`mcp-server/tools.js`) → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file: `src/integrations/gemini.js`. The rules (prompt, validation, fallback) are in `src/services/agendaService.js`.
- The key is `GEMINI_API_KEY`, the model `MODEL_NAME` (default `gemini-2.5-flash-lite`).
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/`, grew out of Exercise 1: `server.js` is the stdio loop, `tools.js` the tools.
- It reads `MCP_TOKEN` (created on the profile page, stored hashed) and resolves it with `auth.userForMcpToken`.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model
- modifying group capacity limits or membership validation rules
- bypassing group membership authorization or capacity checks

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
