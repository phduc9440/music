import { useEffect, useRef } from 'react';

/** Cao độ các nốt: toạ độ y trong khung 170 của khuông 5 dòng kẻ (40..120). */
const MELODY = [96, 84, 72, 84, 60, 72, 84, 96, 72, 60, 72, 84];
const ASSEMBLE_MS = 2600; // thời gian các hạt "mực" bay về đúng chỗ trên khuông
const SWEEP_MS = 8000; // một lượt đầu phát quét qua khuông
// con trỏ như nam châm: hạt trong bán kính bị đẩy ra rồi lò xo kéo về chỗ cũ; bấm thì bắn một đợt sóng
const PUSH_R = 90;
const GLOW_R = 130;
const BURST_R = 190;
const SPRING = 55;
const DAMP = 7;
const TRAIL = 0.3; // mỗi khung xoá bớt 30% khung trước: hạt chuyển động để lại vệt mờ như bóng ma
const BLOOM_SCALE = 3; // lớp quầng sáng vẽ ở 1/3 độ phân giải rồi làm nhoè bằng CSS

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** Màu CSS bất kỳ (hex, rgb...) thêm độ trong suốt, để làm dải chuyển màu mờ dần mà không ngả xám. */
function withAlpha(color: string, a: number) {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return color;
  c.fillStyle = color;
  const v = String(c.fillStyle);
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = v.match(/[\d.]+/g);
  return m ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : color;
}

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
  ox: number; // độ lệch do con trỏ đẩy, lò xo kéo về 0
  oy: number;
  vx: number;
  vy: number;
}

interface Palette {
  ink: string;
  accent: string;
  muted: string;
  deep: string;
  lime: string;
  fx: string[]; // bảng màu hiệu ứng của trang khách: mỗi nốt một màu
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
    fx: [v('--gh-fx-1'), v('--gh-fx-2'), v('--gh-fx-3'), v('--gh-fx-4')],
  };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Dựng các hạt theo kích thước khung: năm dòng kẻ, đầu nốt (hình elip nghiêng), thân nốt và một ít hạt trôi nền. */
function build(w: number, h: number, rand: () => number): { particles: Particle[]; noteX: number[]; noteY: number[] } {
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
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
    });

  for (let i = 0; i < 5; i++) {
    const y = top + i * gap;
    for (let x = left; x <= right; x += 5.2) push(x + (rand() - 0.5) * 1.2, y + (rand() - 0.5) * 1.1, -1, 1.6 + rand());
  }
  const noteX: number[] = [];
  const noteY: number[] = [];
  MELODY.forEach((v, n) => {
    const cx = left + ((n + 0.5) / MELODY.length) * (right - left);
    const cy = unit(v + 24);
    noteX.push(cx);
    noteY.push(cy);
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
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
    });
  }
  return { particles, noteX, noteY };
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
 * và nốt (chính là việc số hoá), rồi đầu phát quét qua và nốt đang phát sáng màu đồng thau, toả tia lấp lánh bay lên.
 * Cho cảm giác mơ hồ: hạt lấp lánh và bồng bềnh như lơ lửng trong nước, để lại vệt mờ khi chuyển động, một làn sóng màu
 * nhấn trôi chậm ngang khuông, và một lớp quầng sáng nhoè phủ lên tất cả. Rê chuột: hạt quanh con trỏ dạt ra như mạt sắt
 * gặp nam châm, sáng lên, có vầng sáng đi theo con trỏ; bấm: một đợt sóng làm hạt văng ra rồi tự xếp lại.
 * `paused` chỉ dừng phần tự chạy (bay về, đầu phát), con trỏ vẫn tác động được. Dừng vẽ khi ra khỏi màn hình hoặc tab
 * ẩn; bật "Giảm chuyển động" thì chỉ vẽ một khung đã xếp xong, không có hiệu ứng con trỏ.
 */
export default function ScoreConstellation({ paused, label }: { paused: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const bloom = bloomRef.current;
    const bctx = bloom?.getContext('2d');
    if (!canvas || !ctx || !bloom || !bctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let palette = readPalette(canvas);
    let w = 0;
    let h = 0;
    let state = build(1, 1, seeded(7));
    let raf = 0;
    let visible = true;
    let clock = 0; // thời gian đã chạy (ms), đứng yên khi tạm dừng
    let last = 0;
    let dt = 0; // giây giữa hai khung, cho phần lò xo (chạy cả khi tạm dừng)
    let px = -1e4; // con trỏ trong toạ độ canvas
    let py = -1e4;
    let wall = 0; // giây theo đồng hồ thật: lấp lánh và bồng bềnh không dừng khi tạm dừng
    let fresh = true; // khung đầu sau khi đổi cỡ: xoá sạch thay vì để vệt
    let lastActive = -1;
    const sparks: Spark[] = [];
    let soft = { lime: '', limeClear: '', glow: '' };
    const readSoft = () => {
      // độ đậm mỗi khung thấp: vệt mờ cộng dồn các khung lại (đậm nhất ≈ giá trị này / TRAIL), nên không bị đọng thành mảng đặc
      soft = {
        lime: withAlpha(palette.lime, 0.09),
        limeClear: withAlpha(palette.lime, 0),
        glow: withAlpha(palette.lime, 0.05),
      };
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, box.width);
      h = Math.max(1, box.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bloom.width = Math.max(1, Math.round(w / BLOOM_SCALE));
      bloom.height = Math.max(1, Math.round(h / BLOOM_SCALE));
      state = build(w, h, seeded(7));
      palette = readPalette(canvas);
      readSoft();
      fresh = true;
    };

    const draw = (t: number) => {
      // vệt mờ: phủ xoá một phần khung trước thay vì xoá hết
      if (reduce || fresh) {
        ctx.clearRect(0, 0, w, h);
        fresh = false;
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      const tw = reduce ? 0 : wall;
      const assemble = reduce ? 1 : Math.min(1, t / ASSEMBLE_MS);
      const sweep = reduce ? 0.04 : Math.max(0, t - ASSEMBLE_MS * 0.85) / SWEEP_MS;
      const head = state.noteX.length ? w * 0.06 + (sweep % 1) * (w * 0.9) : -1;
      const active = state.noteX.findIndex((x) => Math.abs(x - head) < w * 0.035);
      const tones = [palette.ink, palette.accent, palette.muted, palette.deep];
      const gap = Math.min(h * 0.1, w * 0.068);

      // vầng sáng đi theo con trỏ (cùng với vệt mờ thành đuôi sao chổi)
      if (!reduce && px > -1e3) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, GLOW_R);
        g.addColorStop(0, soft.glow);
        g.addColorStop(1, soft.limeClear);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(px - GLOW_R, py - GLOW_R, GLOW_R * 2, GLOW_R * 2);
      }

      // đầu phát: một cột sáng hình bầu dục, mờ dần ở mọi phía; nhờ vệt mờ nó kéo theo một quầng sáng phía sau như
      // đuôi sao chổi, và có vài đốm sáng li ti bay lên dọc cột
      if (!reduce && head >= 0 && assemble >= 1) {
        const cy = h * 0.5 - gap * 0.2;
        ctx.save();
        ctx.translate(head, cy);
        ctx.scale(1, 4.2);
        const col = ctx.createRadialGradient(0, 0, 0, 0, 0, gap * 0.95);
        col.addColorStop(0, soft.lime);
        col.addColorStop(1, soft.limeClear);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, gap * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (Math.random() < 0.5) {
          sparks.push({
            x: head + (Math.random() - 0.5) * gap * 0.8,
            y: cy + (Math.random() - 0.5) * gap * 6,
            vx: (Math.random() - 0.5) * 8,
            vy: -12 - Math.random() * 18,
            life: 0.6,
          });
        }
      }

      state.particles.forEach((p) => {
        let k = 1;
        if (p.ambient) {
          p.x = p.tx + Math.cos(p.drift + t / 2400) * 6;
          p.y = p.ty + Math.sin(p.drift + t / 3100) * 6;
        } else {
          k = easeOut(Math.min(1, Math.max(0, (assemble - p.delay) / (1 - p.delay))));
          // đã về chỗ thì bồng bềnh nhẹ như lơ lửng trong nước
          const bobX = Math.cos(tw * 0.7 + p.drift + p.tx * 0.008) * 1.1 * k;
          const bobY = Math.sin(tw * 0.9 + p.drift + p.tx * 0.011) * 1.6 * k;
          p.x = p.sx + (p.tx - p.sx) * k + bobX;
          p.y = p.sy + (p.ty - p.sy) * k + bobY;
        }
        // con trỏ đẩy hạt ra, lò xo kéo về, ma sát làm tắt dao động
        if (dt > 0) {
          const dx = p.x + p.ox - px;
          const dy = p.y + p.oy - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH_R * PUSH_R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / PUSH_R) ** 2 * 2600 * dt;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
          p.vx += -p.ox * SPRING * dt;
          p.vy += -p.oy * SPRING * dt;
          const damp = Math.exp(-DAMP * dt);
          p.vx *= damp;
          p.vy *= damp;
          p.ox += p.vx * dt;
          p.oy += p.vy * dt;
        }
        const x0 = p.x + p.ox;
        const y0 = p.y + p.oy;
        const gx = x0 - px;
        const gy = y0 - py;
        const glow = Math.max(0, 1 - Math.sqrt(gx * gx + gy * gy) / GLOW_R);

        // lấp lánh theo nhịp riêng của từng hạt; làn sóng màu nhấn trôi chậm ngang khuông như cực quang
        const twinkle = reduce ? 1 : 0.55 + 0.45 * Math.sin(tw * (1.4 + Math.abs(p.spin) * 6) + p.drift * 7);
        const aurora = !p.ambient && k > 0.98 && Math.sin(p.tx * 0.011 - tw * 0.8 + p.ty * 0.004) > 0.93;
        const lit = (p.note >= 0 && p.note === active) || glow > 0.45;
        const breathe = 1 + 0.18 * Math.sin(tw * 0.8 + p.tx * 0.02);
        const size = (lit ? p.size * (1.35 + glow * 0.5) : aurora ? p.size * 1.2 : p.size) * breathe;
        const rot = p.rot + (reduce ? 0 : (t / 1000) * p.spin);
        ctx.globalAlpha = p.ambient
          ? (0.25 + glow * 0.55) * twinkle
          : lit
            ? 1
            : aurora
              ? 0.95
              : 0.85 * (0.7 + 0.3 * twinkle);
        // nốt mang màu riêng theo thứ tự (hồng, tím, hổ phách, xanh ngọc), bụi nền lấp lánh nhiều màu, dòng kẻ giữ màu mực
        const base = p.note >= 0 ? palette.fx[p.note % 4] : p.ambient ? palette.fx[p.tone] : tones[p.tone];
        ctx.strokeStyle = lit || aurora ? palette.lime : base;
        ctx.lineWidth = lit ? 1.4 : 1;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = rot + (i * Math.PI * 2) / 3;
          const x = x0 + Math.cos(a) * size;
          const y = y0 + Math.sin(a) * size;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      });

      // nốt vừa tới đầu phát: toả một chùm tia lấp lánh bay lên
      if (!reduce && active >= 0 && active !== lastActive && assemble >= 1) {
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 20 + Math.random() * 60;
          sparks.push({
            x: state.noteX[active],
            y: state.noteY[active],
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.6 - 50,
            life: 1,
          });
        }
        if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
      }
      lastActive = active;
      ctx.strokeStyle = palette.lime;
      ctx.lineWidth = 1;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy -= 18 * dt;
        sp.life -= dt * 0.75;
        if (sp.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const r = 1.5 + sp.life * 2.5;
        ctx.globalAlpha = sp.life;
        ctx.beginPath();
        ctx.moveTo(sp.x - r, sp.y);
        ctx.lineTo(sp.x + r, sp.y);
        ctx.moveTo(sp.x, sp.y - r);
        ctx.lineTo(sp.x, sp.y + r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // quầng sáng: chép khung vừa vẽ sang lớp nhỏ, CSS làm nhoè và phủ lên
      bctx.clearRect(0, 0, bloom.width, bloom.height);
      bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
    };

    const frame = (now: number) => {
      raf = 0;
      const step = last ? Math.min(64, now - last) : 0;
      if (!pausedRef.current) clock += step;
      dt = step / 1000;
      wall += dt;
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
    // ---- con trỏ ----
    const locate = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      px = e.clientX - box.left;
      py = e.clientY - box.top;
    };
    const onMove = (e: PointerEvent) => locate(e);
    const onLeave = () => {
      px = -1e4;
      py = -1e4;
    };
    const onDown = (e: PointerEvent) => {
      if (reduce) return;
      locate(e);
      for (const p of state.particles) {
        const dx = p.x + p.ox - px;
        const dy = p.y + p.oy - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < BURST_R && d > 0.01) {
          const f = (1 - d / BURST_R) * 900;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
    };
    if (!reduce) {
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointerdown', onDown);
    }

    const onVisibility = () => !document.hidden && start();
    document.addEventListener('visibilitychange', onVisibility);
    // Đổi theme sáng / tối: đọc lại màu
    const mo = new MutationObserver(() => {
      palette = readPalette(canvas);
      readSoft();
      draw(clock);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div className="gh-constellation" role="img" aria-label={label}>
      <canvas ref={canvasRef} className="gh-constellation__ink" />
      <canvas ref={bloomRef} className="gh-constellation__bloom" />
    </div>
  );
}
