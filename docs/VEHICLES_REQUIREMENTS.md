# Vehicles requirements

Status: Phase 1 Chunks 1–3 are implemented and deployed, including the data/domain foundation, scoped API, compact account-menu UI and private vehicle/maintenance attachments. Chunk 3 production release is `b8db621`, verified October 1, 2026 (America/Chicago). Physical-iPhone picker/HEIC and native Safari PDF-preview acceptance remain device checks, not later-phase functionality. Later Vehicles phases remain separate. See [Application boundaries](../ARCHITECTURE.md) for the current architecture.

## Purpose

Vehicles should answer:

- What vehicles are in each household?
- What specifications and parts do they use?
- What maintenance has been performed, and what did it cost?
- What needs to be done next?
- What parts are still under warranty?

Vehicles is its own modular feature within the existing private family portal, following the ownership boundaries in ARCHITECTURE.md.

## Vehicle record

Phase 1 vehicle record supports:

- Year, make, model and trim.
- VIN and license plate.
- Purchase date and mileage at purchase.
- Last-known/current mileage.
- Active or Sold/Inactive status.
- One household, referencing an existing Household.
- One optional Primary driver, referencing a Directory person in that household. This describes the normal driver, not legal ownership.
- Notes.
- Engine, oil specification/viscosity and oil capacity.
- Multiple oil-filter references, each with brand and part number.
- Front/rear tire sizes and recommended pressures.
- Driver, passenger and rear windshield-wiper sizes.
- Lug-nut/socket size.
- Attachments follow the finalized Phase 1 attachment decisions below. Vehicle attachments are useful documents or occasional photos; they do not form a vehicle photo gallery.

Vehicle list and details:

- Phase 1 is opened from the authenticated user's account menu; it does not add a Home card or permanent mobile-navigation item.
- The list is deliberately dense: one row per vehicle, with vehicle name and last-known mileage on the same line. Do not show Primary driver in the list.
- Selecting a vehicle opens its maintenance history. Vehicle specifications/details are available through the vehicle name or a compact details control without becoming prominent list UI.
- A vehicle is not normally deleted. Mark it Sold/Inactive and retain its history.

## Maintenance and service records

Each maintenance record supports:

- Vehicle, date (default today), mileage, optional Category and description. Description remains the primary explanation of what was done; Category may be left blank.
- When provided, Category must be one of: Oil & Filter; Tires; Brakes; Battery; Fluids; Engine; Transmission; Suspension/Steering; Electrical; HVAC; Body/Glass; Inspection; Other.
- One editable **Performed by** text field. It defaults visually to the authenticated person's first name, but may be overwritten with a shop, another person's name or another useful label.
- Total cost and notes.
- Optional attachments such as receipt/invoice photos, other images or PDFs, subject to the finalized Phase 1 attachment decisions below.

The authenticated account that actually creates or updates the record is stored separately as system metadata. It is not inferred from the editable Performed by text. Do not create separate DIY/shop/dealer controls in Phase 1, and do not implement parts or supply line items; total cost is sufficient. Preserve parts and inventory concepts for later phases.

Examples include repair invoices, tire receipts, parts receipts, alignment reports and warranty documents.

Persistent binary documents and images belong in Cloudflare R2, not D1. D1 holds attachment metadata and relationships through the Chunk 3 mechanism below. OCR is not part of Phase 1.

Last-known mileage normally advances when a maintenance record contains a newer mileage. Provide a manual mileage update for cases where a maintenance record is unavailable or unsuitable; do not lower mileage silently without an explicit correction path.

## Maintenance schedules

- Support mileage intervals, time intervals and whichever-comes-first rules.
- Show due soon, due and overdue status.
- Completing applicable maintenance advances/resets its schedule.
- Eventually surface useful upcoming/overdue maintenance on Home.

Detailed scheduling and completion interactions remain to be designed. The Phase 1 category list and optional behavior are fixed above.

## Fuel records

- Record date, mileage, gallons, price per gallon, total cost and full/partial fill-up status.
- Calculate MPG, distance and fuel cost where appropriate; partial fill-ups must be considered when defining calculations.
- Future camera workflow: photograph the odometer and pump/receipt, use vision/OCR to propose values, require user review and confirmation, then save only structured data.
- Fuel OCR source images are temporary and discarded after processing. They must not be intentionally persisted in D1 or R2.

## Receipt and invoice recognition

Future OCR/vision processing of maintenance receipts and PDFs should propose vendor, date, mileage, services/parts, costs and other relevant structured information.

The user reviews and corrects extracted information before saving. Unlike temporary fuel OCR images, maintenance receipts and invoices are permanent documents stored in R2.

## Future Inventory integration

Do not implement Inventory initially, but preserve extension points for it:

- Products such as filters, oil, brake pads and water pumps.
- Product/SKU, brand, part number, units, quantity on hand, storage location and vehicle compatibility.
- Purchase/batch history preserving vendor, quantity, actual unit cost and purchase date.
- Units and partial consumption for consumables; for example, oil purchased in five-quart containers but consumed by quart.
- Maintenance events eventually consume inventory and carry the historical cost of the consumed item into the maintenance event.
- Later purchases at different prices must not change historical maintenance costs.

## Warranties

Warranty coverage belongs to the actual purchased part/batch, not only to a generic inventory product.

- Support none, fixed-duration and lifetime warranty types.
- Preserve warranty duration and notes/terms.
- A warranty may start on purchase or installation date; do not assume a single rule.
- Preserve purchase receipts/proof.
- When installed, record the vehicle, maintenance event, installation date and installation mileage.
- Eventually provide a useful view of parts currently under warranty and their expiration/status.

## Authorization

- Authentication, identity and authorization remain separate concepts.
- Cloudflare Access authenticates requests; the authoritative account gate requires an active provisioned account and active Directory person, with an optional active household.
- Server/API authorization is authoritative. UI visibility is not security.
- Vehicle permissions must not automatically inherit Directory spouse/parent permissions.
- Any active app user in a vehicle's household may view and maintain any vehicle in that household, including adding, editing and deleting maintenance records. Household grocery access is not itself the rule; current household membership is the scope.
- An Administrator has an explicit cross-household Vehicles correction capability. Administrator status is not a universal bypass and does not replace action-specific checks.
- Vehicle deletion is not a normal member operation; the lifecycle action is Sold/Inactive. Any future destructive correction must be explicit and audited.
- Integrate Vehicle-specific policies with `src/api/shared/permissions.js`, including appropriate server-side query scope.
- Centralized account roles and explicit Administrator controls already exist. Vehicles should add explicit actions to the shared policy layer rather than create a new role system.

## Proposed development phases

1. Vehicles, specifications, household scope, Primary driver, dense list/details UI, maintenance history, lightweight records, mileage handling and simple attachments.
2. Maintenance schedules and reminders.
3. Fuel tracking and temporary fuel-photo OCR.
4. Smart processing of permanent receipts/invoices.
5. Optional parts/supplies Inventory.
6. Warranty tracking.
7. Reporting and refinements: vehicle/year costs, MPG/fuel costs, inventory value, upcoming maintenance, active warranties, lifetime history and export.

These phases are planning guidance, not irrevocable implementation boundaries. Dependencies and product decisions may change their order or scope; extension points should not become premature implementations.

## Architecture principles

- Reuse existing Directory people and Households rather than duplicating them. A Directory person need not have a login identity.
- Vehicles owns its pages, forms, validation, API and database concerns, following `src/features/<feature>` and `src/api/<feature>` ownership. Do not create empty modules merely to reserve names.
- Keep browser/server-safe domain functions separate from React, database access and credentials.
- Phase 1 is reached from the account menu. Phase 2 maintenance schedules may justify an optional per-user Home card; Vehicles would own that card and Home would only place it.
- Integrate through existing hash navigation and the app shell, rather than adding another permanent mobile bottom-navigation item.
- Continue using the existing React app, Cloudflare Worker, Cloudflare Access and D1 database. Add R2 for persistent binary files when that functionality is implemented.
- Preserve clean extension points for Inventory, warranties and OCR without prematurely implementing them.
- Follow the existing shared authorization boundary; Directory relationships must not silently determine Vehicle policy. The authorization default-household fallback has already been removed.

## Resolved Phase 1 Product Decisions

- Vehicle belongs to one household; there is no legal-owner field.
- Primary driver is optional and singular.
- Active app users in the household can view and maintain all household vehicles and maintenance records.
- Administrator cross-household correction authority is explicit and feature-specific.
- Phase 1 is account-menu access, with no Home card and no permanent bottom-navigation item.
- Phase 1 maintenance uses an editable Performed by text field plus separate authenticated system metadata; no parts line items, OCR, or provider/DIY controls.
- Phase 1 Category is optional and limited to the fixed list above; Description remains primary.
- Phase 1 attachment UI is simple and may include receipt/invoice images and PDFs; binaries use R2 and metadata uses D1. The finalized attachment rules are specified below.

## Later-phase decisions

Implementation planning must still clarify maintenance schedule thresholds, fuel-calculation handling of partial fills and warranty start/status rules. Preserve later phases for schedules, fuel, permanent receipt/invoice OCR, Inventory, warranties and reporting without pulling them into Phase 1.

## Finalized Phase 1 attachment decisions

- Attachments are supported on both vehicle records and maintenance records through one underlying attachment mechanism. Vehicle-level attachments are for useful documents such as registration/specification documents or occasional photos; do not build a vehicle photo gallery.
- Each vehicle or maintenance record may have at most 5 attachments. Each attachment is at most 10 MB.
- Accept PDF and common iPhone/browser image formats. JPEG and PNG are required; support HEIC where practical through the existing browser/upload path, without introducing image-conversion infrastructure solely for HEIC.
- Attachment authorization inherits the associated vehicle's explicit Vehicle authorization. Users who may view the vehicle may view/download its attachments; users authorized to maintain the vehicle may add/delete attachments. Administrator cross-household access remains explicit and Vehicle-specific.
- Binary objects live in Cloudflare R2; D1 stores attachment metadata and parent relationships. Attachments live for the lifetime of their parent record. Deleting a maintenance record also removes its associated R2 objects and D1 metadata. There is no recycle bin or attachment version history in Phase 1. Vehicle Sold/Inactive status does not delete attachments.
- Phase 1 does not include OCR, tagging, folders, gallery behavior, document categories or other document-management functionality. Permanent vehicle photos are not a separate feature.
- Before R2 becomes production infrastructure, documentation must identify the bucket, Worker binding, object-key strategy, access/security model, deletion/retention behavior and recovery expectations. Vehicles Phase 1 does not create a separate R2 backup system; the implementation documentation must state whether R2 objects have any independent backup/recovery mechanism so that limitation is explicit.

## Phase 1 Chunk 1 implementation boundary

- Migration `0012_vehicles.sql` adds `vehicles` and `vehicle_maintenance` only, without seeding or altering existing tables. Vehicle household is fixed on creation; household transfer is not implemented in this chunk.
- Specification values that include units (oil capacity, pressures, wipers, socket size) remain readable text. Oil-filter references are a validated array of brand/part-number objects stored as JSON. Total cost is stored as integer cents; mileage is an optional nonnegative whole number.
- `src/domain/vehicles.js` owns pure validation/defaults and monotonic mileage advancement. Dates default to today in America/Chicago. `src/api/vehicles/service.js` owns SQL scope, transactional persistence, driver validation and optimistic concurrency. It accepts trusted account-gate context, never an authenticated identity from a payload.
- Explicit actions are `vehicle.read`, `vehicle.create`, `vehicle.update`, `vehicle.mileage.correct`, and `vehicle.maintenance.create/update/delete`. They require the same household. Administrator `vehicle.readAny` and `vehicle.correctAny` must be requested explicitly; corrections are transactionally audited and still enforce validation. Directory relationships grant no rights.
- Vehicle and maintenance writes recheck active/bound account, active person and household scope in SQL. Primary driver assignment must reference an active person in the vehicle household. If that person later moves or becomes inactive, a subsequent vehicle save must clear/reassign the driver; Directory changes do not silently rewrite vehicle history.
- Maintenance mutations require the current vehicle revision as well as the maintenance revision for edits/deletion. They advance last-known mileage only upward. Deletion retains a soft-deleted record and never lowers mileage. Manual lowering/clearing uses a separate, reason-required, audited correction. Vehicle deletion is not exposed.
- Chunk 2 implements bounded/sanitized HTTP serialization and route integration behind the existing central account gate, plus the approved compact UI. Display labels derive from year/make/model/trim. Revisions refresh after maintenance saves and stale writes surface conflicts. Retired-household records remain stored; operations require active target households. No R2, attachment storage, schedules or notifications are included.

## Phase 1 Chunk 2 integration and recovery

- `GET/POST /api/vehicles`, `GET /api/vehicles/people`, `GET/PATCH /api/vehicles/:id`, and `POST /api/vehicles/:id/mileage` provide the core vehicle operations. Maintenance uses `GET/POST /api/vehicles/:id/maintenance` and `PATCH/DELETE /api/vehicles/:id/maintenance/:entryId`. Lists return at most 50 items with a bounded offset and next-page indicator. There is no vehicle deletion endpoint.
- Members always use their account-linked household. Explicit `administration=true` permits an Administrator to select an active household via `household_id`; every operation still enforces the Vehicle-specific policy and transaction guards. Ordinary payloads cannot override household, account or attribution. Driver options contain only active people in that authorized household.
- Account-menu navigation opens the dense vehicle list and maintenance history. Details/edit forms contain the documented specifications; household is read-only after creation. Maintenance defaults date to Chicago today and Performed by to the signed-in person's first name, without separate provider/DIY controls. Category, mileage, cost and notes are optional. Cost is entered as currency and stored as integer cents. Deletion has a cancellable confirmation and retains system history.
- No schema or configuration change is required for Chunk 2. Preserve a private restore-verified D1 export and the pre-Chunk-2 Git checkpoint before deployment. Code rollback uses that account-aware predecessor, retaining migration 0012 and all vehicle/maintenance data; do not restore an older database or roll back to legacy account resolution. The existing fail-closed account recovery release remains an operator fallback.
- Chunk 3 supplies the attachment storage and recovery boundary below; it does not add later-phase features.

## Phase 1 Chunk 3 attachments and operations

- **Storage:** production private R2 bucket `miszuk-family-vehicle-attachments`, Worker binding `VEHICLE_ATTACHMENTS`. Created with Standard storage; Cloudflare reports location `ENAM` and jurisdiction `default` (the location is not a separately configured residency guarantee). R2 account activation is complete. Public development access is disabled and there are no custom bucket domains. Neither a public development URL nor a public/custom bucket domain is permitted. Do not expose bucket credentials or signed/public object links. See [Cloudflare private bucket guidance](https://developers.cloudflare.com/r2/buckets/public-buckets/).
- **Schema:** additive migration `0013_vehicle_attachments.sql` creates `vehicle_attachments`, `vehicle_attachment_cleanup` and the singleton `vehicle_attachment_scan`. Metadata references a vehicle and optionally a maintenance record, plus the authenticated uploader account. Parent validation and the five-file limit are enforced by database triggers, including concurrent uploads. Pending uploads consume a slot. Existing specifications, maintenance, accounts and family data are not rewritten.
- **Keys and filenames:** R2 keys are `vehicles/v1/<random UUID>`, independently generated from the public attachment ID, with no names, household IDs or original filenames. D1 stores a length-bounded display filename with path/control characters removed. Download headers safely encode Unicode names. No binary bytes are stored in D1.
- **API:** `GET/POST /api/vehicles/:vehicleId/attachments` and the equivalent `/api/vehicles/:vehicleId/maintenance/:entryId/attachments` list/add files. `DELETE .../attachments/:attachmentId` removes a file; `GET .../attachments/:attachmentId/file` opens it, with `download=true` for download. Responses expose only file ID, display name, canonical type, size and upload state. File responses are private/no-store, nosniff and sandboxed. Every route stays behind the account gate and live Vehicle household SQL scope; explicit Administrator mode uses the existing `vehicle.readAny`/`vehicle.correctAny` policies. Cross-household attachment mutations are transactionally audited without filenames or object keys.
- **Validation/UI:** five attachments per parent and 10 MB (10,000,000 bytes) per file. Server checks measured bytes and PDF/JPEG/PNG/HEIC/HEIF signatures, not just a client MIME label. Compact Files disclosures use the normal browser picker, filenames, size, open/download and confirmed removal. HEIC/HEIF originals can be uploaded/downloaded; browser preview support varies and no conversion is provided. Physical-iPhone Photo Library/Files selection remains a device acceptance check.
- **Upload failures:** reserve metadata/slot first, put the object in R2, then mark ready only if the parent and account authorization remain valid. Failed/uncertain puts or finalization remove the reservation and queue its opaque key for deletion. If compensation is interrupted, the pending reservation expires after 15 minutes. The UI reports failure and asks users to refresh rather than claiming success. R2 and D1 do not share a transaction; durable compensation and reconciliation cover ordinary failure/crash windows.
- **Deletion/retention:** removing attachment metadata atomically queues the R2 key. Soft-deleting maintenance atomically removes all its attachment metadata and queues every key. Delete R2 first, then acknowledge the durable job; retries are idempotent. Failed storage cleanup is explicitly reported and retained for retry. Sold/Inactive vehicles keep files. Ready files have no automatic retention expiry. Deletion is permanent: no recycle bin, versions or restore UI.
- **Reconciliation:** reuse the existing two daily Worker Cron invocations, without another schedule or notification category. Each run expires pending uploads, retries up to 50 queued deletions and scans up to 100 prefixed objects using a persisted cursor. Only unreferenced objects older than one hour are removed, covering a late put after parent deletion. Cleanup is eventual (normally the next daily invocation, longer for an outage/backlog), not immediate in every failure case. The account-aware maintenance recovery Worker also retains this cleanup handler.
- **Backup limitation:** these R2 binaries currently have **no independent backup**. The private D1 export contains metadata and cleanup state, not files. A lost/deleted object cannot be reconstructed from a D1 backup. Keep original invoices/photos separately where needed; this chunk does not build R2 backup infrastructure.
- **Recovery:** preserve the bucket, R2 binding and migration 0013 during code rollback. Use the tested current account-aware maintenance release and repair forward; an older matched app temporarily hides attachments but does not undo storage changes or process cleanup jobs. Never drop the bucket/tables or restore old D1 merely to roll back code. For an actual D1 restore, first pause scheduled cleanup and attachment mutations through operator maintenance, preserve/export current metadata, jobs and an R2 object inventory, reconcile restored references against surviving objects, and review cleanup jobs before resuming. Restoring metadata does not resurrect deleted binaries; restarting reconciliation against an incomplete database could delete recoverable objects. See [recovery procedures](PHASE3_RECOVERY.md).
- **Release evidence:** migration 0013 was applied once, schema and ledger atomically, after a fresh private export restored with all 22 prior table fingerprints and FK/integrity checks matching. Checkpoint `pre-vehicles-phase1-chunk3-2026-10-01` points to `910654e`. Existing 185 tests, lint and build had passed for the unchanged implementation; rollout reverified backup/recovery, deployed bindings and migration schema rather than repeating them. Authenticated production checks covered vehicle PDF and maintenance PNG upload, byte-identical downloads, image opening, individual removal and maintenance-parent cleanup at 390×844 and 1440×1000. Both R2 objects were confirmed absent afterward; all disposable parent records were removed, metadata/cleanup queues were empty, and pre-existing table fingerprints (including accounts/audits) matched. Home, Groceries, Dinner, Chat, Calendar/Cozi and Directory still loaded. Native PDF preview could not be verified in the in-app browser, which also failed to render the same plain local PDF; download bytes were verified. Physical Safari/Photo Library/HEIC checks remain explicitly unverified.
