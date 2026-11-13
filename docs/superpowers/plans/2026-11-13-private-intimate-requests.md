# Intimate Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver private, consensual romantic and intimate request cards for the two-person PWA without changing existing Love Buttons.

**Architecture:** Presets live in a typed frontend catalog; a dedicated UI section opens a confirmation composer and calls a narrow authenticated Supabase RPC. The RPC validates request codes and writes a private chat entry, while claim_push redacts private content before constructing the Web Push payload.

**Tech Stack:** React 19, TypeScript, Supabase PostgreSQL/RLS/RPC, Vercel Web Push, Playwright, Node tests.

**Spec:** docs/superpowers/specs/2026-11-13-private-intimate-requests.md

## Global Constraints
- Production repository: ahmedmohameda7222-ship-it/Semsem; existing main-only Vercel deployment.
- Preserve both users' profiles, historical messages, buttons, themes, dates, family tree and calls.
- Private lock-screen alerts must not contain request content, linked reply content or sexual titles.
- Preserve normal chat notification content and existing read/reply functionality.

## Review Focus
- Crafted client requests can't mark plain chat private or reveal private request content by abusing RPC arguments.
- Anonymous/outsider calls cannot insert/read private requests; only enrolled pair permitted.
- Retrying a previously created private request with the same UUID is idempotent.
- Receiving a reply to a private request doesn't expose it on the iPhone lock screen.
- Mobile layout and accessibility continue to work at 320px.

### Task 1 — Failing tests
**Files:** tests/intimateRequests.test.ts, tests/pushPayload.test.ts, tests/browser/private.spec.ts
- [ ] Test catalog, safe preview, locked push, and mobile composer flow.
- [ ] Observe expected red failures prior to implementation.

### Task 2 — Secure durable persistence and push redaction
**Files:** supabase/migrations/20261113*_private_intimate_requests.sql, supabase/tests/private_intimate_requests.sql, server/pushPayload.js
- [ ] Add column and dedicated narrow RPC with idempotency and membership.
- [ ] Redact content in claim_push before the Vercel function sees it.
- [ ] Preserve and mark linked private replies.
- [ ] Run SQL fixture in rollback and apply migration non-destructively.

### Task 3 — Responsive section and compose
**Files:** src/intimateRequests.ts, src/IntimateRequests.tsx, src/Attention.tsx, src/data.ts, src/Chat.tsx, src/chatPolish.css
- [ ] Add preset categories, confirmation and retry with stable UUID.
- [ ] Add discreet chat private badge.
- [ ] Run TypeScript, lint, tests and mobile Playwright.

### Task 4 — Release verification
- [ ] Verify PR CI and screenshot evidence.
- [ ] Merge only to main and confirm Vercel Production READY.
- [ ] Confirm no data loss, privilege escalation or private push leaks.
