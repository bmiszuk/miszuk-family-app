# Application boundaries

One React application, one Cloudflare Worker, and one D1 database remain the deployment unit.

- `src/app`: shell, current-user loading and existing hash navigation.
- `src/features`: feature pages and their Home cards. Home composes these cards; groceries owns Quick Add, calendar owns its summary, chat owns the pinned message, and Directory owns family dates.
- `src/shared`: browser HTTP/hooks and shared UI. Polling and mounted-page behavior are intentionally unchanged.
- `src/domain`: pure, browser/server-safe date, display and Directory relationship rules. No React, database or credentials here.
- `src/api/shared/auth.js`: Cloudflare JWT validation and origin protection, called by the Worker before routing.
- `src/api/shared/accounts.js` and `accountGate.js`: verified Cloudflare identity to an active provisioned account, active Directory person, and optional active household. The Worker awaits this boundary before every API handler, including legacy routes and cached Cozi responses. Approved identities bind atomically on first use. Directory email and default-household fallback are not authorization inputs. `identity.js` retains only legacy comparison support and the protected household constant.
- `src/api/shared/permissions.js`: feature-specific policy decisions and household query scope. Unknown actions deny. Explicit Administrator actions govern household assignment/management, relationship creation/removal, and profile/anniversary corrections. Unknown actions and unrelated feature privileges remain denied.
- `src/api/admin/handler.js`: Administrator-only account roster/detail and bounded security-audit display. Responses explicitly serialize display fields; no raw identity/audit records. Directory exposes these through an Administrator disclosure and per-person access information. `mutations.js` implements only pending-Member provisioning and enable/disable, with transaction-time authority/revision guards and atomic audits. Last usable Administrator protection applies; identity/role changes remain deferred.
- `src/api/<feature>`: validation, feature authorization calls and persistence configuration. Shared `records.js` retains the existing versioned CRUD mechanics; it contains no feature-name branches. It is optional plumbing, not a framework future features must use.
- `src/index.css`: ordered stylesheet entrypoint. Most existing rules remain in `shared/base.css`; Calendar rules establish feature CSS ownership without rewriting the cascade.

## Existing policy compatibility

Directory profile editing permits self, parent-to-child and spouses in both directions, plus an explicit Administrator edit-any override. Eligible Members can edit anniversaries, but household assignments and relationship creation/removal are Administrator-only, including nested person saves and creation payloads. Household creation/rename/retirement is Administrator-only; names remain readable by Members. Privileged mutations recheck active Administrator authority and insert security audit records in the same D1 transaction; failures roll back all changes. Household edits require the expected current name for concurrency protection. Chat ownership and household SQL scopes are unchanged. Accounts without an active household receive no Grocery/Dinner access. Account-linked people cannot be deleted; legacy login email remains frozen.

The Worker remains the authentication and application-account boundary for family-wide reads, person creation, Cozi and legacy endpoints. Record validity/consistency rules remain local: Dinner assignees must belong to the household, Directory relationship transactions and D1 constraints remain authoritative, and default/occupied households cannot be retired. These are not automatically inherited as Vehicle authorization rules.

## Legacy API inventory

`/api/people`, `/api/families`, and `/api/events` remain routed and unchanged. No current frontend caller was found in the repository. Local events have existing API regression tests; families/people now have explicit compatibility tests. This repository inspection cannot establish whether an external client uses them, so none is removed. Current Calendar uses `/api/cozi-calendar`.

## Deliberately deferred

Account identity and role changes, invitations, Chat moderation, cross-household administration, Photos and Vehicles remain deferred. Current account roles/status are authoritative at the request boundary; revocation must not be implemented by deleting Directory people. Household query scope must accompany any future cross-household permission expansion; changing a UI button or a single boolean alone is insufficient.

Before or alongside Vehicles, define its own ownership/actions explicitly. Further splitting `domain/familyDisplay.js`, feature CSS extraction and coordinating duplicate polling can proceed separately when useful; none is required to add a feature handler. The legacy endpoints must be included in any future system-wide access/revocation rollout.
