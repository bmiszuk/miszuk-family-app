# Technical Health Review

Reviewed October 1, 2026 against application commit `240209e` (the Home/Polls cleanup release). This is a review checkpoint, not an authorization to refactor or start Vehicles.

## Conclusion

The application still has a coherent architecture. It remains one React/Vite client, one Cloudflare Worker and one D1 database. The recent additions—central application accounts, household scoping, push notifications and household Polls—fit the existing feature boundary model. The Worker-wide account gate is in the right place before routing, and feature handlers retain responsibility for validation, policy and SQL scope.

Incremental development has created some understandable pressure points, but no structural break that should block normal feature work. A focused Vehicles design can proceed after the operational prerequisites below; a broad architecture rewrite would add risk without a demonstrated benefit.

## Findings

### Architecture and frontend

- `src/app/App.jsx` is still a small shell, but it composes every feature and owns hash navigation, account loading and cross-feature Home wiring. This is acceptable for the current size. Keep new features self-contained and avoid moving feature policy into the shell.
- `src/features/*` has clear ownership for Groceries, Dinner, Calendar, Chat, Directory, Notifications and Polls. Home cards are intentionally composed there rather than duplicating feature data models.
- `src/shared/base.css` contains the accumulated global layout and mobile overrides, while only some features have separate stylesheets. The ordered override sections are now the most visible frontend maintenance cost. This is worth gradual extraction when a feature is already being changed, but does not justify a standalone CSS refactor before Vehicles.
- `src/domain` remains appropriately pure. Continue putting date, display and relationship calculations there rather than in React components or SQL.

### Worker/API

- `worker.js` performs authentication, origin protection and `requireAccount` before `src/api/router.js`; this protects legacy routes and Cozi as well as current feature routes.
- `src/api/shared/permissions.js` provides explicit feature actions, while `src/api/<feature>` owns feature-specific checks. This preserves Authentication ≠ Identity ≠ Authorization and avoids a speculative generic RBAC framework.
- `src/api/shared/records.js` is useful CRUD plumbing, but its generic `SELECT *`/public-record behavior means each future feature must deliberately review which fields it exposes. Feature-specific handlers such as Groceries already need custom serialization for household-safe requester names. Do not expand the generic helper to absorb feature policy.
- `/api/people`, `/api/families` and `/api/events` remain compatibility routes with no current frontend callers (`ARCHITECTURE.md` records this). They should remain until external usage is known; include them in any future access or retirement decision.

### D1 schema and migrations

- The additive migration history is understandable and preserves production data. `app_users`/`user_identities` separate account identity from `people`; restrictive foreign keys protect account-linked people. Poll recipient snapshots and notification delivery claims correctly preserve historical access and duplicate prevention.
- `relationships` still uses directional `person1_id`/`person2_id` rows plus triggers for spouse uniqueness, parent cycles and same-family validation. Domain policy derives both directions. This is adequate for the family portal; do not turn it into a genealogy model for Vehicles.
- `families/events` and newer household tables coexist because of the original application and compatibility APIs. That duplication is known and acceptable while legacy consumers are unknown.
- The principal operational risk is migration history, not table design: reconcile the remote D1 migration ledger with the repository and manually applied history before the next production migration. Use the established private backup, restore and table-fingerprint procedure.

### Security, data scope and operations

- Account resolution is authoritative; editable `people.login_email` and default-household fallback are no longer security inputs. Household SQL scopes are present for household features, and Administrator actions are explicit and audited.
- Notifications deliberately use best-effort at-most-once delivery and a two-entry UTC schedule guarded by America/Chicago time. This is proportionate for a private family app. A durable queue, retries or broader provider support should wait for evidence of missed delivery or scale.
- The documented recovery bundles, D1 restore verification, Cloudflare secret handling and account-aware maintenance release are valuable, but the successor runbook remains incomplete until private helper locations, vault recovery ownership and backup retention are documented in a secret-free operator handbook.
- Real-device notification checks remain an operational acceptance item in the notification documentation. Synthetic coverage is strong; do not treat browser tests as proof of iPhone delivery.

### Tests and coverage

The suite covers account gating, identity activation, permissions, household isolation, migrations, notifications, Polls and UI rendering (152 tests at this checkpoint). Meaningful remaining gaps are operational rather than broad unit-test absence: real two-person Chat push, first naturally scheduled birthday, and physical-device Poll push acceptance are documented as pending. Future feature work should add focused policy/API tests and one representative UI flow, rather than snapshotting the whole application.

## Priority classification

### Address before Vehicles

1. ~~Reconcile the remote D1 migration ledger~~ **Completed October 1, 2026.** The four historical gaps were recorded as bookkeeping only after backup/restore verification; no schema SQL was replayed. Preserve the private evidence before the next migration.
2. Make the successor/recovery handbook operational: identify where the tested recovery artifacts live, who owns backup retention and restore access, and how Cloudflare/GitHub/D1 credentials are recovered. Record locations and procedures, never secrets.
3. Resolve the Vehicles design decisions already called out in `docs/VEHICLES_REQUIREMENTS.md`: ownership and authorization actions, attachment/storage boundaries, maintenance data scope, and the first-phase mobile workflow. Vehicles must not inherit Directory relationships or household Grocery access by accident.

### Worth addressing later

- Extract the highest-churn mobile/layout rules from `src/shared/base.css` into feature-owned stylesheets as those features are touched.
- Review the response shapes of generic records and compatibility APIs, then document or narrow fields when there is a concrete consumer and safe compatibility path.
- Revisit duplicate polling/useCollection refresh behavior and display-helper boundaries if a feature change makes the cost visible.
- Record the remaining real-device notification results and decide whether delivery volume justifies a queue or retry design.

### Known/acceptable debt — leave alone

- Legacy `/api/people`, `/api/families` and `/api/events` routes and the original `families/events` tables, while external usage remains unknown.
- The directional relationship representation and the existing household/default compatibility records.
- Best-effort notification delivery and the two-UTC-cron schedule at current family scale.
- Unimplemented original portal ideas (Photos, Vehicles, House Projects, Recipes and Documents) and deferred Poll features. Their requirements documents and roadmap are sufficient; do not prebuild infrastructure.

## Vehicles gate and next checkpoint

Vehicles Phase 1 can begin after the three “Address before Vehicles” items are either completed or explicitly accepted by Bob. Begin with the approved requirements document and a small design/authorization slice, then add schema and UI in independently deployable steps. Do not add R2, Immich, queues or another service without a concrete Vehicles requirement and a backup/recovery plan.

This review does not authorize implementation. The next technical-health review should follow roughly 2–4 meaningful feature projects, or sooner if a concrete security, migration or operational risk appears. The roadmap remains the status index; this document is the evidence checkpoint for this review.
