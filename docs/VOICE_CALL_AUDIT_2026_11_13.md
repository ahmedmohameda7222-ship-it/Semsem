# Our Space — Voice Call Reliability Audit
Date: 2026-11-13

## Scope and evidence
Inspected React WebRTC call lifecycle, Supabase call RPCs, versioned candidate signaling, Cloudflare TURN credential broker, Vercel production environment variable presence, CI tests and production call history. No call content, device IPs, token values, SDP or user identities were copied into this audit.

**Database observation:** 19 call attempts over the prior 24 hours, of which 2 had a successful `mark_voice_connected` timestamp. This is a *logging indicator*, not a scientific call-completion rate; a connected call can lack a timestamp when its RPC fails. Recorded connected attempts averaged about 10 seconds from creation to connection. Per-device ICE error data is not currently retained.

**Relay observation:** Both required Cloudflare TURN variable **names** are present and scoped to Vercel Production. This does not prove they match or that the deployed client selected a relay candidate. Do not claim the TURN relay is verified without an authenticated connection test.

## Findings and status

| Priority | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| P0 | ICE `failed` ended a live call immediately | Original `VoiceCall.tsx` callback called `end()` | Bounded ICE restart negotiation within same call, no re-ring |
| P0 | Locked iPhone microphone cannot be guaranteed in installed PWAs | WebKit iOS issues 226620, 239602, 241480; recent 2026 WebView reports | Set AudioSession play-and-record when available, detect muted/ended tracks, foreground reacquisition; **native iOS CallKit/AVAudioSession required for reliable lock-screen behavior** |
| P1 | Short `disconnected` switched UI to Connecting and armed an 18 s end timer | Existing connection-state handler | Grace period, stable connected UI, recovery watchdog and explicit warning |
| P1 | No renegotiation signaling after network change | Existing voice RPCs only carried original offer/answer | Authorized generation-numbered request/offer/answer, versioned candidates, reuse call ID |
| P1 | Cloudflare short-lived TURN credentials were only obtained at initial setup | Existing `requestVoice('ice')` used once per call | Refresh credentials at restart on **both** peers when provider is available |
| P1 | Call setup fetched microphone and TURN serially | Existing `connect()` awaited them sequentially | Parallel startup with media cleanup on failure/cancellation |
| P1 | 'Secure relay ready' described availability, not selected route | Existing UI used a provider-response boolean | Use selected ICE candidate stats; distinguish direct vs relayed |
| P2 | Intermittent microphone source loss after backgrounding | Existing mic capture had no track-interruption handling | Best-effort source replacement on foreground with explicit Restore button |
| P2 | Operational telemetry insufficient to attribute all production failures | No per-call client ICE failures recorded server-side | Future privacy-preserving diagnostic opt-in; never persist private SDP/IP/voice |

## Changes
1. `public.recover_voice` and `public.push_voice_candidates_v2`: strictly participant-authorized, generation-checked, old signatures preserved.
2. Terminal call transitions clear recovery SDP. SQL tests run inside rollback transactions and prove outsider rejection, stale generation rejection and SDP cleanup.
3. The caller owns restart offers to prevent glare; the recipient requests a restart and answers the new offer. Both sides keep the existing call ID, audio track and call history.
4. iOS supported AudioSession `play-and-record`, audio constraints for echo cancellation/noise suppression and foreground microphone recovery.
5. Bounded attempts and visible failure reason rather than an indefinite spinner.

## Verification
- Supabase SQL rollback fixture: PASS.
- GitHub Actions checks on feature branch: unit tests, lint, TypeScript/build and Chromium mobile browser suite.
- Real Chromium ICE restart test verifies new ICE credentials without closing a working data channel.
- Real-user cross-network call quality and iPhone lock-screen microphone survival **remain unverified** until tested on both devices.

## Mandatory device acceptance matrix
Test signed-in devices with actual TURN on:
- iPhone PWA to iPhone PWA on different Wi-Fi/cellular networks; verify two-way speech in both directions, ringing, and hangup.
- Wi-Fi→cellular and cellular→Wi-Fi transitions mid-call; verify the same call stays active and has no forced re-ring.
- 20-minute call; check relay diagnostics and microphone input after brief app switches.
- Lock each iPhone for 30 seconds, 2 minutes and 5 minutes; check if the **other device still hears the microphone**. A PWA failure here is an OS/browser limitation, not evidence that TURN is bad.
- Audio route to Bluetooth and back; another telephone call interrupts; recover when returning to foreground.
- Capture the safe TURN status ('ready', 'invalid_key' etc.) and selected route ('TURN relay route' vs direct) only, no credentials.

## Platform limit
Messenger uses a native app integrated with iOS audio/background execution. There is no web-only JavaScript option that makes an installed iPhone PWA hold a microphone reliably while the screen is locked across OS versions. For that requirement, build a native iOS client with CallKit/AVAudioSession and native WebRTC or an equivalent supported calling SDK. This repository remains a web PWA.
