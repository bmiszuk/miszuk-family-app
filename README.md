# Miszuk Family

A private household portal at https://family.miszuk.com. React/Vite provides the dashboard; a Cloudflare Worker serves its assets and API; D1 (`family-db`) stores shared records; Cloudflare Access controls membership.

## First usable release

- Shared groceries: add, edit quantities, check off, remove, and explicitly import the old browser-only list.
- Family News: create, edit, and remove announcements with a trusted author and date.
- Calendar: create, edit, and remove timed or all-day events; upcoming view and an option to include past events.
- All three sections refresh every 15 seconds while visible and when the window regains focus.
- Version checks reject stale changes instead of overwriting another family member's work. Cancel and reopen an editor after a conflict to use the latest record.
- Removed records are soft-deleted. They disappear from the app but remain in D1 for recovery; no restore UI is included yet.
- House Projects, Photos, Recipes, and Documents are labeled as planned. They are not implemented in this release.

This is one shared household: every member allowed through this Access application can read, add, edit, and remove household content. It is not a multi-family service. Original family/person APIs and tables are retained for compatibility and now sit behind the same authentication checks.

## Local development

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev
```

The development script builds assets, applies migrations to **local** D1, runs Wrangler on loopback port 8787, and starts Vite at http://127.0.0.1:5173. Vite proxies `/api` to the local Worker. Browser and Worker changes reload through their respective development servers. If either server exits, the other is stopped.

Local development supplies `LOCAL_DEV:true` only to Wrangler's command line. The Worker also requires a loopback hostname before using the local identity. Never set this variable on a deployed Worker. Development does not connect to the remote database.

### Portable local preview

If Wrangler's native bundler cannot traverse directories in a restricted Windows environment:

```sh
npm run preview:portable
```

This builds the production frontend, bundles the Worker with Vite, and serves both on http://127.0.0.1:5173 using Miniflare's real Cloudflare runtime. It uses an independent persistent local D1 database under `.wrangler/portable-state`; migrations are applied automatically to that local database only. This preview requires a rebuild/restart after source changes. Do not run it at the same time as `npm run dev` (both use port 5173).

`npm run preview` is the regular Wrangler production-build preview. Run `npm run db:local` before it if the local database is new.

## Authentication

Production API requests require a signed `Cf-Access-Jwt-Assertion`. The Worker validates the RSA signature, issuer, application audience, expiration, and member claims with `jose`. Raw email headers and client-supplied author fields are not trusted. Requests without valid authentication cannot reach D1.

`wrangler.jsonc` contains these **non-secret** identifiers, observed in the sign-in redirect for `family.miszuk.com` on 2026-09-05:

- `ACCESS_TEAM_DOMAIN`: `broken-bush-7200.cloudflareaccess.com`
- `ACCESS_AUD`: `2d6488c2019b05588c29467e0bd8173b74d46c437efd7225834e9a84090ef1c8`

Confirm these still belong to the intended Access application before deployment, especially if the Access application has been recreated. Protect the full custom hostname, not only `/api`. Also protect or disable alternate `workers.dev` and preview URLs in Cloudflare. The Worker protects API data independently; Access should protect the page/assets too.

Browser mutations use JSON and reject cross-site/mismatched Origin headers. API responses are `private, no-store`. The UI escapes text, preserves form input after failures, and offers a sign-in link on expired sessions.

## Database

- `0001_initial_schema.sql`: existing `families`, `people`, `relationships`, `events`.
- `0002_household_portal.sql`: additive `grocery_items`, `news_posts`, `household_events`.

The older tables are neither renamed nor deleted. The new household calendar deliberately uses its own table so legacy person-linked events are not silently repurposed or migrated.

Times are saved in UTC; the UI displays timed events in the viewer's timezone. All-day dates are stored as `YYYY-MM-DD`, with inclusive end dates, and do not shift across timezones. This release has no recurrence, calendar-provider sync, or notifications. During an ambiguous daylight-saving fall-back hour the browser chooses its default occurrence; schedule outside that hour if the distinction matters.

Old groceries are imported only after a member clicks the import button on the **same browser and origin** where they were saved. The original `miszuk-grocery-list` value is retained as a backup. D1 imports are transactional in batches of up to 100 and deduplicated by member and legacy item ID; retries do not duplicate or resurrect removed records. A list previously lost by the original implementation cannot be recovered by this import.

## Validation

```sh
npm run check
```

This runs ESLint, 19 Node tests, and the production frontend build. Tests cover additive migration preservation, CRUD, stale-write protection, import retry behavior, validation, actual Access JWT verification, calendar dates, and the Worker against D1 in Cloudflare's local runtime. The unit SQL adapter uses Node's built-in SQLite; the runtime integration test additionally checks actual D1 behavior.

## Deploy to the existing Cloudflare account

Do not create a new Worker, new database, or temporary account. Keep the existing Worker name, `family-db` database ID, and custom-domain route.

1. Sign into the Cloudflare account that owns the existing Worker: `npx wrangler login`.
2. Inspect the existing deployment, Access allow policy, hostnames, and bindings in the dashboard. Confirm the configured database ID is the production `family-db`.
3. Inspect pending migrations with `npm run db:remote:list`. Export the production database before applying changes: `npx wrangler d1 export family-db --remote --output family-db-backup.sql`. Store the export privately and outside Git.
4. Apply pending migrations with `npm run db:remote:apply`. If existing tables were created manually and migration tracking is absent, reconcile the migration history before proceeding; do not drop tables to resolve that mismatch.
5. Deploy with `npm run deploy`. It runs lint, tests, and a fresh frontend build before `wrangler deploy`. Database migrations remain an explicit prior step.
6. At `family.miszuk.com`, verify an unauthenticated browser is redirected to Access and a disallowed identity is denied. Sign in with two allowed family members on separate devices. Add groceries on one, refresh the other, then test completing an item, posting news, and creating an event. Check persistence after both reload.

Rollback: restore the prior Worker version in Cloudflare if needed. The additive tables can remain unused; no destructive down-migration is required. Verify D1 backup/Time Travel settings as part of the production handoff.

No production migration or deployment was performed when this release was prepared. Only the unauthenticated Access redirects for the custom hostname were observed; live account settings and production data were not accessible.

## Repository hygiene

The original repository tracks `.wrangler` SQLite state despite ignoring it. This source package excludes local databases, credentials, dependencies, and generated builds. When applying changes to the existing Git checkout, remove the already-tracked local state with `git rm -r --cached .wrangler` and inspect that staged change. This removes it from future commits without deleting local files; historical copies remain in Git history.

Keep database backups, `.dev.vars`, and `.env` out of Git. The unused Vite starter assets/styles are retained to avoid mixing unrelated cleanup into this release.
