# Vehicles requirements

Status: Phase 1 Chunk 1 implements the additive data/domain and authorization foundation only. Vehicles has no routed API, UI, navigation or attachments yet. Later chunks require separate approval. See [Application boundaries](../ARCHITECTURE.md) for the current architecture.

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
- Optional simple attachments such as a photo or PDF only where the existing attachment infrastructure makes permanent vehicle photos essentially trivial. No vehicle-photo/gallery feature is required in Phase 1.

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
- Optional attachments such as receipt/invoice photos, other images or PDFs.

The authenticated account that actually creates or updates the record is stored separately as system metadata. It is not inferred from the editable Performed by text. Do not create separate DIY/shop/dealer controls in Phase 1, and do not implement parts or supply line items; total cost is sufficient. Preserve parts and inventory concepts for later phases.

Examples include repair invoices, tire receipts, parts receipts, alignment reports and warranty documents.

Persistent binary documents and images belong in Cloudflare R2, not D1. D1 holds attachment metadata and relationships. R2 is a future addition to the existing deployment architecture, not an already-implemented Vehicles storage system. OCR is not part of Phase 1.

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
- Phase 1 attachment UI is simple and may include receipt/invoice images and PDFs; binaries use R2 and metadata uses D1.

## Later-phase decisions

Implementation planning must still clarify maintenance schedule thresholds, fuel-calculation handling of partial fills, warranty start/status rules, reporting details and attachment/photo limits. Preserve later phases for schedules, fuel, permanent receipt/invoice OCR, Inventory, warranties and reporting without pulling them into Phase 1.

## Phase 1 Chunk 1 implementation boundary

- Migration `0012_vehicles.sql` adds `vehicles` and `vehicle_maintenance` only, without seeding or altering existing tables. Vehicle household is fixed on creation; household transfer is not implemented in this chunk.
- Specification values that include units (oil capacity, pressures, wipers, socket size) remain readable text. Oil-filter references are a validated array of brand/part-number objects stored as JSON. Total cost is stored as integer cents; mileage is an optional nonnegative whole number.
- `src/domain/vehicles.js` owns pure validation/defaults and monotonic mileage advancement. Dates default to today in America/Chicago. `src/api/vehicles/service.js` owns SQL scope, transactional persistence, driver validation and optimistic concurrency. It accepts trusted account-gate context, never an authenticated identity from a payload.
- Explicit actions are `vehicle.read`, `vehicle.create`, `vehicle.update`, `vehicle.mileage.correct`, and `vehicle.maintenance.create/update/delete`. They require the same household. Administrator `vehicle.readAny` and `vehicle.correctAny` must be requested explicitly; corrections are transactionally audited and still enforce validation. Directory relationships grant no rights.
- Vehicle and maintenance writes recheck active/bound account, active person and household scope in SQL. Primary driver assignment must reference an active person in the vehicle household. If that person later moves or becomes inactive, a subsequent vehicle save must clear/reassign the driver; Directory changes do not silently rewrite vehicle history.
- Maintenance mutations require the current vehicle revision as well as the maintenance revision for edits/deletion. They advance last-known mileage only upward. Deletion retains a soft-deleted record and never lowers mileage. Manual lowering/clearing uses a separate, reason-required, audited correction. Vehicle deletion is not exposed.
- Chunk 2 must add bounded/sanitized HTTP serialization and route integration behind the existing central account gate, then the approved compact UI. Display labels derive from year/make/model/trim. Refresh revisions after maintenance saves and surface stale-write conflicts. Retired-household records remain stored; this foundation operates only on active target households. No R2, attachment storage, schedules or notifications are included.
