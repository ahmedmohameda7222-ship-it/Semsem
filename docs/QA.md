# Verification

- Local lint, TypeScript, production bundle, and unit checks cover calendar rollover, leap-day recurrence, occasion selection, palettes, and Web Push endpoint validation.
- Browser tests cover welcome and profile selection at 320, 375, 390, and 430 CSS pixels, signed-out route protection, the manifest and icons, and offline shell reopening on the configured production build.
- Signed-in browser fixtures cover the four tabs, request cards, the historical timeline and future milestones, family form validation, six palettes, searchable icons, and the 120-second anniversary overlay. Fixtures are confined to browser tests.
- Live Supabase transaction tests cover anonymous and outsider access, partner profile and button privacy, sender and recipient actions, request idempotency, recipient outbox routing, and service-only scheduling. The tests used rolled-back records.
- Supabase security advisors returned informational entries for the four intentionally server-only tables with RLS and no browser policies.
- Production sign-in uses the two enrolled accounts and their existing passwords.


## Chat and media release

- Local lint, TypeScript, Vite build, dependency audit, 12 unit tests and 14 Playwright checks passed. Nine public checks passed against the production alias, including the offline shell and API guards.
- Reviewed browser captures at 320, 375, 390 and 430 CSS pixels. Exercised all six palette choices, including Midnight Romance. The browser suite covered the picker, request layout, history jumps, Favorites, reactions, and the removed settings controls.
- Rolled-back Supabase assertions covered literal case-insensitive history search, owner-private favorites, outsider denial, expanded reactions, attachment ownership, idempotent persistence, and personalized notification claims.
- Production browser sessions for both profiles confirmed search, private Favorites, reaction sync, chat photo upload, voice note recording and playback loading, gallery sync, and a peer-to-peer call with test microphones. The temporary gallery item was removed.
- The production push worker accepted one text notification and one attention notification for Sasa. Both types entered Semsem’s outbox, with no registered endpoint for that account during verification.
- Physical iPhone checks still cover notification text and deep links while locked, Safari keyboard placement, microphone capture and playback, and calls across different networks.
