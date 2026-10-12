// Builds the single-file app: speclab.html at the repo root.
// Inlines CSS, all source scripts, and the sql.js engine (JS + wasm as base64) so the
// page works offline by double-clicking it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, 'src', f), 'utf8');
const require = createRequire(import.meta.url);
const sqlDir = dirname(require.resolve('sql.js/dist/sql-wasm.js'));

// Order matters: core first, content before the screens that use it, app.js (boot) last.
const SCRIPTS = [
  'core.js',
  'sqlengine.js',
  'game-content.js',
  'game.js',
  'lab-erd.js',
  'lab-sql.js',
  'lab-fields.js',
  'lab-devsim.js',
  'app.js',
];

// Keep inline scripts from closing the <script> tag early.
const safe = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const sqljsSrc = readFileSync(join(sqlDir, 'sql-wasm.js'), 'utf8');
const wasmB64 = readFileSync(join(sqlDir, 'sql-wasm.wasm')).toString('base64');

const engine =
  '<script>window.__SQLJS_SRC=' + safe(JSON.stringify(sqljsSrc)) + ';\n' +
  'window.__SQLJS_WASM_B64="' + wasmB64 + '";</script>';
const present = SCRIPTS.filter((f) => existsSync(join(here, 'src', f)) || (console.warn('skipping missing ' + f), false));
const app = present.map((f) => `<script>/* ${f} */\n${safe(src(f))}\n</script>`).join('\n');

const html = src('index.html')
  .replace('/*__STYLES__*/', () => src('styles.css'))
  .replace('<!--__SCRIPTS__-->', () => engine + '\n' + app);

const out = process.env.OUT || join(here, '..', 'speclab.html');
writeFileSync(out, html);
console.log(`Built ${out} (${(html.length / 1024).toFixed(0)} KB)`);
