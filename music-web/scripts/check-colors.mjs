#!/usr/bin/env node
/**
 * Báo lỗi khi có mã màu viết cứng (#hex, rgb(), rgba(), hsl()) ngoài src/styles/tokens.css. Màu phải đi qua biến
 * var(--ui-...) để đổi theme không bỏ sót chỗ nào.
 *
 * Các file chưa dọn xong được ghi trong scripts/colors-baseline.json với số mã màu hiện có: file đó không được có
 * thêm mã màu mới, và khi dọn bớt thì chạy `npm run lint:colors -- --update` để hạ mốc xuống (mốc chỉ giảm, không tăng).
 * Chạy: npm run lint:colors
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');
const baselinePath = join(root, 'scripts', 'colors-baseline.json');
const update = process.argv.includes('--update');

const EXTENSIONS = ['.css', '.ts', '.tsx'];
const TOKENS_FILE = ['src', 'styles', 'tokens.css'].join('/');
// #rgb, #rrggbb, #rrggbbaa (có ký tự không phải chữ/số phía sau để tránh khớp nhầm id, màu trong chuỗi URL...)
const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\(/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext)) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

/** Bỏ chú thích để lời giải thích có chứa mã màu không bị tính. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const counts = {};
for (const file of walk(srcDir)) {
  const rel = relative(root, file).split(sep).join('/');
  if (rel === TOKENS_FILE) continue;
  const found = stripComments(readFileSync(file, 'utf8')).match(COLOR);
  if (found) counts[rel] = found.length;
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};

if (update) {
  // Mốc chỉ được giảm: file mới hoặc file tăng mã màu thì phải sửa code, không được nâng mốc
  const next = {};
  for (const [file, n] of Object.entries(counts)) {
    if (baseline[file] === undefined || n > baseline[file]) {
      console.error(`Không hạ mốc được: ${file} có ${n} mã màu (mốc ${baseline[file] ?? 'chưa có'}). Hãy dùng biến var(--ui-...).`);
      process.exit(1);
    }
    next[file] = n;
  }
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`Đã cập nhật mốc: ${Object.keys(next).length} file còn mã màu viết cứng.`);
  process.exit(0);
}

let failed = false;
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    failed = true;
    console.error(`LỖI ${file}: ${n} mã màu viết cứng (cho phép ${allowed}). Dùng var(--ui-...) trong tokens.css.`);
  }
}
if (failed) process.exit(1);

const stale = Object.keys(baseline).filter((file) => (counts[file] ?? 0) < baseline[file]);
if (stale.length > 0) console.log(`Có ${stale.length} file đã dọn bớt màu: chạy "npm run lint:colors -- --update" để hạ mốc.`);
const remaining = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`OK: không có mã màu mới ngoài tokens.css (còn ${remaining} mã màu chưa dọn trong ${Object.keys(counts).length} file).`);
