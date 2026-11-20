import { useEffect, useRef } from 'react';

/** Cao độ các nốt (cùng giai điệu với bản demo bên dưới): toạ độ y trong khung 170 của khuông 5 dòng kẻ (40..120). */
const MELODY = [96, 84, 72, 84, 60, 72, 84, 96, 72, 60, 72, 84];
const ASSEMBLE_MS = 2600; // thời gian các hạt "mực" bay về đúng chỗ trên khuông
const SWEEP_MS = 8000; // một lượt đầu phát quét qua khuông

interface Particle {
  x: number;
  y: number;
  sx: number; // vị trí rải lúc đầu, như mực lấm tấm trên tờ giấy chụp
  sy: number;
  tx: number; // vị trí đích trên khuông
  ty: number;
  size: number;
  rot: number;
  spin: number;
  delay: number; // 0..1, hạt nào bay về trước
  note: number; // chỉ số nốt (-1 = dòng kẻ hoặc hạt trôi nền)
  tone: 0 | 1 | 2 | 3; // 0 chữ ngà, 1 màu nhấn, 2 chữ phụ, 3 tông sâu
  ambient: boolean;
  drift: number;
}

interface Palette {
  ink: string;
  accent: string;
  muted: string;
  deep: string;
  lime: string;
}

/** Màu đọc từ token CSS của trang (không có mã màu trong TSX). */
function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    ink: v('--gh-ink'),
    accent: v('--gh-accent'),
    muted: v('--gh-ink-2'),
    deep: v('--gh-deep'),
    lime: v('--gh-lime'),
  };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Dựng các hạt theo kích thước khung: năm dòng kẻ, đầu nốt (hình elip nghiêng), thân nốt và một ít hạt trôi nền. */
function build(w: number, h: number, rand: () => number): { particles: Particle[]; noteX: number[] } {
  const particles: Particle[] = [];
  const gap = Math.min(h * 0.1, w * 0.068);
  const top = h * 0.5 - gap * 2;
  const left = w * 0.06;
  const right = w * 0.96;
  const unit = (y: number) => top + ((y - 40) / 20) * gap; // đổi toạ độ khung 170 sang canvas
  const tone = (): Particle['tone'] => {
    const r = rand();
    return r < 0.45 ? 1 : r < 0.75 ? 0 : r < 0.92 ? 2 : 3;
  };
  const push = (tx: number, ty: number, note: number, size: number) =>
    particles.push({
      x: 0,
      y: 0,
      sx: rand() * w,
      sy: rand() * h,
      tx,
      ty,
      size,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 0.6,
      delay: rand() * 0.45,
      note,
      tone: tone(),
      ambient: false,
      drift: rand() * Math.PI * 2,
    });

  for (let i = 0; i < 5; i++) {
    const y = top + i * gap;
    for (let x = left; x <= right; x += 5.2) push(x + (rand() - 0.5) * 1.2, y + (rand() - 0.5) * 1.1, -1, 1.6 + rand());
  }
  const noteX: number[] = [];
  MELODY.forEach((v, n) => {
    const cx = left + ((n + 0.5) / MELODY.length) * (right - left);
    const cy = unit(v + 24);
    noteX.push(cx);
    const rx = gap * 0.62;
    const ry = gap * 0.44;
    const tilt = -0.35;
    for (let k = 0; k < 46; k++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const ex = Math.cos(a) * rx * r;
      const ey = Math.sin(a) * ry * r;
      push(
        cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
        cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
        n,
        1.8 + rand() * 1.4,
      );
    }
    const sx = cx + rx * 0.92;
    for (let y = cy; y > cy - gap * 3.3; y -= 4.4) push(sx + (rand() - 0.5) * 0.8, y, n, 1.4 + rand() * 0.8);
  });
  const ambient = Math.round((w * h) / 2600);
  for (let i = 0; i < ambient; i++) {
    const x = rand() * w;
    const y = rand() * h;
    particles.push({
      x,
      y,
      sx: x,
      sy: y,
      tx: x,
      ty: y,
      size: 1.2 + rand() * 1.6,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 0.4,
      delay: 0,
      note: -1,
      tone: rand() < 0.6 ? 3 : 2,
      ambient: true,
      drift: rand() * Math.PI * 2,
    });
  }
  return { particles, noteX };
}

/** Hạt giả ngẫu nhiên có hạt giống: hình giống nhau giữa các lần tải trang và khi đổi kích thước. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Chữ ký của trang chủ khách: hàng nghìn hạt tam giác nhỏ như mực lấm tấm trên tờ nhạc giấy, bay về xếp thành khuông
 * và nốt (chính là việc số hoá), rồi đầu phát quét qua và nốt đang phát sáng màu đồng thau. Dừng khi `paused`, khi ra
 * khỏi màn hình hoặc tab ẩn; bật "Giảm chuyển động" thì chỉ vẽ một khung đã xếp xong.
 */
export default function ScoreConstellation({ paused, label }: { paused: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let palette = readPalette(canvas);
    let w = 0;
    let h = 0;
    let state = build(1, 1, seeded(7));
    let raf = 0;
    let visible = true;
    let clock = 0; // thời gian đã chạy (ms), đứng yên khi tạm dừng
    let last = 0;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, box.width);
      h = Math.max(1, box.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = build(w, h, seeded(7));
      palette = readPalette(canvas);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const assemble = reduce ? 1 : Math.min(1, t / ASSEMBLE_MS);
      const sweep = reduce ? 0.04 : Math.max(0, t - ASSEMBLE_MS * 0.85) / SWEEP_MS;
      const head = state.noteX.length ? w * 0.06 + (sweep % 1) * (w * 0.9) : -1;
      const active = state.noteX.findIndex((x) => Math.abs(x - head) < w * 0.035);
      const tones = [palette.ink, palette.accent, palette.muted, palette.deep];
      state.particles.forEach((p) => {
        if (p.ambient) {
          p.x = p.tx + Math.cos(p.drift + t / 2400) * 6;
          p.y = p.ty + Math.sin(p.drift + t / 3100) * 6;
        } else {
          const k = easeOut(Math.min(1, Math.max(0, (assemble - p.delay) / (1 - p.delay))));
          p.x = p.sx + (p.tx - p.sx) * k;
          p.y = p.sy + (p.ty - p.sy) * k;
        }
        const lit = p.note >= 0 && p.note === active;
        const size = lit ? p.size * 1.35 : p.size;
        const rot = p.rot + (reduce ? 0 : (t / 1000) * p.spin);
        ctx.globalAlpha = p.ambient ? 0.35 : lit ? 1 : 0.85;
        ctx.strokeStyle = lit ? palette.lime : tones[p.tone];
        ctx.lineWidth = lit ? 1.4 : 1;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = rot + (i * Math.PI * 2) / 3;
          const x = p.x + Math.cos(a) * size;
          const y = p.y + Math.sin(a) * size;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      });
      if (!reduce && head >= 0 && assemble >= 1) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = palette.lime;
        ctx.lineWidth = 1;
        const gap = Math.min(h * 0.1, w * 0.068);
        ctx.beginPath();
        ctx.moveTo(head, h * 0.5 - gap * 3.4);
        ctx.lineTo(head, h * 0.5 + gap * 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (last && !pausedRef.current) clock += Math.min(64, now - last);
      last = now;
      draw(clock);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (reduce || raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    resize();
    draw(reduce ? ASSEMBLE_MS : 0);
    start();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => (resize(), draw(clock))) : null;
    ro?.observe(canvas);
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            visible = e.isIntersecting;
            if (visible) start();
          })
        : null;
    io?.observe(canvas);
    const onVisibility = () => !document.hidden && start();
    document.addEventListener('visibilitychange', onVisibility);
    // Đổi theme sáng / tối: đọc lại màu
    const mo = new MutationObserver(() => ((palette = readPalette(canvas)), draw(clock)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="gh-constellation" role="img" aria-label={label} />;
}
