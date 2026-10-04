# D1 migrations

Migrations are versioned source; verify actual remote schema/ledger before applying anything.

| Migration | Purpose |
|---|---|
| 0001 | Original family/person/relationship/event schema |
| 0002 | Groceries, news and retained local household-calendar tables |
| 0003 | Directory dates, versions, soft deletion and relationship integrity |
| 0004 | Chat sender/Home notice and grocery requester references |
| 0005 | Legacy Directory login email; now frozen, not authoritative identity |
| 0006–0007 | Households/Dinner and household retirement |
| 0008 | Application accounts, trusted identities and security audit |
| 0009 | Push devices/preferences and identity-replacement subscription invalidation |
| 0010 | Notification delivery claims for birthday/Chat duplicate prevention |
| 0011 | Household polls, options, recipient snapshots and responses; preserves claims while adding Polls category |
| 0012 | Vehicles Phase 1 foundation: household vehicles/specifications and versioned maintenance records; no seeds or changes to existing tables |
| 0013 | Vehicles Phase 1 attachments: private R2 metadata, cleanup queue, scan cursor and parent/quota/deletion integrity |

Release 4d3b89c applied 0010 after a private backup/restore verification. Historical production migrations 0004–0007 were applied outside the tracked migration sequence; their schema changes were already present and were never replayed. On October 1, 2026, the remote ledger was reconciled by inserting bookkeeping rows for `0004_chat_requester.sql` through `0007_household_retirement.sql` only. Their migration SQL was not executed. The rows were appended by D1's ledger operation after 0008–0011, so the names are complete but the historical application order remains documented here.

Reconciliation evidence: private export `family-db-before-ledger-reconcile-2026-10-01.sql`, restored with all table fingerprints plus foreign-key/integrity checks; rollback checkpoint `pre-ledger-reconcile-2026-10-01` at application commit `201ea3c`. Post-write verification found the schema and every non-ledger table/data fingerprint unchanged, and `d1_migrations` contains each repository migration 0001–0011 exactly once. Keep this evidence private and outside Git.

```sh
npm run db:local          # apply to local development D1
npm run db:remote:list    # inspect production migration history/pending changes
npm run db:remote:apply   # explicitly apply to production; export and restore-verify a private backup first
```

The deploy script does not apply migrations automatically. Confirm the database binding and migration history before remote execution. The portable preview keeps its own migration ledger and local database, separate from Wrangler's normal local state.

Vehicles Chunk 1 applied `0012_vehicles.sql` on October 1, 2026 after restoring the private export `family-db-before-vehicles-chunk1-2026-10-01.sql` and matching all 20 pre-migration table fingerprints, plus integrity/foreign-key checks. Checkpoint: `pre-vehicles-phase1-chunk1-2026-10-01` at `c013e67`. Only the two new empty tables, their indexes/triggers and one ledger row were added; all previous schema objects and non-ledger data matched the backup afterward.

Vehicles Chunk 3 applied `0013_vehicle_attachments.sql` on October 1, 2026 after a fresh private backup/restore verification. It added attachment metadata, the durable R2 cleanup queue, scan cursor and integrity triggers; no existing family records were rewritten. The private bucket and `VEHICLE_ATTACHMENTS` binding are documented in the Vehicles requirements. The remote ledger now contains 0001–0013 exactly once. Safe rollback keeps all additive tables, attachment metadata and R2 objects while restoring compatible code; do not drop data or remove migration history. Backup and verification artifacts remain private in the existing operator workspace outside Git.
