# Miszuk Family Digital Systems Handbook — Outline

Status: active handbook outline and documentation roadmap, created September 19; repository status reconciled September 30, 2026; home-network infrastructure inventory begun September–October 2026.
Audience: Bob and a technically competent family member maintaining the systems without Bob or AI assistance.

## Scope and evidence

This outline began as a repository-only audit. It is now being expanded with live-system verification and reviewed configuration backups. **Repository-known** means documented or represented in source. **Verified / documented** means the relevant live system, configuration, or backup was inspected during the handbook project. **Collect / verify** marks information still missing or not yet sufficiently verified.

Primary repository sources: [architecture](../../ARCHITECTURE.md), [README](../../README.md), [package scripts](../../package.json), [Worker configuration](../../wrangler.jsonc), [migrations](../../migrations/README.md), [Cozi connection](../cozi-calendar.md), and [Vehicles requirements](../VEHICLES_REQUIREMENTS.md). Home infrastructure documentation is maintained under this directory; see [Home Network](HOME_NETWORK.md).

For each eventual system entry, record its purpose, owner and backup contact, dependencies, administrative entry point, configuration location, recovery procedure, last verification date, and evidence. Procedures should state prerequisites, expected results, failure handling, and rollback without depending on chat history or AI.

Never record passwords, tokens, private keys, recovery codes, private calendar URLs, or exported family data here. Record only approved storage locations and recovery methods. Keep sensitive raw configuration backups and contact details in an appropriately restricted location; do not assume this repository will always remain private.

## 1. Start Here / Break Glass

**Repository-known**
- The family portal is identified as `family.miszuk.com`; its stack is React/Vite, Cloudflare Workers, Cloudflare Access, and D1.
- Authentication, application deployment, and family records are separate concerns. Removing a Directory person is not an access-revocation procedure.
- The repository contains source and some operating instructions, but no complete successor-access or emergency-recovery runbook.

**Verified / documented**
- Bitwarden is the credential/password manager.
- The Bitwarden master password is stored in the physical break-glass envelope in the safe.
- Secrets must not be copied into this repository.

**Collect / verify**
- [ ] Identify a successor, emergency contacts, account owners, and authorized access arrangements.
- [ ] Document where the handbook and credential-recovery instructions can be found if the portal, email, or home network is unavailable.
- [ ] Create a complete dependency map and short outage triage guide spanning home infrastructure and cloud services.
- [ ] Establish how to regain registrar, email, Cloudflare, GitHub, and home infrastructure access without Bob's device or an already-working family email account.
- [ ] Define safe first actions, escalation points, and actions to avoid until backups and the failure are understood.

## 2. Domain and DNS

**Repository-known**
- The portal uses `family.miszuk.com`; README describes a Cloudflare Worker route for it.
- Worker configuration is not a complete DNS-zone export or registrar inventory.

**Collect / verify**
- [ ] Registrar, legal/account owner, renewal dates, billing, auto-renewal, nameservers, and recovery method.
- [ ] Authoritative DNS provider and an approved inventory of records, proxy settings, TTLs, and service dependencies.
- [ ] Certificate ownership/renewal, subdomain purposes, and a tested process for restoring DNS.
- [ ] Confirm any proposed `photos.miszuk.com` entry separately; no deployed Photos destination is established by the repository.

## 3. Email / Google Workspace

**Repository-known**
- App documentation describes Cloudflare Access email-PIN authentication plus provisioned application accounts linked to active Directory people. Editable Directory email no longer establishes identity.
- This does not establish Google Workspace tenancy, mail routing, mailbox ownership, or administrator access.

**Collect / verify**
- [ ] Confirm email provider/Workspace tenant, subscription, billing owner, administrators, and independent administrator recovery.
- [ ] Inventory domains, mailboxes, aliases, groups, forwarding, and successor responsibilities in a restricted record.
- [ ] Document MX, SPF, DKIM, DMARC, delivery troubleshooting, and Access PIN delivery dependencies.
- [ ] Establish mailbox retention/export/backup policies and recovery procedures without copying mail or credentials here.

## 4. Family App

**Repository-known**
- One React application, one Worker, and one D1 database form the deployment unit.
- `src/app` owns the shell, identity loading, and hash navigation; `src/features` owns feature pages and Home cards; `src/shared` supplies browser utilities/UI; `src/domain` contains pure shared rules.
- `src/api/<feature>` owns feature validation and persistence; shared authentication, identity, and permission modules enforce request boundaries.
- Current features include Groceries, Dinner, Chat, Directory, Home summaries, and the read-only Cozi Calendar. Legacy APIs remain for compatibility.
- Directory permits self, parent-to-child and spouse ordinary profile editing plus explicit Administrator correction. Administrators manage households, relationships and application accounts; Chat ownership and household-scoped Groceries/Dinner remain distinct policies. Users & Permissions through Phase 4 is complete.
- The PWA is online-only with a notification-only service worker. Family enrollment and Birthday/Chat categories are deployed; see [Notifications](../NOTIFICATIONS.md) for remaining device checks and VAPID recovery. Local development and portable preview use separate local database state.

**Collect / verify**
- [ ] Record the actually deployed revision, feature inventory, user-facing entry points, and known limitations.
- [ ] Provide a short file map, local setup checklist, test workflow, and deployment/rollback procedure executable by a successor.
- [ ] Explain provisioned identity binding, no-household denial, Administrator household/relationship management and account recovery without publishing real family records.
- [ ] Document Cozi ownership, secret recovery, outage behavior, and verification of recurrence/timezones; display timezone is America/Chicago.
- [ ] Verify the current README and feature runbooks against actual operator tooling before successor handoff; private helper locations and access remain to be documented.

## 5. GitHub / Source Control

**Repository-known**
- The authoritative repository is `bmiszuk/miszuk-family-app`, default branch `main`.
- Source, migrations, tests, documentation, and dependency lockfile are versioned. `.gitignore` excludes local environment files, Wrangler state, build output, and a named database-backup pattern.
- Git history and tags can identify source rollback points; they do not prove which release is currently deployed or back up live data.

**Collect / verify**
- [ ] Confirm ownership/succession, collaborator access, branch protections, and automation.
- [ ] Document a working clone/authentication/push method and account recovery location without credential values.
- [ ] Define release tagging, review expectations, repository backup, and restoration from an independent copy.
- [ ] Review historical-data exposure noted in README through a separate authorized process; ignore rules do not remove Git history or guarantee secret exclusion.

## 6. Cloudflare

**Repository-known**
- `wrangler.jsonc` identifies Worker `miszuk-family-app`, entry point `worker.js`, D1 binding `DB` / database `family-db`, static assets, and Access issuer/audience configuration.
- The Worker validates Access JWTs before API routing; mutations also have origin protection. API responses are private/no-store.
- `COZI_CALENDAR_URL` is documented as a Worker secret, never a browser variable. Observability is enabled in repository configuration.
- Database migrations are explicitly separate from deployment.

**Collect / verify**
- [ ] Account/zone ownership, billing, successor access, recovery, actual routes, deployments, and binding inventory.
- [ ] Export a sanitized description of Access applications, email-PIN provider, policies, session durations, and alternate-host protection.
- [ ] Inventory secret names, approved recovery sources, renewal/rotation ownership, and deployment tooling; never their values.
- [ ] Record logs/retention, alerting, costs/limits, D1 recovery capabilities, and Worker rollback steps.
- [ ] Confirm whether any Cloudflare Tunnels exist; no home tunnel topology is established here.

## 7. Home Network

See [Home Network](HOME_NETWORK.md).

**Verified / documented**
- [x] Physical WISP path from outdoor radio through utility-room PoE equipment to EdgeRouter-X.
- [x] EdgeRouter-X role, routed VLANs 71-75, DHCP ranges, DNS choices, NAT, and summarized firewall segmentation.
- [x] Cisco Catalyst 3850 management configuration, VLANs, major port roles, and trunks.
- [x] Cisco 2504 controller, five-AP deployment at backup time, SSIDs, and Trusted/Guest VLAN mapping.
- [x] Key infrastructure addresses and physical equipment location.
- [x] Raw network configuration backups identified as secret-bearing protected artifacts that must not be stored in normal GitHub documentation.
- [x] Current lack of functioning UPS coverage and the UGREEN enclosure power/startup dependency.

**Collect / verify**
- [ ] Update the Internet section after the Verizon 5G Home trial and any dual-WAN configuration are finalized.
- [ ] Establish and document the protected long-term storage location for raw device configuration backups.
- [ ] Verify which infrastructure devices are actually powered through the Tripp Lite PDU.

## 8. Proxmox

**Verified / documented**
- Proxmox host `proxmox` is `10.112.72.11/24`, running Proxmox VE 9.2.4 on an Intel i5-10500T with approximately 23 GiB usable RAM and a 256-GB-class Samsung NVMe.
- `vmbr0` bridges the active physical NIC; the default gateway is `10.112.72.1`.
- VM 100 is Home Assistant OS; VM 101 is the Ubuntu Infrastructure VM.
- The physical 4 TB WD Red is passed through to VM 101 rather than mounted by Proxmox.
- No scheduled or existing Proxmox VM backups were found during verification.

**Collect / verify**
- [ ] Create the dedicated Proxmox/VM documentation with startup, shutdown, update, console, and rebuild procedures.
- [ ] Establish a guest backup destination, retention policy, and restore test.

## 9. VMs and Docker Services

**Verified / documented**
- VM 100 is Home Assistant OS with 4 GB RAM and a 32 GB disk; no USB or PCI passthrough was configured.
- VM 101 is Ubuntu 26.04 LTS at `10.112.72.13`, with 2 vCPUs, 4 GB RAM, and a 50 GB system disk.
- VM 101 runs Syncthing and Uptime Kuma in Docker Compose with `restart: unless-stopped`.
- Compose files are under `/opt/docker/compose/`; persistent application data is on the WD Red under `/mnt/backup/docker/`.
- Uptime Kuma monitors Home Assistant, Infrastructure VM, Internet reachability, Proxmox, and Syncthing.
- Syncthing receives the ThinkPad T590 Desktop, Documents, and Pictures folders in receive-only mode with one-year staggered versioning.

**Collect / verify**
- [ ] Create dedicated Home Assistant and Infrastructure VM/service documentation.
- [ ] Add startup/shutdown, upgrade/rollback, log inspection, and service restoration procedures.

## 10. Storage

**Repository-known**
- D1 holds application records; migrations describe the application schema. Local preview databases are separate from production.
- Vehicles requirements propose R2 for future permanent binary attachments; they explicitly do not describe implemented storage.

**Verified / documented**
- The Infrastructure VM mounts the 4 TB WD Red filesystem at `/mnt/backup` by UUID as ext4 with `noatime`.
- The disk contains Docker persistent data and ThinkPad backup data; several other backup-looking directories are currently empty or not verified as active.
- The UGREEN enclosure can remain powered off after a power interruption, preventing VM 101 startup until manually powered on.

**Collect / verify**
- [ ] Create dedicated storage documentation, including authoritative data, write paths, capacity/health checks, disk replacement, and restoration.
- [ ] Confirm archive/photo storage boundaries before documenting them as operational.

## 11. Backup Strategy

**Repository-known**
- README/migration guidance calls for a private remote D1 export before production migrations; deployment does not automatically apply migrations.
- Release `4d3b89c` recorded a private D1 export/restore with matching fingerprints for all 15 pre-migration tables. This is evidence for that release, not proof of a recurring backup schedule or successor access.

**Verified / documented**
- No scheduled or existing Proxmox VM backups were found.
- Home Assistant automatic encrypted backups are enabled daily but stored inside VM 100, placing them in the same failure domain as the VM.
- Syncthing provides a local receive-only copy and one-year versioning for selected ThinkPad folders on the WD Red; this is not independent disaster recovery for the WD Red.
- No independent backup of the WD Red was identified.
- Blue Iris configuration exports exist on the Blue Iris D: drive, the same physical recording disk, and therefore are not an independent backup.

**Collect / verify**
- [ ] Build the complete backup matrix for D1, source, DNS/configuration, email, Proxmox guests, Home Assistant, service databases, WD Red data, Blue Iris configuration, archive, and future uploads.
- [ ] For each: owner, method, destination, schedule, retention, encryption-key recovery, off-site/offline protection, and failure monitoring.
- [ ] Set acceptable data loss and recovery time, then record independent restore tests and results.
- [ ] Verify actual D1 Time Travel availability/retention and exports; keep private database backups outside the repository.

## 12. Photos

**Repository-known**
- Photos is not an implemented feature in the documented app architecture. No Immich installation, external-library configuration, or photo-host authorization is defined here.
- Existing navigation belongs to `src/app`; feature-specific policies belong at server boundaries. Hiding a navigation link is not authorization.

**Collect / verify**
- [ ] Use the agreed Immich/Bob-only/read-only-archive direction in [Photos requirements](../PHOTOS_REQUIREMENTS.md); collect host placement and unresolved sharing/upload choices rather than reopening settled decisions.
- [ ] Record the authoritative archive, read-only indexing boundaries, excluded/private folders, and separate upload destination before implementation.
- [ ] Define direct-hostname protection as well as portal visibility; record external-service authentication and origin-access controls.
- [ ] Collect sizing, database/thumbnail storage needs, backups, upgrades, and recovery responsibilities independently of the archive.
- [ ] Keep future design and installation procedures explicitly separate from the current system inventory.

## 13. Security and Credentials

**Repository-known**
- Trusted Access identity must map to an active provisioned account and active Directory person; the household is optional and has no authorization fallback. Client-supplied email is not authenticated identity.
- Shared policies deny unknown actions; UI visibility does not replace API enforcement. Directory relationships are not universal permission grants.
- Local development bypass is documented as loopback-only and must not be enabled in production.

**Verified / documented**
- Bitwarden is used for secrets.
- The Bitwarden master password is stored in the physical break-glass envelope in the safe.
- Network and Blue Iris configuration exports inspected during this project can contain secret or recoverable authentication material and must not be committed to the normal repository.

**Collect / verify**
- [ ] Document ownership, successor access, MFA recovery process, and offline emergency instructions without storing secret values.
- [ ] Maintain an account and secret inventory by name/purpose only, with authorized recovery location and rotation responsibility.
- [ ] Define join/leave/revocation procedure across Cloudflare, app identity, GitHub, email, and future external services.
- [ ] Document incident response contacts, device-loss procedure, audit/log access, and restricted-document handling rules.

## 14. Hardware Inventory

**Verified / documented**
- Utility-room infrastructure includes the EdgeRouter-X, Cisco 3850, Cisco 2504, structured cabling/patch panels, Blue Iris OptiPlex 5070, Proxmox mini PC, UGREEN/WD Red storage, Tripp Lite PDU, and an out-of-service APC Smart-UPS 3000-class unit.
- The Blue Iris server is a Dell OptiPlex 5070 with an i7-9700, approximately 16 GB RAM, a 256-GB-class SSD, and a 1-TB-class WD HDD.
- The Proxmox host uses an Intel i5-10500T, approximately 24 GB RAM, and a 256-GB-class Samsung NVMe.
- Work equipment physically present in the utility room, including the Cisco C1111, is outside the household handbook scope.

**Collect / verify**
- [ ] Add purchase/warranty information and replacement priority where useful.
- [ ] Link devices to protected configuration backups and maintenance/replacement procedures.
- [ ] Identify essential spares worth maintaining.

## 15. Disaster Recovery

**Repository-known**
- Source recovery, Worker rollback, and D1 restoration are separate operations. Rolling back code does not undo schema/data changes.
- The repository does not contain a complete tested end-to-end disaster-recovery runbook.

**Verified / documented**
- The home-network documentation includes a practical dependency/startup order after a major power event.
- Important current failure domains have been identified: no functioning UPS, no Proxmox guest backups, HA backups inside VM 100, WD Red without identified independent backup, Blue Iris exports on the recording disk, and the UGREEN enclosure startup dependency.

**Collect / verify**
- [ ] Prepare scenarios for lost administrator access, domain/email failure, bad deployment, data loss, failed disks/host, and loss of the home site.
- [ ] For each: dependencies, access prerequisites, backup selection, safe restoration target, validation, cutover, and rollback/abort conditions.
- [ ] Determine complete restoration order across home and cloud dependencies.
- [ ] Perform isolated restore exercises and record dates/results.

## 16. Routine Maintenance

**Repository-known**
- `package.json` provides tests, lint, production build, and combined `npm run check`; `npm run deploy` runs checks before Wrangler deployment.
- Remote migration listing/application are separate scripts; local development/preview must remain distinct from production.

**Collect / verify**
- [ ] Set owners and cadence for patching, backup/restore checks, disk/UPS health, capacity, renewal/billing review, and account-access review.
- [ ] Establish release checklist, rollback checkpoint, private backup requirements for data changes, and focused post-release verification.
- [ ] Document supported tool versions and a verified deployment process.
- [ ] Schedule handbook review after infrastructure changes and periodically with the successor.

## 17. Change Log

Git history records handbook and application documentation changes.

For operational changes that need a separate record, use fields such as date/time and timezone, operator, system, reason, change/reference, verification, backup/rollback reference, and outstanding work.

Handbook milestones:
- September 19, 2026 — initial repository-based handbook outline.
- September 30, 2026 — repository state reconciled.
- September–October 2026 — live home-infrastructure inventory and configuration review performed.
- October 2026 — first dedicated infrastructure document, [Home Network](HOME_NETWORK.md), added.
