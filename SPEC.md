# StudyHub - Study organization

## Project option
Study groups.
StudyHub is an open study group platform for any type of learner (university students, civil service candidates and people preparing a certification or a language exam) to find each other, form groups and plan shared study sessions around the same topic.

## Goals
- Users can create a study group, join a group with free places, leave it, and see which groups they belong to.
- Any member of a group can schedule a study session with a day, time, length, place and agenda, and everyone sees the upcoming sessions of their groups in one timetable.
- A member can ask for a suggested agenda for a session and edit it before saving; the app keeps working when the model is not available.
- An AI agent can read the groups and timetables and plan a session through MCP, acting as one user and bound by exactly the same rules as the website.

## Non-goals
- **No micropayments:** every feature is free; there are no paid groups or tutors.
- **No video or conferencing integration:** the app does not create Zoom, Meet or WebRTC calls; a meeting link is stored as plain text.
- **No external calendar sync:** sessions live only in StudyHub, with no Google Calendar or Outlook export.
- **No email notifications or reminders:** members see changes when they open the app. The only email the app sends is the password reset link the user asked for.
- **No file sharing or real-time video in groups:** the group chat is text only; files and notes stay in the tools the group already uses.

## Constraints
- Passwords are never stored as readable text: they are hashed with scrypt and a random salt per user.
- Node.js 22, Express and PostgreSQL (Neon in production), with a frontend in semantic HTML, CSS and vanilla JavaScript modules; no frontend framework and no build step.
- Every business rule lives in `src/services/`, so the HTTP API and the MCP server enforce the same rules.
- Secrets come only from environment variables; the repository is public.

## The model feature
- Model: gemini-2.5-flash-lite, through the Gemini API (`MODEL_NAME` can switch it).
- Input: the session topic, the group category (university course, civil service exam, certification, language exam or other) and the session length in minutes. Nothing that identifies a user is sent.
- Output: 3 to 6 consecutive blocks, each a short sub-topic with its minutes, shown as a markdown agenda that the member can edit before saving.
- When it fails: the app falls back to a template. With no key, an error, a timeout after 8 seconds or an answer that does not fit (not JSON, wrong number of blocks, minutes more than 20% off the session length) the app shows a notice and fills in a standard four-block template that adds up to the session length, which the member can edit.

## Auth
- Local: email and password; passwords are hashed with Node's crypto scrypt and a 16-byte salt. Sessions are random tokens stored hashed in Postgres and sent as a signed, HttpOnly, SameSite=Lax cookie (Secure in production) that expires after 7 days.
- Provider: Google OAuth 2.0 authorization code flow with `state` and PKCE (S256), using GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- Password reset: "Forgot your password?" sends a single-use link (stored hashed, valid for 30 minutes) by email through Brevo; the answer is the same whether the account exists or not, and a reset signs out every other session.
- Linking: when Google reports a verified email that already belongs to a local account, Google is linked to that account instead of creating a second one. An unverified Google email is refused.

## MCP tools
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `list_study_groups` | Lists study groups with subject, category, members, capacity and next session, filtered by category, by search text or to the caller's own groups. | Any caller with a valid MCP token; the result is what that user sees on the website. |
| `create_study_session` | Schedules a new study session with date, time, length, topic and place in an existing group, with the same clash and future-date rules as the website. | Members of the target group, identified by their MCP token. |
| `get_group_schedule` | Returns the upcoming sessions of one study group, with their time, place and agenda. | Any caller with a valid MCP token. |

## UI
- Stack: semantic HTML5, one CSS file with design tokens, and vanilla JavaScript modules using `fetch`; rendered in the browser from a single page with hash routes.
- Screens:
  - Sign-in and registration screen with email and password, and the Google button when Google is configured.
  - Study groups list with search, category filter, "only my groups", a seat map per group and a join, leave or full button.
  - Group page with the upcoming sessions timetable and "Going / Can't go" answers, the group chat with emoji picker and reactions, a "Copy invite link" button, the members, the planning form with the agenda suggestion, and delete for the creator.
  - Forgot password and choose a new password screens.
  - My sessions: every upcoming session of my groups, grouped by day.
  - Profile with the MCP token for agents.

## Acceptance criteria
### Slice 1: sign-in and the study groups list
- [AC-1] When a registered user enters their email and password and clicks "Sign in", they land on the study groups list and see their name in the navigation bar.
- [AC-2] When a user submits the sign-in form with an empty email or password, they see the message "Email and password are required" and the API answers 422.
- [AC-3] When a user signs in with a wrong password or an unknown email, they see "Email or password is incorrect.", the API answers 401 and no session cookie is set.
- [AC-4] When a visitor fills in name, email and a password of at least 8 characters and clicks "Create account", they are signed in at once; the users table holds a salted scrypt hash, never the password. A taken email answers 409.
- [AC-5] On the study groups list, each group shows its title, subject, category, creator and "members / capacity" (for example "3 / 6 members").
- [AC-6] When somebody who is not signed in requests `GET /api/groups`, the API answers 401 with no rows, and the browser shows the sign-in screen.
- [AC-7] When a signed-in user clicks "Sign out", their session row is deleted and the old cookie gets 401 on `GET /api/auth/me`; a session also stops working after 7 days.
- [AC-8] When a user clicks "Continue with Google", a new Google user gets an account, a local account with the same verified email is linked instead of duplicated, and an unverified email or a wrong `state` brings them back to sign-in with a reason.
- [AC-9] When a user types in the search box, picks a category or ticks "Only my groups", the list shows only the matching groups; an unknown category answers 422.

### Slice 2: join and leave study groups
- [AC-10] When a signed-in user clicks "Join" on a group with free places, they become a member, the count goes up by 1 and the button changes to "Leave".
- [AC-11] When a group is at capacity, its button is disabled and reads "Full"; a join request answers 409 "This group is full." and the member count does not change.
- [AC-12] When a member tries to join a group they are already in, the request answers 409 and the member count does not change.
- [AC-13] When a member clicks "Leave", their membership is removed, the count goes down by 1 and the button changes back to "Join".
- [AC-14] Leaving a group you are not a member of answers 409; joining or leaving a group that does not exist answers 404, and no membership row changes.
- [AC-15] Joining or leaving without being signed in answers 401 and no membership row changes.
- [AC-16] When a user creates a group with a title of 3 to 80 characters, a subject, a category and 2 to 50 places, they become its first member; anything outside those limits answers 422.
- [AC-17] Only the creator can delete a group: another signed-in user gets 403, somebody not signed in gets 401, and when the creator deletes it its memberships and sessions are removed too.
- [AC-18] When the creator clicks "Leave" through the API, the request answers 409 and tells them to delete the group instead.

### Slice 3: schedule study sessions
- [AC-19] When a member fills in topic, day, start, length (15 to 480 minutes) and an optional place and agenda and clicks "Schedule session", the API answers 201 and the session appears in the group's upcoming sessions, sorted by start time.
- [AC-20] When a signed-in user who is not a member tries to schedule a session, the API answers 403; without a session it answers 401.
- [AC-21] When a new session overlaps another session of the same group, the API answers 409 and names the session it clashes with; a session that starts exactly when another ends is allowed, and other groups are not affected.
- [AC-22] A start in the past, a date that cannot be read or a length outside 15 to 480 minutes answers 422 and nothing is saved.
- [AC-23] Only the member who scheduled a session can move it ("Move") or cancel it ("Cancel session"): others get 403; a move is checked for clashes against every session except itself.
- [AC-24] On "My sessions", a user sees the upcoming sessions of all their groups grouped by day, and sessions that have already ended are not shown.

### Slice 4: agenda suggestion with a model
- [AC-25] When a member writes a topic and clicks "Suggest an agenda", a usable model answer appears in the agenda box, labelled as an AI suggestion, with blocks that add up exactly to the session length and clock times that begin at the start time chosen in the form (a 17:30 session starts at 17:30, not at 00:00); it can be edited before saving.
- [AC-26] When the model answers with something unusable (not JSON, fewer than 2 or more than 8 blocks, a block without a title or with an impossible length, or minutes more than 20% off), the answer is rejected and the standard template is shown with a notice; HTML and markdown in block titles are stripped.
- [AC-27] When there is no key, the provider returns an error, or there is no answer within 8 seconds, the standard template is shown with a notice and the rest of the page keeps working.
- [AC-28] The request to the model contains only the topic, category and length: no name, email or user id, and the key travels in a header, not in the URL.

### Slice 5: MCP
- [AC-29] `list_study_groups` called with a category returns the same groups as the website filter for the token's user.
- [AC-30] `create_study_session` called with the token of a group member creates the session through the same service as the website; with the token of a non-member it returns a tool error saying only members can schedule; with no or a revoked token it returns a tool error asking for a valid token.
- [AC-31] `get_group_schedule` returns the upcoming sessions of a group with time, place and agenda, and a group that does not exist is a tool error.
- [AC-32] On the profile page a user clicks "Create token" and sees the token once; only its hash is stored, and creating a new token or clicking "Revoke token" makes the old one stop working.

### Slice 6: running in production
- [AC-33] `GET /health` answers 200 `{"status":"ok","db":"ok"}` when the database answers and 503 `{"status":"error","db":"down"}` when it does not.
- [AC-34] Broken JSON answers 400 with one readable sentence, an unknown `/api` path answers a JSON 404, an unknown page shows the 404 page, and an unexpected error answers 500 with one sentence while the details go to the server log.
- [AC-35] After 10 failed sign-ins for the same email from the same address within 15 minutes, further attempts answer 429 even with the right password.

### Slice 7: group chat
- [AC-36] When a member types a message in the group chat, optionally adds emoji from the emoji button, and presses Enter or "Send", it appears at once with their name and the time, exactly as typed, and the other members see it within 5 seconds without reloading.
- [AC-37] The chat opens on the latest 50 messages, oldest first; asking for the messages after the last one seen returns only the new ones.
- [AC-38] Somebody who is not a member of the group, or who has left it, cannot read or write its chat (403); nobody signed in gets 401.
- [AC-39] An empty message or one longer than 1000 characters is refused with 422, and HTML in a message is shown as plain text.
- [AC-40] The author of a message can delete it, the group creator can delete any message of their group, and anybody else gets 403.

### Slice 8: forgotten password
- [AC-41] When a user clicks "Forgot your password?" and enters their email, the page answers the same sentence whether the account exists or not, and the account owner gets an email with a single-use link; more than 10 requests for one email from one address within 15 minutes answer 429.
- [AC-42] Opening the link and entering a new password twice saves it as a new scrypt hash, signs the user in and signs out every other session; the link stops working after one use, after 30 minutes or when a newer link is requested.

### Slice 9: reactions, unread messages and attendance
- [AC-43] A member reacts to a message with one of 👍 ❤️ 😂 🎉 🙏 🤔 👀 ✅; everyone sees each emoji with its count and who reacted, clicking the same reaction again takes it back, any other emoji answers 422, and a non-member gets 403.
- [AC-44] On the study groups list, each group the user belongs to shows "N new messages in the chat" for messages from others they have not seen; opening the group chat clears it.
- [AC-45] Under every upcoming session a member clicks "Going" or "Can't go"; the session shows how many are going and their names, the person who scheduled it counts as going, and clicking the chosen answer again removes it.
- [AC-46] Only members of the group can answer for a session (403), the answer must be "going" or "not_going" (422), a session that is over cannot be answered (422), and cancelling a session removes its answers.

### Slice 10: hardening found in my own review
- [AC-47] The place of a session (often a meeting link) is shown only to members of its group: on the group page, in "My sessions" and through MCP, a non-member sees that the place is shared with members only.
- [AC-48] More than 20 agenda suggestions per user per hour, 10 new accounts per address per hour or 30 chat messages per user per minute answer 429 with a sentence saying when to try again.

## Traceability
| Criterion | Test |
| --- | --- |
| AC-1 | tests/auth.test.js |
| AC-2 | tests/auth.test.js |
| AC-3 | tests/auth.test.js |
| AC-4 | tests/auth.test.js |
| AC-5 | tests/groups.test.js |
| AC-6 | tests/auth.test.js |
| AC-7 | tests/auth.test.js |
| AC-8 | tests/auth.test.js |
| AC-9 | tests/groups.test.js |
| AC-10 | tests/groups.test.js |
| AC-11 | tests/groups.test.js |
| AC-12 | tests/groups.test.js |
| AC-13 | tests/groups.test.js |
| AC-14 | tests/groups.test.js |
| AC-15 | tests/groups.test.js |
| AC-16 | tests/groups.test.js |
| AC-17 | tests/groups.test.js |
| AC-18 | tests/groups.test.js |
| AC-19 | tests/sessions.test.js |
| AC-20 | tests/sessions.test.js |
| AC-21 | tests/sessions.test.js |
| AC-22 | tests/sessions.test.js |
| AC-23 | tests/sessions.test.js |
| AC-24 | tests/sessions.test.js |
| AC-25 | tests/agenda.test.js |
| AC-26 | tests/agenda.test.js |
| AC-27 | tests/agenda.test.js |
| AC-28 | tests/agenda.test.js |
| AC-29 | tests/mcp.test.js |
| AC-30 | tests/mcp.test.js |
| AC-31 | tests/mcp.test.js, tests/sessions.test.js |
| AC-32 | tests/auth.test.js |
| AC-33 | tests/http.test.js |
| AC-34 | tests/http.test.js |
| AC-35 | tests/auth.test.js |
| AC-36 | tests/chat.test.js |
| AC-37 | tests/chat.test.js |
| AC-38 | tests/chat.test.js |
| AC-39 | tests/chat.test.js |
| AC-40 | tests/chat.test.js |
| AC-41 | tests/auth.test.js |
| AC-42 | tests/auth.test.js |
| AC-43 | tests/chat.test.js |
| AC-44 | tests/chat.test.js |
| AC-45 | tests/sessions.test.js |
| AC-46 | tests/sessions.test.js |
| AC-47 | tests/sessions.test.js |
| AC-48 | tests/sessions.test.js |

## Architecture
One request, `POST /api/groups/:id/membership` (join a group), through every layer:

1. `src/app.js` mounts the API router. `express.json` parses the body, `sameOriginWrites` in `src/http/middleware.js` refuses writes from another site, and `attachUser` reads the signed `sid` cookie and asks `auth.userForSession` in `src/services/authService.js` who is calling.
2. `src/routes/groups.js` runs `requireUser` first, so a missing session answers 401 before any service is called. The handler only takes `req.user.id` and `req.params.id` and calls `groups.joinGroup(userId, groupId)`.
3. `joinGroup` in `src/services/groupService.js` holds the rule. Inside one transaction it locks the group row (`lockById`, `SELECT ... FOR UPDATE`), throws `NotFoundError` if it does not exist, `ConflictError('AlreadyMember')` if the user is already in it and `ConflictError('GroupFull')` if the member count has reached `max_capacity`; then it adds the membership. The lock means two people cannot take the last place at the same time.
4. Only `src/data/groups.js` writes SQL. The `group_memberships` primary key `(group_id, user_id)` from `migrations/001_users_and_groups.sql` makes a double membership impossible even if the service had a bug.
5. Back out: the service returns a group DTO built by `toGroupDto` (`memberCount`, `maxCapacity`, `isFull`, `isMember`, `isOwner`), never a raw database row. `errorHandler` in `src/http/middleware.js` turns `NotFoundError` into 404 and `ConflictError` into 409 with `{ error, code }`.
6. In the browser, `membershipButton` in `public/js/views/groups.js` makes the REST call through `api()` in `public/js/api.js`, shows "Joining…" while it waits, and redraws only that row from the returned group; the state lives in that row's closure, and an error becomes a toast with the server's sentence.

The MCP server enters at the service layer, not at the route: `create_study_session` in `mcp-server/tools.js` resolves the token to a user with `auth.userForMcpToken` and then calls the same `studySessions.scheduleSession` that `POST /api/groups/:id/sessions` calls. The model call sits behind the service too: `src/services/agendaService.js` builds the prompt, validates the answer and falls back, and `src/integrations/gemini.js` is the only file that knows the provider.

Where this codebase does not match its own layering: `src/routes/auth.js` holds the brute-force limiter and the Google `state` and PKCE checks instead of a service. I left them there because both are about the HTTP exchange (an address, a cookie, a redirect) and the MCP server never signs in with a password or with Google, so there is no second front door that would need the same rule.

| Screen | Rendered | Why | While the data is on its way |
| --- | --- | --- | --- |
| Sign-in and registration | Browser | It needs no data from the server except whether Google is configured, so it paints at once. | The form is usable immediately; the submit button shows "Signing in…". |
| Study groups list | Browser | Filters, join/leave and the unread counts change one row or the list without reloading the page. | Three skeleton rows that reserve the space of the real rows. |
| Group page | Browser | Joining, planning and moving sessions update the timetable in place, and the chat asks for new messages every 5 seconds. | A "Loading the group…" status line, then "Loading messages…" inside the chat. |
| My sessions | Browser | Same data shape as the group timetable, reused from the same component. | A "Loading your timetable…" status line. |
| Forgot and reset password | Browser | Two small forms; the reset token stays in the address fragment, which the browser never sends to the server or in a Referer. | The button shows "Sending…" or "Saving…". |
| Profile | Browser | The token is shown once after a click and must never be cached in a page. | "Checking your token…". |

## Spec vs result
- All 48 criteria are implemented and named in a test; `npm test` runs 107 tests with no failures, and the service layer is covered at 100% of lines and branches.
- The first version of slice 2 answered 400 for a full group and kept a capacity check that two simultaneous joins could pass; I changed the spec to 409 (AC-11, AC-12) and the service now locks the group row in a transaction.
- The first spec said the model failure shows an empty text area. I changed it (The model feature, AC-26, AC-27): an empty box gave members nothing to start from, so the fallback is now a standard template that adds up to the session length and is clearly labelled.
- The MCP table first allowed anonymous calls to `list_study_groups`, while the website requires sign-in for the same list. I changed it so every project tool needs a token, which keeps one set of rules for both front doors.
- The first agenda suggestion numbered its blocks from 00:00 whatever the start time; testing it in the browser showed the problem, and AC-25 now says the times begin at the session start.
- Chat and password reset were non-goals at first. After using the app I moved them into scope (slices 7 and 8) and narrowed the non-goals: no file sharing, and no email except the reset link.
- Slice 9 came from using the chat: without reactions every "ok" became a message, and the organiser had no way to know who would come to a session. An invite link opens the group after sign-in, which is checked by hand because it lives only in the browser.
- Slice 10 came from reviewing my own project the way Exercise 5 will: any signed-in user could read the meeting links of every group, and nothing stopped one account from calling the model hundreds of times.
- Not covered by automated tests: the look of the four states and keyboard use in a real browser; those are checked by hand in `docs/UI.md`.
