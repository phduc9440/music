import * as THREE from 'three';

/*
 * Ảnh nốt nhạc cho các nền 3D (vẽ bằng đường trên canvas, không phụ thuộc font nhạc). Ảnh trắng trên nền trong suốt,
 * tô màu bằng material. Đầu nốt nằm đúng tâm ảnh, đuôi hướng lên ở mép phải; nốt đuôi xuống thì lật dọc khi đặt.
 */

export const GLYPH_W = 128;
export const GLYPH_H = 256;
/** Một khe khuông trên ảnh = 36px: nhân với khoảng cách dòng kẻ thật để ra cỡ ô nốt. */
export const GLYPH_GAP_PX = 36;

/** 0 móc đơn, 1 nốt đen, 2 nốt trắng, 3 nốt tròn. */
export type Glyph = 0 | 1 | 2 | 3;
export const GLYPHS: Glyph[] = [0, 1, 2, 3];

/** Cỡ ô nốt (rộng, cao) theo khoảng cách dòng kẻ `gap`. */
export const glyphSize = (gap: number) => [(GLYPH_W / GLYPH_GAP_PX) * gap, (GLYPH_H / GLYPH_GAP_PX) * gap] as const;

/** `ledger`: thêm một dòng kẻ phụ ngang qua đầu nốt (nốt Đô giữa ở khoá Sol); `sharp`: dấu thăng bên trái nốt. */
export function makeGlyph(kind: Glyph, { ledger = false, sharp = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_W;
  canvas.height = GLYPH_H;
  const g = canvas.getContext('2d')!;
  const cx = GLYPH_W / 2;
  const cy = GLYPH_H / 2;
  g.fillStyle = '#fff';

  if (ledger) g.fillRect(cx - 34, cy - 2, 68, 4);
  if (sharp) {
    // hai nét dọc và hai nét ngang dày hơi xiên lên, cao khoảng 2,6 khe
    const sx = cx - 44;
    const h = GLYPH_GAP_PX * 1.3;
    g.fillRect(sx - 6, cy - h, 3, h * 2 - 4);
    g.fillRect(sx + 4, cy - h + 4, 3, h * 2 - 4);
    for (const dy of [-9, 9]) {
      g.beginPath();
      g.moveTo(sx - 12, cy + dy + 3);
      g.lineTo(sx + 12, cy + dy - 5);
      g.lineTo(sx + 12, cy + dy + 1);
      g.lineTo(sx - 12, cy + dy + 9);
      g.closePath();
      g.fill();
    }
  }

  // đầu nốt: hình bầu dục nghiêng; nốt trắng/tròn rỗng ruột
  const whole = kind === 3;
  g.beginPath();
  g.ellipse(cx, cy, whole ? 25 : 21, whole ? 16 : 15, whole ? 0.25 : -0.38, 0, Math.PI * 2);
  g.fill();
  if (kind >= 2) {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(cx, cy, whole ? 11 : 15, whole ? 9 : 7, whole ? 1.1 : -0.38, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  if (!whole) {
    // đuôi nốt ở mép phải, dài khoảng 3,4 khe
    const sx = cx + 18;
    const top = cy - GLYPH_GAP_PX * 3.4;
    g.fillRect(sx, top, 4.5, cy - top - 2);
    if (kind === 0) {
      g.beginPath();
      g.moveTo(sx + 4, top);
      g.bezierCurveTo(sx + 6, top + 30, sx + 34, top + 40, sx + 24, top + 86);
      g.bezierCurveTo(sx + 28, top + 52, sx + 12, top + 44, sx + 4, top + 38);
      g.closePath();
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}
