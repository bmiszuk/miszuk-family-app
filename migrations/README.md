# D1 migrations

`0001_initial_schema.sql` is the unchanged original schema. `0002_household_portal.sql` adds shared groceries, news, and household calendar tables without modifying existing records.

```sh
npm run db:local          # apply to local development D1
npm run db:remote:list    # inspect production migration history/pending changes
npm run db:remote:apply   # explicitly apply to production; export a backup first
```

The deploy script does not apply migrations automatically. Confirm the database binding and migration history before remote execution. The portable preview keeps its own migration ledger and local database, separate from Wrangler's normal local state.
