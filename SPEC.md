# StudyHub-Study organization

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
     Study groups.
     StudyHub is an open study group platform for any type of learner—including university students, civil service candidates, and independent certification seekers—to coordinate study sessions around shared topics.

## Goals
- **Users (university students, civil service candidates, or independent learners) can create a study group, join existing groups, and browse active memberships.**
- **Any group member can schedule a study session with a date, time, and topic, and view upcoming meetings for their groups.**


## Non-goals
-**No Micropayments:** All the features are free.
-**No external video or conferencing integrations:** The system does not provision meetings via Zoom, Meet, or WebRTC APIs (meeting links are stored as plain text URLs if needed).
-**No external calendar sync:** Events are stored and viewed only within the app, with no integration into Google Calendar or Outlook.

## Constraints
-**Passwords are never stored as readable text and must be securely hashed before being saved to the database.**
-**The project is built using Node.js, Express, and SQLite for data persistence, with a lightweight frontend using semantic HTML, CSS, and vanilla JavaScript.**

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: gemini-2.5-flash-lite
- Input: Study topic, exam category, and intended session duration in minutes.
- Output: A structured markdown study agenda with recommended sub-topics and time allocations.
- When it fails: The application displays a fallback notice and provides an empty text area for members to write the agenda manually.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: Email and password authentication with passwords securely hashed using bcrypt.
- Provider: Google OAuth 2.0 using GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- Linking: Existing local accounts with a matching verified email address are linked automatically upon Google sign-in.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| `list_study_groups` | Retrieves all active study groups filtered by academic course or competitive exam category. |
| `create_study_session` | Schedules a new study session with date, time, topic, and location details for an existing group. |
| `get_group_schedule` | Returns the upcoming meetings and agendas planned for a specific study group identifier. |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
- Stack: Semantic HTML5, CSS3, and vanilla JavaScript using standard browser fetch.
- Screens:
  - Sign-in and registration screen with email/password and Google login options.
  - Study groups directory displaying group cards, filter tags, and member counts.
  - Group details view showing upcoming study sessions, members, and meeting links.
  - Session creation modal/form with optional AI agenda generation button.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] When an unregistered user submits valid registration details and clicks "Register", they see a confirmation message and are redirected to the sign-in form.
- [AC-2] When a registered user inputs their email and password and clicks "Sign in", they see their profile name displayed in the navigation bar.
- [AC-3] When a user submits an empty sign-in form, they see an error message stating "Email and password are required".
- [AC-4] When a logged-in user enters a group title, description, and study field (such as a university course or competitive exam) and clicks "Create Group", they see the new group card appear on the dashboard.
- [AC-5] When a user clicks "Join Group" on a public group card, they see the button label change to "Joined" and the member counter increases by one.
- [AC-6] When any group member fills in a session title, date, time, and focus topic and clicks "Schedule Meeting", they see the meeting added to the group's upcoming schedule list.
- [AC-7] When a user clicks "Leave Group" on a group details page, they see that group removed from their "My Groups" section.
- [AC-8] When a user clicks "Sign out", they see the sign-in page and no longer see their user profile in the navigation bar.

### Slice 1: sign-in and study groups list
- [AC-9] When an unauthenticated visitor opens the app, they see the sign-in form with email and password input fields.
- [AC-10] When a user submits valid login credentials, they are redirected to the study groups page and see the list of available groups.
- [AC-11] On the study groups list screen, each listed group displays its subject title, meeting topic, and member count.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-2 | tests/slice1.test.js |
| AC-3 | tests/slice1.test.js |
| AC-10 | tests/slice1.test.js |
| AC-11 | tests/slice1.test.js |

## Spec vs result
- Slice 1 criteria (AC-9, AC-10, AC-11) have been planned and are ready for implementation. No criteria missed or reinterpreted.
