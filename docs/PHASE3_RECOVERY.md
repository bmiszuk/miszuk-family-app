# Phase 3 account-boundary recovery

Phase 3 introduced account enforcement before all API routing. Phase 4 subsequently completed explicit household/relationship and account administration. Phase-specific sections below are historical checkpoints, not a recommendation to deploy an old release over current security/data expectations. See [current notification rollback requirements](NOTIFICATIONS.md) and [architecture](../ARCHITECTURE.md).

## Safe rollback

Do not deploy the Phase 2B tag as a routine rollback: it restores legacy email/default-household access and admits unprovisioned authenticated users. Preserve current accounts, revocations, bindings and audits; do not restore an old database just to roll back code.

The emergency source is `scripts/account-recovery-worker.js`. Its tested bundle is held privately by the operator as `phase3-account-recovery-worker.mjs`, alongside its SHA-256 file. It validates authentication and the account boundary for every API request, then returns maintenance (503) instead of invoking any family-data handler. Invalid or denied accounts still receive 401/403. Non-API requests receive a maintenance page. Normal service is deliberately unavailable during this recovery.

Using authorized Cloudflare operator access, deploy that bundle to the existing Worker while preserving existing D1, Access configuration, secret bindings, hostname/routes and asset run-worker-first settings. Do not upload credentials or database backups. Verify direct API denial and maintenance before repairing forward. The private operator deployment helper retains current bindings and deploys only the prepared bundle.

After a verified repair, redeploy a tested matched application/frontend preserving the current Phase 4 permissions and notification lifecycle. Never turn off the gate or add an email/header bypass.

## Account recovery

Bob is the sole application Administrator. Independent recovery uses existing Cloudflare/D1 operator credentials stored outside Git. Inspect the verified Access identity and existing approved account/person binding before any repair; require exact identity confirmation, back up first, and record an operator security-audit event in the same controlled operation. Preserve at least one active Administrator with an active linked person and usable identity. Never guess a subject, reassign a conflicting identity silently, or bulk provision Directory emails.

At the historical Phase 3 checkpoint no account-management API existed; Phase 4 now supplies controlled account administration. The Directory API blocks deletion of any account-linked person and freezes legacy login email. Operator recovery is separate from ordinary Directory editing.

## Local development

The local development scripts seed only a synthetic, already-bound localhost account from `scripts/local-account.sql` into local D1. Never execute that file remotely. The deployed hostname cannot use LOCAL_DEV authentication.

## Phase 4 Step 1 recovery

Step 1 restricts household and relationship mutations to Administrators. Its rollback checkpoint is `pre-users-phase4-step1-2026-09-29` (`8470b92`), for source comparison only: deploying it would reopen Member household/relationship mutations. Do not use it as a security-preserving rollback.

The operator has prepared and tested `phase4-step1-account-recovery-worker.mjs`, its SHA-256 file, and the private `deploy-phase4-step1-recovery.mjs --deploy-maintenance` helper. These use the same account-aware maintenance source and binding-preserving deployment procedure above. Deploy maintenance if needed, then repair forward with Step 1 enforcement intact. Preserve current D1 data and audit records; no migration or database restore is required for this release.

## Phase 4 Step 2 recovery

The Step 2 checkpoint is `pre-users-phase4-step2-2026-09-29` (`eb4f2bc`). This previous release preserves the Phase 3 account boundary and Step 1 privileged-write enforcement, so a matched frontend/backend rollback is security-preserving. No migration or account mutation is introduced. The existing tested private Step 1 account-aware maintenance bundle remains the fail-closed emergency option; preserve data, bindings and audits and repair forward.

## Phase 4 Step 3 recovery

Checkpoint `pre-users-phase4-step3-2026-09-29` (`f429d4d`) is a security-preserving frontend/backend rollback: it removes account mutation controls while retaining authoritative account status, secure first-use activation, and Step 1 restrictions. Preserve newly provisioned accounts, disabled states, bindings and audits; never restore a pre-change D1 snapshot merely to roll back code. No migration is required. The previously tested private account-aware maintenance bundle remains the fail-closed emergency fallback; its checksum is reverified before deployment. Independent operator recovery stays separate from application controls.

## Phase 4 Step 4 recovery

Checkpoint `pre-users-phase4-step4-2026-09-30` (`a1d93df`) retains the account gate, Step 1 restrictions and Step 3 status administration. A matched frontend/backend rollback removes role/identity replacement controls while respecting current roles, approved identities and disabled states. Preserve all D1 data, revisions and audits; never restore the pre-change database merely to roll back code. No migration is needed.

The private `phase4-step4-account-recovery-worker.mjs` bundle and SHA-256 file are rebuilt and tested with the current account resolver. The matching private deployment helper requires `--deploy-maintenance` and preserves existing Cloudflare bindings. This fail-closed maintenance option remains available if a normal rollback is insufficient. Own-identity correction requires the independently authenticated operator procedure above, not a self-service exception. Do not guess a replacement subject or weaken Access/account enforcement.

## Vehicles attachment recovery

Chunk 3 adds migration 0013 and private R2 storage. Retain the `VEHICLE_ATTACHMENTS` binding/bucket and all attachment metadata, pending jobs and family records when rolling back code. The private `vehicles-chunk3-account-recovery-worker.mjs`, checksum and explicit `deploy-vehicles-chunk3-recovery.mjs --deploy-maintenance` helper use the current account gate and maintenance responses; their scheduled handler also retries attachment cleanup. Deploy this tested maintenance bundle and repair forward if the normal app is unsafe. The pre-Chunk-3 checkpoint is a source/code fallback, not an instruction to drop storage; old code cannot administer attachments or retry jobs.

R2 files have no independent backup; the restore-verified private D1 backup contains only metadata. For database-disaster recovery, pause Cron invocations and attachment mutations first, preserve current metadata/deletion jobs and an object inventory, then restore/reconcile references and review pending deletions before restarting cleanup. Incomplete restored metadata must not be treated as proof that an R2 object is disposable. Deleted binaries cannot be recreated from D1. Do not change schedules during ordinary code rollback; pausing cleanup is a deliberate operator step only for database restore. See [attachment operations](VEHICLES_REQUIREMENTS.md#phase-1-chunk-3-attachments-and-operations) for limits, retention and reconciliation behavior.
