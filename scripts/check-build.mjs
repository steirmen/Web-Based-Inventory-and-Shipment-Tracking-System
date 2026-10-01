// Production build review (Phase 10B), run by `npm run check:build` after `npm run build`.
// Fails when the web build:
//   - ships source maps;
//   - contains the value of any secret-looking variable from the repository .env
//     (only variable NAMES are ever printed, never values);
//   - lacks the configured API base URL, or references a missing asset;
//   - stops splitting pages into lazy chunks, or the initial download grows past its budget.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'apps/web/dist');
const assets = join(dist, 'assets');
/** Entry + modulepreloaded chunks, raw kB. Phase 9 measured ≈ 694 kB; ~10% headroom. */
const INITIAL_BUDGET_KB = 765;
/** Business pages that must stay lazy (one chunk each). */
const MIN_PAGE_CHUNKS = 25;

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/web/dist is missing: run `npm run build` first.');
  process.exit(2);
}

const files = readdirSync(assets);
const sizeKb = (file) => statSync(join(assets, file)).size / 1000;

// 1. No source maps.
const maps = files.filter((file) => file.endsWith('.map'));
if (maps.length > 0) fail(`source maps in the build: ${maps.join(', ')}`);

// 2. No secret values from .env anywhere in the build.
const envFile = join(root, '.env');
const env = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
const secretNames = Object.keys(env).filter(
  (name) => /PASSWORD|SECRET|TOKEN|KEY|DB_USER/i.test(name) && (env[name] ?? '').length >= 4,
);
const bundleText = [join(dist, 'index.html'), ...files.map((file) => join(assets, file))]
  .filter((path) => /\.(html|js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
for (const name of secretNames) {
  if (bundleText.includes(env[name])) fail(`the value of ${name} appears in the build`);
}
if (/process\.env\b/.test(bundleText)) fail('the build references process.env');

// 3. The API base URL the build was made for, and every asset index.html references.
const apiBase = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL;
if (apiBase && !bundleText.includes(apiBase))
  fail(`VITE_API_BASE_URL (${apiBase}) is not in the build`);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((match) => match[1]);
for (const file of referenced) {
  if (!files.includes(file)) fail(`index.html references a missing asset: ${file}`);
}

// 4. Route-level code splitting still works.
const entry = [...html.matchAll(/<script type="module"[^>]*src="\/assets\/([^"]+)"/g)].map(
  (m) => m[1],
);
const preloaded = [...html.matchAll(/rel="modulepreload"[^>]*href="\/assets\/([^"]+)"/g)].map(
  (m) => m[1],
);
if (entry.length !== 1) fail(`expected one entry script, found ${entry.length}`);
const initialKb = [...entry, ...preloaded].reduce((sum, file) => sum + sizeKb(file), 0);
if (initialKb > INITIAL_BUDGET_KB) {
  fail(`initial JavaScript ${initialKb.toFixed(1)} kB exceeds the ${INITIAL_BUDGET_KB} kB budget`);
}
const pageChunks = files.filter((file) => /-page-[\w-]+\.js$/.test(file));
if (pageChunks.length < MIN_PAGE_CHUNKS) {
  fail(`only ${pageChunks.length} lazy page chunks (expected at least ${MIN_PAGE_CHUNKS})`);
}
const entryText = readFileSync(join(assets, entry[0]), 'utf8');
// A page's own text in the entry chunk would mean an accidental static import.
if (entryText.includes('Sales, orders, customers, and stock of this workspace')) {
  fail('the dashboard page was bundled into the entry chunk');
}

const jsFiles = files.filter((file) => file.endsWith('.js'));
const totalKb = jsFiles.reduce((sum, file) => sum + sizeKb(file), 0);
console.log(
  `Build review: initial JS ${initialKb.toFixed(1)} kB (entry + ${preloaded.length} preloaded), ` +
    `${jsFiles.length} JS chunks (${pageChunks.length} page chunks), ${totalKb.toFixed(1)} kB total, ` +
    `${maps.length} source maps, ${secretNames.length} secret-looking .env values checked.`,
);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log('Build review passed.');
