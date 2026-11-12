# Our Space — Master Implementation Plan (iPhone-First PWA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Status:** Product design and interactive HTML prototype approved by Ahmed; **implementation not started**.
**Prepared:** 2026-11-12.
**Goal:** Ship a private, secure, beautiful, iPhone-first PWA for Ahmed and Sama that integrates two-way attention buttons into a single real-time chat, Web Push, family tree, dated milestones, special annual celebrations, editable profiles, and six independently selectable themes.
**Architecture:** React + TypeScript + Vite PWA deployed on Vercel. Supabase Auth/Postgres/Realtime/Storage hold authenticated and shared data. A trusted server-side layer maps the two profile choices to their enrolled email identities and handles OTP and Web Push; database constraints and RLS, not client UI, enforce access.
**Tech stack:** React, TypeScript, Vite, React Router, Lucide icons, CSS design tokens, Supabase JS, date-fns (or equivalent), Vite PWA plugin, Vitest/React Testing Library, Playwright, Supabase SQL migrations and tests, Vercel hosting.
**Spec:** This same document, Sections A–N below; it consolidates the approved Our Space design v1.8 and the interactive iPhone prototype. Do not treat the old standalone demo as secure production code.
**Existing GitHub:** ahmedmohameda7222-ship-it/Semsem (default branch main; initially empty and PUBLIC when plan was authored).
**Supabase:** User has connected an account named semsem with one project; verify the correct project and organization before ANY schema changes. Do not infer that project display name must equal Our Space.
**Language:** All user-facing UI, dates labels, errors, accessibility labels, emails, and notification copy are ENGLISH ONLY.
**Design authority:** The approved Our Space iPhone HTML prototype and the requirements here; keep visual design faithful, but replace simulated data, fake OTP and notifications with real functionality.

## A. Product vision, scope and fixed decisions

This is ONE private application for exactly two people: no public sign-up, no multi-couple community, no public feeds, no App Store native release requirement. Both iPhone users can create/send/receive attention requests. Requests appear as ACTIONABLE CARDS within the same private chat as ordinary messages. Dates do not generate reminder pushes. Birthday dates are profile metadata, not automatically extra celebration days.

The launch scope includes secure login, persistent sessions, full profiles and avatars, 6 themes, attention-button icon picker (at least 36 icon ideas), two-way message and request cards, real-time sync, notification subscriptions and push, dates + 2 special animations, family tree and future children, iPhone PWA install and testing. The prototype also shows a Love Jar; implement basic functional shared Love Jar before declaring feature parity. Memories gallery and chat attachments/voice notes may be delivered as a separately identified follow-on milestone, not silently represented as complete.

All shared data belongs to a single couple record and is accessed only by authorized members. User-level settings and button templates are personal; messages, dates, family members and notes are shared.

## B. Identity and onboarding — do not change these names

| Stable profile choice | Real name | Default nickname | Family role | Date of birth |
| --- | --- | --- | --- | --- |
| sasa | Ahmed | Sasa | Husband | 2002-02-07 |
| semsem | Sama | Semsem | Wife | 2003-12-03 |

Welcome flow: **Our Space** logo/heart + subtitle **Just you, me, and our little world.** → button **Enter Our World** → two large selectors **Semsem** and **Sasa** → first-time **Email OTP** verification → Home. The profile selection is NOT authorization. On returning with a valid refreshed session, bypass the welcome / selection / OTP directly to Home. A valid session may still require re-login after logout, revocation, cleared storage, or a newly installed Home Screen context.

Enrollment: provision exactly two verified/invited Supabase Auth accounts and bind immutable auth_user_id to sasa/semsem in a server-controlled mapping. The emails will be supplied privately at setup, NOT committed to GitHub, hardcoded in frontend JS, or printed in logs. A user may request an email change through a verified account recovery/reverification process in Settings (if implemented). Display only masked registered email on OTP screen.

**OTP practical detail:** Supabase signInWithOtp requires an email and, without customizing the email template with the Token variable, commonly sends a Magic Link. Use a secure backend OTP broker: POST selected profile key → rate-limited server resolves address via non-exposed protected mapping and starts OTP request with shouldCreateUser:false → generic success response → six-digit OTP screen → protected verify endpoint verifies code for selected bound account and establishes a correctly associated client session. Never trust profile key as authentication, never expose the address-to-profile mapping in public JavaScript, and never expose service_role or other secrets. Implement session handoff safely and explain its threat model; use server-side functions or verified design, not a mocked OTP. Persist/refresh session with Supabase and re-check auth_user_id against the stored binding after login. OTP requests should be throttled by account/device/IP where feasible and errors should avoid account enumeration. No shared PIN 0512 in production; 123456 is demo-only.

Test enrollment, expired/wrong OTP, resend, profile swapping, user-mismatch protection, app reload, two-device sessions, explicit logout, revoked session, and email-change recovery.

## C. iPhone-first visual/interaction specification

Primary target: current iPhone Safari/Home Screen PWA, also small screens 320px, 375px, 390px, 430px CSS wide and Pro Max. Safe areas, notch/Dynamic Island, bottom Home Indicator, rounded cards, one-hand operation, minimum 44×44pt effective touch targets, 16px form inputs (avoid iOS zoom), scrolling chat with keyboard, no unintended horizontal overflow, semantic form labels, VoiceOver and reduced-motion support.

Four fixed bottom tabs: **Home**, **Chat**, **Our Dates**, **Our World**. Top-right profile avatar opens Profile / Settings. Our World contains Family Tree, Love Jar and Memories entry. Installable app manifest, icons/apple-touch icon, standalone display, offline shell and accurate offline/error messaging. Prefer CSS/theme tokens rather than a hardcoded pink interface. Layout should stay visually close to approved HTML prototype, with production-quality contrast (especially dark theme).

### All six REQUIRED appearance palettes (both users can choose independently)

| theme_id | Display name | Background | Primary/CTA | Soft | Foreground | Card surface |
|---|---|---|---|---|---|---|
| cherry | Cherry Love | #FFF8F7 | #BA314F | #F4BDCC | #6A2638 | #FFFFFF |
| scarlet | Scarlet Romance | #FFF3F3 | #D7263D | #FFC4D3 | #5B172A | #FFFFFF |
| velvet | Burgundy Velvet | #FAF3EC | #84243F | #D9A5B6 | #3F202B | #FFFFFF |
| sunset | Rosewood Sunset | #FFF7ED | #B93D46 | #F0B6A5 | #5A3030 | #FFFFFF |
| berry | Berry Kiss | #FBF9FF | #B73763 | #F7D3E5 | #59365B | #FFFFFF |
| night | Midnight Romance | #1D1822 | #E95C7D | #68364F | #FBEDF1 | #2C2331 |

Settings → Appearance → Color Palette: swatches for all themes, selected checkmark, live preview, instant switch with no reload, persist by authenticated profile to DB and local cache for first paint. Theme for Ahmed MUST NOT alter Sama's. Every screen, request card, date, badge, error, modal, message, form and icon must respect palette; do not let dynamic button tints make text unreadable. Default theme cherry only if no preference exists. Respect prefers-reduced-motion and allow disabling animations.

## D. Home / attention buttons and icon library

Home: appropriate English greeting with person's editable nickname; avatar shortcut; 2-column large touch-friendly personalized Attention Buttons; prominent **+ Create Button**, favorites/recents where reasonable; nearby next-anniversary countdown. Both users can save their own templates and one-tap send to the other.

Button template data: owner_user_id, title (max around 40), descriptive icon key, theme-aware accent/tint, custom push text (max around 160), favorite flag/order, timestamps. Save/edit/delete only own templates, confirm destructive delete, validate blank/overlong values; deleting template MUST NOT delete already sent chat cards (snapshot content on send). Sending creates a single immutable request snapshot and matching chat entry atomically / transactionally. Prevent accidental double taps and duplicate sends with an idempotency key or equivalent, and show success and possible Undo within a short window only if feasible.

Searchable categorized icon picker with at least 36 usable choices and matching labels (use Lucide icons where available; safe emoji fallback for lips/kiss). Examples:
- Love/affection: heart, heart-handshake, hand-heart, heart-pulse, smile, sparkles, star, gift.
- Closeness: hug, kiss/lips, hand-hold, moon/cuddle, bed, hearts, comfort.
- Communication: phone call, video/FaceTime, message, voice note, headphones/listen, sweet message, bell, camera/selfie.
- Quality time: calendar-heart/date, coffee, film, gamepad, music, map pin, walk, dinner.
- Care: flower, soup, utensils, cake, sun/good morning, moon/good night, cloud-rain/sad, support, laugh.
Search matching both icon labels and keywords. Include an icon preview and a notification preview in the form. Button icons are not tied to a single theme.

## E. One private real-time Chat (no separate request Inbox)

One chronological stream of type=text or type=attention_request, sorted by stable created_at + id; own/partner message bubbles, timestamp, sender nickname/avatar, read state, typing indicator and emoji reactions (simple set). Messaging uses authenticated writes and Supabase Realtime subscription. Optimistic updates with safe dedupe/reconciliation; pagination/scroll restoration for history; no automatic snap-to-bottom when user is reading older messages; offline or failed sends show retry state.

A request is a FIRST-CLASS card with icon, title, custom message, sender, timestamp and status Pending → Seen → Responded. Only the recipient can mark it Responded; recipient can tap action/quick reply (On my way / I love you / Calling now) or explicitly Responded; sending ordinary text must not silently mutate status. Cards and messages synchronize to both devices. Opening a notification goes to /chat and focuses the matching entry. No artificial split into a second inbox.

Push: On ONE newly committed text message or attention request, notify recipient only, never sender; respect permission and subscriptions. Do not send duplicate notifications for request and its associated chat entry. Notifications are real Web Push, sent by a trusted server-side worker, not browser Notification() pretending to reach an offline phone. Multiple device subscriptions allowed; handle expired endpoints.

## F. Our Dates and countdowns

Historical timeline **most recent original date first** and oldest at bottom; visible vertical connector and downward arrow. For events with a date, show title, original date, elapsed time (years/months/days if appropriate) and countdown to next annual recurrence. Use local calendar date for on-device celebrations, including leap-year behavior, daylight saving and year rollover. Never show fabricated dates.

Initial shared seeded records, idempotent:
1. **Our First Kiss** — 2025-02-26 — annual countdown PLUS yearly floating kisses.
2. **Our First Date** — 2025-02-22 — annual countdown ONLY.
3. **Our Anniversary** — 2024-12-05 — annual countdown PLUS 120-second hearts/confetti celebration.
4. **The Day We First Met** — 2024-09-23 — annual countdown ONLY.

Three reserved undated milestones in a separate section (not falsely sorted with dated events): **Our Engagement**, **Our Wedding**, **Our First Born**. Initially no date and no arbitrary countdown. Both users can enter/edit dates later; add custom dates with title, optional notes/photos and repeat-yearly choice, edit/delete user-added entries with confirmation. Reserved placeholders are retained even while undated.

No push reminders for any date. Home shows next date countdown, and Our Dates shows fuller list. Any optional date-specific decoration must not add celebrations to First Met or First Date.

### Celebrations (strict behavior)
- Every **December 5** on fresh foreground app opening: overlay/message **Happy Anniversary!** with correct years since 2024-12-05, red/pink hearts, confetti and sparkles; last 120 seconds and auto-stop. Closing and reopening app on same Dec 5 restarts a full 120 seconds. Nonblocking, pointer-events:none for particle layer, allow normal navigation.
- Every **February 26** on opening/while app visible: **Our First Kiss** message and continuously rising lip/kiss icons and subtle hearts, until app closes/backgrounds or date changes. Restart on reopen that day.
- Sept 23 and Feb 22: countdown ONLY.
- Pause timers when document hidden; clean up all animation loops; reduced-motion fallback uses a static celebratory message rather than continuous animation; optional user animation-off setting.
- No occasion should cause unwanted push notifications or block navigation.

## G. Our World / Family Tree / future children

Family Tree is both CLASSIC (visual parent → child connectors, readable hierarchy) and CUTE (small hearts/animations) in one interactive, responsive layout. Parent nodes: real name **Ahmed** prominent, nickname **Sasa** below, Husband, birthday 07 Feb 2002 and avatar; **Sama** prominent, nickname **Semsem** below, Wife, birthday 03 Dec 2003 and avatar. Display updated nicknames but never replace real names in tree. Pan/zoom or scroll carefully when several children; don't crop offscreen nodes.

Both partners can **Add Child** with name, mandatory gender **Boy or Girl ONLY** (never Not Decided), status default **Not Born Yet**, optional picture. When Not Born Yet birthdate is optional/hidden; when status switches to Born, birthdate becomes required, and the same child record updates without duplication. Dashed node styling for future child. Both can edit/delete (confirm delete) shared children. Do not fabricate children or automatically assign a date to Our First Born placeholder.

## H. Editable profiles, settings, Love Jar and Memories

Sasa and Semsem each edit ONLY their own nickname and profile picture (select from iPhone Gallery, crop, replace, remove); image stored in private Supabase Storage and displayed consistently on Home, Chat, Family Tree and profile. Real name, DOB and role shown read-only by default. Settings: Color Palette, Enable/Disable Notifications, Install Our Space guidance, reduce animation (optional), account email and verified change-email flow, Logout. Both see the partner's changed display nickname/photo in shared UI.

Love Jar: both may create/delete their own positive notes in shared couple space; random **Open a Note** reveals a saved note with tasteful animation and clear author. Persistence and privacy enforced. Memories: an Our World entry with optional small shared photo-and-caption gallery; phase 2 after stable launch unless user explicitly prioritizes it sooner. Chat photos and voice notes also phase 2, distinct from profile and optional date/child photo uploads in MVP.

## I. Data model and access control (server-enforced)

Use SQL migrations committed to repo, with seed/reseed safety, backups and rollback strategy. Proposed normalized schema:
- profiles: auth_user_id PK FK auth.users.id, stable_key enum(sasa,semsem), real_name, nickname, role, dob, avatar_path, theme_id.
- couples: id; couple_members: couple_id, auth_user_id, unique membership, exactly approved two for initial deployment.
- auth_identity_map: profile_key -> auth_user_id plus private auth email mapping; keep addresses in non-exposed schema/server config; no SELECT by anon/authenticated on private map.
- attention_buttons: id, owner_user_id, title, icon_key, accent, default_message, favorite, position, timestamps.
- chat_entries: id, couple_id, sender_user_id, entry_type(text,attention_request), text_content, created_at, client_idempotency_key, read_at or separate per-user receipts.
- attention_requests: id, chat_entry_id UNIQUE, sender_user_id, recipient_user_id, snapshot fields (title,icon,message), status, seen_at, responded_at.
- chat_reactions and typing presence (ephemeral realtime where possible, not persist unneeded typing logs).
- special_dates: id, couple_id, slug UNIQUE per couple for seeded items, title, occurred_on nullable, annual, reserved, celebration_kind none/anniversary/kisses, note, photo_path.
- family_children: id, couple_id, name, gender boy/girl, birth_status not_born_yet/born, birth_date nullable, avatar_path, created_at.
- love_notes: id, couple_id, author_user_id, note, created_at.
- push_subscriptions: id, user_id, endpoint UNIQUE, p256dh/auth encrypted or protected, expires/disabled_at, last_seen_at.
- notification_outbox: idempotent event_id, recipient_user_id, event_kind, payload/chat_entry_ref, delivery status/attempt counters (server-only).

Apply RLS to EVERY public table, deny all unauthenticated reads/writes, ensure only exact couple members can SELECT shared data and only owners edit private template/profile data; never trust client-supplied sender_user_id or recipient_user_id without constraint/validation. Database CHECKs/FKs for valid gender/status and Born requires birth_date. Do not permit client to forge chat events from someone else or mark their own sent request responded as recipient. For privative uploads use separate private buckets/path policies; validate MIME/file-size, revoke deleted assets, and use signed URLs for display. RLS test with both approved accounts and an unrelated third authenticated account. Never expose service role or VAPID private key via VITE_*.

## J. Push / live delivery architecture

Use a trusted, authenticated write to commit chat message/request, enqueue notification outbox exactly once, then server/Edge Function consumes queue and sends VAPID Web Push to registered recipient device endpoints. Prefer durable retries/idempotency over relying on the sender browser to trigger notification. Remove 404/410 subscriptions, retry transient errors safely, avoid sending to sender. Service worker shows push and handles click to /chat?entry=<id>. A profile consent flow registers only after explicit tap **Enable Notifications**, checking support and Home Screen installation; gracefully explain unsupported/denied. Track permission changes, disable/unsubscribe and invalid subscriptions. Web Push on iOS requires supported iOS version (16.4+), installed Home Screen web app, user gesture for permission, HTTPS and OS permission. Delivery can be delayed or suppressed by Focus/network/power settings; do NOT claim guaranteed instant arrival.

Data security: endpoint keys and notification payloads are personal; avoid revealing full private message body on lock screen if user prefers notification privacy. Include a notification text preview toggle if convenient. No automatic event-date reminders.

## K. Delivery order and exact task/check interface contract

Each task below should be implemented test-first, with a failing test or SQL assertion before code, a passing check, then a focused commit. Suggested files are the target structure for the initially empty repo; adjust file extensions/names only with documented reason. Commands must be adapted to the actual package scripts once created. Review the user-facing preview visually after each UI task.

### Task 1 — Bootstrap UI and iPhone shell
**Files:** package.json, index.html, vite.config.ts, src/main.tsx, src/app/App.tsx, src/app/router.tsx, src/styles/tokens.css, src/components/BottomNav.tsx, public/manifest.webmanifest, public/icons/*.
**Interfaces:** route paths /, /welcome, /choose-profile, /verify, /home, /chat, /dates, /world, /profile, /settings/appearance.
- [ ] Define Vite/React/TS and tests; add test that four tabs route correctly and fit 320px without horizontal overflow.
- [ ] Run test and record expected FAIL before implementing.
- [ ] Implement accessible mobile shell and PWA manifest/install UX; no actual auth yet.
- [ ] Run unit tests and Playwright mobile screenshot tests; commit.

### Task 2 — Theme engine: ALL six palettes
**Files:** src/styles/themes.ts, src/styles/tokens.css, src/features/settings/AppearancePage.tsx, src/features/settings/themeStore.ts, src/features/settings/AppearancePage.test.tsx.
**Interfaces:** ThemeId = cherry|scarlet|velvet|sunset|berry|night; setTheme(themeId); active theme in authenticated profile record when available.
- [ ] Failing tests for six IDs, exact color swatches, dark contrast, per-profile independent choices, persistence after route changes.
- [ ] Run red; implement CSS vars/local cache and selection UI.
- [ ] Run green and screenshot all six palettes on iPhone widths; commit.

### Task 3 — Supabase schema, RLS and seed
**Files:** supabase/migrations/<generated-timestamp>_init_our_space.sql (create via Supabase CLI), supabase/seed.sql, supabase/tests/rls.sql, src/lib/database.types.ts.
**Interfaces:** schema in Section I; seed helper idempotently inserts 4 dated rows + 3 reserved milestones for the intended couple only.
- [ ] Write SQL/RLS negative tests first (anon and unrelated user cannot read; one partner cannot impersonate the other; only own button/profile mutations).
- [ ] Run red; create migrations/constraints/indexes; implement seed.
- [ ] Run security tests and Supabase advisors; validate repeat seed does not duplicate; commit.

### Task 4 — Trusted enrollment and real Email OTP
**Files:** src/features/auth/WelcomePage.tsx, ChooseProfilePage.tsx, VerifyOtpPage.tsx, AuthProvider.tsx; api/auth/request-otp.ts and api/auth/verify-otp.ts or protected equivalent; src/features/auth/auth.test.ts.
**Interfaces:** requestOtp(profileKey) -> generic success/failure; verifyOtp(profileKey, code) -> validated session/user profile; protected routes use actual auth_user_id.
- [ ] Fail tests for unauthenticated redirect, wrong/expired code, wrong profile binding, OTP resend rate limit and refreshing session.
- [ ] Implement server-private account lookup, request and verify flow; provision only two auth accounts securely out of repo.
- [ ] Verify real emails privately, both profiles and browser relaunch; commit. No production demo OTP or shared PIN.

### Task 5 — Profile management and avatar storage
**Files:** src/features/profile/ProfilePage.tsx, EditProfileSheet.tsx, src/features/profile/profileApi.ts, src/features/profile/profile.test.tsx, src/lib/storage.ts.
**Interfaces:** updateOwnProfile(nickname, avatarPath); uploadOwnAvatar(file), removeOwnAvatar(); cloud theme on profile.
- [ ] Fail tests for own-only edits, invalid image/size, nickname sync, remove/replace photo; run red.
- [ ] Implement private bucket policies/cropping and profile UI; verify second device receives updates; commit.

### Task 6 — Attention templates and 36+ icons
**Files:** src/features/attention/iconCatalog.ts, AttentionButtonForm.tsx, IconPicker.tsx, AttentionGrid.tsx, attentionApi.ts; tests beside feature.
**Interfaces:** createButton, updateOwnButton, deleteOwnButton, listOwnButtons; sendAttentionRequest(templateId, idempotencyKey).
- [ ] Fail tests for search/category labels, required title, ownership and idempotent double-tap; run red.
- [ ] Implement editor, grid, favorites, notifications preview and atomic request/card send; run green/visual checks; commit.

### Task 7 — Real-time chat and request cards
**Files:** src/features/chat/ChatPage.tsx, ChatComposer.tsx, MessageBubble.tsx, AttentionRequestCard.tsx, chatApi.ts, realtime.ts, tests.
**Interfaces:** sendText(content,idempotencyKey), subscribeToChat(coupleId), markRequestResponded(requestId), markRead(entryId).
- [ ] Fail tests for cross-user message sync, send/receive, ordered mixed entries, unread, request statuses, retries/duplicate events and recipient-only status; run red.
- [ ] Implement text, live stream, requests/quick replies, typing, reactions and scroll behavior; real two-device smoke test; commit.

### Task 8 — Real push notifications for both iPhones
**Files:** public/sw.js or generated PWA service worker; src/features/notifications/NotificationSettings.tsx, pushClient.ts; supabase/functions/send-web-push/index.ts and server-only outbox handler/SQL; tests.
**Interfaces:** subscribePushForCurrentDevice(), unsubscribePush(), enqueueNotification(eventId), deliverRecipientPush(outboxId).
- [ ] Fail tests for sender suppression, one request -> one push, invalid 410 endpoints, duplicate outbox events, permission denied and unsupported browser.
- [ ] Implement server-held VAPID secrets and durable outbox consumer; test tap deep-link and foreground/bkg behavior; commit.
- [ ] Test installed PWA on BOTH physical iPhones with app closed/phone locked before calling push complete; document Focus/permission constraints.

### Task 9 — Our Dates timeline and counters
**Files:** src/features/dates/OurDatesPage.tsx, DateEditor.tsx, datesApi.ts, countdown.ts, countdown.test.ts.
**Interfaces:** getNextAnniversary(originalDate,today), timeSince(originalDate,today); persisted reserved event row has occurred_on=null.
- [ ] Fail tests for exact seed dates, descending order, undated reserved section, anniversary rollover, Feb 29 policy, leap years and cross-year countdown.
- [ ] Implement date management, timeline arrow and Home next-date card; verify no date notifications; commit.

### Task 10 — Anniversary and First Kiss celebrations
**Files:** src/features/celebrations/CelebrationManager.tsx, AnniversaryOverlay.tsx, FloatingKisses.tsx, calendar.ts, tests.
**Interfaces:** getCelebration(localDate) -> anniversary|kisses|none, show anniversary 120s on every fresh app foreground opening.
- [ ] Fail tests for Dec 5 exactly 120 seconds, Feb 26 active only while visible, Feb 22 / Sep 23 no animation, reopening, timer cleanup, reduced-motion.
- [ ] Implement pointer-events:none particles, non-blocking navigation, CPU/battery-aware scheduling; visual QA; commit.

### Task 11 — Family Tree and child editor
**Files:** src/features/family/FamilyTreePage.tsx, AddEditChildSheet.tsx, FamilyConnections.tsx, familyApi.ts, tests.
**Interfaces:** saveChild({name,gender:boy|girl,status:not_born_yet|born,birthDate?}); listCoupleChildren().
- [ ] Fail tests for real names + nickname subtitles, genders ONLY boy/girl, Not Born Yet default, missing DOB when Born, duplicate prevention, shared editing, many children on 320px.
- [ ] Implement classic connectors + cute flourishes and private child avatar; iPhone layout QA; commit.

### Task 12 — Our World / functional Love Jar
**Files:** src/features/world/OurWorldPage.tsx, LoveJarPage.tsx, loveJarApi.ts, tests.
**Interfaces:** createOwnLoveNote(text), listCoupleNotes(), openRandomNote(), deleteOwnLoveNote(noteId).
- [ ] Fail tests for empty notes, shared read, only author deletes, random open among available notes; run red.
- [ ] Implement and style; keep Memories entry clearly labeled phase 2 if gallery not shipped; commit.

### Task 13 — Cross-device E2E, deployment, privacy and release gate
**Files:** tests/e2e/*.spec.ts, tests/security/*, README.md, .env.example, vercel.json when routing demands it, docs/DEPLOYMENT.md, docs/QA.md.
- [ ] Set up Vercel project linked to the EXISTING Semsem GitHub repo; configure HTTPS, SPA fallback, Supabase redirect allow list, domain settings and Vercel environment variables using connector/secure settings, not commits.
- [ ] Validate static/client variables (only publishable Supabase key in VITE_*); server-only secrets VAPID private key, OTP-broker credentials, service role never bundled.
- [ ] Test production and preview routes, OAuth/OTP returns if any, refresh on deep routes, service worker updates, offline shell, install as Home Screen icon.
- [ ] Perform RLS negative tests against unrelated authenticated user and owner mismatch; upload/URL policy tests; no public chat/media read.
- [ ] Physical iPhone Safari tests for both users: OTP → Home Screen install → persistent login → real chat both directions → real push with receiver app closed → notification click opens correct card → birthdays/child/profile/theme/date synchronization → animations on simulated relevant calendar dates.
- [ ] Run lint, typecheck, unit tests, integration tests, build, Playwright mobile tests and security advisors; record actual outputs in docs/QA.md, fix failures, commit.
- [ ] Deliver production URL, installation instructions for both iPhones, verified GitHub commit(s), Supabase project ID, and concise checklist of working vs deferred features.

## L. Global acceptance and security gates

Do NOT describe the project as finished if any core requirement remains simulated. Completion means:
- Exactly two verified accounts, no open account registration or weak shared PIN; returning PWA user not repeatedly prompted.
- Both users see one secure shared chat with live text and action request cards; correct sender/recipient; no duplicate push.
- Real Web Push works on both installed supported iPhones after permissions; graceful fallback on unsupported/denied devices.
- Both independently customize nickname, avatar, theme; family tree always shows Ahmed and Sama as real names.
- At least 36 icons, searchable, editable per-user buttons, working send and response flow.
- Four exact historical dates, annual countdowns, three undated reserved milestones, arrow-down historical order.
- Anniversary Dec 5 exactly 120 seconds per opening; First Kiss Feb 26 visible-duration kisses; First Met/First Date countdown only.
- Family tree shows father/mother with future children, boy/girl only, optional DOB until born.
- All six exact palettes independently persist and preserve readable light/dark contrast.
- Core iPhone widths and hardware safe areas pass; no secrets, private email addresses or uploaded pictures in public repo.
- No undisclosed gaps: phase-2 Memories/photo-chat/voice-note features explicitly documented if deferred.

**Critical privacy note:** GitHub repo was PUBLIC when this plan was written. Recommend converting it to PRIVATE before upload of app media or personal data; never commit credentials, actual login emails, OTPs, private photographs or Supabase service keys. Vercel deploy preview protection should be configured if supported; frontend/DB auth and RLS must remain secure regardless of obscurity.

## M. Review focus — must be tested in owning task

1. **Session/profile confusion:** signed in as Ahmed while choosing Semsem cannot gain her identity (Task 4).
2. **Notification duplication/misrouting:** single request leads to exactly one event sent only to other user even on retry (Tasks 6–8).
3. **Date boundary/leap year:** yearly anniversary countdown works on Feb 28/29, Dec 31 and timezone changes (Task 9).
4. **Dark palette and keyboard:** Midnight Romance text/input contrast and iPhone chat composer remain usable with onscreen keyboard (Tasks 2,7,13).
5. **Stale/deleted media + storage privacy:** previous avatar/image paths cannot be publicly fetched or swapped by other user (Tasks 3,5,13).

## N. Delivery workflow for next implementation agent

1. Read this ENTIRE plan and the approved standalone interactive HTML preview if available. If prototype cannot be accessed, treat Sections A–M as source of truth; do not fabricate content.
2. Inspect the existing repository and Supabase project FIRST; determine correct project IDs, access and state. The GitHub repo name stays Semsem but app-facing brand is Our Space.
3. Work in small commits/PRs, tests before implementation, no broad rewrites. Make architecture choices explicit if needed; prefer the simplest secure production approach.
4. Build and verify progressively, do not just create attractive placeholder pages. Use GitHub, Supabase and Vercel connectors directly where authorized.
5. Never ask the user to paste secrets into chat; use secure connector setup for private auth email enrollment and secrets. Only ask for the two real email addresses when truly necessary, and avoid echoing them publicly.
6. Keep the user informed of completed stages and evidence. Final answer must show source GitHub paths, deployment URL and real iPhone test status, distinguishing verified features from those requiring the two physical devices.

## Reference documentation (verify current versions at implementation)

- Supabase passwordless email sign-in: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase email OTP template: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase security/data API: https://supabase.com/docs/guides/api/securing-your-api
- Apple WebKit push for Home Screen web apps: https://webkit.org/blog/13878/
- Vercel Vite framework: https://vercel.com/docs/frameworks/frontend/vite
- Vercel environment variables: https://vercel.com/docs/environment-variables

**Plan-only change:** This document must be committed first. Do not provision accounts, deploy, or mutate Supabase as part of writing the plan itself.
