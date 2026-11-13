# Private Intimate Requests — Approved Feature

**Scope:** One private section within the existing Our Space Love Buttons page for the same two enrolled adult partners. Preserve existing Love Buttons, messaging, reactions, push, themes, identity and user data.

**Interaction:** Three compact categories (Direct & Intimate, Flirty & Teasing, Romantic & Private), each with five curated requests. Tapping a tile opens a private composer instead of immediately sending. The sender can edit a short personal message and must explicitly tap Send; Cancel is always available. Reply in chat remains optional. Avoid timers, pressured responses, and automatic acceptance.

**Privacy:** Every intimate request is marked server-side is_private=true and only authorized paired accounts can read it through existing RLS. On lock screens, its push content contains only the sender nickname and a neutral Private Request notice; never the request's title, sexual content, message, or any subsequent linked reply. Opening the notification deep-links to the original chat entry. Unmarked chat messages and existing ordinary Attention Requests retain their rich notifications.

**Data:** Store each intimate request as a chat_entries row with title/icon/tint and is_private=true, using a new authenticated RPC with a server-side list of request codes and permission check. Keep stable UUID idempotency/retries. No separate table, duplicate account, additional permissions, or historical data rewrites.

**Mobile:** Use current six theme tokens and cards. At 320, 375, 390, 430 CSS pixels avoid overflow and preserve 44px accessible touch actions. Do not autoplay explicit text or expose it in service-worker logs.

**Acceptance:** Unit tests for approved templates, private notification redaction and normal notification non-regression. SQL rollback tests for authenticated pair, outsider denial, invalid codes, exact retries, and linked reply privacy. Playwright composer flow with mobile width checks. Full CI before main merge and production verification after.
