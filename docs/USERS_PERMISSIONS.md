# Users and Permissions Design

Implementation status: Phase 3 account enforcement and Phase 4 Step 1 Directory/Household restrictions and Step 2 Application Access views and Step 3 provisioning/enable/disable and Step 4 role/approved-identity administration are implemented. Step 1 adds explicit Administrator profile/anniversary corrections and transactional security audits; moderation and cross-household overrides remain deferred. Household PATCH/DELETE requires `expected_name` for guarded concurrency. Member person-deletion eligibility is unchanged; no Administrator delete-any override is introduced in Step 1.

Status as of September 30, 2026: Users & Permissions through Phase 4 is complete. The earlier design also records optional moderation/cross-household ideas; these are deferred, not implemented privileges or an instruction to begin a further phase.  Follow [ARCHITECTURE.md](../ARCHITECTURE.md); no broad refactor or enterprise RBAC framework is required.

## Authentication, identity, and authorization

**Authentication** proves who signed in. Cloudflare Access remains responsible for login. The Worker continues validating the signed Access JWT, including issuer, audience, expiry, and identity claims; client-supplied emails are not trusted.

**Identity** resolves that verified external identity to a provisioned application account and its Directory person. A Directory person may have no account. Every usable account must link to one active Directory person. An ordinary editable Directory email must not control this mapping.

**Authorization** decides whether an active account may perform an explicit action on a resource. Extend the existing shared `can(currentUser, action, resource)` boundary, with server-loaded relationship/context data as needed. Server/API checks are authoritative; UI visibility only reflects them.

Implemented request flow:

`verified Access identity → provisioned account → active-account/person check → explicit feature action → scoped query/write and validation`

Resolve the account context before all API routing, including legacy endpoints and cached Calendar responses. Check current account status on every request; do not cache authorization across requests in a way that delays revocation. Unknown actions deny. Failed account lookup must not fall back to Directory email or default-household access.

## Account data model

These account tables are implemented by `0008_application_accounts.sql`. Use database uniqueness, foreign keys, and transactional guards as well as API checks.

| Table | Fields and relationships |
|---|---|
| `app_users` | `id`; unique, required `person_id` referencing `people`; `status` constrained to `pending`, `active`, `disabled`; `role` constrained to `member`, `administrator`; `created_at`, `updated_at`, `version`. Initially one account per person. |
| `user_identities` | `id`; `user_id` referencing `app_users`; trusted provider/issuer; administrator-provisioned normalized login email; nullable provider subject until activation; binding timestamp and creation/update timestamps. Unique normalized email within issuer and unique `(issuer, subject)` when bound. Initially one login identity per account; do not build an alias-management UI. |
| `security_audit` | `id`, timestamp, actor account (or explicit operator/bootstrap actor), action, target type/ID, and limited structured change details. Record provisioning, binding/rebinding, roles, disable/reactivate, sensitive membership/relationship changes, and administrator overrides. No API for ordinary users to alter audit history. |

Directory `people`, `relationships`, and `households` remain family data. Account roles/status and authoritative login identities do not belong in the person editor. Existing `people.login_email` is a reviewed migration input only: do not automatically provision every existing value. After cutover, stop using it for authentication and reject ordinary writes to it; later retirement must not silently repurpose it as a new security field.

Account/person links must not cascade-delete accounts or audit history. Block ordinary deletion of an account-linked person; use account disable for revocation. Unlink/relink/deletion administration remains deferred and would require last-administrator safeguards. Person soft deletion must also fail identity resolution. Preserve existing record attribution rather than rewriting historical `created_by` values.

Normalize provisioned emails consistently using trimmed, case-insensitive comparison; do not invent provider-specific alias equivalence. At activation, only an approved pending identity may match the verified Access email. Atomically bind its verified issuer/subject and activate the account. Subsequently resolve the bound identity, not a mutable person email. Conflicting or changed identity details require controlled administrator/operator recovery, not silent reassignment. Binding and replacement are implemented; recovery must still verify actual Access identity rather than inventing a subject.

## Roles and agreed rules

- **Member:** active provisioned account with normal family-wide Directory, Chat, and Calendar access; resource rules still apply.
- **Administrator:** explicit implemented account, Directory and household administration actions. Cross-household operations remain deferred. Bob (`bob@miszuk.com`) is the initial and only Administrator.
- Administrator status is not a universal bypass. Every override must be named and implemented deliberately. Unknown actions, integrity checks, optimistic concurrency, and last-administrator protections still apply.
- Household assignment and household create/rename/retire are Administrator-only.
- Relationship creation/removal is Administrator-only, including nested relationships in person-save requests. Self/parent/spouse rules remain for ordinary non-security-sensitive profile editing. Anniversary editing may retain the existing relationship-edit eligibility; it must not change relationship endpoints or type.
- Provisioned users without an assigned household have no household-specific access. The authorization fallback is removed; existing default-household records and groceries are preserved. An Administrator can explicitly assign people to that household.
- Chat authors retain ownership. A future separately authorized Administrator moderation capability could remove/unpin another author's message, never impersonate or rewrite it. Current Administrators retain author-only Chat rights.
- Photos will require explicit access authorization; Administrator status alone does not grant it.
- Household membership, marriage, and parenthood never automatically grant unrelated feature rights such as Vehicle editing.

## Endpoint/action policy matrix

This inventories feature routes plus the separate implemented admin and notification routes below. Some table action names are conceptual policy names rather than literal `can()` constants. Administrator columns describe current behavior; future overrides are explicitly marked deferred. Unless stated otherwise, every row requires a verified Access identity, active account, and active linked person. Unsupported methods/routes remain rejected.

`Related editor` means self, direct parent editing child, or spouse in either direction, using current active server-loaded relationships. It does not grant security-field access.

| Existing endpoint and method | Target action | Member rule | Explicit Administrator rule |
|---|---|---|---|
| `GET /api/me` | `session.read` | Return own active account/person context and UI permissions. Matching approved first use may activate a pending account; denied callers receive only the access error, never family data. | Same; disabled Administrators gain no access. |
| `GET /api/directory` | `directory.read` | Family-wide active people/relationships; do not include authoritative account identity records. | Same. |
| `POST /api/directory/people` | `directory.create` | May create a Directory person only; no account, household assignment, or relationship creation. | May create and separately authorize household/relationship fields. |
| `PATCH /api/directory/people/:id` | `directory.profile.edit` | Related editor for ordinary profile fields only. | Explicit edit-any-person action. |
| Same person POST/PATCH, household field changes | `directory.household.assign` | Denied. | Allowed for valid target household or clearing assignment. |
| Same person POST/PATCH, relationship additions/removals | `directory.relationship.manage` | Denied, including nested payloads. | Allowed subject to relationship integrity. |
| Same person POST/PATCH, login/account security fields | `account.manage` | Denied. | Use dedicated account operations, not the ordinary person-save endpoint. |
| `DELETE /api/directory/people/:id` | `directory.delete` | Retain existing related-editor eligibility for unlinked people, subject to deletion protections. | Same related-editor rule; no delete-any-person override. Account-linked people remain protected. |
| `POST /api/directory/relationships`; `DELETE /api/directory/relationships/:id` | `directory.relationship.manage` | Denied. | Allowed; preserve same-family, no-cycle, uniqueness, and spouse constraints. |
| `PATCH /api/directory/relationships/:id` | `directory.anniversary.edit` | Existing spouse-anniversary edit rule: related editor of either spouse. No relationship rewiring. | Explicit anniversary correction. |
| `GET /api/households` | `household.read` | Read active household names; this grants no access to household content. | Same. |
| `POST /api/households`; `PATCH /api/households/:id`; `DELETE /api/households/:id` | `household.create`, `household.rename`, `household.retire` | Denied. | Allowed; retain occupied/default-household retirement protections. |
| `GET /api/groceries`; `POST /api/groceries`; `PATCH /api/groceries/:id`; `DELETE /api/groceries/:id` | `grocery.read`, `grocery.create`, `grocery.update`, `grocery.delete` | Assigned household only, enforced in queries and writes. | Assigned household only; cross-household override deferred. |
| `POST /api/groceries/import`; `DELETE /api/groceries/checked` | `grocery.import`, `grocery.clearChecked` | Assigned household only, including bulk operations. | Assigned household only; cross-household override deferred. |
| `GET /api/dinner` | `dinner.read` | Assigned household only. | Assigned household only; cross-household override deferred. |
| `PUT /api/dinner/:day` | `dinner.assign` | Assigned household only; assignee must belong to it, or clear the day. | Assigned household only; assignee must belong to it. Cross-household override deferred. |
| `GET /api/news` | `chat.read` | Family-wide reading. This is the current Chat route. | Same. |
| `POST /api/news` | `chat.post` | Sender forced to current account's person. | Same; no impersonation. |
| `PATCH /api/news/:id` | `chat.editOwn`, `chat.pinOwn` | Author only; includes own pin/unpin behavior. | Author-only; moderation of others deferred. |
| `DELETE /api/news/:id`; restricted `PATCH /api/news/:id` | `chat.removeOwn`, `chat.moderate.remove`, `chat.moderate.unpin` | Delete own message; no moderation of others. | Author-only today. Future moderation may remove/unpin others without rewriting or impersonating; not implemented. |
| `GET /api/cozi-calendar` | `calendar.read` | Family-wide read; cached results still require the account gate. | Same; no Cozi write override. |
| `GET /api/events`; `POST /api/events`; `PATCH /api/events/:id`; `DELETE /api/events/:id` | `calendar.local.read/create/update/delete` | Retain existing family-wide local-calendar behavior for active accounts. | Same explicit actions. This retained API uses `household_events`, not the current Cozi UI. |
| `GET /api/people`; `POST /api/people` | `directory.legacy.read/create` | Retain read/create compatibility behind account gate; no security-field or relationship writes. | Same; must not bypass Directory/account safeguards. |
| `GET /api/families`; `POST /api/families` | `family.legacy.read/create` | Retain existing family-wide compatibility behind account gate. | Same explicit actions. |

Directory person creation/deletion and legacy/local-calendar behavior above retain existing eligibility where no agreed decision tightens it. They do not create new administrative privileges. The `/api/people` legacy read currently has different deletion filtering; avoid expanding its output and assess compatibility before changing its response contract. Account revocation must cover it regardless.

Field-level checks apply to changes, not merely to which endpoint was called. Inspect nested person saves so ordinary profile edits cannot smuggle a household or relationship change. Reject unauthorized changes atomically; unchanged submitted values do not confer authority. UI must remove unavailable controls and obtain updated capabilities; API authorization remains mandatory.

If separately implemented, cross-household administration must explicitly identify and authorize one target household. Define separate known override actions for the grocery/dinner operations above, audit writes, and preserve SQL scope for item lookups, imports, and bulk deletion. Never implement `administrator → unrestricted SQL`. The exact transport/UI for selecting the target is implementation detail, not a new existing endpoint.

Implemented read-only routes: `GET /api/admin/accounts` (optional `person_id` filter), `GET /api/admin/accounts/:id`, and `GET /api/admin/security-audit`. Account reads require `account.read`; audit reads require `securityAudit.read`, both Administrator-only. Lists accept `limit` (default 20, maximum 50) and `offset` (0–100000), returning `next_offset`. Audit pages sort newest-first by timestamp/ID; concurrent new events may shift offset pages, so this is a recent-changes view, not an audit export. Only display fields are serialized; raw audit details/labels and security identity identifiers are excluded. Reads do not create audit events. Step 2 introduced no mutations.

Implemented mutation routes use the explicit actions in the Step 3/4 sections below, not a generic `account.manage` grant. No current API may provision accounts through a Directory email write.

Notification routes: `GET /api/notifications/config`, `GET/POST /api/notifications/subscriptions`, `DELETE /api/notifications/subscriptions/:id`, `GET/PATCH /api/notifications/preferences`, and `POST /api/notifications/test`. They use `notification.settings.readOwn`, `notification.subscription.manageOwn`, `notification.preferences.readOwn/updateOwn`, and `notification.test.sendOwn`; Members and Administrators have identical own-account/device rights. Rollout and send-time account checks apply in addition to the central gate. Birthday/Chat/Poll dispatch is internal, not an Administrator send API; see [Notifications](NOTIFICATIONS.md).

## Implemented Phase 4 Step 3 account operations

- `POST /api/admin/accounts`: `account.provision`. Body: existing `person_id`, current `person_version`, explicitly entered `login_email` and `confirm_email`. Creates only a pending Member and approved/unbound identity for the configured Access issuer. Never copies Directory email or changes person/household records. Normalized identity remains reserved even when disabled.
- `POST /api/admin/accounts/:id/disable`: `account.disable`; body: current account `version`. Active/pending becomes disabled, preserving all linked data. Rejects disabling an active Administrator unless another active Administrator has an active person and bound identity for this Access issuer.
- `POST /api/admin/accounts/:id/enable`: `account.enable`; body: current account `version`. Disabled becomes active when bound, otherwise pending; requires active person and valid existing configured identity. Never supplies a subject.
- Each D1 batch checks the acting active Administrator and verified binding, target revision/state, and invariants in the mutation SQL. Failed guards abort through NOT NULL constraints. The final audit insert is part of the same transaction and aborts all writes on failure. Account status changes increment `app_users.version`; every successful first-use binding (including active/unbound accounts) also increments it. Missing targets, stale submissions and duplicates cannot produce successful partial writes.
- Account responses include the revision required for these operations. UI requires email confirmation plus review for provisioning, and explicit review/confirmation for status changes. Directory and roster refresh after mutations. Account deletion/relinking and invitations remain unimplemented. Cloudflare admission remains separately configured; provisioning sends no email.

## Lifecycle, bootstrap, and recovery

- **Pending:** Administrator has approved a specific person and identity; no family-data access. Verified matching activation binds identity atomically. No public signup or auto-provisioning from an email domain or existing Directory fields.
- **Active:** bound identity and active person permit the account gate; feature rules then apply. No assigned household means no ordinary household access.
- **Disabled:** deny application data and mutations even with a valid Access session. Preserve person, relationships, content, identity binding, and audit history. Administrator-controlled reactivation restores access after review; login alone cannot reactivate it.

Historical bootstrap (completed): before enforcement, confirm Bob's existing Directory ID and verified Access identity for `bob@miszuk.com`. Create and bind the initial Administrator using a controlled operator/bootstrap operation, not first-login-wins or a hard-coded permanent email bypass. Review other initial accounts individually. Test Bob's administrative access in a separate session before cutover.

Prevent disabling, demoting, unlinking, deleting the linked person, or removing the usable identity of the last active Administrator. Protect the invariant transactionally, including concurrent requests; a UI warning or count-before-write alone is insufficient. Role and identity changes must not indirectly strand the sole Administrator.

There will initially be one application Administrator. Independent recovery is through authorized Cloudflare/D1 operator access and documented break-glass credentials, not a second application Administrator. Document and test how an authorized operator repairs Bob's account/identity while preserving the account gate and recording the recovery. Keep secrets outside Git; document only approved credential locations and recovery procedures. No permanent secret URL or request-header bypass.

Disabling takes effect for subsequent API requests; it cannot retract data already downloaded or automatically terminate sessions in independent services.

## Future invitations and Photos; implemented notification boundary

External ordinary family members may receive the same family-wide Directory/Chat/Calendar access, with household features determined by assignment. Email domain does not choose role or automatically provision access. Restricted-purpose accounts are deferred.

Later, an Administrator may provision a pending account and send an invitation. A future invitation record can reference the account, approved email, hashed single-use token, expiration, and accepted/revoked timestamps. Acceptance must also require matching verified Cloudflare authentication; possession of the invitation alone is not authentication. Access policy admission for external identities must be coordinated separately. Disabled accounts must never be reactivated by invitation replay. Invitation delivery and tables are not part of this documentation or initial account implementation.

Photos will need an explicit account capability such as `photos.access`, independent of Administrator role, Directory relationships, and household membership. Portal visibility does not replace separate Photos-host/Immich enforcement. Define coordinated revocation for that service before enabling it; portal disabling alone cannot revoke an independent Immich session. No Photos grant table or integration is required now.

Push preferences and per-device subscriptions now reference stable `app_users.id`. Disabling accounts suppresses future delivery; senders recheck eligibility, and identity replacement invalidates subscriptions. Devices are not identities or grants; Administrator role adds no exception. Birthdays, Chat and new-Poll announcements are implemented; other categories remain deferred. See [notification operations](NOTIFICATIONS.md).

## Historical staged cutover and continuing rollback rules

The account schema, reviewed provisioning/comparison, Phase 3 enforcement and Phase 4 administration stages are complete. The sequence below preserves design history; it must not be rerun. Feature moderation/overrides and invitations remain deferred; push was delivered separately. Phase 3 enforced accounts first, then Phase 4 Step 1 tightened household/relationship controls.

1. **Finalize implementation contracts.** Use the matrix above to define explicit actions, field checks, account response shape, and identity-binding recovery. Confirm Bob and the reviewed initial account roster. No enforcement change yet.
2. **Add account tables.** Back up production D1 before a separately authorized additive migration. Keep Directory and application data intact; old code remains compatible with unused tables.
3. **Provision and compare.** Seed only reviewed accounts and Bob's bound Administrator identity. Run the new resolver in comparison mode without granting additional privileges. Verify account/person mappings, unassigned-household handling, and operator recovery. This is a temporary transition, not the target access model.
4. **Cut over atomically at the application boundary.** Enforce active accounts on every API; stop Directory-email identity resolution and default-household fallback. Phase 4 Step 1 subsequently introduced relationship/household restrictions and matching UI together. Preserve existing records and reject unauthorized nested updates. Do not leave a legacy-email fallback available to disabled users.
5. **Expose controlled administration.** The small account management UI and explicit Directory/Household administration shipped with audit and last-Administrator safeguards. Moderation/cross-household overrides did not ship. Independent operator recovery remains necessary. Independently verify each release before proceeding.
6. **Defer future capabilities.** Implement invitations and Photos authorization only with separately approved feature work. Push preferences were subsequently implemented.

Any future permission changes must retain regression coverage of every matrix route, disabled/unprovisioned users, first binding/conflicts, self/parent/spouse edits, forbidden security-field changes, unassigned/cross-household access, nested relationship writes, moderation without impersonation, and concurrent last-Administrator changes. This document itself requires no application tests.

Before cutover, rollback may leave unused additive tables in place. After cutover, the rollback release must retain the account gate and agreed security boundaries. Reverting to the old editable-email/default-household version would reopen access and is not an acceptable routine rollback. Prepare an account-aware rollback build; otherwise recover forward or temporarily restrict access through controlled operator action. Preserve audit and revocation state during recovery; do not restore an old database snapshot merely to roll back code.

## Implemented Phase 4 Step 4 account operations

- `POST /api/admin/accounts/:id/role`: explicit `account.role.change`, body `version`, `role` (`member` or `administrator`). Promotion is a separate reviewed operation; provisioning still creates Members. Role changes preserve account status. Demotion requires another usable Administrator: active account, active person, complete bound configured Access identity. Pending, disabled or unbound Administrators never satisfy this safeguard.
- `POST /api/admin/accounts/:id/identity`: explicit `account.identity.replace`, body `version`, explicitly entered `login_email`, `confirm_email`. Self-replacement is forbidden in API and absent from UI; use independently authorized operator recovery. A different normalized email must be unreserved, including by disabled accounts. The transaction keeps the same account/person/identity record, clears the old subject/binding, and moves enabled accounts to pending; disabled accounts remain disabled. No client subject is accepted. Cloudflare admission remains separate.
- Both operations recheck actor authority and verified binding, target revision and invariants inside one D1 batch. Revision-guarded before/after metadata is written to the audit at the end of that transaction; any guard, uniqueness, mutation or audit failure rolls it all back. No preflight check is authoritative. Role and identity changes increment `app_users.version`.
- Every successful first-use binding now checks the observed account revision and increments it exactly once, including active/unbound roster entries. Concurrent replacement, binding, disable or role changes cannot overwrite a newer revision. Repeated bound requests do not increment it.
- Administrator audit display allowlists role before/after or approved old/new email plus target display name. It never serializes raw metadata, security identity identifiers or credentials. Self-demotion refreshes the frontend identity immediately. Account deletion/relinking, invitations, moderation and unrelated feature permissions remain deferred.

## Household Polls V1 actions

All Poll routes remain behind the authoritative account gate. No Administrator, parent or spouse override applies. SQL rechecks active person/account/current household and creation-time recipient membership, including counts/history/results. No-household accounts receive HOUSEHOLD_REQUIRED.

| Endpoint | Action and scope |
|---|---|
| GET /api/polls, /api/polls/summary, /api/polls/:id | poll.read; own current household recipient snapshot; bounded lists/counts |
| POST /api/polls | poll.create; current household; server-derived active account audience including creator |
| GET /api/polls/:id/results | poll.results.read; same recipient boundary; named household results |
| PUT /api/polls/:id/response | poll.respondOwn; own response only, open/unexpired poll, same-poll option and response revision |
| POST /api/polls/:id/close | poll.closeOwn; current household creator, open poll and poll revision |

Question/choices cannot be changed after publication; no delete/reopen/impersonation endpoint exists. Notification preferences remain own-account; Poll sends additionally enforce household audience and exclude creator. See [Polls](POLLS_REQUIREMENTS.md).
