# Implementation Roadmap

Updated October 1, 2026 for Family Polls V1, following the September 30 audit of release `4d3b89c`. This is planning guidance, not implementation authorization or a promise of sequence. Documentation commits do not change the production release.

## Completed

- **Architecture:** feature boundaries/refactor complete. One React app, Worker and D1 remain the deployment unit. No further architecture cleanup is a prerequisite for features; see [architecture](../ARCHITECTURE.md).
- **Core portal:** Home, household Groceries and Dinner, Family Chat/notices, Directory/relationships/family dates, Cozi Calendar, mobile navigation and installable PWA.
- **Users & Permissions through Phase 4:** authoritative provisioned-account boundary; explicit Directory/Household administration; account roster/audit display; provision, enable/disable, role changes and controlled approved-identity replacement. No universal Administrator bypass. See [implemented policies and deferred options](USERS_PERMISSIONS.md).
- **Push foundation and family enrollment:** voluntary per-device enrollment for eligible active accounts; Bob's physical-iPhone pilot passed, documented at `0ede46c`; family enrollment released at `60907c0`.
- **Birthday and Family Chat categories:** deployed at `4d3b89c`, with independent account-wide opt-outs, privacy-safe payloads and duplicate prevention. See [notification operations](NOTIFICATIONS.md). Deployment is complete; the two real-device category checks below remain open.

- **Family Polls V1:** household recipient snapshots, single-choice answers, seven-day expiry/early close, named results/history, compact Home discovery and new-poll push with default-On preference. See [requirements and operations](POLLS_REQUIREMENTS.md). Physical-device delivery/tap acceptance remains open.

## Near-term candidates — no project selected

- **Finish notification acceptance:** Chat between two family members (recipient receives it, author does not, tap opens Chat), a genuine new household Poll (generic push to other opted-in recipients, creator excluded, tap Home), and the first naturally scheduled 8 AM Chicago birthday (one notification per birthday per enrolled device, tap opens Home). Record results without fabricating birthdays or sending unsolicited test messages.
- **Personal grocery lists:** design individual ownership, optional sharing and navigation alongside existing household lists. No change to household behavior is implied.
- **Grocery ordering investigation:** investigate transferring unchecked grocery items to ALDI/Instacart, Walmart and Costco using official APIs, deep links or other supported integration mechanisms. Investigation only; no retailer integration is implemented.
- **Dinner/Calendar notifications:** scope useful events, recipients, timing and category preferences before implementation. Current push infrastructure is reusable; these triggers are not implemented. Calendar is read-only Cozi, so do not assume a local event-write trigger.
- **Administrator-provisioned external invitations:** build on existing pending accounts; decide delivery/expiry/replay protection and coordinate Cloudflare admission separately. No public signup.
- **Vehicles first phase:** can be selected for new app development without waiting for Photos; resolve ownership/permissions and attachment storage/limits first. Retain the phased plan below.
- **Infrastructure handbook/inventory:** document actual home server, storage, backup, network and recovery arrangements. This is a prerequisite for Photos/self-hosting, not a blanket blocker for the other app candidates. See [handbook outline](infrastructure/HANDBOOK_OUTLINE.md).

## Later projects and phased expansion

### Photos / Immich

Follow [Photos requirements](PHOTOS_REQUIREMENTS.md): infrastructure inventory → storage/privacy design → isolated sample-only Immich pilot → limited read-only archive pilot → secure `photos.miszuk.com` and origin → Bob-only portal integration → gradual archive expansion → later family access/uploads, native apps and encrypted off-site backup.

Do not install or expose Photos until its prerequisites are verified. The WD Red archive/folder organization and existing ingestion workflow stay authoritative; private directories preferably stay unmounted. Immich is separate from the Worker/D1. Explicit Photos authorization is independent of Administrator role. Backup provider/software are undecided.

### Vehicles

Follow [Vehicles requirements](VEHICLES_REQUIREMENTS.md); do not duplicate or prematurely resolve its open decisions. Planned phases:

1. Vehicles, specifications, maintenance history, permanent documents/photos.
2. Maintenance schedules/reminders.
3. Fuel tracking and temporary fuel-photo OCR.
4. Permanent receipt/invoice recognition with user review.
5. Optional parts/supplies Inventory, preserving historical costs.
6. Warranties.
7. Reporting/refinements: costs, MPG, fuel costs, inventory value, upcoming maintenance, warranties, history and export.

Vehicle permissions must be explicit; neither Directory relationships nor household Grocery access defines them. R2 attachment storage is planned, not deployed. Phases remain revisable.

### Other preserved ideas

House Projects, Recipes and Documents remain original unimplemented portal ideas, without detailed approved scope. Future notification categories may include Dinner, Calendar, anniversaries/family dates and Vehicles; Birthdays, Chat and new Polls currently send. User-selectable preferences accompany any approved expansion; a reserved category key is not an implemented feature.

## Deferred or optional work

- Polls expansion: multiple-choice, anonymous voting, free text, multi-question surveys, proxy answers, repeated reminders and natural-language deadlines remain deferred. V1 is deliberately one household question with one choice per person.
- Poll response notifications remain an undecided future possibility; no response notifications are implemented.

- Chat Administrator moderation, cross-household Grocery/Dinner administration, and any delete-any-person override remain unimplemented options, not unfinished requirements for the completed Phase 4 release. Require separate authorization and explicit audited actions.
- Restricted-purpose accounts, account unlink/relink/delete workflows, additional Photos/Vehicle permissions and invitation delivery require a real scoped need. Additional Administrators are already supported by role administration; do not create one speculatively.
- Push retries/durable queue, quiet hours and broader provider support are deferred. Current delivery is best-effort/at-most-once; evaluate improvements if actual delivery or scale warrants them.
- Soft-delete restore UI, legacy API retirement, further CSS extraction, display-helper splitting and polling consolidation are optional. No broad cleanup/refactor is required now; preserve compatibility until consumers are understood.

## Development checkpoints

Follow the [development and technical-health principles](../ARCHITECTURE.md#development-and-technical-health-principles). GitHub documentation is the durable source of project decisions and status. Design major modules before implementation; keep infrastructure justified by real needs and watch feature sprawl as projects are selected.

After roughly 2–4 meaningful feature projects from the September 30, 2026 whole-project review, perform a focused architecture/technical-health review; repeat that cadence thereafter, or sooner for a concrete risk. Record the review checkpoint and actionable findings here. This is not a scheduled deployment or a standing refactoring project. Maintain successor/recovery instructions as part of each relevant change rather than postponing them until that review.

The October 1, 2026 checkpoint is recorded in [Technical Health Review](TECHNICAL_HEALTH_REVIEW.md). It found the architecture coherent; before Vehicles, reconcile the D1 migration ledger, make successor recovery documentation operational, and resolve Vehicles' explicit ownership/storage decisions.

## Small worthwhile maintenance / documentation debt

These concrete items remain open; general health reviews do not replace or close them. Record evidence when an item is resolved.

- **Operator handoff:** turn private helper locations and tested recovery artifacts into a successor-usable, secret-free runbook; document vault recovery and backup retention/restore ownership. Existing private artifacts alone are not a complete portable recovery process.
- **Migration history:** reconciled October 1, 2026. The remote ledger now records 0001–0011 exactly once; 0004–0007 were recorded as bookkeeping only because their schema was already present. Preserve the private export/evidence and never replay those migrations.
- **Legacy data exposure review:** README records historical local database copies in Git. Verify repository access/history separately before any sharing or history cleanup; do not rewrite history as routine housekeeping.
- **Notification operations:** retain documented delivery limits; decide ledger retention only if growth warrants it, preserving duplicate protection. Record real-device category results when available.
- **Documentation discipline:** keep this roadmap as the status index and feature docs as detailed requirements/operations. Historical release checkpoints are not current rollback instructions. Update status with each scoped release rather than duplicating checklists across docs.

Choose the next project explicitly. Preserve the stable app and current security boundary; do not infer authorization to implement any item from this roadmap.
