# Push notifications: foundation and Bob-only pilot

## Boundary and enrollment decision

Phase 1A introduced the disabled foundation. Phase 1B enables only Bob’s manual enrollment/self-test pilot described below. No automatic event triggers are enabled. Authenticated registration of a browser-generated PushSubscription is sufficient for this private application: Cloudflare authentication, the authoritative active account gate, same-origin write checks, explicit browser consent, server-derived ownership and globally unique endpoints form the boundary. A push-delivered challenge would add state and an extra delivery without materially addressing a demonstrated threat here. Subscription endpoints and keys are credentials; never copy, log or expose them in status APIs. Registration cannot transfer an endpoint between accounts, and unknown request fields (including submitted owners) are rejected.

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

Phase 1A disabled baseline / emergency kill-switch configuration:

- `NOTIFICATIONS_ENROLLMENT_ENABLED=false`
- `NOTIFICATIONS_SENDING_ENABLED=false`
- `NOTIFICATIONS_ALLOWED_USER_IDS` empty
- `VAPID_SUBJECT=mailto:bob@miszuk.com`

Both gates also require exact account-ID allowlisting and all VAPID fields. Administrator role is not a rollout grant. Turn sending off to stop new dispatches; turn enrollment off independently to prevent registration. Preserve these settings in any emergency release.

Phase 1B creates one stable P-256 VAPID pair using Web Crypto. The private key is a Worker `VAPID_PRIVATE_KEY` secret with a user-confirmed Bitwarden recovery record; `VAPID_PUBLIC_KEY` and the stable nonsecret `VAPID_KEY_ID` are deployment configuration. The adapter expects the base64url raw uncompressed public point and base64url private JWK `d`. Never put private values in Git, command transcripts or documentation. Do not generate keys during deployment. Document credential location and independent recovery access, not values. Key rotation requires deliberate re-enrollment; key-ID mismatches are rejected.

## Backup, rollback and next phase

Before the remote migration, privately export D1, restore it locally, compare every existing table fingerprint and run integrity/FK checks. Apply the migration transactionally, then confirm old data unchanged (apart from its migration ledger) and new tables empty. Backups now contain push credentials and must remain private.

For application rollback, retain the additive tables/trigger and disable both switches. Do not restore an old database just to roll back code. Retain this compatible `/sw.js` asset and its headers even if restoring pre-notification frontend assets; an installed worker outlives an application release. It never caches or fetches family data, so it cannot revive old application access. Preserve the tested account-aware maintenance recovery Worker, existing Access bindings and assets; it denies family APIs safely while an account-aware forward fix is prepared. Never fall back to pre-account enforcement.

Phase 1B is now production-verified on Bob's physical iPhone. Enrollment, locked-phone delivery with the PWA closed, notification display, tap-to-open/focus behavior, disable/removal, re-enable, and a subsequent test notification all passed. The pilot remains Bob-only; family-wide rollout, automatic triggers, retries, category UI and quiet hours remain deferred.

## Phase 1B — Bob-only manual pilot

Enrollment and self-test switches are enabled only in conjunction with the exact allowlist `2f1e9ed4-a0cb-433b-a30b-5aeab0138b30` (Bob’s existing active, bound application account). Administrator role is irrelevant. Every other account remains ineligible, including any future Administrator. No automatic Chat, Dinner, Calendar, poll, birthday or Vehicle notification exists. No migration or account mutation is required.

The stable key ID is `miszuk-push-2026-09-30-v1`; contact remains `mailto:bob@miszuk.com`. Initial setup used an ephemeral loopback-only operator handoff: Web Crypto generated the pair in memory, Bob copied the recovery record directly into Bitwarden and confirmed saving it, then the helper uploaded the private key to the Worker secret. No plaintext private-key file or repository entry was created. The helper was stopped afterward. The vault save is operator-confirmed, not independently inspected by the application or AI.

Recovery source: the Bitwarden Secure Note **Miszuk Family — Production Web Push VAPID**, containing the matched private/public pair and key ID. An authorized successor must be able to unlock that vault through the family’s independent break-glass arrangements. The exact emergency-access/MFA mechanism is maintained outside this repository; this release does not independently verify it. Do not rely on the portal or family email alone to recover the vault.

To restore: first disable both rollout switches. Retrieve the existing matched record through authorized Bitwarden access. Using Cloudflare’s secret editor or interactive `wrangler secret put VAPID_PRIVATE_KEY`, restore the private value without putting it in command arguments, logs, chat or files. Restore the matching public key and key ID in configuration, verify the key-ID/public-key match, and re-enable only the exact Bob account allowlist. Cloudflare does not return a stored secret’s plaintext. Never generate a replacement merely because a deployment credential expired. If the recovery record is irretrievably lost, stop sending; deliberate key rotation and device re-enrollment require a separate operator action.

Rollback checkpoint: `pre-push-phase1b-2026-09-30` at `87e6a9c`. Redeploy that checkpoint to restore both false switches and an empty allowlist, retaining the private secret, notification tables and `/sw.js`. Do not delete accounts, subscriptions, or restore D1 to roll back this pilot. The kill switches stop new sends/enrollment; a push already accepted by a provider cannot be recalled.

### Physical iPhone acceptance test (operator performs after deployment)

1. Use an iPhone running iOS 16.4 or later. In Safari open `https://family.miszuk.com`, sign in as Bob, use Share → Add to Home Screen (enable Open as Web App if offered), and retain the Miszuk Family name/icon. An existing installed copy may be reused. Launch from its Home Screen icon.
2. Open Notifications, tap **Enable on this device**, and choose **Allow** in the iOS prompt. Expect Enabled on this device and one iPhone entry. If permission was previously denied, change Miszuk Family notification permissions in iOS Settings before retrying. Do not repeatedly request permission.
3. On a desktop browser signed in as Bob, open Notifications after iPhone enrollment (reload if already open). No desktop enrollment is needed. Confirm the iPhone appears under Your devices.
4. On iPhone return to the Home Screen and lock the phone. On desktop select **Send test to iPhone**. Expect **Miszuk Family / Test notification** on the locked iPhone. The sender reports provider acceptance, which alone is not delivery proof. If absent, check network, notification permissions, Focus/Scheduled Summary and lock-screen alert settings; wait at least one minute before another test.
5. Tap the notification and unlock. Expect the installed family portal to open/focus Home. If Access has expired, complete the normal email-PIN flow; no bypass is provided. To test expiry, let the session expire naturally—explicit Sign out intentionally detaches notifications.
6. In iPhone Notifications select **Disable on this device**. Expect Disabled and no device entry after refreshing desktop settings. Existing Notification Center entries can remain and should be cleared manually.
7. Select **Enable on this device** again on iPhone. Expect one fresh active device entry, not duplicates. Repeat the desktop-triggered locked-phone test after the one-minute cooldown. Existing permission may mean no second permission prompt.

The desktop test controls list only the authenticated account's sanitized devices. They never send as another user or expose endpoints/keys. Enrollment waits for service-worker activation and is disabled where platform support, Home Screen installation or permission is missing. Bob's physical-iPhone acceptance is complete and production-verified; future changes must preserve this tested path.

Platform references: [Apple Home Screen installation](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) and [WebKit iOS Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
