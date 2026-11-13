# Reliable Voice Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion.

**Goal:** Fix false call failures, add authorized ICE restart signaling, improve real-time route diagnostics and make iOS foreground microphone recovery explicit.

**Architecture:** Keep existing voice-call row and Supabase Realtime/polling; add a revision-controlled recovery negotiation protocol and candidate append guard. Keep browser media tracks alive across short disconnections and restore after interruption when the OS permits.

**Tech Stack:** React 19, WebRTC, TypeScript, Supabase/PostgreSQL, Cloudflare TURN, Vercel, Playwright.

**Spec:** docs/superpowers/specs/2026-11-13-voice-stability-audit.md

## Global constraints
- No secrets, SDP, IPs or candidate strings in logs or diagnostic UI.
- Old clients' voice RPC signatures remain usable.
- Reconnect must retain the same call ID, logs, partner and media streams.
- PWA background audio remains best effort; no false promises about iOS lock screen.
- No automatic call recordings or destructive historical changes.

## Tasks
- [ ] RED: write unit tests for recovery policy, selected route and AudioSession; SQL rollback tests for restart authorization and epoch guard.
- [ ] GREEN: add pure helpers, a new migration and apply verified rollback SQL fixture.
- [ ] RED: browser coverage for reconnection without ending a call, and real browser ICE renegotiation.
- [ ] GREEN: integrate recovery protocol into VoiceCall provider (bidirectional) and foreground microphone retry; warnings and statuses.
- [ ] Run lint, all unit tests, full Playwright, build and Supabase security advisors.
- [ ] Review entire branch and deploy only after verifying all checks.
