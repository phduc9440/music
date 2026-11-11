#!/usr/bin/env node
/**
 * Kiểm tra đa ngôn ngữ (mục 6.2):
 *  1. src/locales/vi và src/locales/en có cùng bộ khóa (khóa số nhiều "_one/_other" tính là một khóa).
 *  2. Mọi khóa viết thẳng trong code ('common.nav.back', t('home.guest.signIn'), labelMap('prefix', [...])) đều có chuỗi
 *     tiếng Việt, để không còn chỗ gọi một khóa không tồn tại.
 *  3. Không viết thêm chuỗi tiếng Việt cứng trong .ts/.tsx (trừ comment). File chưa chuyển xong được ghi trong
 *     scripts/i18n-baseline.json với số dòng hiện có: file đó không được có thêm dòng mới, và khi chuyển bớt thì chạy
 *     `npm run lint:i18n -- --update` để hạ mốc (mốc chỉ giảm, không tăng). Dòng nào cố ý giữ chữ tiếng Việt (ví dụ tên
 *     ngôn ngữ "Tiếng Việt") thì thêm `i18n-ignore` vào comment cuối dòng.
 * Chạy: npm run lint:i18n
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');
const localesDir = join(srcDir, 'locales');
const baselinePath = join(root, 'scripts', 'i18n-baseline.json');
const update = process.argv.includes('--update');
const init = process.argv.includes('--init');

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(message);
};

// ---------------------------------------------------------------------------------------------- 1. khóa vi / en
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

function loadLocale(lang) {
  const keys = new Map();
  const dir = join(localesDir, lang);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    flatten(JSON.parse(readFileSync(join(dir, file), 'utf8')), ns, keys);
  }
  return keys;
}

const vi = loadLocale('vi');
const en = loadLocale('en');
const base = (key) => key.replace(PLURAL, '');
const viBase = new Set([...vi.keys()].map(base));
const enBase = new Set([...en.keys()].map(base));

for (const key of viBase) if (!enBase.has(key)) fail(`THIẾU bản tiếng Anh: ${key}`);
for (const key of enBase) if (!viBase.has(key)) fail(`THIẾU bản tiếng Việt: ${key}`);

// Chuỗi tiếng Anh có số nhiều thì phải đủ _one và _other
for (const key of en.keys()) {
  const m = PLURAL.exec(key);
  if (m && (m[1] === 'one' || m[1] === 'other')) {
    const sibling = key.replace(PLURAL, m[1] === 'one' ? '_other' : '_one');
    if (!en.has(sibling)) fail(`Khóa số nhiều thiếu cặp _one/_other: ${key}`);
  }
}

// Tham số {name} phải giống nhau giữa hai ngôn ngữ (không tính khóa số nhiều, vì mỗi dạng có thể bỏ {count})
const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [key, text] of vi) {
  if (en.has(key) && params(text) !== params(en.get(key))) {
    fail(`Tham số khác nhau giữa vi và en: ${key} (vi: {${params(text)}}, en: {${params(en.get(key))}})`);
  }
}

// ----------------------------------------------------------------------------------------------- 2. khóa được gọi
const namespaces = readdirSync(join(localesDir, 'vi'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (full === localesDir) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

const files = walk(srcDir);
const keyPattern = new RegExp(`['"\`]((?:${namespaces.join('|')})\\.[A-Za-z0-9_.]+)['"\`]`, 'g');
const viKeys = [...vi.keys()];
// Khóa có thể là một chuỗi, một chuỗi số nhiều, hoặc tiền tố của cả nhóm (dùng cho labelMap('tiền.tố', [...]))
const hasKey = (key) =>
  vi.has(key) || vi.has(`${key}_other`) || vi.has(`${key}_one`) || viKeys.some((k) => k.startsWith(`${key}.`));

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const sources = new Map();
for (const file of files) sources.set(file, readFileSync(file, 'utf8'));

for (const [file, text] of sources) {
  const rel = relative(root, file).split(sep).join('/');
  const code = stripComments(text);
  for (const m of code.matchAll(keyPattern)) {
    if (!hasKey(m[1])) fail(`KHÓA không tồn tại: ${m[1]} (${rel})`);
  }
  // labelMap('tiền.tố', ['A', 'B', 1, 2]) => cần "tiền.tố.A", ...
  for (const m of code.matchAll(/labelMap(?:<[^>]*>)?\(\s*['"]([\w.]+)['"]\s*,\s*\[([^\]]*)\]/g)) {
    for (const k of m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)) {
      if (!hasKey(`${m[1]}.${k}`)) fail(`KHÓA không tồn tại: ${m[1]}.${k} (${rel}, labelMap)`);
    }
  }
}

// ---------------------------------------------------------------------------- 3. chuỗi tiếng Việt viết cứng
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

const counts = {};
for (const [file, text] of sources) {
  const rel = relative(root, file).split(sep).join('/');
  const lines = stripComments(text).split('\n');
  const original = text.split('\n');
  let n = 0;
  lines.forEach((line, i) => {
    if (VIETNAMESE.test(line) && !original[i].includes('i18n-ignore')) n++;
  });
  if (n > 0) counts[rel] = n;
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};

if (init && !existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n');
  console.log(`Đã tạo mốc ban đầu: ${Object.keys(counts).length} file còn chuỗi tiếng Việt viết cứng.`);
  process.exit(0);
}

if (update) {
  // Mốc chỉ được giảm: file mới hoặc file tăng dòng thì phải chuyển sang t(), không được nâng mốc
  const next = {};
  for (const [file, n] of Object.entries(counts)) {
    if (baseline[file] === undefined || n > baseline[file]) {
      console.error(`Không hạ mốc được: ${file} có ${n} dòng tiếng Việt cứng (mốc ${baseline[file] ?? 'chưa có'}). Hãy dùng t().`);
      process.exit(1);
    }
    next[file] = n;
  }
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`Đã cập nhật mốc: ${Object.keys(next).length} file còn chuỗi tiếng Việt viết cứng.`);
  process.exit(0);
}

for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) fail(`LỖI ${file}: ${n} dòng tiếng Việt viết cứng (cho phép ${allowed}). Dùng t('<ns>.<khóa>') và thêm vào src/locales.`);
}

if (failed) process.exit(1);

const stale = Object.keys(baseline).filter((file) => (counts[file] ?? 0) < baseline[file]);
if (stale.length > 0) console.log(`Có ${stale.length} file đã chuyển bớt chuỗi: chạy "npm run lint:i18n -- --update" để hạ mốc.`);
const remaining = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `OK: ${viBase.size} khóa, vi và en khớp nhau; còn ${remaining} dòng tiếng Việt chưa chuyển trong ${Object.keys(counts).length} file.`,
);
