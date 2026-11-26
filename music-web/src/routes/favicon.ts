import type { FaviconGlyph } from './pageMetaRoutes';

const GLYPHS: Record<FaviconGlyph, string> = {
  note: '<path d="M9 17V6l9-2v11"/><circle cx="7" cy="17" r="2"/><circle cx="16" cy="15" r="2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="#FD550A"/>',
  explore: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  team: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c0-3.5 3-5.5 6-5.5s6 2 6 5.5M16 14c3 0 5 1.5 5 4.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  admin: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};

/** Màu thương hiệu Scorewise, giống public/favicon.svg: nền xanh ngọc → xám đá, nét vàng nhấn. Giữ cố định ở cả hai theme
 *  để biểu tượng tab nhận ra ngay là của Scorewise. */
const BG_FROM = '#01796a';
const BG_TO = '#04201c';
const INK = '#FD550A';

/** Biểu tượng tab dạng SVG nhúng thẳng (data URI): ô bo góc màu Scorewise, hình theo loại trang. */
export function faviconHref(glyph: FaviconGlyph): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${BG_FROM}"/><stop offset="1" stop-color="${BG_TO}"/></linearGradient></defs>` +
    `<rect width="24" height="24" rx="6" fill="url(#bg)"/>` +
    `<g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
