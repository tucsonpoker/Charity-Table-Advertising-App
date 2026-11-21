

**Start here:** `docs/PROJECT_LOG.md` holds the current status, the problem register (with permanent IDs) and a running list of updates. Read it after this file, and add an entry there for every change, audit or deploy.

# Agent handoff

## Ownership and deployment
Repository: tucsonpoker/Charity-Table-Advertising-App. Railway project: Charity Table Advertising App. Node >=20 and PostgreSQL. `npm install`, `npm start`; syntax check: `node --check server.js && node --check workspace.js && node --check full_app.js`.

The user explicitly forbids delegating coding to Railway cloud coding workers or assistants. Write code directly. Use Railway only for hosting, configuration, logs and deployment.

## Architecture
`full_app.js` is the legacy server with inventory, charity management, authentication, sales and artwork status. `server.js` adapts its request listener once to compose the separately maintained `workspace.js` handler and add a workspace navigation link. The temporary adapter restores http.createServer immediately; refactor to an explicit exported app handler in a later reviewed change. `index.html` is the original table prototype, not the authenticated workspace.

## Data and privacy
Workspace migrations are additive CREATE TABLE/INDEX IF NOT EXISTS operations on first authenticated workspace request. New tables: workspace_prospects (event and owner), workspace_notes (author and explicit visibility), workspace_reminders (owner). Private notes are filtered in SQL by author; managers and cactus administrators do NOT get access to others' private notes. Reminders are owner-only. Calendar links include only title and times, never note bodies automatically. Calendar creation is optional, user-confirmed, not OAuth synchronization. New workspace forms use a session-bound CSRF token. Escape all rendered user content. Never log private notes, credentials, invitation or reset tokens.

IMPORTANT LIMITATION: existing user memberships and legacy sponsor directory are charity-scoped, NOT event-membership-scoped. Workspace prospects/notes are partitioned by selected event, but every user of a charity can select that charity's events. Explicit per-event membership and corresponding legacy route enforcement remain required before claiming strict team isolation across events. Do not misrepresent this.

## Configuration
Existing variable names: DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD; optional PORT and PGSSL. Never commit their values. Bootstrap creates the first cactus admin only when absent. Do not reset production data. Preserve current inventory pricing and sale flows.

## Outstanding work / release gates
- Invitation-only signup collecting full name and email, single-use-at-redemption tokens, expiry and atomic redemption; remove manager-created temporary password flow only after migration.
- Password recovery with configured and tested delivery, request throttling and anti-enumeration.
- Per-event memberships enforced throughout legacy routes; validate role/owner behavior with integration tests.
- Link prospects to existing sponsors and conversion workflows to avoid duplicate directories.
- Better local-time reminder input/display; current first increment explicitly uses timezone-bearing ISO strings and UTC display.
- Optional photo handling and home-screen guidance/install assets.
- Automated PostgreSQL tests for private note exclusion, cross-charity/event access, CSRF, ownership and regression of sales flows.
- Test deployment health and real iPhone/Android usability. No such tests have been run for this commit at authoring time. No claim of production readiness.
- Legacy auth still needs rate limiting, complete CSRF coverage and security review.

## Deployment / rollback
Inspect current GitHub branch/commit and Railway source before writes. Obtain user confirmation for exact writes. A main push may trigger connected Railway auto-deploy. Check build/runtime logs and `/health`, then authenticated flows. Roll back via Railway to the last known working deployment after explicit approval; new additive tables can remain, never drop them to roll back. Record actual results rather than implying a successful deployment equals working features.
