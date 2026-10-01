# Vehicles requirements

Status: product planning for a future feature; not implemented. This document records requirements, not authorization to implement or change production. See [Application boundaries](../ARCHITECTURE.md) for the current architecture.

## Purpose

Vehicles should answer:

- What vehicles do we own?
- What specifications and parts do they use?
- What maintenance has been performed, and what did it cost?
- What needs to be done next?
- What parts are still under warranty?

Vehicles is its own modular feature within the existing private family portal, following the ownership boundaries in ARCHITECTURE.md.

## Vehicle record

Support:

- Year, make, model and trim.
- VIN and license plate.
- Purchase date and mileage at purchase.
- Current mileage.
- Active/sold status.
- Household and one or more owners, referencing existing Households and Directory people. The precise ownership/access model remains an open product decision.
- Notes.
- Oil specification and capacity.
- Multiple oil-filter references, each with brand and part number.
- Tire sizes, including different front and rear sizes.
- Recommended tire pressure.
- Driver, passenger and rear windshield-wiper sizes.
- Lug-nut/socket size.
- A small number of permanent vehicle photos.

## Maintenance and service records

Each record supports:

- Vehicle, service date, mileage, category and description.
- DIY/shop/dealer designation and vendor information.
- Cost and notes.
- Parts/supply line items.
- Multiple permanent attachments: camera photos, uploaded images or PDFs.

Examples include repair invoices, tire receipts, parts receipts, alignment reports and warranty documents.

Persistent binary documents and images belong in Cloudflare R2, not D1. D1 holds metadata and relationships. R2 is a future addition to the existing deployment architecture, not an already-implemented Vehicles storage system.

## Maintenance schedules

- Support mileage intervals, time intervals and whichever-comes-first rules.
- Show due soon, due and overdue status.
- Completing applicable maintenance advances/resets its schedule.
- Eventually surface useful upcoming/overdue maintenance on Home.

Detailed category, scheduling and completion interactions remain to be designed.

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
- Household grocery access must not imply Vehicle edit/delete rights or automatically establish Vehicle access scope.
- Integrate Vehicle-specific policies with `src/api/shared/permissions.js`, including appropriate server-side query scope.
- Centralized account roles and explicit Administrator controls already exist. Vehicle-specific overrides, household authority and module permissions remain undecided; Administrator role is not a universal bypass.
- Exact Vehicle roles and permissions remain a product-design decision before implementation.

## Proposed development phases

1. Vehicles, specifications, maintenance history, and permanent documents/photos.
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
- If Vehicles gains a Home card, Vehicles owns the card and Home only places it.
- Integrate through existing hash navigation and the app shell, rather than adding another permanent mobile bottom-navigation item.
- Continue using the existing React app, Cloudflare Worker, Cloudflare Access and D1 database. Add R2 for persistent binary files when that functionality is implemented.
- Preserve clean extension points for Inventory, warranties and OCR without prematurely implementing them.
- Follow the existing shared authorization boundary; Directory relationships must not silently determine Vehicle policy. The authorization default-household fallback has already been removed.

## Open Product Decisions

Settle these before Vehicles implementation:

- Ownership model: person, household or both; how multiple owners relate to the vehicle's household and access scope.
- Exact view/add/edit/delete permissions for vehicles and associated records/documents.
- Administrator behavior, including cross-household/module correction authority and its integration with the existing explicit permission model.
- Detailed maintenance category/schedule UX, including due-soon thresholds and how completion advances mileage/time schedules.
- Which receipt/OCR processing belongs in the initial release versus later phases.

Implementation planning must also clarify photo limits, fuel-calculation handling of partial fills, and warranty start/status rules without weakening the requirements above.
