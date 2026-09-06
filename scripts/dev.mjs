import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(root, '.wrangler/logs') };
let stopping = false;
function start(file, args) {
  const child = spawn(process.execPath, [resolve(root, file), ...args], { cwd: root, env, stdio: 'inherit' });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
async function run(file, args) {
  await new Promise((done, reject) => {
    const child = start(file, args);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`Setup failed (${code}).`)));
  });
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
try {
  await run('node_modules/vite/bin/vite.js', ['build']);
  await run('node_modules/wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', 'family-db', '--local']);
  const worker = start('node_modules/wrangler/bin/wrangler.js', ['dev', '--local', '--ip', '127.0.0.1', '--port', '8787', '--var', 'LOCAL_DEV:true']);
  const frontend = start('node_modules/vite/bin/vite.js', []);
  for (const child of [worker, frontend]) {
    child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
    child.on('exit', code => { if (!stopping) { process.exitCode = code || 1; stop(); } });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; stop(); }
