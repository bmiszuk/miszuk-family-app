# Family Polls / Surveys — V1 requirements and design

Status: Family Polls V1 implemented October 1, 2026. Household scope, single-choice voting and the simple iPhone flow below are the approved requirements. The implementation instruction supersedes the earlier notification proposal: V1 includes new-poll push with Polls defaulting On. Physical-device category acceptance remains to be recorded.

## Purpose and agreed scope

A household member asks one practical question and everyone in that household with an active application account can answer. Examples:

- “Who will be home Saturday for dinner?” — Yes / No / Maybe.
- “What should we have for dinner?” — Chicken / Hamburgers / Spaghetti.

V1 has **one question and single-choice answers**: each respondent selects exactly one option, and may change that answer while the poll is active. Several polls may be active simultaneously. Named results are shared with household poll recipients. This is not a survey builder or meal-planning system; attendance answers do not assign the existing Dinner cook/signup or modify Calendar.

## iPhone simplicity — primary requirement

Normal creation requires only **question + answer choices**, followed by **Create poll**. Provide a one-tap **Yes / No / Maybe** template that fills editable choice fields. Custom choices use the same small form; no wizard, drag-and-drop or separate mandatory review screen.

Do not ask for recipients, household selection, deadline, privacy, notification settings or other configuration. Show a short passive explanation: “For your household · closes automatically in 7 days · named results.” Server derives household and audience from the authenticated account. Enforced bounds: question up to 240 characters, 2–8 distinct trimmed options of up to 100 characters. The template is a convenience, not a different question type.

Use stacked radio choices with approximately 44px touch rows, one **Submit answer** button, compact confirmation, and **Change answer** while active. After submission show option counts and the user's answer, not an empty success screen. Names can expand beneath results; avoid wide tables or a large permanent name list. Show vote totals as people, never count one person more than once. “Not answered” is distinct from “No.”

## Existing foundations to reuse

- [Architecture](../ARCHITECTURE.md): keep one React app, Worker and D1. Polls owns its feature page/Home summary and API under `src/features/polls` and `src/api/polls`; small pure rules may live in `src/domain`. No new service, generic form engine, queue or datastore is justified.
- [Accounts and permissions](USERS_PERMISSIONS.md): verified Access → active account → active Directory person remains mandatory. Store ownership/answers by stable `app_users.id`, display Directory names, and use the account's current active household. No parallel identity, email mapping or Directory-only voter.
- Add explicit Poll actions to the shared permission layer and enforce household scope in SQL for reads and writes. Reuse the no-household error pattern; do not reinstate a default-household fallback. Parent/spouse relationships and Administrator role provide no bypass or proxy vote.
- Reuse browser API/access-error handling, version-conflict handling, compact forms and existing visible/focus refresh patterns. Share summary loading rather than adding duplicate background polling.
- Preserve the Home Groceries/Dinner/Calendar/Chat grid, Family Dates ordering and bottom-navigation clearance. Polls owns a bounded summary rather than redesigning Home.
- [Notifications](NOTIFICATIONS.md): reuse preferences, devices, VAPID, sender lifecycle and eligibility checks. Polls is now an exposed category defaulting On when no saved value exists, alongside Birthdays and Family Chat. Existing saved preference values are preserved.

## Household audience and membership

Every new poll belongs permanently to the creator's current household and automatically includes **all active app users with active Directory people assigned to that household, including the creator**. There is no recipient picker, exclusion list, all-family mode or household override. People without accounts and pending/disabled accounts do not receive a ballot. Active approved/unbound accounts can be included; normal secure first-use binding is still required before access.

Implemented membership rule: automatically snapshot those accounts at creation in `poll_recipients`, and additionally require current membership in the poll's active household on every request/send. The snapshot is server-generated, never a client-selected audience. A household move never moves the poll or grants continued access to the old household; creator powers are also lost outside that household. New accounts/new household members join future polls, not old polls. This preserves the original response denominator and avoids silently exposing earlier household questions/history to newcomers.

Disabling an account or deactivating its person immediately removes access and push eligibility, without deleting its historical answer. Restoring the same account in the same household restores access to its snapshotted polls. Retain answers from recipients who leave/become inactive as part of that poll's results, label them unavailable where appropriate, and do not count them as currently awaiting a response. Names/answers are poll history, not permission to read those people's new household data. Identity replacement retains stable account ownership and ordinary pending/binding/device-invalidation protections.

If a creator is disabled or leaves, no automatic ownership transfer or Administrator takeover occurs; automatic seven-day expiration still ends the poll. These conservative membership edge rules are explicit defaults, not additional creation settings.

## Authorization and results

All operations require an active account/person **and the poll's current household membership**, plus snapshot membership. No-household accounts cannot create, list, answer or read Polls. Inaccessible IDs return not-found behavior without leaking question/results.

| Action | Rule |
|---|---|
| `poll.create` | Any active household Member or Administrator, for their own household only. |
| `poll.read` / list / summary | Household poll recipient; scope all queries, including history and counts. |
| `poll.respondOwn` | Recipient's own single answer while active; includes creator. |
| `poll.results.read` | Any authorized household poll recipient, not just creator. |
| `poll.closeOwn` | Creator only, while active, with expected poll version and current household access. |
| Edit question/choices | Before creation in the local form only. After creation, close and create a corrected poll. |
| Edit response | Own choice only, with response revision check, until close/expiration. |
| Delete, reopen, impersonate, moderate | Not in V1; no Administrator exception. |

Named results and counts are available to authorized recipients during the poll and in history. The voting view emphasizes answering first; a results disclosure may be opened before voting, but voting is not a privacy gate. After voting, results and the selected answer become the primary view, with a clear change-answer control while active. Explain briefly that names and answers are visible to household poll recipients. No privacy mode or anonymous claim is offered. Ordinary application Administrators cannot browse another household's polls; independently authorized database operators can access stored records as elsewhere in the app.

## Implemented data model

Migration `0011_household_polls.sql` creates the four tables below and extends the notification claim category constraint without losing existing claims. One poll row holds the question; no generic questionnaire/question hierarchy is needed.

| Table | Minimum fields/constraints |
|---|---|
| `polls` | `id`, restrictive `household_id` and `creator_user_id` references, question, server-set UTC `created_at` and `expires_at`, nullable manual `closed_at`, `updated_at`, `version`. Household/expiration immutable. |
| `poll_options` | Poll reference, stable option ID, label, position; unique poll/option and poll/position. Immutable after creation. |
| `poll_recipients` | Primary key `(poll_id,user_id)`, restrictive poll/account references; automatic household-account snapshot. No copied emails or user-supplied recipients. |
| `poll_responses` | Primary key `(poll_id,user_id)`, composite FK to recipient membership, one non-null `option_id` with composite FK to that poll's option; timestamps and version. One current answer; no answer-history table initially. |

Index household/creation-time lists, recipient lookups and creator lookups; bound list/history pagination. Preserve account-linked history using restrictive references. A retired household is inaccessible even if historical records remain; Polls must not weaken current household retirement protections.

Create poll/options/automatic recipients in one D1 transaction. Recheck the actor's active account/person/household and derive audience in SQL at creation time. Reject client fields for recipients, author, household, expiration, privacy and per-poll notification control. Use a client-generated request/poll UUID checked against creator and payload for idempotent identical retries; mismatched reuse conflicts without exposing a foreign poll. Never partially create a poll or silently change an existing poll's audience during a retry.

For answers, atomically recheck current active account/person/household, recipient membership, open state/server expiry, same-poll option and expected response version (0 for first response). One answer means exactly one choice, not a set or free-text value. Concurrent first responses cannot duplicate a ballot; stale edits conflict. Serialize close/answer races: a response committed before effective closing stays; later writes fail. Never rely solely on preflight permission or time checks.

Implemented routes: `GET/POST /api/polls`, `GET /api/polls/summary`, `GET /api/polls/:id`, `PUT /api/polls/:id/response`, `POST /api/polls/:id/close`, `GET /api/polls/:id/results`. No recipient-picker endpoint. Responses explicitly serialize display data, never account/security records; API filtering is authoritative. Lists/history return at most 20 polls per page; summary returns counts and at most one unanswered question.

## Automatic expiration and history

Server sets expiration to **creation instant + 7 × 24 hours**. Store UTC and display in established **America/Chicago** time; this fixed duration is unambiguous across DST. Do not parse dates, weekdays, “Saturday,” or other natural-language time references from the question. Do not offer a deadline picker or automatic event integration. A question about an earlier event still remains open until early close or seven-day expiry.

Effective active = no manual `closed_at` and server time before `expires_at`. Expiration needs no Cron: reads/writes derive it from server time. Creator can optionally close early with a small confirmation. No extending/reopening in V1. Closing/expiration freezes answers, removes active/unanswered prompts and puts the poll in History under unchanged access rules. “Moves to history” is a query/UI classification, not data copying/deletion. History remains paginated; no speculative retention/deletion policy or redundant archived boolean.

## Multiple polls, Home and navigation

- Multiple active polls are allowed; never replace an earlier one when creating another.
- Home has **one compact Polls area**, showing at most the nearest-expiring unanswered question with one-tap answer buttons and a count/link for additional unanswered/active polls. Home submits through the existing version-checked response API; caught-up users see a compact active-count line. Do not stack full questionnaires or one large card per poll. Preserve the existing card order and desktop grid.
- Answered active polls are secondary: a small “View active polls/results” link/count, not the primary prompt. When none await an answer, keep a modest Polls entry for creation, active results and History. Closed/inaccessible polls never contribute to unanswered counts.
- Polls page prioritizes unanswered active polls, then answered active polls, with separate History access. Answered cards show the user's answer and a results link. Details expand within that same card, with compact counts and one named-breakdown disclosure. Active/History use compact filters. Answered active polls show results immediately, without a separate View results step. Normal active cards omit response-progress totals and closing dates; history retains a compact closed date. A single View names disclosure reveals named results. Creator-only Close poll is a low-prominence action with a cancellable confirmation. Expiration and manual closure update on save/focus/visible refresh; a server rejection overrides any stale client “active” display.
- After sign-in, the Home summary is the normal prompt. If the user lands on another section, a small nonblocking unanswered-count link may be shown with “Not now” for that tab session; no modal, forced redirect or mandatory answer. Keep dismissal in account-scoped component memory, reset on sign-out/account change or reload, and persist no poll content locally. This is an in-app discovery aid, not a repeated reminder workflow.
- Use a secondary `#polls` destination reached from Home, like Dinner/Notifications. Do not add a sixth permanent mobile bottom-navigation button or build a general navigation overhaul. Errors in Polls must not block existing Home features.

## V1 new-poll notification

Household scope makes **one new-poll announcement** sufficient. After successful creation, notify other snapshotted household recipients who are currently eligible, enrolled, opted in, and have not yet answered. Include the creator in voting but **exclude the creator from their own push**. Recheck current household, snapshot membership, active/unanswered poll state, account/person/bound identity and device eligibility just before sending.

Use exactly **Family Poll / New poll — vote now**. Include no question, choices, names, votes or other household detail on the lock screen. Tap Home to reach its prioritized Polls area, reusing the existing supported service-worker destination. No new deep-link protocol is needed.

Keep preference control in **Notifications**, not creation: one account-wide **Polls** switch, separate from device enrollment and Birthday/Chat preferences. The default is **On** for a missing value; preserve any existing saved value. In-app polls work regardless of that switch. Push is included in V1; no per-poll notification checkbox is offered.

Reuse sender lifecycle/kill switches and at-most-once event/account claims keyed by poll creation. Migration 0011 extends the category CHECK while retaining all existing claim rows. Limit claims and dispatch to eligible household recipients, not every enrolled account. Preserve all Birthday/Chat claims and behavior. Publication success must not depend on provider success. Idempotent creation retries do not reannounce; later enrollment/opt-in does not replay old polls. Accepted pushes cannot be recalled if someone answers, leaves or closes the poll immediately afterward.

Retain existing best-effort limits; Home remains the source of outstanding polls. **No repeated reminders**, closing/result announcements, per-response pushes, manual nagging, new Cron or queue in V1.

## Deferred

Multiple-choice answers (selecting several options), anonymous voting, free-text answers/comments, multi-question surveys, proxy responses, repeated reminders and natural-language deadline interpretation remain deferred. Also defer draft storage, recipient editing, custom deadlines/extensions/reopening, export, moderation/co-creators, retention/deletion UI and external sharing. The agreed Yes / No / Maybe shortcut is included now; broader saved templates are not required.

## Implementation phases, tests and recovery

1. **Core household Polls and discovery:** four tables, scoped APIs, compact creation/voting/results/history and bounded Home discovery.
2. **New-poll push:** household-recipient/send-time checks, account preference and preserved claim ledger. No unsolicited test pushes or fabricated production votes.
3. **Release verification:** local synthetic mutation tests, private backup restored with fingerprints/integrity checks before applying 0011, existing-data comparison, desktop/390×844 checks and read-only production verification.
4. **Physical-device acceptance:** another eligible household recipient receives the generic push while their PWA is closed/phone locked; creator receives none; tap opens Home. Verify the Polls opt-out on a later genuine poll. Record the outcome without implementing deferred features.

Tests must cover automatic inclusion of creator/all eligible household accounts, exclusion of other households/nonusers/inactive accounts, no-household denial, no Administrator/parent/spouse bypass, submitted recipient/household/deadline spoofing, snapshot/current-membership checks, household moves/retirement and account changes, shared named results, exactly one option, response changes/conflicts, idempotent creation and transaction rollback, foreign options, seven-day/DST boundaries with no question parsing, early-close races, simultaneous polls, bounded Home display/unanswered priority, template usability and safe text rendering. Push tests add creator exclusion, household-scoped opt-outs/eligibility/deduplication and failure isolation. Retain existing account/family-data/Birthday/Chat regressions.

Create rollback checkpoints; use matching frontend/backend releases preserving current account/household boundaries. Retain additive Poll data and existing notification claims/subscriptions/VAPID secret; never restore an old database merely to undo UI code. A Poll-trigger rollback must not stop existing Birthday/Chat behavior inadvertently. Update successor/recovery documentation without turning this module into an unrelated infrastructure project.

## Release and recovery notes

No product decision blocks V1. Real-device push acceptance still requires family participation; provider acceptance and synthetic encryption tests cannot establish iPhone display.

Rollback checkpoint: `pre-polls-v1-2026-10-01` at `3c87a5e` (application code baseline `4d3b89c`). Redeploy that matching frontend/Worker to remove Polls UI/triggers while retaining migration 0011 and all data. Keep the existing Birthday Cron, VAPID bindings and service worker. Do not reverse the migration or restore old D1 data to undo code. For emergency containment, use the established account-aware maintenance recovery Worker; it returns 401/403/maintenance 503 without reopening legacy access. See [recovery](PHASE3_RECOVERY.md) and [notification operations](NOTIFICATIONS.md).
