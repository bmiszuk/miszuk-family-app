# Implementation Roadmap

Audited September 30, 2026 against repository/application release `4d3b89c` and Bob's confirmed status. This is planning guidance, not implementation authorization or a promise of sequence. Documentation commits do not change the production release.

## Completed

- **Architecture:** feature boundaries/refactor complete. One React app, Worker and D1 remain the deployment unit. No further architecture cleanup is a prerequisite for features; see [architecture](../ARCHITECTURE.md).
- **Core portal:** Home, household Groceries and Dinner, Family Chat/notices, Directory/relationships/family dates, Cozi Calendar, mobile navigation and installable PWA.
- **Users & Permissions through Phase 4:** authoritative provisioned-account boundary; explicit Directory/Household administration; account roster/audit display; provision, enable/disable, role changes and controlled approved-identity replacement. No universal Administrator bypass. See [implemented policies and deferred options](USERS_PERMISSIONS.md).
- **Push foundation and family enrollment:** voluntary per-device enrollment for eligible active accounts; Bob's physical-iPhone pilot passed, documented at `0ede46c`; family enrollment released at `60907c0`.
- **Birthday and Family Chat categories:** deployed at `4d3b89c`, with independent account-wide opt-outs, privacy-safe payloads and duplicate prevention. See [notification operations](NOTIFICATIONS.md). Deployment is complete; the two real-device category checks below remain open.

## Near-term candidates — no project selected

- **Finish notification acceptance:** Chat between two family members (recipient receives it, author does not, tap opens Chat) and the first naturally scheduled 8 AM Chicago birthday (one notification per birthday per enrolled device, tap opens Home). Record results without fabricating birthdays or sending unsolicited test messages.
- **Personal grocery lists:** design individual ownership, optional sharing and navigation alongside existing household lists. No change to household behavior is implied.
- **Family surveys/polls:** e.g. “Who will be home Saturday for dinner?” Define recipients, response visibility, results for the creator, and login prompts for appropriate nonrespondents, including dismissal/re-prompt behavior. Push reminders need their own consent/preferences decision.
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

House Projects, Recipes and Documents remain original unimplemented portal ideas, without detailed approved scope. Future notification categories may include polls, Dinner, Calendar, anniversaries/family dates and Vehicles, but only Birthdays and Chat currently send. User-selectable preferences accompany any approved expansion; a reserved category key is not an implemented feature.

## Deferred or optional work

- Chat Administrator moderation, cross-household Grocery/Dinner administration, and any delete-any-person override remain unimplemented options, not unfinished requirements for the completed Phase 4 release. Require separate authorization and explicit audited actions.
- Restricted-purpose accounts, account unlink/relink/delete workflows, additional Photos/Vehicle permissions and invitation delivery require a real scoped need. Additional Administrators are already supported by role administration; do not create one speculatively.
- Push retries/durable queue, quiet hours and broader provider support are deferred. Current delivery is best-effort/at-most-once; evaluate improvements if actual delivery or scale warrants them.
- Soft-delete restore UI, legacy API retirement, further CSS extraction, display-helper splitting and polling consolidation are optional. No broad cleanup/refactor is required now; preserve compatibility until consumers are understood.

## Small worthwhile maintenance / documentation debt

- **Operator handoff:** turn private helper locations and tested recovery artifacts into a successor-usable, secret-free runbook; document vault recovery and backup retention/restore ownership. Existing private artifacts alone are not a complete portable recovery process.
- **Migration history:** reconcile manually applied historical migrations with the remote ledger before any later migration run; never blindly reapply absent ledger entries or change production during a documentation audit.
- **Legacy data exposure review:** README records historical local database copies in Git. Verify repository access/history separately before any sharing or history cleanup; do not rewrite history as routine housekeeping.
- **Notification operations:** retain documented delivery limits; decide ledger retention only if growth warrants it, preserving duplicate protection. Record real-device category results when available.
- **Documentation discipline:** keep this roadmap as the status index and feature docs as detailed requirements/operations. Historical release checkpoints are not current rollback instructions. Update status with each scoped release rather than duplicating checklists across docs.

Choose the next project explicitly. Preserve the stable app and current security boundary; do not infer authorization to implement any item from this roadmap.
