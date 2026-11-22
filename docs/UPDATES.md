# Running updates

Newest first. **Add every new entry here, at the top**, not in `docs/PROJECT_LOG.md` (this replaces rule 2 there; the older "Running updates" section in the log is history). This file is kept short so any reader can see all of it. Follow the other rules in `docs/PROJECT_LOG.md`.

Template:

### YYYY-MM-DD, America/Phoenix, <who: person or agent and model>, <short title>
- In plain words: <one sentence a non-programmer can follow>
- Changed: <files, commit hash if any>
- Findings touched: <IDs and new status>
- Checked how: <what was run or measured, and the result>
- Not tested: <what was not checked>
- Next suggested: <one or two items>

### 2026-11-21, America/Phoenix, Perplexity Computer (Claude Opus 5.5), volunteer limit set to 12
- In plain words: Each charity can now have up to 12 active volunteers (the lead isn't counted); the Team page shows how many spots are used, and leads can cancel an invitation to free a spot.
- Changed: `lib/db.js` (VOLUNTEER_LIMIT, volunteerCount), `lib/routes-admin.js` (limit on invite and reactivate, spots-used line, Cancel invitation), `lib/routes-public.js` (limit checked again when someone joins), `public/app.css` (invitation row layout), new `test/e2e-volunteers.js`, `AGENTS.md`, requirements doc.
- Findings touched: audit item 8 volunteer limit, now closed at 12 (owner confirmed). Owner also confirmed table charges are the same for all charities, so they stay fixed. Table limit stays at 20 per save.
- Checked how: `npm test` 7/7; browser walkthrough 28/28; audit checks 14/14; new volunteer-limit checks 8/8 (13th invite refused, cancel frees a spot, full team can't join, reactivation past limit refused); Team page screenshot reviewed.
- Not tested: real phones.
- Next suggested: confirm Railway database backups.

### 2026-11-21, America/Phoenix, Perplexity Computer (Claude Opus 5.5), fixes from the Claude audit (7.3/10)
- In plain words: A bad request can no longer crash the app, phones always get the newest look, leads can add up to 20 tables at once (Platinum by default), money figures are correct and leads see costs and net, strangers can't lock someone out, and text is easier to read.
- Changed: `server.js` (safe cookies, last-resort handlers, HSTS, cache rule), `lib/ui.js` (content-fingerprinted assets), `lib/security.js` + `lib/routes-public.js` (sign-in failure counters, real visitor address), `lib/routes-main.js` (Add tables 1-20, split-center price required, Platinum-only splits, still-available fix, lead-only Money card), `lib/image.js` + `lib/routes-sales.js` (file content check), `public/app.css` + `public/app.js` (contrast, sizes, tap targets, show/hide fields), `test/` (unit, e2e, e2e-audit), `package.json`, `AGENTS.md`.
- Findings touched: audit items 1, 2, 3, 4 (no invented split prices; owner did not set them, so the lead enters them), 5, 6, 7, 8 (cost/net built; volunteer limit still 25 pending owner), 9, 10 (HSTS, file check; demo passwords kept visible on purpose for demos).
- Checked how: `npm test` 7/7; browser walkthrough 28/28; audit checks 14/14 (bad cookie, 12 tables in one save, split price, still available, renamed file refused, lockout does not block the real owner, volunteer cannot see money); contrast and tap-size scan of 15 phone pages.
- Not tested: real phones; heavy use.
- Next suggested: owner to confirm volunteer limit (12 or 25) and whether table charges ever differ per charity.

### 2026-11-21, America/Phoenix, Perplexity Computer (Claude Opus 5.5), fixes 6 and 10-14 from the open-items list
- In plain words: The header now always matches the charity you are looking at, long names show in full, pop-up messages no longer cover the top bar, sponsor uploads name the sponsor, the start-up warning is gone and the old unused code was removed.
- Changed: `server.js` (useEvent), `lib/routes-main.js`, `lib/routes-sales.js`, `lib/production.js`, `public/app.css`, new `railway.json` (start with `node server.js`), `package.json` check script, `AGENTS.md`; deleted `legacy/`.
- Findings touched: open items 6, 10, 11, 12, 13, 14 fixed.
- Checked how: 28-check browser run passed; screenshots reviewed; activity text checked in the test database.
- Not tested: real phones.
- Next suggested: items 1-5 and 7-9 from the open-items list.

### 2026-11-21, America/Phoenix, Perplexity Computer (Claude Opus 5.5), real-looking tables and cleaner Tables page
- In plain words: Tables now look like real poker tables (green felt, padded rail, numbered spaces), each card shows sold/reserved/open at a glance, and the clutter was moved off the Tables page.
- Changed: `lib/ui.js` (table drawing), `lib/routes-main.js` (Tables page, new `/tables/new` and `/event` pages, event switch on More), `public/app.css`.
- Findings touched: owner feedback "clunky and unserious" on the Tables page.
- Checked how: 28-check browser run passed; phone screenshots reviewed.
- Not tested: real phones.
- Next suggested: owner review on a phone.

### 2026-11-21, America/Phoenix, Perplexity Computer (Claude Opus 5.5), full v3 rebuild
- In plain words: The whole app was rebuilt as a clean, fast phone app with a demo charity and a read-only "View as" for the admin.
- Changed: new `server.js`, `lib/*`, `public/*`; old code moved to `legacy/`; `AGENTS.md`, `README.md`; added `busboy`.
- Findings touched: D-04 (README out of date) fixed; per-event membership, invite-only signup, password reset, rate limiting and full CSRF now built.
- Checked how: local PostgreSQL plus a 28-check Playwright browser run on phone and desktop sizes (sell, reserve, price approval, artwork upload and sponsor link, submit with unsold spaces, proof approve, production, invites single-use, private notes hidden, View as read-only, password reset): all passed, no browser errors. Migration from the old database was also tried once and worked.
- Not tested: real iPhone/Android devices; email delivery (there is none, links are shared by hand).
- Next suggested: try the demo on a real phone; add an automated test suite to the repo.

### 2026-11-21, America/Phoenix, Claude (Sonnet 5.5), moved running updates to this file
- In plain words: One AI reader could not reach the updates at the bottom of the long log, so new updates now live in this short file.
- Changed: added `docs/UPDATES.md` and a line in `AGENTS.md` (both added by the owner by hand on GitHub).
- Findings touched: none.
- Checked how: an access test run by the owner with ChatGPT read the commits, `AGENTS.md`, Railway status and Railway logs correctly, but reported it could not reach the "Running updates" section of `docs/PROJECT_LOG.md`, which starts about 16.5 KB into a 20 KB file.
- Not tested: whether other AI readers (for example Perplexity) can read this file.
- Next suggested: when GitHub is connected, shorten `docs/PROJECT_LOG.md` (the register tables are most of it) and update rule 2 there.

Earlier entries (2026-11-21, "created this log" and "mobile UI and logic audit") are in the "Running updates" section of `docs/PROJECT_LOG.md`.
