// Local-only preview for environments where Wrangler's native bundler is restricted.
// Runs the real Cloudflare runtime with persistent local D1 and the production UI.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { migrationStatements } from './migration-statements.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
await readFile(resolve(dist, 'index.html')); // Run npm run build first.
const result = await build({ configFile: false, root, logLevel: 'silent', build: { write: false, lib: { entry: resolve(root, 'worker.js'), formats: ['es'], fileName: 'worker' }, minify: false } });
const output = Array.isArray(result) ? result[0] : result;
const script = output.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const mf = new Miniflare({
  modules: true, script, host: '127.0.0.1', port: 5173, compatibilityDate: '2026-07-05',
  bindings: { LOCAL_DEV: 'true' }, d1Databases: ['DB'], d1Persist: resolve(root, '.wrangler/portable-state'),
  serviceBindings: { ASSETS: async request => {
    let path;
    try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Invalid path', { status: 400 }); }
    const file = resolve(dist, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(dist + sep)) return new Response('Not found', { status: 404 });
    try { return new Response(await readFile(file), { headers: { 'Content-Type': types[extname(file)] || 'application/octet-stream' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  } },
});
try {
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)').run();
  for (const name of (await readdir(resolve(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    if (await db.prepare('SELECT name FROM preview_migrations WHERE name = ?').bind(name).first()) continue;
    const sql = (await readFile(resolve(root, 'migrations', name), 'utf8')).replace(/--[^\n]*/g, '');
    await db.batch([...migrationStatements(sql).map(value => db.prepare(value)), db.prepare('INSERT INTO preview_migrations(name) VALUES(?)').bind(name)]);
  }
  console.log(`Family preview: ${await mf.ready}`);
  console.log('Local data only. Ctrl+C to stop. Rebuild and restart after source changes.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await mf.dispose(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) { await mf.dispose(); throw error; }
