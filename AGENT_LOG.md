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

