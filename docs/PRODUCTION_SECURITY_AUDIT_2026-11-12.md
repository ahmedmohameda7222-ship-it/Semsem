# Our Space — production security and reliability review

Date: 2026-11-12
Repo: `ahmedmohameda7222-ship-it/Semsem`
Production: https://sasa-semsem.vercel.app
Database: Supabase project `dthmpdsyxqnfsdaoicvm`

## Scope and evidence

Reviewed the current source, authentication/authorization flow, Supabase public tables/RLS, private Storage, privileged functions, notifications, Web Push Cron, WebRTC/TURN fallback, PWA shell, and Vercel deployment configuration. Production read-only SQL impersonation, Supabase Security/Health/Performance Advisors, live public endpoint checks, TypeScript/ESLint, dependency audit and browser/unit CI provide verification. This is a focused engineering audit, **not** a formal penetration test or a guarantee of perfect uptime.

## Findings addressed

1. **WebRTC availability during provider outages**: Cloudflare TURN failures used to abort the whole call. The server now falls back to direct STUN when TURN fails, so calls can still connect on permissive networks. Restrictive NATs can still require a healthy TURN provider.
2. **Silent loss of iPhone push registration**: Previously, a server-deleted subscription could leave the phone displaying notifications as enabled without a server-side registration. The app now re-registers an existing previously approved subscription when returning to foreground/online. It does not silently request notification permission or create a new subscription.
3. **Browser hardening**: Vercel now serves an enforced script-restricting Content Security Policy (no inline/eval JavaScript), HSTS, and restrictive Permissions-Policy. Existing frame-denial, no-sniff, and referrer policies remain.
4. **Database longevity**: Added 12 covering foreign-key indexes, targeting unread chat, message relations, saved items, notification delivery, voice calling, and private shared content. Verified the Supabase unindexed-foreign-key advisor finding cleared. Freshly created indexes naturally show as unused until real queries exercise them.
5. **Migration safety**: Reconciled all seven repository migration filenames with Supabase's actual applied version numbers. Did not replay any old schema migration.
6. **Regression integrity**: Corrected negative RLS/call fixture tests that previously caught their own assertion exceptions. Added a separate read-only production RLS test that was run successfully without modifying records.
7. **Dependency supply chain**: `npm audit --audit-level=high` was executed in GitHub CI and found **0 known vulnerabilities** in the installed dependency graph. It now runs on each PR and on a schedule.
8. **Operational checks**: Scheduled GitHub Actions twice daily for anonymous production HTTP health, PWA assets, API method/auth rejection, enforced security headers, and dependency advisories. Also run after a production-code merge.

## Positive observations

- All **14 public tables** had Row Level Security enabled when checked.
- An unauthenticated role had no SELECT on profiles; a randomly generated outsider identity saw zero profiles, chat, dates and call rows. The enrolled pair could read both intended profiles. The identity key was not editable by authenticated clients.
- All **three Storage buckets are private** and have upload MIME/size restrictions and user/pair access policies.
- Public RPC functions route to authorization-checked functions in `our_space_private`, with fixed search paths. Privileged push and OTP RPCs are not executable by anonymous or authenticated clients.
- Cloudflare long-term TURN credentials and Supabase service keys exist only in Vercel server-side Sensitive environment variables, not `VITE_*`.
- Cron jobs for push delivery retry and stale-call expiry were active. Checked recent runs were `succeeded`.
- Anonymous GET requests to POST-only API endpoints returned HTTP 405; the protected push Cron returned 401 without its secret.
- The Vercel production deployment was READY and anonymous app shell, manifest and service worker returned 200 before this patch.
- Existing chat messages, profiles, dates, buttons, photos, notes and active account secrets were not deleted or reset by the audit.

## Residual risks and owner actions

1. **GitHub repository visibility: PUBLIC.** This is not the same as public chat data, but the private application's source and project design are readable. Change it to Private through GitHub Settings → General → Danger Zone → Change repository visibility; confirm Vercel Git integration and Actions still operate afterward. Public forks, if any, do not become private automatically. The connected GitHub tools cannot change repository administration settings.
2. **Supabase leaked-password detection: OFF.** This optional HaveIBeenPwned protection requires Supabase Pro or higher. If available, enable it at Supabase Auth → Security and use unique high-entropy passwords. Do not send account passwords to anyone for an audit.
3. **Push subscriptions require both users' device setup.** One device was registered at a later checkpoint; the second must enable/restore notifications through the installed iPhone PWA. Push delivery while iOS is closed is browser-controlled.
4. **Five old, unreferenced files remain in the private `our-space-chat-media` bucket** from a prior chat cleanup. Delete their exact paths via the Supabase Storage API / dashboard, not direct SQL. Do not empty the entire bucket if new chat media exists.
5. **iOS PWA limitations:** native lock-screen call answering and uninterrupted microphone use in the background cannot be guaranteed. Two-way voice across Germany–Egypt should be verified on real independent networks; simulated browser tests do not prove that.
6. **Cloudflare TURN free allowance is not a spending cap.** Review realtime usage and provider billing alerts to avoid accidental overage.
7. **Alerts:** a scheduled GitHub Actions failure is visible in the repo Actions tab. Configure GitHub email/app notifications for failed workflow runs for prompt notice; a scheduled check is not a 24/7 uptime SLA.
8. **Two permissive SELECT policy overlaps** remain a minor performance advisory. They're authorization-compatible and were intentionally left unchanged to avoid altering production policy semantics. No high-severity RLS advisory was reported.

## Release acceptance

- Strict regression checks: dependency audit, lint, TypeScript build, unit tests, and browser tests must all pass.
- Production checks: latest merged Vercel deployment READY, served app HTTP 200 and manifest/worker available, security headers present, GET API auth/method guards enforce expected statuses.
- Actual connected-device push, media, calling and mobile-data quality remain manual iPhone acceptance tests.

## Operational response if something fails

1. Check `Actions → Our Space production uptime and security` for the affected time.
2. Check Vercel project `our-space` deployment logs and target commit.
3. Check Supabase Auth/Database/Realtime logs, Security Advisor and Cron status.
4. Prefer reverting a bad commit or rolling back a verified Vercel production deployment rather than making ad-hoc destructive SQL changes.
5. Do not reset user accounts, remove chat data, or rotate secrets without a verified cause and the user's authorization.
