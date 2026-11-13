# Voice calling reliability audit and remediation

## Current architecture
Our Space is a React PWA with browser WebRTC; Supabase voice_calls row + Realtime + 1.5s polling for SDP/candidates; Cloudflare TURN credentials from authenticated Vercel /api/voice. Current code ends on ICE "failed" with no ICE restart and briefly drops the UI to Connecting on each "disconnected". The initial call and its candidates are appended to the same row. Backend calls can expire if a browser is suspended.

## Observed evidence (2026-11-13)
Production shows 19 call attempts in 24h, 2 calls logged as WebRTC connected (recording may be incomplete); Cloudflare key/token names exist in Vercel, but this does not prove the credentials work or that the selected ICE route uses relay. Production runtime logs do not include enough connection-level telemetry to classify individual failures. Never show or log keys, tokens, SDP, candidates, IP addresses or private call content.

## Chosen remediation (existing stack, no service swap)
1. Persist authenticated ICE restart requests/offers/answers with generation-safe Trickle ICE; preserve existing RPCs for old iPhone PWA builds; no automatic new ringing call.
2. On short disconnect keep the call UI calm; after a grace period attempt bounded recovery and retain the media stream and call history identity. Disconnect/failed must not cause instantaneous termination; if repeated recovery attempts fail, clearly end.
3. Configure AudioSession 'play-and-record' when supported, monitor microphone interruptions and reacquire audio when foreground resumes where allowed. Never tell users the PWA can reliably capture from locked iOS screen: that requires a native audio/call architecture on some OS versions.
4. Show true selected candidate path based on getStats, not merely existence of provider credentials. Keep TURN diagnostic server-validated and redact all secrets.
5. Add regression tests: real Chromium renegotiation, client policy/microphone/route logic, SQL authorization and generation; lint, build, mobile browser.
6. No retroactive changes to call logs, no unexpected privacy or media recording.

## Architecture boundaries / limitations
Network relays help NAT/firewall traversal but do not override browser OS suspension or physical network loss. User-visible fallbacks are explicit, no false 100%-reliable claim.
