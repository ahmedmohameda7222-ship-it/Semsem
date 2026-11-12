# Our Space — Mobile performance and Egypt verification

This document separates repeatable synthetic checks from real-device verification.

## What the automated pipeline measures

- Chromium iPhone-sized (375/390 CSS px) first-load and profile-picker responsiveness.
- Asset latency injection (650 ms) to exercise delayed CDN resources.
- A separate simulated mobile connection: 320 ms round-trip latency, 160,000 bytes/sec down (roughly 1.3 Mb/s), 50,000 bytes/sec up.
- User-interaction latency once the application has loaded.
- Narrow-screen overflow and functional chat, voice recording and call controls.
- Build, TypeScript, ESLint and unit tests.

Measurements run on GitHub's hosted runner. They are **not measurements from Egypt**; geography, operator policies, cellular congestion and iOS hardware can differ.

## What was optimized

- Audio message files set `preload="none"`; pressing Play starts streaming promptly.
- Private attachment signed URLs are obtained only when an attachment nears the viewport, preventing off-screen chat history from generating avoidable requests.
- Audio visualization decodes at most 8 MiB **on demand after Play** and samples a bounded amount of data per waveform bar; a waveform decoding failure does not stop audio playback.
- Microphone waveform is drawn to a canvas at a capped redraw rate, not through repeated React re-renders.
- Existing PWA caches its versioned app shell, so returning visitors can reopen the UI even when temporarily offline.

## Real-life acceptance test: Germany ↔ Egypt

On two iPhones, use the production installed Home Screen PWA at https://sasa-semsem.vercel.app.

1. From Egypt, start on normal cellular data. Open the app cold and record the time to reach Home and Chat. Repeat on weak Wi-Fi.
2. Send and receive text and attention requests with the network throttled or intermittently disconnected. Verify no accidental duplicate sends and visible retry states.
3. Record a 10–20-second voice note, observe the live recording waveform, send it and play it back. Ensure the waveform displays distinct real peaks, shows progress and allows seeking.
4. Place voice calls in both directions between Germany and Egypt on different networks. Verify two-way speech, incoming ring, outgoing ringback, answer/decline and minimize-to-chat.
5. Lock both phones, confirm notification links open the right conversation or call, and note that a PWA cannot guarantee native background calling.
6. Try power-saving/Low Data Mode; confirm missing audio permission and connectivity errors are understandable rather than silently failing.
7. Reopen the installed PWA after the release to confirm the new service worker and cached bundle activate.

**Release gate:** Do not claim Cairo or Egypt performance has been validated until a physical device located there has been tested. Also, STUN-only WebRTC can work on some networks but a TURN relay remains the robust fallback on restrictive NATs.
