# Push notifications: Birthdays and Family Chat

## Current status and remaining acceptance

Deployed at `4d3b89c`: push infrastructure, voluntary family enrollment, Birthdays and Family Chat. Bob’s physical-iPhone foundation pilot passed and was recorded at `0ede46c`; do not repeat that pilot as unfinished implementation. Remaining real-device verification is **Chat between two family members** and **the first naturally scheduled birthday**. Confirm recipient/author behavior and Chat tap routing for the former, and 8 AM Chicago timing, duplicate suppression and Home tap routing for the latter. The category release passed 137 tests, lint/build and authenticated desktop/mobile browser verification; no production test messages or birthdays were created.

## Current categories

Birthdays and Family Chat are the only automatic categories. Their account-wide switches default **On** when no explicit value exists; saved opt-outs remain off. Device enrollment remains separate, voluntary and explicit. No other category is shown or triggered.

- **Birthdays:** active Directory birthdays use the same America/Chicago date and February 29 rules as Home. At 8:00 AM, send **Birthday today / It’s [first name]’s birthday today.** Tapping opens Home.
- **Family Chat:** after a new message commits, background delivery sends **Family Chat / [first name] posted a new message.** to eligible accounts other than the author. Tapping opens Chat. Message text is never included. Edits do not trigger notifications; notification errors cannot roll back the post.

### Scheduling and delivery guarantees

Cloudflare Cron runs `0 13,14 * * *` UTC; the handler proceeds only when the scheduled instant is 8 AM America/Chicago. This handles standard/daylight time without changing the schedule. There is no public scheduling endpoint. Wrangler deploy synchronizes the configured triggers; API-based deployment must also update the Worker's schedules. Schedule propagation can take up to 15 minutes.

Migration `0010_notification_deliveries.sql` adds an event/account claim ledger. Birthday keys contain the Directory person ID and local date; Chat keys contain the committed post ID. An atomic claim precedes delivery, preventing repeated/concurrent runs from sending that event again to the same account. No birthday data is copied. Results contain counts, not payloads or push credentials.

Delivery is best-effort, at-most-once per event/account, with one attempt per currently enrolled device. A crash or ambiguous provider failure after claiming can miss a notification; there is no automatic retry queue. Four accounts are processed concurrently, devices sequentially. Chat background work has Cloudflare's 30-second post-response lifetime; slow providers or a much larger device population may require a durable queue later. Payload TTL is five minutes. Provider acceptance does not prove display. Account, person, identity, device revision and category preference are rechecked immediately before dispatch.

Rollback: `pre-notification-categories-2026-09-30` at `60907c0`. Remove the Cron schedule and redeploy that family-enrollment release. Retain the additive ledger, preferences, subscriptions, VAPID secret and service worker; do not restore an old database for a code rollback. The sending kill switch stops new dispatch. Accepted provider messages cannot be recalled.

Synthetic tests cover payload encryption, authorization, opt-outs, dates and duplicate suppression. Physical-device category acceptance still requires a real message from another family member and a naturally scheduled birthday; do not create fake production records or send rollout notifications for verification.

## Family enrollment — Phase 1C history

Phase 1C expands voluntary enrollment and manual self-tests to every eligible active provisioned application account, including future accounts. Production uses `NOTIFICATIONS_AUDIENCE=active_accounts`; the pilot allowlist is empty. The central account gate requires a verified identity, active account and active Directory person. Approved/unbound identities still complete secure first-use activation through that gate. Enrollment and each send also recheck account/person/bound-identity eligibility in SQL. Household assignment and Administrator role do not grant or restrict notification eligibility.

Consent remains explicit and per device. Users can read, enroll, detach and test only their own devices. No rollout message is sent, no browser permission is requested automatically, and only the two categories above have automatic triggers. Both existing server kill switches remain authoritative. Phase 1C preserved VAPID keys, subscriptions and account data without a migration. The later category release added migration 0010 as described above.

Rollback: `pre-push-phase1c-2026-09-30` at documentation checkpoint `0ede46c` (application baseline `64bf121`). Redeploy that checkpoint to return to the Bob-only pilot. Its code uses the exact pilot allowlist and ignores the newer audience setting; clear that setting when maintaining configuration afterward. Retain the VAPID secret, service worker and D1 data. Family subscriptions enrolled before rollback remain stored but become ineligible for new sends while the pilot restriction applies. Both switches can instead be set false to suspend all new enrollment/sends. Already accepted provider messages cannot be recalled.

## Boundary and enrollment decision

Phase 1A introduced the disabled foundation; Phase 1B completed Bob's physical-iPhone pilot. Phase 1C opens voluntary enrollment to eligible family accounts. Only Birthdays and Family Chat have automatic event triggers. Authenticated registration of a browser-generated PushSubscription is sufficient for this private application: Cloudflare authentication, the authoritative active account gate, same-origin write checks, explicit browser consent, server-derived ownership and globally unique endpoints form the boundary. A push-delivered challenge would add state and an extra delivery without materially addressing a demonstrated threat here. Subscription endpoints and keys are credentials; never copy, log or expose them in status APIs. Registration cannot transfer an endpoint between accounts, and unknown request fields (including submitted owners) are rejected.

The pinned MIT library `@block65/webcrypto-web-push@2.0.0` constructs RFC 8291 AES128GCM payloads and RFC 8292 VAPID signatures using Web Crypto. Synthetic tests run in the existing Workers compatibility date without Node flags, independently decrypt payloads and verify signatures, and replace all provider networking with mocks. Transport uses manual redirects: provider redirects are failures, never followed. Enrollment accepts HTTPS Apple, FCM and Mozilla production push hosts only; expanding that list requires review. No hand-written production Web Push cryptography is introduced.

## Storage and API

Migration `0009_push_notifications.sql` is additive and seeds nothing. `push_subscriptions` references `app_users` restrictively, permits up to ten devices per account through atomic registration, and stores a unique endpoint, browser keys, VAPID key identifier, label, enabled state, expiry, timestamps, revision and bounded result/failure fields. List responses contain only display/status fields. `notification_preferences` stores an account's versioned allowlisted categories (birthdays, chat, polls, dinner, calendar, family_dates, vehicles); missing birthdays/chat values default on, other categories default off, with a separate test-send cooldown. Only Birthdays and Family Chat are exposed as category controls; reserved keys do not imply implemented triggers.

Every endpoint is centrally account-gated:

- `GET /api/notifications/config`: rollout flags and public VAPID configuration only when eligible.
- `GET /api/notifications/subscriptions`: sanitized own-device list.
- `POST /api/notifications/subscriptions`: explicit browser registration, separately rollout-gated.
- `DELETE /api/notifications/subscriptions/:id`: own-device detach, still available when rollout is off; foreign/missing IDs are harmless idempotent responses.
- `GET/PATCH /api/notifications/preferences`: own allowlisted preferences with optimistic revision.
- `POST /api/notifications/test`: own device ID only; separately rollout-gated, fixed generic content, one request/account/minute, TTL 300 seconds.

The sender rechecks active account, active person, bound identity, enabled device and revision immediately before dispatch. Disabling an account suppresses sends. Identity replacement invalidates subscriptions transactionally via a trigger; first binding does not. Already accepted provider requests cannot be recalled. 404/410 deletes only that expired device; 401/403 retains it and reports configuration failure; 429/5xx/network errors are temporary. No response bodies, endpoints, keys or tokens are logged. No retry queue exists.

## Browser and privacy

The Notifications link opens a settings page without adding a bottom-navigation item. No permission request occurs on page load or service-worker registration. iPhone/iPad Home Screen installation, browser support, permission and rollout states are distinct. The physical-iPhone foundation pilot is complete. The two category checks above remain; notification taps always use normal Access/account enforcement.

`/sw.js` is notification-only and served with no-cache revalidation. Only validated version-1 payloads and Home/Chat destinations are accepted; invalid payloads show generic content and route Home. Same-origin navigation never bypasses Access. Preserve the manifest identity and this stable worker URL across releases. Lock-screen content must remain generic unless separately approved; the manual test is **Miszuk Family / Test notification**. No chat text, calendar details or survey responses are sent.

Explicit Sign out attempts server detachment and browser unsubscribe first. Partial failure is reported with retry/continue choice; never silently claim cleanup succeeded. The browser stores only its account/device IDs as a local marker, never endpoint/key material. Another account cannot inherit server ownership; an unmatched browser subscription is unsubscribed before explicit fresh enrollment. Shared-device users should disable notifications before sharing the device; a failed detach or already accepted notification cannot be recalled.

## Rollout and VAPID

Phase 1A disabled baseline / emergency kill-switch configuration:

- `NOTIFICATIONS_ENROLLMENT_ENABLED=false`
- `NOTIFICATIONS_SENDING_ENABLED=false`
- `NOTIFICATIONS_ALLOWED_USER_IDS` empty
- `VAPID_SUBJECT=mailto:bob@miszuk.com`

Both gates require the configured audience and all VAPID fields. Phase 1C uses active application accounts; omitting that audience setting retains the optional exact-ID pilot restriction. Administrator role is not a rollout grant. Turn sending off to stop new dispatches; turn enrollment off independently to prevent registration. Preserve these settings in any emergency release.

Phase 1B creates one stable P-256 VAPID pair using Web Crypto. The private key is a Worker `VAPID_PRIVATE_KEY` secret with a user-confirmed Bitwarden recovery record; `VAPID_PUBLIC_KEY` and the stable nonsecret `VAPID_KEY_ID` are deployment configuration. The adapter expects the base64url raw uncompressed public point and base64url private JWK `d`. Never put private values in Git, command transcripts or documentation. Do not generate keys during deployment. Document credential location and independent recovery access, not values. Key rotation requires deliberate re-enrollment; key-ID mismatches are rejected.

## Backup, rollback and next phase

Before the remote migration, privately export D1, restore it locally, compare every existing table fingerprint and run integrity/FK checks. Apply the migration transactionally, then confirm old data unchanged (apart from its migration ledger) and new tables empty. Backups now contain push credentials and must remain private.

For application rollback, retain the additive tables/trigger and disable both switches. Do not restore an old database just to roll back code. Retain this compatible `/sw.js` asset and its headers even if restoring pre-notification frontend assets; an installed worker outlives an application release. It never caches or fetches family data, so it cannot revive old application access. Preserve the tested account-aware maintenance recovery Worker, existing Access bindings and assets; it denies family APIs safely while an account-aware forward fix is prepared. Never fall back to pre-account enforcement.

Phase 1B is production-verified on Bob's physical iPhone. Enrollment, locked-phone delivery with the PWA closed, notification display, tap-to-open/focus behavior, disable/removal, re-enable, and a subsequent test notification all passed. Phase 1C expands voluntary enrollment to eligible family accounts; other category triggers, retries and quiet hours remain deferred.

## Phase 1B — completed Bob-only manual pilot (historical scope)

Enrollment and self-test switches are enabled only in conjunction with the exact allowlist `2f1e9ed4-a0cb-433b-a30b-5aeab0138b30` (Bob’s existing active, bound application account). Administrator role is irrelevant. Every other account remains ineligible, including any future Administrator. No automatic Chat, Dinner, Calendar, poll, birthday or Vehicle notification exists. No migration or account mutation is required.

The stable key ID is `miszuk-push-2026-09-30-v1`; contact remains `mailto:bob@miszuk.com`. Initial setup used an ephemeral loopback-only operator handoff: Web Crypto generated the pair in memory, Bob copied the recovery record directly into Bitwarden and confirmed saving it, then the helper uploaded the private key to the Worker secret. No plaintext private-key file or repository entry was created. The helper was stopped afterward. The vault save is operator-confirmed, not independently inspected by the application or AI.

Recovery source: the Bitwarden Secure Note **Miszuk Family — Production Web Push VAPID**, containing the matched private/public pair and key ID. An authorized successor must be able to unlock that vault through the family’s independent break-glass arrangements. The exact emergency-access/MFA mechanism is maintained outside this repository; this release does not independently verify it. Do not rely on the portal or family email alone to recover the vault.

To restore: first disable both rollout switches. Retrieve the existing matched record through authorized Bitwarden access. Using Cloudflare’s secret editor or interactive `wrangler secret put VAPID_PRIVATE_KEY`, restore the private value without putting it in command arguments, logs, chat or files. Restore the matching public key and key ID in configuration, verify the key-ID/public-key match, and restore the currently approved rollout audience (`active_accounts` for family enrollment), or deliberately use the exact-ID pilot restriction for a separately chosen recovery test. Do not silently leave family enrollment in historical Bob-only mode. Cloudflare does not return a stored secret’s plaintext. Never generate a replacement merely because a deployment credential expired. If the recovery record is irretrievably lost, stop sending; deliberate key rotation and device re-enrollment require a separate operator action.

Rollback checkpoint: `pre-push-phase1b-2026-09-30` at `87e6a9c`. Redeploy that checkpoint to restore both false switches and an empty allowlist, retaining the private secret, notification tables and `/sw.js`. Do not delete accounts, subscriptions, or restore D1 to roll back this pilot. The kill switches stop new sends/enrollment; a push already accepted by a provider cannot be recalled.

### Physical iPhone foundation acceptance procedure (completed; retained for regression testing)

1. Use an iPhone running iOS 16.4 or later. In Safari open `https://family.miszuk.com`, sign in as Bob, use Share → Add to Home Screen (enable Open as Web App if offered), and retain the Miszuk Family name/icon. An existing installed copy may be reused. Launch from its Home Screen icon.
2. Open Notifications, tap **Enable on this device**, and choose **Allow** in the iOS prompt. Expect Enabled on this device and one iPhone entry. If permission was previously denied, change Miszuk Family notification permissions in iOS Settings before retrying. Do not repeatedly request permission.
3. On a desktop browser signed in as Bob, open Notifications after iPhone enrollment (reload if already open). No desktop enrollment is needed. Confirm the iPhone appears under Your devices.
4. On iPhone return to the Home Screen and lock the phone. On desktop select **Send test to iPhone**. Expect **Miszuk Family / Test notification** on the locked iPhone. The sender reports provider acceptance, which alone is not delivery proof. If absent, check network, notification permissions, Focus/Scheduled Summary and lock-screen alert settings; wait at least one minute before another test.
5. Tap the notification and unlock. Expect the installed family portal to open/focus Home. If Access has expired, complete the normal email-PIN flow; no bypass is provided. To test expiry, let the session expire naturally—explicit Sign out intentionally detaches notifications.
6. In iPhone Notifications select **Disable on this device**. Expect Disabled and no device entry after refreshing desktop settings. Existing Notification Center entries can remain and should be cleared manually.
7. Select **Enable on this device** again on iPhone. Expect one fresh active device entry, not duplicates. Repeat the desktop-triggered locked-phone test after the one-minute cooldown. Existing permission may mean no second permission prompt.

The desktop test controls list only the authenticated account's sanitized devices. They never send as another user or expose endpoints/keys. Enrollment waits for service-worker activation and is disabled where platform support, Home Screen installation or permission is missing. Bob's physical-iPhone acceptance is complete and production-verified; future changes must preserve this tested path.

Platform references: [Apple Home Screen installation](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) and [WebKit iOS Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
