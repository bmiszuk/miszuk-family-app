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

Release 4d3b89c applied 0010 after a private backup/restore verification. Historical production migrations 0004–0007 were applied outside the tracked migration sequence; an absent ledger entry must not be treated as permission to reapply existing schema. Reconcile read-only first, then authorize any ledger repair separately.

```sh
npm run db:local          # apply to local development D1
npm run db:remote:list    # inspect production migration history/pending changes
npm run db:remote:apply   # explicitly apply to production; export and restore-verify a private backup first
```

The deploy script does not apply migrations automatically. Confirm the database binding and migration history before remote execution. The portable preview keeps its own migration ledger and local database, separate from Wrangler's normal local state.
