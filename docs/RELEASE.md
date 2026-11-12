# Release and device checks

The production Vercel project is `ahmed-s-projectssasa/our-space`. The intended Supabase project is `dthmpdsyxqnfsdaoicvm` on the connected semsem account. The database migration installs the two-slot profile allowlist, private photo storage, Realtime policies, and the push outbox. The four historical dates and three reserved milestones were seeded directly in Supabase.

## Enrollment and protected settings

1. Keep public Supabase Auth signups disabled. Our Space currently uses the two enrolled accounts and their existing passwords. To restore OTP later, configure the email provider and six-digit template, set both `OUR_SPACE_AUTH_MODE` and `VITE_OUR_SPACE_AUTH_MODE` to `otp`, then redeploy.
2. Create the two approved users in Supabase Authentication using their private email addresses, and confirm their emails through the authorized enrollment flow. Run the private enrollment SQL in the Supabase SQL editor with their assigned Auth UUIDs. The SQL assigns the two profile slots and creates their initial love buttons. Keep the completed SQL local.
3. In the Vercel project settings, add a sensitive production variable named `SUPABASE_SERVICE_ROLE_KEY` with the server-only key from this Supabase project. Redeploy the production build. Keep the key out of `VITE_*` variables.
4. Enable notifications on the first enrolled device. Registration creates the Supabase Cron retry job and stores the Vercel worker credential in Vault. Chat triggers an immediate attempt and the schedule processes due retries even when both apps are closed.

## Install on both iPhones

Open the production URL in Safari, tap Share and Add to Home Screen, then open Our Space from its icon. Select your own profile and sign in with your existing account password. Open your profile and choose Notifications, then Enable Notifications. Use iOS 16.4 or later.

Verify the following with the two enrolled devices.

- Reopen both apps and confirm the session persists.
- Send a text and an attention request in each direction with the receiving app closed and the phone locked. Check that each notification opens the matching chat item and only the recipient gets it.
- Check read receipts, quick replies, reactions, typing, and independent themes with both apps open.
- Test private profile and child photo uploads, the chat keyboard, Home Screen safe areas, and notification disable.
- Confirm changing a date does not notify either user.

Chat supports private photos, voice notes with elapsed time, and a shared Memories gallery. Incoming calls are stored for 45 seconds and can be recovered from a call notification. Answer and Decline are inside the installed web app. While a call is connected, both participants renew its lease. Expired calls are marked missed or ended and their SDP is cleared.

## Voice relay setup

The protected `/api/voice` endpoint uses Cloudflare Realtime TURN when both `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` are set in Vercel Production. Create a TURN key in Cloudflare Realtime and store its ID and token as sensitive server-side variables, then redeploy. The endpoint returns short-lived ICE credentials only to an enrolled profile. The relay status in the authenticated response is `true` only when the provider returns TURN endpoints.

Without these variables, calls use direct ICE with STUN and can fail on networks that require a relay. Test with one iPhone on Wi-Fi and the other on cellular, then with both phones on different Wi-Fi networks. Verify two-way audio, cancellation, decline, a missed call, and return to Chat during an active call. iPhone Web Push opens the invitation. Native lock-screen answering and continuous background call behavior require a native iOS integration.
