# Miszuk Family

A private family portal at https://family.miszuk.com, not a genealogy application. React/Vite serves the UI; one Cloudflare Worker serves assets/API; D1 (`family-db`) stores application data. Cloudflare Access authenticates; active provisioned application accounts authorize entry.

## Current status

Application baseline `4d3b89c`, documentation audited September 30, 2026. Architecture refactor and Users & Permissions through Phase 4 are complete. Existing application behavior is stable.

- Home dashboard, household Groceries/requesters and Dinner signup.
- Family Chat with author-owned messages and Home notices.
- Directory people, birthdays (optional years), spouse/anniversary and parent/child relationships; a person need not have an account.
- Read-only Cozi Calendar and Home upcoming events, displayed in America/Chicago. Legacy local calendar APIs/data remain for compatibility; the current UI does not edit them.
- Explicit Administrator Directory/Household and account administration, with transactional audits and last-usable-Administrator protection.
- Mobile navigation, installable House M PWA, voluntary per-device push enrollment and account-wide Birthday/Chat switches. No other notification triggers are enabled.

The physical-iPhone push foundation pilot passed. Chat between two family members and the first naturally scheduled birthday remain real-device category acceptance checks. See [notification operations](docs/NOTIFICATIONS.md).

## Documentation map

- [Roadmap](docs/ROADMAP.md): completed work, candidates, later projects and deferred options; no next project is selected.
- [Architecture](ARCHITECTURE.md): current module and security boundaries.
- [Users & Permissions](docs/USERS_PERMISSIONS.md) and [recovery](docs/PHASE3_RECOVERY.md): implemented policy, account operations and historical recovery checkpoints.
- [Cozi](docs/cozi-calendar.md), [Notifications](docs/NOTIFICATIONS.md), [migrations](migrations/README.md): feature-specific operations.
- [Vehicles](docs/VEHICLES_REQUIREMENTS.md), [Photos](docs/PHOTOS_REQUIREMENTS.md): unimplemented requirements, not authorization to build.
- [Digital Systems Handbook outline](docs/infrastructure/HANDBOOK_OUTLINE.md): successor/infrastructure information still to collect.

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

## Authentication, identity and permissions

Every API route, including legacy APIs and cached Cozi responses, requires a validated Cloudflare Access JWT followed by an active provisioned account and active Directory person. Approved/unbound identities activate through verified first use; arbitrary authenticated but unprovisioned users receive no family data. Legacy `people.login_email` is frozen and is not a security identity. There is no default-household authorization fallback.

Members edit ordinary Directory information for self, direct children or spouse; Administrators have explicitly named profile/household/relationship/account actions. Groceries and Dinner remain household-scoped for everyone. Chat authorship is forced to the current person. Administrator role is not a universal bypass. Browser writes reject mismatched origins and APIs are private/no-store.

Protect the full custom hostname with Access, plus any alternate/preview hosts. Never enable `LOCAL_DEV` remotely. Keep Access issuer/audience identifiers aligned with the intended application; neither they nor editable client fields substitute for JWT validation.

## Data and date behavior

See the [migration inventory](migrations/README.md). Existing family data is preserved; record version checks reject stale changes. Soft deletion exists for family content, but not every table uses it (for example, detaching a push device deletes its subscription). Account-linked people cannot be deleted; account disabling preserves authorship/history.

Birthdays reuse Directory dates: MM-DD or YYYY-MM-DD. One spouse relationship stores the anniversary; directed parent links derive children and parents. Home family dates use America/Chicago, year rollover, and February 28 observance for February 29 in non-leap years. Ages appear only with a birth year. The Directory no longer has a duplicate upcoming-dates section.

The legacy browser grocery import remains explicit, transactional and deduplicated; its original local storage value is retained. It is not a recovery mechanism for previously lost browser data.

## Validation and release

Use `npm run check` for application changes: lint, the full Node test suite and production frontend build. Tests include actual local Cloudflare runtime/D1 checks and synthetic push cryptography/provider tests. Documentation-only changes need scope, link and whitespace checks, not application tests or deployment.

Before any separately authorized production change:

1. Confirm current release, account security state, bindings and rollback checkpoint. Use the existing Worker/database/domain.
2. For D1 changes, export privately **outside the repository**, restore locally and verify table fingerprints plus integrity/FKs. Reconcile migration history before applying only intended migrations; missing ledger entries can represent manually applied history.
3. Run relevant checks; deploy matching frontend/backend only after they pass. `npm run deploy` checks/builds then invokes Wrangler; it does not apply D1 migrations. Standard Wrangler deploy synchronizes Cron; any alternate upload helper must also preserve secret bindings/assets and synchronize schedules.
4. Verify the changed feature and account boundary without unnecessary real-data mutations or unsolicited pushes. Device receipt is not proved by provider acceptance alone.

Rollback must preserve current account enforcement, revocation, privileged-write restrictions, push secrets/subscriptions and service worker. Historical pre-account tags are not safe routine rollbacks. Use current feature operating notes and the account-aware maintenance recovery source when necessary; never restore an old D1 snapshot merely to roll back code.

## iPhone PWA

In Safari, sign in, Share → Add to Home Screen, keep Open as Web App enabled when offered, and retain Miszuk Family. Launch the House M icon. The vector master is `public/app-icons/house-m.svg`; icon assets include 1024/512/192/180/32 sizes and a separate maskable icon.

This remains online-only. The notification-only `/sw.js` handles display and safe Home/Chat taps; it does not cache family data or bypass Access/account authentication. Notification permission requires explicit action in Notifications; device enrollment and account-wide category preferences are separate. No intrusive installation prompt exists.

## Repository hygiene and historical releases

Keep exports, credentials, private recovery artifacts and local runtime data outside Git. VAPID recovery location/procedure is documented without the key in [Notifications](docs/NOTIFICATIONS.md).

Earlier release notes recorded local SQLite state removed from the Git index but historical database copies remaining in Git history. That is a separate access/history review item, not proof that ignore rules sanitize history. Do not publish or rewrite history without a scoped review.

Early releases used one shared household, editable login-email matching, a local Calendar editor and no service worker. Those descriptions are superseded. Git history retains the original release notes and tags; use current operating docs, not an early tag's rollback instructions, for recovery.
