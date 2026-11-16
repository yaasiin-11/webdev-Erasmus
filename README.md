# StudyHub

StudyHub helps students and exam candidates find each other, form study groups, talk in a group chat and plan shared study sessions. A university course, a civil service exam, a certification or a language exam: you find the people preparing the same thing, take a place in their group, and everyone sees the group's timetable. When you plan a session, StudyHub can suggest an agenda with Gemini, and an AI agent can use the same rules through MCP.

The specification, with every acceptance criterion and where it is tested, is in [SPEC.md](SPEC.md).

## Run it in one minute

```bash
npm install
cp .env.example .env
npm start
```

`.env.example` starts with `DATABASE_URL=memory`: an in-memory database filled with demo data, lost when the server stops. Open the forwarded port 3000 (Ports tab, globe icon) and sign in with one of the demo accounts:

| Account | Password | What you see |
|---|---|---|
| `ana@studyhub.test` | `StudyHub2026!` | Created two groups and is a member of two more, with sessions this week |
| `boris@studyhub.test` | `StudyHub2026!` | Creator of three groups, including the full "SQL and normalisation clinic" |
| `carmen@studyhub.test` | `StudyHub2026!` | In no group yet: the empty states, and the "Full" button on the SQL clinic |

To try "Forgot your password?" without an email provider, ask for a link on the sign-in page: in development the email, with its link, is printed in the terminal where `npm start` runs. With `BREVO_API_KEY` and `MAIL_FROM` set it is sent for real.

## With a real database

Put the Neon connection string in `.env` as `DATABASE_URL`, generate a `SESSION_SECRET` with `openssl rand -hex 32`, then:

```bash
npm run migrate   # creates the tables
npm run seed      # optional: the three demo accounts and their groups
npm start
```

The server also applies pending migrations when it starts, and creates the demo data when `SEED_DEMO=true`.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Starts the app on `PORT` (3000), reading `.env` if it exists |
| `npm run dev` | The same, restarting when a file changes |
| `npm test` | Runs every test with Node's built-in test runner, on an in-memory Postgres |
| `npm run coverage` | Fails below 100% of lines, branches and functions in `src/services`, or below 80% of lines in `src` |
| `npm run migrate` | Applies the numbered files in `migrations/` that have not run yet |
| `npm run seed` | Creates the demo accounts if they are not there |
| `npm run --silent mcp` | Starts the MCP server on stdio |

## Configuration

Every variable is listed, with where its value comes from, in [.env.example](.env.example). Only `DATABASE_URL` and `SESSION_SECRET` are required: the app stops at start with `missing <NAME>: see .env.example` when one is missing. Without the Google keys the Google button is hidden; without `GEMINI_API_KEY` the agenda suggestion offers a standard template; without `BREVO_API_KEY` and `MAIL_FROM` password reset emails are printed in the log during development and not sent in production.

## How the code is organised

```text
src/
  server.js          start-up: config, database, migrations, demo data, listen
  app.js             Express app: security headers, /health, static files, /api
  config.js          reads and checks the environment
  routes/            HTTP only: read the request, call a service, send the result
  services/          every rule: auth, groups, study sessions, chat, agenda; no HTTP, no SQL
  data/              every SQL query
  integrations/      the outside services: Gemini, Google OAuth and Brevo (email)
  emails.js          the text of the password reset email
  http/              cookies, middleware, the sign-in rate limit
migrations/          numbered SQL files
mcp-server/          the MCP server (stdio), using the same services
public/              the browser app: index.html, css/app.css, js/ modules, fonts
tests/               node:test files, named after the acceptance criteria
```

## Deployment

The `Dockerfile` builds a production image that runs `node src/server.js` as a non-root user on port 3000, with a health check on `/health`. On Render, create a Docker web service from this repository, add the variables from `.env.example` (with a Neon `DATABASE_URL`), and set Auto-Deploy to "After CI Checks Pass". For Google sign-in, add `<your address>/api/auth/google/callback` as an authorized redirect URI.

## Course files

`AGENTS.md` holds the instructions for coding agents, `AGENT_LOG.md` and `USAGE.md` record every agent session, `checks/` holds the exercise self-checks (`node checks/ex2.mjs` to `ex5.mjs`), and `docs/UI.md` is the UI checklist.

Fonts: Bricolage Grotesque and Atkinson Hyperlegible, both under the SIL Open Font License (see `public/fonts/`).
