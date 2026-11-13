# Personal Cards Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
**Goal:** Add personal everyday notes and customizable private requests while preserving messaging/privacy.
**Architecture:** Frontend catalogs and shared UI; RLS-protected shared_cards table; private RPC for dynamic titles; regular send_chat for everyday notes.
**Tech Stack:** React/TypeScript, Supabase PostgreSQL RLS, Playwright, Vercel.
**Spec:** docs/superpowers/specs/2026-11-13-personal-cards-design.md
## Global Constraints
- Keep legacy Love Buttons and send_intimate_request untouched.
- Private content never enters lock-screen notifications.
- Preserve existing chat, profiles, requests and all user data.
- Mobile widths 320, 375, 390 and 430 px.
## Review Focus
- Authenticated outsider cannot read/create/send cards.
- A person can delete only cards they authored.
- UUID retry cannot overwrite a different private message.
- Daily note must be a normal chat message, not a response request.
- Unsent composer and failed sends never produce duplicate notifications.
### Task 1 — Tests and catalogs
- [ ] RED: update tests to require 27 private cards and 15 daily notes, and browser send flow.
- [ ] GREEN: add 12 intimate items, daily catalog.
### Task 2 — Shared persistence and private send
- [ ] RED: SQL fixture rejects outsiders, duplicates and invalid inputs.
- [ ] GREEN: add shared_cards with RLS, private RPC and idempotency, apply migration.
### Task 3 — Responsive UI
- [ ] RED: browser tests for daily send, custom card storage and custom private send.
- [ ] GREEN: add daily section, custom private creation and shared cards loading.
### Task 4 — Verify and release
- [ ] Run CI lint, tests, build, mobile browser checks, database security verification.
- [ ] Inspect production changes and confirm deployment status.
