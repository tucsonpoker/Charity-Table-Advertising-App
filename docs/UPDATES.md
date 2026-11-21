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

### 2026-11-21, America/Phoenix, Claude (Sonnet 5.5), moved running updates to this file
- In plain words: One AI reader could not reach the updates at the bottom of the long log, so new updates now live in this short file.
- Changed: added `docs/UPDATES.md` and a line in `AGENTS.md` (both added by the owner by hand on GitHub).
- Findings touched: none.
- Checked how: an access test run by the owner with ChatGPT read the commits, `AGENTS.md`, Railway status and Railway logs correctly, but reported it could not reach the "Running updates" section of `docs/PROJECT_LOG.md`, which starts about 16.5 KB into a 20 KB file.
- Not tested: whether other AI readers (for example Perplexity) can read this file.
- Next suggested: when GitHub is connected, shorten `docs/PROJECT_LOG.md` (the register tables are most of it) and update rule 2 there.

Earlier entries (2026-11-21, "created this log" and "mobile UI and logic audit") are in the "Running updates" section of `docs/PROJECT_LOG.md`.
