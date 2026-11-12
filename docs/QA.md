# Verification

- Local lint, TypeScript, production bundle, and unit checks cover calendar rollover, leap-day recurrence, occasion selection, palettes, and Web Push endpoint validation.
- Browser tests cover welcome and profile selection at 320, 375, 390, and 430 CSS pixels, signed-out route protection, the manifest and icons, and offline shell reopening on the configured production build.
- Signed-in browser fixtures cover the four tabs, request cards, the historical timeline and future milestones, family form validation, six palettes, searchable icons, and the 120-second anniversary overlay. Fixtures are confined to browser tests.
- Live Supabase transaction tests cover anonymous and outsider access, partner profile and button privacy, sender and recipient actions, request idempotency, recipient outbox routing, and service-only scheduling. The tests used rolled-back records.
- Supabase security advisors returned informational entries for the four intentionally server-only tables with RLS and no browser policies.
- Production OTP delivery, a real pair of Realtime sessions, signed photo upload with enrolled accounts, and physical iPhone Web Push remain pending private enrollment and provider setup. The production PWA URL serves the signed-out app shell while these steps are pending.
