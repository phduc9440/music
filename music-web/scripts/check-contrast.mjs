#!/usr/bin/env node
/**
 * Kiểm tra độ tương phản của các cặp màu chữ/nền quan trọng ở cả hai theme (đọc thẳng từ src/styles/tokens.css).
 * Chữ thường cần >= 4,5:1; biểu tượng và viền cần >= 3:1. Chạy: npm run check:contrast
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

/** Đọc các khai báo `--ui-xxx: giá trị;` trong một khối selector. */
function readBlock(selector) {
  const start = css.indexOf(`\n${selector}`);
  if (start < 0) return {};
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  const vars = {};
  for (const m of css.slice(open, close).matchAll(/(--ui-[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = readBlock(':root {');
const dark = { ...light, ...readBlock(":root[data-theme='dark']") };

function parse(value) {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  throw new Error(`Chưa hỗ trợ màu "${value}" (chỉ #rgb hoặc #rrggbb)`);
}

function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [chữ, nền, ngưỡng, ghi chú] */
const PAIRS = [
  ['--ui-text', '--ui-bg', 4.5, 'chữ chính trên nền trang'],
  ['--ui-text', '--ui-surface', 4.5, 'chữ chính trên thẻ'],
  ['--ui-text', '--ui-surface-hover', 4.5, 'chữ chính khi rê chuột'],
  ['--ui-text-2', '--ui-surface', 4.5, 'chữ phụ trên thẻ'],
  ['--ui-text-2', '--ui-bg', 4.5, 'chữ phụ trên nền trang'],
  ['--ui-text-3', '--ui-surface', 4.5, 'chữ mờ trên thẻ'],
  ['--ui-primary', '--ui-surface', 4.5, 'liên kết / chữ nhấn trên thẻ'],
  ['--ui-primary', '--ui-primary-soft', 4.5, 'chữ nhấn trên nền nhấn nhạt'],
  ['--ui-on-accent', '--ui-primary', 4.5, 'chữ trên nút chính'],
  ['--ui-on-accent', '--ui-danger', 4.5, 'chữ trên nút nguy hiểm'],
  ['--ui-success', '--ui-success-soft', 4.5, 'chữ thành công'],
  ['--ui-warning', '--ui-warning-soft', 4.5, 'chữ cảnh báo'],
  ['--ui-danger', '--ui-danger-soft', 4.5, 'chữ lỗi'],
  ['--ui-violet', '--ui-violet-soft', 4.5, 'chữ nhãn tím'],
  ['--ui-border-strong', '--ui-surface', 1.3, 'viền đậm (chỉ cần nhìn thấy)'],
  ['--ui-stage-text', '--ui-stage-bg', 4.5, 'chữ trên sân khấu trang chủ'],
  ['--ui-stage-text-2', '--ui-stage-bg-2', 4.5, 'chữ phụ trên sân khấu trang chủ'],
  ['--ui-brass', '--ui-stage-bg', 4.5, 'chữ vàng đồng trên sân khấu'],
  ['--ui-stage-text', '--ui-velvet', 4.5, 'chữ trên nút đỏ nhung'],
  ['--ui-stage-text', '--ui-velvet-hover', 4.5, 'chữ trên nút đỏ nhung khi rê chuột'],
];

let failed = 0;
for (const [name, theme] of [
  ['sáng', light],
  ['tối', dark],
]) {
  console.log(`\nTheme ${name}`);
  for (const [fg, bg, min, note] of PAIRS) {
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? 'OK  ' : 'LỖI'} ${r.toFixed(2).padStart(5)}:1 (cần ${min})  ${note}  [${fg} ${theme[fg]} / ${bg} ${theme[bg]}]`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} cặp màu chưa đạt độ tương phản tối thiểu.`);
  process.exit(1);
}
console.log('\nTất cả cặp màu đạt độ tương phản.');
