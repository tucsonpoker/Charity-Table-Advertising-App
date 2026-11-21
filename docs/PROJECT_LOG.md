# Project log

Shared notes for every person and AI agent working on this app: what has been done, what is broken, what is suggested, and a running list of updates. **Read `AGENTS.md` first (hard rules), then this file.**

Last updated: 2026-11-21

## How to use this log

1. Before changing anything, compare the repository head with "Audit baseline" below. The findings were made on a snapshot whose commit is unknown, so re-check a finding in the current code before fixing it.
2. After any change, audit or deploy, add an entry at the top of "Running updates" in the same commit as the work. Newest first. Start each entry with one plain-language sentence a non-programmer can follow. Do not edit or delete another agent's entry; correct it with a new entry.
3. Update the **Status** of every finding you touch in the register. Never delete a finding. When fixing one, write `Fixed in <commit>` and how you checked it.
4. Tag how you know each claim: **Measured** (seen or timed in the running app), **Code** (read in the source, not run), **Source** (a published standard, linked below), **Inferred** (reasoned, not reproduced). Say what was **Not tested**.
5. A successful deploy does not prove a feature works. Record real results (`AGENTS.md` says the same).
6. Never write secrets or real data here: no database URL, no bootstrap credentials, no invite or reset tokens, no private notes, no real sponsor or charity details.
7. Do not use Railway cloud coding agents or workers (owner rule in `AGENTS.md`). Railway is for hosting, configuration, logs and deployment only.
8. Permission to push to `main` comes from the owner, per agent and per change. A push to `main` can trigger a Railway auto-deploy. If unsure, ask.

Status words: Open, In progress, Fixed, Needs recheck, Won't fix.

## Current status (2026-11-21)

- **Live app.** Railway project "Charity Table Advertising App", production environment. Railway reported on 2026-11-21 that the app service and the Postgres service were both SUCCESS. The latest deployment is commit `558b665` ("Implement single-use account setup and lead-issued recovery; restore live segmented table inventory"), deployed 2026-11-21 19:55 UTC from `main`.
- **Audit baseline.** A zip download of `main` named `Charity-Table-Advertising-App-main`. A zip carries no commit hash, so the audited commit is **unknown**, and it has not been checked against `558b665`. Treat every finding as "verify first".
- **Audit score.** 5.2 out of 10 against a polished-mobile-app standard (Claude, 2026-11-21). The score is a judgment; the measurements behind it are in the register. Category scores out of 10 with weights: core task of selling a space 4 (25%), visual polish 7 (20%), phone fit and navigation 5 (20%), logic and data clarity 5 (20%), accessibility 6.5 (10%), build quality 3 (5%). A 9 would mean a volunteer sells a space one-handed on a phone in under a minute with no surprises.
- **Not tested by anyone yet.** Real iPhone and Android phones, Safari itself, a real PostgreSQL database (sales racing each other, sessions and reset links were read in code, not run), and email delivery. The audit ran the real server code against a stand-in database with made-up data, in Chrome at 390 × 844.
- **Not production-ready.** `AGENTS.md` says the same.

## Problem register

IDs are permanent. F = fix first, N = fix next, S = structural, D = documentation out of date. "Where" names files in this repository.

### Fix first

| ID | Problem | Evidence | Where | Suggested fix | Status |
|----|---------|----------|-------|---------------|--------|
| F-01 | Sign out and Save to phone are `display:none` on phones (width 650px or less). A volunteer on a shared phone cannot sign out; the only other way found to end a session is changing the password. | Measured at 390px; Code | `redesign.css`, rule `nav .save-phone,nav form{display:none!important}` | Move both into the Account page and show them on phones. | Open |
| F-02 | The polished demo sell screen is not the real selling flow. A live sale takes four page loads (Dashboard, event, table, space) before a long form, and Save returns to the space page, not the table. The demo does it in two taps and is reachable only by typing `/original-table`. | Code; Measured | `full_app.js`, `release.js`, `index.html` | Rebuild the live table page on the demo's pattern: tap a space, fill five fields, Save, land back on the table. | Open |
| F-03 | The table map is small and low on the page. It starts about 650px down, below the header and three stat cards. Edge cells measure 78 × 34, 67 × 60 and 39 × 62 px; seat numbers are about 11px. Seat status is shown by color alone on the map (the text list below compensates). Apple asks for 44-point and Google for 48dp touch targets. | Measured; Source | `release.js` (`tableSVG()`) | Put the map first, make it larger, keep every cell at least 44px, print a status word or icon on each cell. | Open |
| F-04 | Live inputs are 15px and buttons 13px. Safari on iPhone is reported to zoom into inputs under 16px (a developer report, not an Apple specification; not tested on a device). | Measured; Source | `redesign.css` | Inputs 16px or larger, button text 15px or larger. | Open |
| F-05 | The sale form invites mistakes. "Record as" defaults to Pending, so a forgotten tap records a sale that does not count as revenue. The lead-only "Set asking price" card sits above the sale form. "Existing sponsor" is a plain dropdown with no search, so sponsors get typed twice. Save is not pinned to the screen. The requirements document asks for sponsor search and reuse. | Code; Measured | `full_app.js` | Sale form first, a clear two-button Pending/Sold choice like the demo's, a searchable sponsor field, Save pinned at the bottom. | Open |
| F-06 | Reminder times are typed as code (`2026-12-01T09:00:00-07:00`) and shown in UTC (`2026-12-01 16:00 UTC`), seven hours off for Arizona. Also listed in `AGENTS.md`. | Code; Measured | `workspace.js`, `experience.js` | Use a `datetime-local` picker and display in America/Phoenix time. | Open |
| F-07 | Wrong seller credit. Releasing a space does not clear `seller_id` (the release SQL sets only status, sponsor_id, agreed_cents and artwork_status), and the next sale keeps the old seller through `coalesce(seller_id,$4)`. The first salesperson is credited for a new sponsor's sale. | Code (re-read 2026-11-21; not run against a real database) | `full_app.js` | Clear or re-record the seller on release. | Open |
| F-08 | A blank price becomes 0 and the server accepts it (`Math.round(Number(price)*100)`). The browser's required check normally stops it, so this is a hardening gap. | Code | `full_app.js` | Reject blank or zero prices on the server. | Open |
| F-09 | Double tap on Save may submit twice. The second submit hits an already-sold space and shows an "already sold" error page after a successful sale. | Inferred; not reproduced | `full_app.js` | Disable Save after the first tap. | Open |

### Fix next

| ID | Problem | Evidence | Where | Suggested fix | Status |
|----|---------|----------|-------|---------------|--------|
| N-01 | The header is 173px tall on every app page (20% of an 844px screen): two rows of 12px text links, and leads see seven links. Apple says tab bars are for top-level sections, fewer tabs are easier, and to avoid overflow "More" tabs; its customization advice aims for five or fewer. | Measured; Source | `app-shell.js` (`navigation()`), `redesign.css` | A bottom tab bar of five tabs at most (Home, Sell, Sponsors, Follow-ups, Account), with Team, Manage events and Sign out inside Account. | Open |
| N-02 | Tap targets are too short. Menu links are 40px tall; "Back to table" is 20px and "Open" is 18px, under the 24px WCAG 2.2 minimum unless spacing exempts them. | Measured; Source | `redesign.css` | 44px minimum height for anything tappable. | Open |
| N-03 | The dashboard's first screen under-serves the main job. The "View tables & sell a space" button sits about 735px down. The copy ("Let's make a difference.") and hero card read like a marketing page; the demo's "Pick a space. Record the sponsor. Done." is the right tone. Switching events takes a separate button and a page reload. | Measured | `experience.js` (`home()`) | Put selling first, use plain copy, make event switching one tap. | Open |
| N-04 | Dollars do not match between screens. The dashboard rounds to whole dollars (`maximumFractionDigits:0`; $897.50 reads $898); table pages show cents. | Measured; Code (rounding setting re-read 2026-11-21) | `experience.js`, `release.js`, `full_app.js` | One shared money function. | Open |
| N-05 | Weak non-text contrast. Input borders are 2.01:1 against white; WCAG 2.1 SC 1.4.11 asks 3:1 for a control's visible edge. The older stylesheet's `#7d9487` is 3.25:1 and would pass. Available and Pending seat colors are 1.14:1 apart in lightness, so they differ by hue alone. | Measured; Source | `redesign.css`, `release.js` | Darker borders; add a non-color cue to seats (ties to F-03). | Open |
| N-06 | Much of the text is small: 27 of 48 text blocks on the dashboard are 11–12px. Contrast passes, but it is hard going for many volunteers. | Measured | `redesign.css` | Keep 12px for captions only. | Open |
| N-07 | The password-manager hint is overwritten on account setup. The server sends `autocomplete="new-password"` on the invite and reset pages; `app-design.js` changes every password field not named `next` to `current-password`. Browsers may then not offer a strong generated password. | Measured; Code (script line re-read 2026-11-21); Source | `app-design.js` | Remove or narrow that script rule. | Open |
| N-08 | Mistakes cannot be fixed. Prospects, notes and reminders cannot be edited or deleted. A sold space cannot be corrected, only released, which also wipes its price and artwork status. The requirements say corrections must keep attribution and approved artwork. | Code | `workspace.js`, `full_app.js` | Add edit and correct for sales and prospects that keep the seller and artwork status. | Open |
| N-09 | Blocked actions show raw system text such as "Not permitted for this role" on a bare page with no menu. | Code | `full_app.js` | A plain-language message with the menu kept. | Open |
| N-10 | Names and labels are inconsistent. The same space is "Seat 2" in the demo, "Space 2" in the table list and "Position P2" on the sell page. Types and statuses show lowercase (`platinum`, `available`). Standard tables read "0/0 sold". The sign-in page shows a developer footer ("2026-11-20 v02 · Sponsorship revenue is gross...") and both an h1 "Sign in" and an h2 "Welcome". | Measured | several pages | One vocabulary, no developer footer, one h1 per page. | Open |

### Structural

| ID | Problem | Evidence | Where | Suggested fix | Status |
|----|---------|----------|-------|---------------|--------|
| S-01 | Every HTML page is rewritten at runtime. `server.js` wraps `res.end`, runs `shell.transform` (a regex header swap that injects `redesign.css`), deletes the table illustration (`hero-art`) that `experience.js` just drew, and patches strings. A wording change in an older page can silently break the look. | Code (re-read 2026-11-21) | `server.js`, `app-shell.js` | One page template for every screen; delete the older layout and the regex rewriting. | Open |
| S-02 | The approved demo is restyled in production. `/original-table` is served with the new header, 15px inputs and 13px buttons, while `index.html` itself has 16px inputs and 16px buttons. `README.md` says it was imported unchanged. | Measured | `server.js`, `index.html`, `README.md` | Serve `index.html` untouched, or fold its pattern into the live page (see F-02). | Open |
| S-03 | Styles fight each other. `redesign.css` uses 37 `!important` rules to beat the older inline CSS. | Measured; Code (count re-run 2026-11-21) | `redesign.css` | One stylesheet. | Open |
| S-04 | Dead and stale files. `app-design.css` is not used by the server (only the stale test mentions it). `app-shell.test.js` fails on its first assertion (re-run 2026-11-21: AssertionError). There is no `npm test`, and `npm run check` only syntax-checks `full_app.js`. | Measured | `app-design.css`, `app-shell.test.js`, `package.json` | One test command that passes and runs before each deploy; remove the dead file. | Open |
| S-05 | Security gaps the notes already admit: no login rate limiting, and the older POST routes only check the Origin header (CSRF coverage incomplete). `AGENTS.md` says new workspace forms already use session-bound CSRF tokens. | Code | `full_app.js` | Rate limiting; session-bound CSRF tokens on the legacy routes. | Open |

### Documentation out of date

| ID | Problem | Evidence | Where | Status |
|----|---------|----------|-------|--------|
| D-01 | The `AGENTS.md` architecture paragraph says `server.js` composes `workspace.js` and adds a navigation link. The current `server.js` also composes `release.js` and `experience.js`, rewrites HTML responses (S-01) and serves `/app-design.js`. | Code | `AGENTS.md`, `server.js` | Open |
| D-02 | `AGENTS.md` "Outstanding work" still lists invitation-only signup and password recovery. `release.js` now has `/join`, `/reset` and `/recover`, and the latest deploy message mentions them. Whether they meet every listed item (tested deli
