import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker.js';
import {accountSeed} from './account-fixture.mjs';
export function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'));
  db.exec("INSERT INTO families(id,name) VALUES('existing','Existing family')");
  db.exec(readFileSync(new URL('../migrations/0002_household_portal.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_family_directory.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0004_chat_requester.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_login_identity.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0006_households_dinner.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0007_household_retirement.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0008_application_accounts.sql', import.meta.url), 'utf8'));
  db.exec(accountSeed);
  db.exec(readFileSync(new URL('../migrations/0009_push_notifications.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0010_notification_deliveries.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_household_polls.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0012_vehicles.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0013_vehicle_attachments.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { const result = statement.run(...args); return { meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  async function request(path, method = 'GET', body, extra = {}) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB, LOCAL_DEV: 'true', ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com', ...extra.env }, extra.ctx);
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  return { db, request, DB };
}
