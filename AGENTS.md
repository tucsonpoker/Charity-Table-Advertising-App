**Running updates:** add every new entry at the top of `docs/UPDATES.md` (a short file, newest first). `docs/PROJECT_LOG.md` is history plus the problem register; do not add running updates there.

# Agent handoff

## Ownership and deployment
Repository: tucsonpoker/Charity-Table-Advertising-App. Railway project: Charity Table Advertising App (auto-deploys from `main`). Node >=20 and PostgreSQL. `npm install`, `npm start`. Syntax check: `for f in server.js lib/*.js public/app.js; do node --check $f; done`.

The owner is a non-programmer. The owner forbids delegating coding to Railway cloud coding workers or assistants. Write code directly. Use Railway only for hosting, configuration, logs and deployment. Never change Railway variables, secrets or the production database by hand, and never ask the owner for passwords or tokens.

## Architecture (v3, 2026-11-21)
- `server.js`: one explicit HTTP server and router. Security headers (strict CSP, `script-src 'self'`, no inline scripts), same-origin check, CSRF token (HMAC of session id) on every signed-in POST, read-only enforcement while an admin is in "View as".
- `lib/db.js`: pool plus additive migrations only (CREATE/ALTER ... IF NOT EXISTS). Never drop or rewrite existing data.
- `lib/security.js`: scrypt password hashes (format unchanged from v1), tokens, CSRF, rate limiter, escaping.
- `lib/ui.js`: layout shell (desktop sidebar, phone bottom tabs), components, charity brand theming, poker-table SVG.
- `lib/routes-public.js` sign-in, branded `/c/:slug`, invites (`/join`), password reset, sponsor upload link `/art/:token`.
- `lib/routes-main.js` home, events, tables. `lib/routes-sales.js` selling, artwork, approvals, sponsors, notes, reminders, my list. `lib/production.js` submit → proof → approve → production. `lib/routes-admin.js` team, Cactus admin, View as.
- `lib/demo.js`: seeds the demo charity (slug `demo`) once; demo passwords are random and shown only on `/admin`.
- `lib/image.js`: artwork size check. `public/`: CSS, JS, manifest and icons.
- `legacy/`: the previous v1/v2 code, kept for reference only. Not loaded.

## Rules that must hold
- Roles: Cactus admin; charity lead (manager); volunteer (sales). Volunteers never see costs or profit.
- Private notes are visible only to their author, filtered in SQL. Nobody else, including admins and "View as", sees them.
- Reminders are owner-only. Google Calendar links carry only title and time.
- Team data is scoped by event membership (`event_members`).
- Invite links work once, collect full name, email and password; email is the sign-in name.
- "View as" is read-only; every POST is blocked except stopping View as.
- Escape all user content. Never log notes, passwords, invite or reset tokens.

## Configuration
DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD; optional PORT and PGSSL. Never commit values.

## Not yet done
- No email delivery: reset and invite links are shared by the lead or admin.
- Not tested on real iPhone/Android devices.
- No automated test suite in the repo yet (a 28-check browser run was done locally; see `docs/UPDATES.md`).

## Deployment / rollback
Push to `main` triggers Railway deploy. Check logs for "Cactus Charity Tables v3 listening" and `/health`. Roll back via Railway to the last working deployment only with owner approval; additive tables can stay.
