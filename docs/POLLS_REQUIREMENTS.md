# Family Polls / Surveys — proposed initial design

Status: design proposal, September 30, 2026. **Not implemented or approved for implementation.** Based on application baseline `4d3b89c` and the current repository documentation. Recommendations below need the decisions listed at the end before implementation. This document does not authorize schema, infrastructure or production changes.

## Purpose and smallest useful scope

Help a family member ask a specific group one practical question and see who answered what. Examples:

- “Will you be home for dinner Saturday, October 3?” — Yes / No / Not sure.
- “Which day works best for a family visit?” — Saturday / Sunday / Neither.
- “Which meal would you prefer?” — a short list of choices.

Use **Polls** as the UI name. Version 1 is one question per poll, single-choice, identifiable answers, a selected audience and a closing deadline. It is not a general survey builder, scheduling engine or meal-planning system. Dinner attendance does not assign the existing Dinner cook/signup or change Calendar events.

Single-choice covers the first use case cleanly. Multiple-choice is useful for “select every day that works,” but adds different validation/results semantics; defer it until requested. Free-text answers, “Other” text, comments, multiple questions, ranked voting and attachments are not worthwhile initially. The creator can put “Not sure” or “None of these” in the choices when appropriate.

## Existing foundations to reuse

- [Architecture](../ARCHITECTURE.md): one React app, Worker and D1; `src/features/polls` would own its page and Home summary, `src/api/polls` its handlers, and small pure rules can live in `src/domain`. No new service, framework, queue or datastore is justified.
- [Accounts and permissions](USERS_PERMISSIONS.md): every API is behind the verified Access → active account → active Directory person gate. Link ownership and responses to stable `app_users.id`; use linked Directory names for display. No parallel users, email identity or Directory-only voters.
- `src/api/shared/permissions.js`: add explicit Poll actions, with authoritative resource checks and SQL scope. Parent/spouse/household rules and Administrator role confer no extra Poll rights.
- `src/features/home/Home.jsx`: preserve the existing Groceries/Dinner/Calendar/Chat grid and Family Dates order. Polls owns a compact summary, not a second Home implementation.
- Existing `api`, error/access handling, `useAction`, version-conflict handling and visible/focus refresh patterns can be reused. Do not independently poll the same summary from multiple mounted components.
- [Notifications](NOTIFICATIONS.md): reuse account preferences, own-device enrollment, VAPID, send-time eligibility and the transport. The reserved `polls` preference currently defaults Off; it is not a working trigger. The delivery-ledger CHECK and preference SQL currently allow only birthdays/chat, and recipient selection currently scans enrolled accounts. Poll sending therefore requires deliberate changes, not merely a new category label.

## Audience and identity

Recommend an explicit list of **active provisioned accounts with active Directory people**, selected when publishing. Accounts awaiting first use but already active may be selected; pending/disabled accounts and people without accounts cannot. They can participate in future polls after activation. Explain excluded Directory-only people without offering proxy voting.

The picker displays Directory names (disambiguated with surname), never approved emails, roles, binding states or Cloudflare IDs. A small Poll-specific recipient lookup may return person IDs/names and household grouping; the server resolves and validates their accounts. Do not expose the Administrator roster to Members.

“My household” and “All current users” may be selection shortcuts, but show the actual people for review. Start with no recipients selected. Store the resolved list at publication: future accounts or household moves do not silently join or leave. This is an explicit audience grant, not household authorization inheritance. Creators may include themselves but are not automatically respondents. Require at least one recipient.

Disabled/inactive users immediately lose read, answer and push access through existing checks; retain their historical answers. If restored, the same selected account regains access while the poll exists. Identity replacement keeps the same account/participation, with normal pending/binding and device invalidation protections. A disabled creator's poll remains available to its recipients until its deadline; there is no automatic ownership transfer or Administrator takeover.

## Recommended authorization and results policy

All actions require the current active-account/person gate. No household is required.

| Proposed action | Who may perform it |
|---|---|
| `poll.create` | Any active Member or Administrator; same rules for both. |
| `poll.read` / list | Creator or explicitly selected recipient only; enforce in SQL, including history and Home summaries. |
| `poll.respondOwn` | Selected recipient, on their own behalf, while open. Creator only if also selected. |
| `poll.closeOwn` | Creator, while open, using expected poll version. |
| `poll.results.readOwn` | Creator only: named answers, totals and unanswered recipients. |
| Edit question/choices/audience | Before publish in the local form only. No changes after publication, even before the first response. |
| Edit response | Respondent may replace their own choice until closing, with response revision checks. |
| Delete, reopen, impersonate, moderate | Not in version 1. Close a mistaken poll and publish a corrected one. |

Recommend **identifiable responses, creator-only results** for version 1. Dinner attendance needs names, and limiting results avoids disclosing availability to the whole family. Tell respondents before submitting: “Your name and answer are visible to [creator].” Other respondents see the question/options, creator, deadline and their own answer, not the audience roster, others' answers or aggregate counts. Creator results are available immediately and after closure; always distinguish “Not answered” from “No.” Show inactive recipients separately in progress, retaining answers and the original audience denominator rather than silently dropping them.

Do not offer an “anonymous” checkbox initially. Anonymity in a small family is difficult to promise, and ordinary backups/operator access would still identify the responder in this design. If anonymous or participant-visible results are wanted later, design their disclosure/storage rules explicitly before implementation. A normal application Administrator is not entitled to read arbitrary polls; independently authorized database operators remain capable of accessing stored data, as elsewhere in this app.

## Proposed data model — design, not a migration

One poll row is the question; no generic questionnaire/question table is needed.

| Proposed table | Minimum fields and constraints |
|---|---|
| `polls` | `id`, `creator_user_id` → `app_users`, `question`, required `closes_at` (UTC), nullable `closed_at` (manual close), `created_at`, `updated_at`, `version`. No redundant expired boolean. |
| `poll_options` | `poll_id` → `polls`, stable option ID, label, position. Unique `(poll_id, id)` and `(poll_id, position)`; immutable once published. |
| `poll_recipients` | `(poll_id, user_id)` primary key, restrictive references to poll/account. Explicit publication snapshot. No copied email, birthday or household security identity. |
| `poll_responses` | `(poll_id, user_id)` primary key; composite FK to recipient membership; `option_id` with composite FK to the same poll's option; `created_at`, `updated_at`, `version`. One current answer, no answer-history table initially. |

Use restrictive foreign keys; do not cascade away account-linked history. Index recipient lookups by user/poll and creator lists by creator/creation time; keep bounded pagination. Suggested input limits: question 240 characters, 2–8 distinct trimmed options of up to 100 characters. These are implementation bounds, not reasons to build a schema framework.

Publish poll/options/recipients in one D1 transaction, rechecking creator and recipient eligibility; reject the entire operation if any submitted recipient is unavailable. Never partially publish. Use a client-generated request/poll UUID scoped and checked against the creator to make identical creation retries idempotent; a different payload with the same key conflicts, and a collision must reveal no foreign poll.

Respond using trusted current account, never a supplied author. In the atomic write recheck active account/person, recipient membership, poll open status and deadline, option ownership and expected response version (0 for first answer). Concurrent first answers cannot insert duplicates. Close and response writes must serialize correctly: a response committed before close remains; one attempted after effective closing fails. Failed writes return the existing conflict/error pattern; refresh instead of silently overwriting. Do not use a read-then-write check as the sole permission or deadline guard.

Proposed routes: `GET /api/polls/recipients` (sanitized picker), `GET /api/polls` (scoped open/history/created lists, bounded), `GET /api/polls/summary` (own unanswered count/nearest deadline), `POST /api/polls`, `GET /api/polls/:id`, `PUT /api/polls/:id/response`, `POST /api/polls/:id/close`, `GET /api/polls/:id/results`. Use explicit response serialization and not-found behavior for inaccessible polls. Creator-only result fields must never be sent to recipient clients and merely hidden. Final paths can follow implementation conventions without changing these boundaries.

## Closing and history

Recommend a required deadline, default seven days ahead, clearly editable during creation. Enter/display in **America/Chicago**, store an unambiguous UTC instant; show the timezone and reject/resolve ambiguous or nonexistent DST input explicitly. A dinner-attendance question should include the actual date in its text; the response deadline is separate from the dinner date.

Effective open = no manual `closed_at` and server time before `closes_at`. No scheduled job is needed to expire polls: reads and writes derive closure from time. Client clocks only help presentation. Creator can close early with confirmation; no deadline extension or reopening initially. Closing removes unanswered prompts immediately on refresh, freezes answers and preserves history. Historical polls remain available to their creator and recipients under the same visibility rules. No automatic deletion/retention policy is invented; decide retention later if needed. No duplicate “archived” state is necessary.

## Home, unanswered prompts and mobile UI

- Add a compact Polls strip above the existing Home grid, preserving current card order and bottom-navigation clearance. Show the nearest-closing unanswered question, deadline, count of other unanswered polls, and “Answer” / “Open polls.” If none await an answer, retain just a small “Polls” entry so creators can start a poll or view results/history.
- Interpret login prompting as a nonblocking “You have N polls to answer” notice after account resolution. If landing outside Home, show a compact link to Polls; do not force a redirect or modal. “Not now” suppresses this extra notice for the current tab session; Home/list still shows the outstanding poll. Store only an account-scoped dismissal marker, clear it on sign-out/account change, and do not store questions/answers locally. No per-user snooze table initially. A new tab/session can prompt again; this behavior needs Bob's agreement.
- Answered, closed and inaccessible polls never count as unanswered. A push opt-out does not hide in-app polls. Refresh on successful response/close, focus and while relevant views are visible using existing patterns; errors must not block the rest of Home.
- Add `#polls` as a secondary destination, like Dinner/Notifications, reached from Home. No sixth permanent bottom-navigation button or broad navigation redesign. The initial page can expand a selected poll in place; direct question links are optional later.
- Mobile: short open-poll list, radio choices with roughly 44px touch rows, one explicit “Submit answer” button, small saved status and “Change answer” until close. Creator gets a compact named-response list grouped by choice plus unanswered names. Creation is question → choices → recipients/deadline → review/publish. No drag-and-drop, wide tables or desktop-only controls. Unsaved form fields remain local drafts, not saved draft polls.

## Push proposal — a separately verifiable integration step

Recommend **one new-poll announcement**, not repeated reminders: after a successful publish, notify selected eligible recipients other than the creator, only while the poll remains open and they have not answered. Recheck membership, unanswered/open state and existing active account/person/bound-identity/device protections immediately before dispatch. These checks reduce stale sends, but a response/close after provider acceptance cannot recall a push.

Payload: **Family Poll / A new family poll is ready for your response.** No question, choices, deadline, household or answer on the lock screen. Tap **Home** initially; the Polls strip then leads to the question. This reuses the service worker's existing Home destination and avoids incompatible payload/deep-link changes on installed devices.

Expose one account-wide **Polls** switch when this integration ships. Recommend preserving the reserved preference's current **Off** default and all explicitly saved values; users turn it on voluntarily. It remains independent of device enrollment and Birthday/Chat preferences. Bob can choose a different default explicitly before implementation; do not silently infer consent from existing Chat enrollment.

Reuse the existing sender, provider lifecycle, kill switches and at-most-once event/account claims, using an event key such as `poll-published:<id>`. Extend the existing ledger's category constraint with a data-preserving migration only when adding this trigger; SQLite CHECK constraints cannot simply be enabled by a UI change. Extend preference handling deliberately. Recipient eligibility must be supplied by Polls and revalidated in the dispatch path; never broadcast to all enrolled accounts and filter only in the UI. Preserve birthday/chat claims and regression behavior. Post-commit notification failures never fail or roll back publication. Duplicate publish retries do not reannounce; enabling notifications later does not replay old announcements.

Accept the existing best-effort delivery limits for this small module; Home is the reliable source of outstanding requests. No new Cron, durable queue, response-per-answer push to the creator, closing summary push, manual “nag everyone,” deadline reminder or periodic reminder in version 1. Those require a later scoped decision on timing, consent, deduplication and suppression.

## Initial version versus later

**Initial:** named single-choice polls, explicit active-account audience, creator-only live results, own-answer changes, required deadline/manual close, private history, compact Home/login prompting, and the separately verified optional-push step above.

**Later only if useful:** multiple-choice, free-text/comments, multiple questions, anonymous or participant-visible results, proxy answers for children/nonusers, durable drafts, recipient changes, deadline extension/reopen, duplication/templates, retention/deletion UI, export, co-creators/moderation and scheduled reminders. Do not reserve empty modules or add general permission management for these possibilities.

## Verification, implementation phases and recovery

1. **Agree on product boundaries.** Resolve the decisions below and update this document; no feature rollout yet.
2. **Core module and in-app discovery.** Back up/restore-verify D1, reconcile its existing migration ledger, add only the Poll tables, and implement gated APIs, mobile page, creator results and Home/nonblocking prompts together. No push sends in this phase. Add targeted tests, full regression checks and desktop/iPhone-sized verification. Deploy as a complete usable stopping point.
3. **Optional new-poll push.** Add the bounded recipient checks, preference UI and data-preserving claim-category migration; preserve existing push defaults/claims. Verify with synthetic providers before deployment, then two consenting family accounts and a physical iPhone. Do not fabricate or message real recipients during automated verification.
4. **Acceptance/documentation.** Record results, current limitations, migration/backup/rollback evidence and successor instructions. Stop; later survey features need separate authorization.

Tests must cover cross-account list/detail/results denial (including guessed IDs and summaries), creator versus recipient rights, no Administrator/parent/spouse bypass, no-household users, disabled/inactive/unprovisioned states, account changes, candidate serialization, duplicate publication, recipient rejection/transaction rollback, response revision races, foreign choices, expiration/DST/close races, immutable published content, safe text rendering, Home dismissal/count behavior, and push author exclusion/opt-out/recipient restriction/duplicate suppression/failure isolation. Retain all current account, family-data and Birthday/Chat regressions.

Create a release checkpoint before changes. Roll back code to a security-preserving account-aware release; keep additive Poll data and existing notification claims, subscriptions and VAPID secret. A trigger rollback must stop Poll sends while preserving Birthday/Chat behavior. Never restore an old database just to undo UI code or weaken the account boundary. Existing private backup/recovery handoff debt remains a prerequisite for safe operations, not permission to broaden this module.

## Decisions requiring Bob's agreement before implementation

1. **Creation/audience:** may every active account create polls for selected active users, with household/all-user picker shortcuts? Confirm no proxy answers or invitations to Directory-only people initially.
2. **Disclosure:** accept identifiable answers visible only to the creator, with other participants seeing only their own answer? If shared results or anonymity are essential, decide that before storage/API work.
3. **Initial scope/lifecycle:** accept single-choice only, immutable published question/options/audience, required deadline (seven-day editable default), early close and no reopen? Multiple-choice can be added to the initial scope if it is already a real need.
4. **Prompting:** accept a compact Home summary and dismissible, per-tab-session login notice rather than repeated modals or enforced answers?
5. **Push:** include the separate new-poll announcement step, preserve Polls Off by default, tap Home, and defer reminder/response-result pushes?

These are recommendations, not approved policy. No decision is needed to create new infrastructure: the existing stack is sufficient for this proposed scope.
