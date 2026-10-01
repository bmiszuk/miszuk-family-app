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

Release 4d3b89c applied 0010 after a private backup/restore verification. Historical production migrations 0004–0007 were applied outside the tracked migration sequence; their schema changes were already present and were never replayed. On October 1, 2026, the remote ledger was reconciled by inserting bookkeeping rows for `0004_chat_requester.sql` through `0007_household_retirement.sql` only. Their migration SQL was not executed. The rows were appended by D1's ledger operation after 0008–0011, so the names are complete but the historical application order remains documented here.

Reconciliation evidence: private export `family-db-before-ledger-reconcile-2026-10-01.sql`, restored with all table fingerprints plus foreign-key/integrity checks; rollback checkpoint `pre-ledger-reconcile-2026-10-01` at application commit `201ea3c`. Post-write verification found the schema and every non-ledger table/data fingerprint unchanged, and `d1_migrations` contains each repository migration 0001–0011 exactly once. Keep this evidence private and outside Git.

```sh
npm run db:local          # apply to local development D1
npm run db:remote:list    # inspect production migration history/pending changes
npm run db:remote:apply   # explicitly apply to production; export and restore-verify a private backup first
```

The deploy script does not apply migrations automatically. Confirm the database binding and migration history before remote execution. The portable preview keeps its own migration ledger and local database, separate from Wrangler's normal local state.
