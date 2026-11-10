// Báo lỗi khi CSS/TSX của phần bản nhạc còn viết cứng mã màu (#rgb, #rrggbb, rgb(), rgba(), hsl(), hsla()).
// Màu phải đi qua biến trong src/styles/tokens.css (hoặc score-tokens.css). Chạy: npm run lint:colors
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Nơi được định nghĩa màu.
const ALLOWED = ['styles/tokens.css', 'styles/score-tokens.css'];

// Phạm vi đang quét: phần bản nhạc. Đức/Công bật thêm thư mục của mình khi dọn xong.
const SCOPES = [
  'pages/scores/editor',
  'pages/scores/library',
  'pages/scores/player',
  'pages/scores/upload',
  'components/scores',
  'components/player',
  'components/editor',
  'components/export',
];

// Thư mục của Công (luyện tập), chưa quét.
const SKIP = ['components/scores/practice/'];

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(css|tsx?)$/.test(name) ? [full] : [];
  });

const problems = [];
for (const scope of SCOPES) {
  for (const file of walk(join(root, scope))) {
    const rel = relative(root, file).split(sep).join('/');
    if (ALLOWED.includes(rel) || SKIP.some((prefix) => rel.startsWith(prefix))) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Bỏ dòng chú thích và ID trong URL (ví dụ #section)
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
        const hits = line.match(COLOR);
        if (hits) problems.push(`${rel}:${i + 1}  ${hits.join(', ')}`);
      });
  }
}

if (problems.length > 0) {
  console.error(`Còn ${problems.length} chỗ viết cứng màu (dùng biến --ui-* trong styles/tokens.css):\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('lint:colors: không còn mã màu viết cứng trong phần bản nhạc.');
