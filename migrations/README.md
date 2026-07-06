# D1 Migrations

This directory contains SQL migrations for the Miszuk Family App D1 database.

- Apply migrations with Wrangler:
  `npx wrangler d1 migrations apply family-db --local`
  or
  `npx wrangler d1 migrations apply family-db`

- The initial migration creates tables for families, people, relationships, and events.
