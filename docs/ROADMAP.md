# Implementation Roadmap

Planning guidance for the next major application work. This document does not authorize implementation or production changes. Revisit phase order and scope as requirements are resolved.

## Current production baseline

The architecture refactor is complete. Treat existing application functionality as stable and preserve its behavior and data. No further architecture cleanup is currently required before feature development. Follow the existing boundaries in [ARCHITECTURE.md](../ARCHITECTURE.md); do not begin another broad refactor or remove compatibility APIs as roadmap preparation.

## Next prerequisite: infrastructure documentation

The separate Miszuk Digital Systems Handbook and infrastructure inventory are being completed before significant new self-hosted infrastructure is added. Photos/Immich implementation must wait until the relevant home-server, storage, backup, network, and recovery arrangements are understood and documented. Do not infer missing infrastructure details or install services to fill inventory gaps.

## Photos

[Photos requirements](PHOTOS_REQUIREMENTS.md) remain the detailed source of truth. Intended sequence:

1. Complete the relevant infrastructure inventory.
2. Define storage and privacy boundaries.
3. Run an isolated Immich pilot with sample photos only.
4. Pilot one approved archive subtree read-only.
5. Secure `photos.miszuk.com`, including direct-access and origin protection checks.
6. Add the Bob-only Photos destination to existing portal navigation.
7. Expand indexed archive directories gradually.
8. Later evaluate family access/sharing and uploads, native apps, and encrypted off-site backup.

Do not start installation or portal integration before their prerequisites. Keep each phase independently verifiable and safe to pause. Immich remains a separate service; wider family access is not part of the initial pilot.

## Vehicles

[Vehicles requirements](VEHICLES_REQUIREMENTS.md) remain the detailed source of truth. Vehicles can proceed after the current documentation effort when ready for new application development; it need not wait for Photos implementation.

Retain the defined phases:

1. Vehicles, specifications, maintenance history, and permanent documents/photos.
2. Maintenance schedules and reminders.
3. Fuel tracking and temporary fuel-photo OCR.
4. Smart processing of permanent receipts/invoices.
5. Optional parts/supplies Inventory.
6. Warranty tracking.
7. Reporting and refinements: vehicle/year costs, MPG/fuel costs, inventory value, upcoming maintenance, active warranties, lifetime history, and export.

Before implementation, resolve the requirements document's open ownership and authorization decisions with Bob. This roadmap makes no choice about person/household ownership, exact permissions, or administrator authority. Do not infer Vehicle access from Directory relationships or Grocery household access. Do not build later phases or speculative framework components in advance of a concrete need.

## Future platform work

The application-account boundary and explicit Administrator controls through Users & Permissions Phase 4 Step 4 are implemented (production release `12b2212`). Follow [Users and Permissions](USERS_PERMISSIONS.md) for the implemented scope and remaining work. Administrator-provisioned external-user invitations and additional feature-specific capabilities remain future work. Introduce them only when explicitly authorized for a real need; do not build a generic permissions framework or treat legacy Directory email as an authorization grant.

## Future ideas — not approved for implementation

- **Personal grocery lists:** lists for an individual in addition to the existing household grocery behavior. Ownership, sharing and navigation require a future scoped design; do not change current household lists now.
- **Push/pop-up notifications:** Phase 1A added the foundation; Phase 1B passed Bob's physical-iPhone acceptance tests. Phase 1C enables voluntary enrollment and manual own-device tests for all eligible active provisioned accounts, including future users. See [Notifications operations](NOTIFICATIONS.md). Birthdays at 8 AM America/Chicago and new Family Chat messages now have independent account-wide preference switches and duplicate prevention. Other automatic categories remain future work requiring separate authorization; no unsolicited rollout notification is sent.
- **Family surveys/polls:** for example, “Who will be home Saturday for dinner?” A future design should let a creator choose appropriate recipients, prompt those who have not responded when they log in, and provide results to the survey creator. Define recipient eligibility, response visibility and prompt/dismissal behavior before implementation.

These are recorded ideas, not a scheduled release or authorization to implement them. Preserve existing behavior and develop each through a separately approved, bounded task. Do not begin Phase 4 Step 5 as part of recording this roadmap.

## Immediate handoff

Finish the infrastructure/documentation effort first. Then select a bounded, explicitly authorized feature phase and resolve its prerequisites before implementation. Preserve the stable application throughout; this roadmap itself requires no code, schema, infrastructure, or deployment changes.
