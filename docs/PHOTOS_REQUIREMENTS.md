# Photos Requirements

Status: product requirements and planning decisions; not implemented by this document. No installation, configuration, application change, or production deployment is authorized by this documentation task.

These requirements record Bob's supplied decisions. Repository context is limited to [ARCHITECTURE.md](../ARCHITECTURE.md) and the [Digital Systems Handbook outline](infrastructure/HANDBOOK_OUTLINE.md). They do not establish a verified home infrastructure inventory or an existing Immich deployment.

## Purpose and service boundary

- Provide private family-photo viewing, search, and sharing through the Miszuk Family system.
- Immich is the planned photo application and remains a separate service. It does not run inside the family Cloudflare Worker and does not use `family-db`.
- Preserve the existing family application's behavior, authentication, feature policies, and production data.
- Browser access is the initial target. Native Immich mobile-app access will be evaluated separately later.

## Authoritative photo archive

- The existing archive is approximately 134 GB, as supplied by Bob; infrastructure capacity has not been independently inventoried here.
- Existing folder organization remains authoritative.
- Preserve the existing ingestion workflow: **iPhone → PhotoSync → Windows laptop → organize/review → Syncthing → WD Red**.
- Immich initially provides a viewing/search layer over the archive, not the authoritative repository or a replacement ingestion workflow.
- Mount only approved archive directories into Immich, read-only.
- Prefer not mounting truly private directories at all. Exclusion patterns may provide an additional filter, but must not be the sole privacy boundary.
- Exact archive paths, mount locations, permissions, and private-directory boundaries remain to be collected and approved.

## Immich storage

- Immich has its own PostgreSQL database and writable application/generated-media storage.
- Keep those stores separate from both the authoritative archive and the family application's D1 database.
- Future family uploads must use separate writable storage rather than directly modifying the authoritative archive.
- Host placement, capacity, storage paths, and backup/restore procedures are open decisions. Do not assume archive size alone determines generated-media capacity.

## Initial access and direct-host protection

- Initial Photos access is **Bob only**.
- Protect `photos.miszuk.com` with its own Cloudflare Access application/policy so unauthorized family members are denied even when visiting the URL directly.
- Prefer Cloudflare Tunnel over public router port forwarding. Origin protection must prevent bypass through alternate exposed endpoints; a portal link or hidden navigation item is not a security boundary.
- Do not assume Cloudflare Access automatically authenticates a user to Immich. Define and verify Immich's own authentication separately before use.
- Verify authorized Bob browser access, denied access for another family identity, unauthenticated direct access, and attempted origin/alternate-host bypass before exposing the portal destination.
- Native mobile-app compatibility with the chosen authentication path is deferred, not assumed.

## Family app integration

- Eventually add a Photos-specific authorization capability using the existing separation of trusted authentication, identity resolution, and feature policy.
- The existing architecture places authentication in `src/api/shared/auth.js`, identity mapping in `src/api/shared/identity.js`, and feature policy in `src/api/shared/permissions.js`. Reuse those boundaries without inheriting unrelated feature permissions.
- Do not automatically grant Photos access based solely on household membership, Directory relationships, or an editable Directory login-email field.
- Initially expose a Photos destination only to the specifically authorized Bob identity. The trusted identity binding and capability configuration remain to be designed; do not guess an email address or use a mutable Directory field as the grant itself.
- Integrate through existing navigation in `src/app`, without another permanent mobile bottom-navigation button.
- The first integration may simply open `photos.miszuk.com`. No embedded gallery, photo proxy, or photo storage in the Worker/D1 is required.
- Portal authorization and the separate Photos-host policy must agree on the intended audience; direct-host protection remains independently enforced.

## Encrypted off-site backup

- An encrypted off-site cloud backup of the authoritative archive is desired for disaster recovery, not as the primary photo library.
- The cloud provider and backup software have **not been selected**. Backblaze B2 and restic have been discussed only; neither is a decision.
- Where practical, encrypt before upload so archive contents are not readable by the storage provider; provider-side encryption alone must not be assumed to meet that objective.
- Protect against accidental local deletion with snapshots, versioning, and/or retention. Do not use a simple deletion-synchronized mirror as the recovery strategy.
- Define and test recovery of both backup data and encryption credentials. A documented break-glass strategy must allow an authorized successor to restore the archive if Bob is unavailable.
- Document credential storage/recovery locations and procedures, never secret values, passwords, keys, tokens, or recovery codes in this repository.
- Archive backup and Immich PostgreSQL/application-data backup are distinct responsibilities; neither should be presumed to cover the other.

## Proposed implementation sequence

These phases are planning guidance and may be revised as inventory and pilot results become available. Each phase should have a verifiable stopping point, leaving the existing family app stable if work pauses afterward.

1. **Inventory existing infrastructure.** Document the home server, storage, network, and backup architecture using the handbook outline. Verify actual ownership, paths, dependencies, and recovery access before choosing deployment details.
2. **Define storage and access boundaries.** Approve archive paths, private/unmounted directories, supplemental exclusions, writable Immich stores, and Bob-only authorization/origin boundaries. Stop with a reviewed plan rather than assumed permissions.
3. **Install an isolated pilot with sample photos only.** Verify basic viewing/search, storage separation, and service operation without mounting the real archive or modifying the family portal.
4. **Test one approved archive subtree read-only.** Verify indexing and that Immich cannot write the source; confirm private directories are inaccessible and excluded content is absent.
5. **Secure the Photos hostname.** Configure its own Cloudflare Access and origin protection, preferably through Tunnel. Verify Bob access and unauthorized/direct/bypass denial, plus the actual Immich browser login flow.
6. **Add the Bob-only portal destination.** Implement the Photos capability and navigation entry only after host protection passes. Verify other family users do not receive the destination and existing navigation/features remain unchanged.
7. **Expand indexing deliberately.** Add approved archive directories incrementally, checking privacy boundaries, read-only behavior, capacity, and service health after each expansion.
8. **Evaluate later capabilities separately.** Consider wider family sharing, uploads, native apps, and encrypted off-site backup through explicit decisions and independently verified changes. These are not implied pilot features.

## Open Decisions

- **Exact Immich host/storage locations:** host/guest placement, resources, service configuration location, PostgreSQL volume, generated-media/application storage, archive mounts, and future upload storage.
- **Approved/private archive paths:** precise allowlist, directories never mounted, supplemental exclusions, and who approves changes.
- **Generated-media capacity:** expected thumbnails/transcodes and other writable growth, processing resources, free-space thresholds, and monitoring based on pilot measurements.
- **Immich PostgreSQL/application-data backup and restore:** consistent backup method, destinations, schedule, retention, version compatibility, recovery order, and isolated restore verification.
- **Bob identity and authentication:** explicit trusted Photos grant, independent Cloudflare policy, Immich account/login method, and origin-bypass prevention without relying on editable Directory data.
- **Future family authorization/sharing model:** who may view which photos/albums, who may share, revocation, and how portal, Access, and Immich permissions remain consistent.
- **Future upload workflow:** separate writable destination, uploader permissions, review/organization, and whether/how approved uploads later enter the authoritative archive.
- **Native mobile-app compatibility:** actual authentication/session behavior and whether a secure supported flow meets future needs; no authentication bypass is presumed acceptable.
- **Off-site backup provider/software/retention:** provider and tool selection, cost, encryption, snapshot/version retention, deletion recovery, restore time/data-loss objectives, and break-glass ownership.

Unknown infrastructure facts must be collected from Bob or the systems during separately authorized work, not inferred from these requirements.
