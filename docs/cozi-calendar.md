# Cozi calendar connection

Production remains on the previous release until the private feed is configured and this change is deployed. No database migration is needed. Existing calendar tables and API data are retained; the UI uses the read-only `/api/cozi-calendar` endpoint.

## Configure the private URL

1. In Cozi, obtain the outbound calendar-sharing URL for the whole family (not an incoming calendar URL). Cozi instructions: https://www.cozi.com/using-cozi-with-other-calendars/
2. Open Cloudflare dashboard → Workers & Pages → **miszuk-family-app** → Settings → Variables and Secrets → Add.
3. Choose **Secret**, enter the name **COZI_CALENDAR_URL**, and paste the complete private Cozi URL as its value. Save/deploy the secret change. Cloudflare instructions: https://developers.cloudflare.com/workers/configuration/secrets/
4. Tell the developer the secret is configured; do not send the URL in chat, Git, screenshots, or issue reports. Deploy this repository release, then verify Calendar and Home against Cozi.

CLI alternative from the repository: `npx wrangler secret put COZI_CALENDAR_URL`. Paste the URL only at Wrangler's hidden interactive prompt; do not place it in a command argument or shell history. Do not use a VITE-prefixed variable, regular source configuration, or a client environment variable.

HTTPS Cozi domains are accepted; `webcal:` is upgraded to HTTPS. Redirects are not followed. If the real URL redirects, verify its final Cozi destination securely before configuring that destination.

## Behavior and limits

- Upcoming 90-day window, including ongoing events; times displayed in America/Chicago. ICS all-day DTEND stays exclusive, with the last included day shown to readers.
- ICAL.js handles RRULE, RDATE and EXDATE. Individual RECURRENCE-ID moves/cancellations and whole-series cancellations are supported. Embedded VTIMEZONE is honored; IANA timezone fallback uses Temporal. Floating date-times use X-WR-TIMEZONE or America/Chicago.
- RANGE=THISANDFUTURE and malformed/unknown timezones produce an unavailable state rather than silently showing potentially wrong dates. These uncommon feed forms require real-feed validation if present.
- Five-minute server caching, one-minute failure caching, coalesced in-flight requests. The cache key hashes the secret and results are served only after Cloudflare Access authentication. Browser API responses are private/no-store.
- Limits: 10-second fetch timeout, 2 MiB feed, 2,000 event groups/returned occurrences, 20,000 recurrence steps. Large or pathological feeds fail safely.
- Only normalized titles, dates, location, attendee display names and category labels are returned. No feed URL, raw ICS, attendee email, raw UID, or event description is returned. URLs embedded in display text are omitted. Cozi-specific member metadata can only be confirmed against the real feed.
- “Open Cozi” links to https://my.cozi.com/ for editing. No second calendar editor, import into D1, scheduled job or new database schema is created.

## Local verification

`npm run build` then `node scripts/preview.mjs --cozi-sample` runs the real Worker locally with `tests/fixtures/cozi-sample.ics` and intercepts outbound fetches. The sample is entirely synthetic, dated September 2026, and never published as a public asset. Without `--cozi-sample`, local preview shows the not-connected state. Tests use synthetic feeds and never contact a real Cozi calendar.

Before release with the real secret, verify actual Cozi events (including recurrence/all-day times and available member names), the Home summary, five-minute refresh behavior, and that no private URL appears in API responses or client assets. Do not alter family calendar data to perform this read-only check.
