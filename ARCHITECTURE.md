# Application boundaries

One React application, one Cloudflare Worker, and one D1 database remain the deployment unit.

- `src/app`: shell, current-user loading and existing hash navigation.
- `src/features`: feature pages and their Home cards. Home composes these cards; groceries owns Quick Add, calendar owns its summary, chat owns the pinned message, and Directory owns family dates.
- `src/shared`: browser HTTP/hooks and shared UI. Polling and mounted-page behavior are intentionally unchanged.
- `src/domain`: pure, browser/server-safe date, display and Directory relationship rules. No React, database or credentials here.
- `src/api/shared/auth.js`: Cloudflare JWT validation and origin protection, called by the Worker before routing.
- `src/api/shared/identity.js`: trusted authenticated identity to optional Directory person and effective household. Current email matching and default household fallback are unchanged. No email-domain eligibility rule is introduced.
- `src/api/shared/permissions.js`: feature-specific policy decisions and household query scope. Unknown actions deny. Future provisioned accounts/roles can feed this boundary without changing how a Directory person represents a family member.
- `src/api/<feature>`: validation, feature authorization calls and persistence configuration. Shared `records.js` retains the existing versioned CRUD mechanics; it contains no feature-name branches. It is optional plumbing, not a framework future features must use.
- `src/index.css`: ordered stylesheet entrypoint. Most existing rules remain in `shared/base.css`; Calendar rules establish feature CSS ownership without rewriting the cascade.

## Existing policy compatibility

Directory editing still permits self, parent-to-child and spouses in both directions. Chat writes require a mapped person and edits/deletions require message ownership. Groceries and Dinner queries/writes remain household-scoped; unassigned members retain the existing default-household behavior. Dinner assignment still requires an assigned household. Every authenticated member can still manage households. This refactor does not add roles or tighten existing policy.

The Worker remains the authentication boundary for family-wide reads, person creation, Cozi and legacy endpoints. Record validity/consistency rules remain local: Dinner assignees must belong to the household, Directory relationship transactions and D1 constraints remain authoritative, and default/occupied households cannot be retired. These are not automatically inherited as Vehicle authorization rules.

## Legacy API inventory

`/api/people`, `/api/families`, and `/api/events` remain routed and unchanged. No current frontend caller was found in the repository. Local events have existing API regression tests; families/people now have explicit compatibility tests. This repository inspection cannot establish whether an external client uses them, so none is removed. Current Calendar uses `/api/cozi-calendar`.

## Deliberately deferred

No roles, invitations, account status, external-login provisioning, Vehicles, migrations or new UI. Future access revocation belongs in the authenticated request/identity policy path and must not be implemented by deleting Directory people. Household query scope must accompany any future cross-household permission expansion; changing a UI button or a single boolean alone is insufficient.

Before or alongside Vehicles, define its own ownership/actions explicitly. Further splitting `domain/familyDisplay.js`, feature CSS extraction and coordinating duplicate polling can proceed separately when useful; none is required to add a feature handler. The legacy endpoints must be included in any future system-wide access/revocation rollout.
