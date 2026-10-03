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

## Vehicles Phase 1 post-implementation review

Reviewed October 2, 2026: application `b8db621`, deployment documentation `bff2ff9`. The earlier review above remains a historical checkpoint. This review changes documentation only; it does not authorize implementation work.

### Assessment and scope

Vehicles fits the existing architecture cleanly. Pure validation stays in `src/domain`, scoped persistence in `src/api/vehicles/service.js`, transport/serialization in its handler, and the compact UI in `src/features/vehicles`. R2 is justified by the approved attachment requirement; there is no separate service or generic permission framework. No broad refactor or schema redesign is indicated.

Reviewed migrations 0012/0013, all Vehicles/maintenance/attachment routes, shared account/policy/audit boundaries, R2 cleanup, menu/UI structure, relevant tests, and architecture/security/requirements/recovery documentation. Three isolated, in-memory SQLite/Worker probes confirmed the filename, mileage and household-retirement findings below. No production requests, data changes, infrastructure changes or deployment were performed for this review. The recorded release verification includes 185 passing tests, lint/build, desktop/iPhone-sized layouts and production cleanup; those unchanged checks were not rerun. Physical-iPhone acceptance is still separate from that evidence.

### What is sound

- **Account and household boundary:** the central Worker gate precedes Vehicles routing. Each resource operation resolves the associated vehicle, checks explicit Vehicle policy and includes live account/person/binding/active-household conditions in SQL. Driver choices are household-scoped. Client household/author fields cannot confer authority. `vehicle.readAny`/`vehicle.correctAny` require deliberate Administrator mode; spouse/parent relationships confer no Vehicle rights. No cross-household family-data leakage or authentication bypass was found.
- **Model and validation:** 0012 preserves existing tables and uses restrictive foreign keys, integer mileage/cents, status/category constraints, valid driver-assignment triggers and account attribution independent of editable `performed_by`. API validation adds actual-date, length, type and field allowlists. Sanitized responses omit authentication identifiers, object keys and internal account attribution. Sold/Inactive retains records/files; ordinary vehicle deletion is absent.
- **Concurrency and integrity:** vehicle/maintenance revisions and SQL guards reject stale writes and access changes during a transaction. Required audit insertions share the privileged D1 transaction; Administrator rights do not bypass integrity. The 0013 trigger enforces independent five-file parent quotas even under concurrent uploads, prevents moving/replacing metadata, and atomically queues removal when metadata or maintenance is deleted.
- **R2 lifecycle:** private bucket access is through the authorized Worker, using unrelated UUID object keys. Actual stream bytes are bounded at 10 MB, declared type is checked against signatures, and responses use canonical MIME, no-store, nosniff and sandbox headers. Reserve → put → guarded ready transition, compensating cleanup, durable deletion jobs, expired-reservation cleanup and aged-orphan scans cover ordinary partial failures and late uploads. R2 deletion precedes acknowledging its D1 job; failed cleanup remains retryable. D1/R2 are deliberately not presented as one atomic transaction.
- **UI:** account-menu-only entry, one-line vehicle/mileage rows, maintenance-first navigation, secondary specifications and compact lazy file areas follow the approved scope. Feature CSS retains mobile touch targets and desktop columns. No Home card, gallery, OCR, fuel or schedule UI was introduced.

### Concrete findings

P2 means a concrete medium-priority issue with a limited trigger; P3 means targeted technical debt. No critical/high-severity access-control finding was identified.

| ID / severity | Classification | Evidence and consequence | Recommended follow-up, not implemented |
|---|---|---|---|
| V1 / P2 | **Resolved in `6128b70` (deployed October 2, 2026)** | An upload accepted by the existing content/type validator now receives a safe display/download extension derived from that validated type. Mismatched suffixes are replaced while retaining a safe useful basename; supported PDF/JPEG/PNG/HEIC/HEIF types are covered. Regression tests include an active-file `.CMD` name and assert a PDF download disposition ends in `.pdf`. No validation or private-R2 boundary was weakened. | No further V1 action. |
| V2 / P2 | **Resolved in `6128b70` (deployed October 2, 2026)** | Maintenance deletion now asks “Remove entry? Attached files will be permanently deleted.” when linked attachments exist, and retains “Remove this entry?” when none exist. Focused tests cover both states. Cancellation remains available. | No further V2 action. |
| V3 / P2 | **Tracked technical debt; no planned-phase dependency** | `src/api/vehicles/service.js:79,120`: manual mileage correction replaces the value, but any later maintenance edit reapplies the maximum using that record's retained mileage, even when only notes changed. Probe: maintenance 200 → manual correction 100 → notes-only edit → current mileage 200. This can silently undo an intentional correction and affect later mileage-dependent use. | Preserve manual corrections across unrelated historical edits; explicitly test when a new/changed mileage should advance the value. Until corrected, fix the erroneous maintenance mileage as well as the vehicle's current mileage. Resolve before any future feature relies on these mileage semantics. |
| V4 / P2 | **Tracked technical debt; no planned-phase dependency** | `migrations/0007_household_retirement.sql:3` blocks retirement only for active people; `src/api/households/handler.js` adds no Vehicles guard. Vehicles SQL requires an active household (`service.js:15`), including Administrator mode. Probe: an empty non-default household containing a vehicle retired successfully (200); explicit Administrator vehicle read then returned 403, with the row retained. Files/history become inaccessible through normal UI/API, rather than deleted. The protected default household cannot be retired. | Prevent retirement from stranding Vehicles data, or provide a deliberate, authorized retained-history path. Test retirement with Active and Sold/Inactive vehicles and attachments. Do not solve this by weakening household scope or deleting history. This is lifecycle debt, not a prerequisite for an unplanned phase. |

### Worthwhile technical debt

- **Cleanup pagination/failure coverage (P3):** the attachment mock's `list()` always returns `truncated:false`; it does not exercise persisted cursor advancement, restart or multiple pages (`tests/vehicle-attachments.test.mjs`). Add focused coverage before changing cleanup. The oldest-first 50-job batch and abort-on-error orphan page can repeatedly encounter failing work; test continued progress behind failures and document operator inspection of queue age/attempts. Existing durable retries are sound; no new queue/service is justified now.
- **Upload audit meaning (P3):** Administrator `attachment.upload` is audited with the reservation before R2 succeeds (`attachments.js:62`). A failed/compensated upload can therefore leave that event without a surviving file. Document it as an authorized attempt/reservation, or make completion/failure distinguishable in a future scoped change; it must not be interpreted as proof of durable upload success.
- **Focused regression gaps (P3):** add the four reproductions above, maintenance-parent attachment cross-household cases explicitly, and access revocation during `put()`/ready finalization. Current tests already cover the shared guard, concurrent quotas, stale writes, audit rollback, uncertain puts, deletion failures, expired uploads and a late upload after parent deletion. Static UI tests do not replace stateful picker/delete interaction or physical-device acceptance. Do not build a broad snapshot suite.
- **Successor recovery:** existing requirements and `PHASE3_RECOVERY.md` correctly document bucket/binding, keys, deletion, rollback and pausing cleanup before D1 restore. The established open debt remains: private helper/checksum locations, backup retention and credential recovery need a portable successor runbook. Historical checkpoint sections are not current deployment instructions.

### Acceptable limitations and documentation accuracy

- R2 has **no independent binary backup**. This is explicitly approved and documented, not a missing D1 backup. Retain original receipts/documents elsewhere if they are irreplaceable. D1 restores cannot recreate deleted objects; pause cleanup/mutations and reconcile preserved metadata/jobs/object inventory before resuming, as the recovery doc requires. Do not add backup infrastructure under this review.
- Orphan recovery is eventual, bounded to 100 listed objects per existing daily Cron invocation, with a one-hour age guard; pending reservations expire after 15 minutes but are swept on those invocations. Missing objects return an unavailable response rather than pretending the file exists. Limits are proportionate to family scale, not a prompt for an immediate scheduler redesign.
- Signature checks are file-type checks, not complete document decoding or malware scanning. HEIC has no conversion and preview depends on the browser. Physical-iPhone picker/HEIC and Safari PDF-preview acceptance remain pending; production download byte verification does not prove those device behaviors.
- Vehicle service holds live author attribution and soft-delete metadata, not a full revision-history/restore interface. Offset pagination and one parent revision serializing maintenance writes are adequate for the current scale. Optional categories and editable service-provider text are intentional; no schema mistake requires prebuilding schedules or Inventory.
- Architecture, security and deployment docs accurately describe the main implemented boundary and storage/recovery model. Their optimistic mileage summary needs the V3 qualification, and household-retirement policy does not yet cover V4. This checkpoint and the roadmap now record those exceptions; requirements remain authoritative, and neither implementation nor settled product requirements were silently changed.

### Use and next-phase decision

Vehicle/maintenance use within the current active-household/account boundary remains safe as deployed; there is no finding requiring the portal to be taken offline. V1/V2 are resolved. Attachments still have no independent binary backup, so keep irreplaceable originals; the documented iPhone picker/HEIC and Safari preview checks remain device-specific limitations. Avoid retiring households containing Vehicles records. V3/V4 remain tracked technical debt with no dependency on a planned feature phase; address them in a future scoped maintenance/data-integrity update. The remaining debt does not justify a broad rewrite.
