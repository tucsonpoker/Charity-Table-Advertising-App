# Charity Table Advertising App — Full application scope

Version: 2026-11-20 v01 (requirements baseline; NOT a completed implementation).

## Approved design baseline
Preserve the Perplexity mobile-first interactive oval poker table currently in `index.html`. Keep ten separately selectable perimeter panels and a center region, accessible list view, sponsor details, and Available/Pending/Sold labels. Current `index.html` is a demonstration only and must not be represented as persistent or multi-user.

## Roles and isolation
- **Cactus operator**: manage all charities and events; see cross-charity rollups; oversee table inventory, sales, sponsor contacts, artwork approvals and exceptions; preserve audit history.
- **Charity leader**: create/configure events and tables, invite/manage up to 12 active volunteers (leader excluded; confirmed by owner 2026-11-21), edit asking prices and correct sales, view team performance and missing logos.
- **Volunteer salesperson**: view all authorized event tables and sponsors, search directory, place pending holds or sell any available spot, automatically record authenticated salesperson, upload artwork on sponsor behalf.
- **Sponsor**: no account; revocable, scoped upload link only.
Enforce authorization and charity/event boundaries in backend queries, not just interface visibility.

## Table inventory
- Standard: $150 charity table charge; zero ad spots.
- Center-only: $550 charity table charge; one full center ad by default. Center splits here unconfirmed.
- Platinum: $600 charity table charge; exactly ten perimeter ads plus center configured as full, two halves, or four quarters per table.
These fees are costs to the charity, never sponsorship revenue.
Asking price defaults: perimeter $299, full center $1,999. Half/quarter prices must be explicitly configured; do not invent defaults. Support event, table and position asking-price overrides. Sold price remains historical agreed price.

## Sales and reporting
Available / Pending / Sold positions synchronized between table map and list. One-minute mobile flow: select spot, search/reuse sponsor, enter company + at least one contact method, actual agreed price, confirm sale. Atomic transaction and optimistic conflict check prevent double sales. Automatically attribute authenticated salesperson and time. Correcting a sale preserves original attribution and approved artwork unless explicitly authorized and audited. Pending is not revenue. Gross revenue is sum of agreed prices on Sold positions only. Display table/event gross, status counts, unsold potential separately labeled. Do not mix table charges into gross.

## Shared sponsor directory
Per-charity/event searchable businesses with contact name, email, phone, purchased positions, salespeople and status; one business may buy multiple positions. No cross-charity leakage.

## Artwork workflow
Logo needed -> Submitted -> Needs correction -> Approved by Cactus. Secure revocable position-scoped sponsor upload links, server-side file validation and protected object storage. Charity volunteers can submit on behalf. Cactus alone approves final artwork. Track print readiness independently of sold-out status.

## Screens
1. Sign in
2. Cactus portfolio dashboard and charity/event drilldown
3. Charity leader event dashboard, tables, pricing, volunteers
4. Volunteer mobile dashboard and table visual/list
5. Record/edit sponsorship
6. Sponsor directory
7. Artwork queue/upload/approval
8. Activity and audit trail

## Architecture and release gates
Current minimal Node server is suitable only for public demo. For production add persistent managed Postgres, secure sessions/authentication, migrations, server-side role checks, atomic sale writes, audit trail, secure artwork storage, backups and tests. Keep existing Railway project and GitHub repository; avoid duplicate services and unnecessary add-ons. No secrets in GitHub. Build and test in stages without replacing the approved prototype until end-to-end parity is demonstrated.

## Open decisions
Center-only split support; half/quarter asking prices; pending hold exclusivity/expiration; final print geometry. Do not silently assume answers.

## Required acceptance tests
Role isolation, login, charity/event setup, all three table types, ten platinum panels, center subdivisions, pricing overrides, pending/sold concurrency, original salesperson preservation, gross calculation, sponsor search, artwork access/approval, mobile usability, and deployed health checks.

Source: existing project requirements snapshot and current Perplexity prototype. This document describes the desired complete build, not currently shipped functionality.
