# Push notifications: Phase 1A

## Boundary and enrollment decision

This release is a disabled foundation, not a notification rollout. No event triggers or real push delivery are enabled. Authenticated registration of a browser-generated PushSubscription is sufficient for this private application: Cloudflare authentication, the authoritative active account gate, same-origin write checks, explicit browser consent, server-derived ownership and globally unique endpoints form the boundary. A push-delivered challenge would add state and an extra delivery without materially addressing a demonstrated threat here. Subscription endpoints and keys are credentials; never copy, log or expose them in status APIs. Registration cannot transfer an endpoint between accounts, and unknown request fields (including submitted owners) are rejected.

The pinned MIT library `@block65/webcrypto-web-push@2.0.0` constructs RFC 8291 AES128GCM payloads and RFC 8292 VAPID signatures using Web Crypto. Synthetic tests run in the existing Workers compatibility date without Node flags, independently decrypt payloads and verify signatures, and replace all provider networking with mocks. Transport uses manual redirects: provider redirects are failures, never followed. Enrollment accepts HTTPS Apple, FCM and Mozilla production push hosts only; expanding that list requires review. No hand-written production Web Push cryptography is introduced.

## Storage and API

Migration `0009_push_notifications.sql` is additive and seeds nothing. `push_subscriptions` references `app_users` restrictively, permits up to ten devices per account through atomic registration, and stores a unique endpoint, browser keys, VAPID key identifier, label, enabled state, expiry, timestamps, revision and bounded result/failure fields. List responses contain only display/status fields. `notification_preferences` stores an account's versioned allowlisted categories (chat, polls, dinner, calendar, family_dates, vehicles), all default off, and a test-send cooldown. No preference controls imply that unimplemented triggers exist.

Every endpoint is centrally account-gated:

- `GET /api/notifications/config`: rollout flags and public VAPID configuration only when eligible.
- `GET /api/notifications/subscriptions`: sanitized own-device list.
- `POST /api/notifications/subscriptions`: explicit browser registration, separately rollout-gated.
- `DELETE /api/notifications/subscriptions/:id`: own-device detach, still available when rollout is off; foreign/missing IDs are harmless idempotent responses.
- `GET/PATCH /api/notifications/preferences`: own allowlisted preferences with optimistic revision.
- `POST /api/notifications/test`: own device ID only; separately rollout-gated, fixed generic content, one request/account/minute, TTL 300 seconds.

The sender rechecks active account, active person, bound identity, enabled device and revision immediately before dispatch. Disabling an account suppresses sends. Identity replacement invalidates subscriptions transactionally via a trigger; first binding does not. Already accepted provider requests cannot be recalled. 404/410 deletes only that expired device; 401/403 retains it and reports configuration failure; 429/5xx/network errors are temporary. No response bodies, endpoints, keys or tokens are logged. No retry queue exists.

## Browser and privacy

The Notifications link opens a settings page without adding a bottom-navigation item. No permission request occurs on page load or service-worker registration. iPhone/iPad Home Screen installation, browser support, permission and rollout states are distinct. Actual iPhone delivery and Access-expiry behavior require the later physical-device pilot.

`/sw.js` is notification-only and served with no-cache revalidation. Only validated version-1 payloads and Home/Chat destinations are accepted; invalid payloads show generic content and route Home. Same-origin navigation never bypasses Access. Preserve the manifest identity and this stable worker URL across releases. Lock-screen content must remain generic unless separately approved; the manual test is **Miszuk Family / Test notification**. No chat text, calendar details or survey responses are sent.

Explicit Sign out attempts server detachment and browser unsubscribe first. Partial failure is reported with retry/continue choice; never silently claim cleanup succeeded. The browser stores only its account/device IDs as a local marker, never endpoint/key material. Another account cannot inherit server ownership; an unmatched browser subscription is unsubscribed before explicit fresh enrollment. Shared-device users should disable notifications before sharing the device; a failed detach or already accepted notification cannot be recalled.

## Rollout and VAPID

Production defaults in `wrangler.jsonc`:

- `NOTIFICATIONS_ENROLLMENT_ENABLED=false`
- `NOTIFICATIONS_SENDING_ENABLED=false`
- `NOTIFICATIONS_ALLOWED_USER_IDS` empty
- `VAPID_SUBJECT=mailto:bob@miszuk.com`

Both gates also require exact account-ID allowlisting and all VAPID fields. Administrator role is not a rollout grant. Turn sending off to stop new dispatches; turn enrollment off independently to prevent registration. Preserve these settings in any emergency release.

Production key creation is deferred to Phase 1B. The operator will generate one stable P-256 VAPID pair using a reviewed tool, store the private key as the Worker `VAPID_PRIVATE_KEY` secret and recoverable Bitwarden/break-glass material, and configure `VAPID_PUBLIC_KEY` plus a stable nonsecret `VAPID_KEY_ID`. The adapter expects the base64url raw uncompressed public point and base64url private JWK `d`. Never put private values in Git, command transcripts or documentation. Do not generate keys during deployment. Document credential location and independent recovery access, not values. Key rotation requires deliberate re-enrollment; key-ID mismatches are rejected.

## Backup, rollback and next phase

Before the remote migration, privately export D1, restore it locally, compare every existing table fingerprint and run integrity/FK checks. Apply the migration transactionally, then confirm old data unchanged (apart from its migration ledger) and new tables empty. Backups now contain push credentials and must remain private.

For application rollback, retain the additive tables/trigger and disable both switches. Do not restore an old database just to roll back code. Retain this compatible `/sw.js` asset and its headers even if restoring pre-notification frontend assets; an installed worker outlives an application release. It never caches or fetches family data, so it cannot revive old application access. Preserve the tested account-aware maintenance recovery Worker, existing Access bindings and assets; it denies family APIs safely while an account-aware forward fix is prepared. Never fall back to pre-account enforcement.

Phase 1B needs explicit authorization, stable VAPID recovery, Bob's stable account-ID allowlist, and a physical iPhone Home Screen pilot. Test consent, delivery, click routing, expired Access, device disable/sign-out and revocation before wider availability. Do not enable any of these as part of Phase 1A. Family event triggers, retries, category UI, quiet hours and other notification features remain deferred.
