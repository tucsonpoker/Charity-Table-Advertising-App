## For AI agents, auditors and contributors

Read `AGENTS.md` (hard rules), then `docs/PROJECT_LOG.md` (current status, known problems with IDs, suggested changes and a running updates list). Add an entry to the log with every change, audit or deploy. The sections below were written for the original prototype and are partly out of date (see D-04 in the log).

# Charity Table Advertising App

This repository contains the **original Perplexity interactive oval poker-table prototype** in `index.html`, plus a minimal Node.js server for Railway deployment.

## Preview

Run `npm start` (Node.js 20+) and open http://localhost:3000. Railway supplies `PORT` automatically.

## Current limitations

**Preview only:** all sponsors and sales are demonstration data; changes are not persisted to a shared database. Do not enter real sponsor or charity information.

## Version

2026-11-20 v01: imported the previously approved Perplexity prototype unchanged, added minimal Railway hosting.

## Health check

`GET /health` returns `ok`.
