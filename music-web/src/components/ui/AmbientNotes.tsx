import { useEffect, useRef } from 'react';
import './ambient-notes.css';

/*
 * Nền trang trí nhẹ dùng chung cho các trang sau đăng nhập và trang đăng nhập (canvas 2D, không cần WebGL):
 *  - ánh màu cực quang rất nhẹ ở bốn góc (CSS)
 *  - nốt nhạc nhiều màu (móc đơn, nốt đen, nốt trắng, cặp nốt nối dây) lơ lửng ở ba tầng sâu, trôi lên, đung đưa,
 *    trôi theo cuộn trang (tầng gần trôi nhanh hơn: thị sai); con trỏ đi qua thì nốt dạt ra rồi đàn hồi về
 *  - bụi sáng lấp lánh
 *  - bấm chuột: một vòng sóng màu và chùm nốt nhỏ toả ra từ chỗ bấm, vẽ trên một lớp phủ nổi trên nội dung (không
 *    nhận sự kiện), trừ khi bấm vào ô nhập liệu hay hộp thoại
 * Màu lấy từ bảng màu hiệu ứng --ui-fx-1..4 (tokens.css), đổi theo theme. Giảm chuyển động: vẽ một khung tĩnh, không
 * có hiệu ứng bấm. Dừng khi tab ẩn.
 * `ambient={false}`: chỉ có hiệu ứng bấm, không có nốt bay / bụi / ánh màu nền (cho trang đã có nền riêng như trang chủ
 * làm việc); khi đó vòng vẽ chỉ chạy lúc đang có hiệu ứng rồi tự dừng.
 */

type Kind = 0 | 1 | 2 | 3; // móc đơn, nốt đen, nốt trắng, cặp nối dây

interface Floater {
  x: number; // 0..1 theo bề ngang
  y: number; // 0..1 theo khoảng quay vòng dọc
  depth: number; // 0 xa .. 1 gần
  size: number;
  speed: number;
  sway: number;
  rot: number;
  kind: Kind;
  tone: number;
  ox: number; // độ lệch do con trỏ đẩy
  oy: number;
  vx: number;
  vy: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  seed: number;
  tone: number;
}

interface Burst {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  kind: Kind;
  tone: number;
  born: number;
}

interface Ripple {
  x: number;
  y: number;
  tone: number;
  born: number;
  size: number;
}

const PUSH_R = 110;
const BURST_LIFE = 1.1;
const RIPPLE_LIFE = 0.75;
// bấm vào đây thì không có hiệu ứng: ô nhập liệu, vùng soạn thảo, hộp thoại
const NO_FX = 'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"],[role="listbox"]';

/** Vẽ một nốt nhạc tâm ở (0, 0), đầu nốt cao khoảng `s` px, đuôi hướng lên. */
function drawNote(ctx: CanvasRenderingContext2D, kind: Kind, s: number) {
  const rx = s * 0.62;
  const ry = s * 0.44;
  const stemH = s * 3.1;
  ctx.lineWidth = Math.max(1, s * 0.13);
  if (kind === 3) {
    // cặp móc đơn nối dây
    const dx = s * 1.5;
    for (const hx of [-dx / 2, dx / 2]) {
      const hy = hx < 0 ? s * 0.35 : -s * 0.35;
      ctx.beginPath();
      ctx.ellipse(hx, hy, rx, ry, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + rx * 0.9, hy);
      ctx.lineTo(hx + rx * 0.9, hy - stemH);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-dx / 2 + rx * 0.9, s * 0.35 - stemH);
    ctx.lineTo(dx / 2 + rx * 0.9, -s * 0.35 - stemH);
    ctx.lineWidth = s * 0.42;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, -0.4, 0, Math.PI * 2);
  if (kind === 2) ctx.stroke();
  else ctx.fill();
  ctx.beginPath();
  ctx.moveTo(rx * 0.9, 0);
  ctx.lineTo(rx * 0.9, -stemH);
  ctx.stroke();
  if (kind === 0) {
    // móc đuôi
    ctx.beginPath();
    ctx.moveTo(rx * 0.9, -stemH);
    ctx.bezierCurveTo(rx * 0.9 + s * 0.15, -stemH + s * 0.9, rx * 0.9 + s * 1.1, -stemH + s * 1.1, rx * 0.9 + s * 0.75, -stemH + s * 2.1);
    ctx.stroke();
  }
}

export default function AmbientNotes({ density = 1, ambient = true }: { density?: number; ambient?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const bg = bgRef.current;
    const fx = fxRef.current;
    const bctx = bg?.getContext('2d');
    const fctx = fx?.getContext('2d');
    if (!host || !bg || !fx || !bctx || !fctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let colors: string[] = [];
    const readColors = () => {
      const cs = getComputedStyle(host);
      colors = [1, 2, 3, 4].map((i) => cs.getPropertyValue(`--ui-fx-${i}`).trim() || '#888');
    };
    readColors();

    let w = 0;
    let h = 0;
    let dpr = 1;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let floaters: Floater[] = [];
    let motes: Mote[] = [];
    const bursts: Burst[] = [];
    const ripples: Ripple[] = [];

    const build = () => {
      if (!ambient) return; // chỉ có hiệu ứng bấm: không có nốt nền
      const area = (w * h) / (1440 * 900);
      const n = Math.round(Math.min(64, Math.max(20, 42 * area)) * density);
      floaters = Array.from({ length: n }, (_, i) => {
        const depth = Math.random();
        return {
          x: Math.random(),
          y: Math.random(),
          depth,
          size: 6 + depth * 12 + Math.random() * 4,
          speed: 0.006 + depth * 0.012 + Math.random() * 0.006,
          sway: rnd(0, Math.PI * 2),
          rot: rnd(-0.45, 0.45),
          kind: (i % 4) as Kind,
          tone: i % 4,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
        };
      });
      const m = Math.round(Math.min(220, Math.max(70, 150 * area)) * density);
      motes = Array.from({ length: m }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        r: rnd(0.8, 2.4),
        seed: Math.random() * 100,
        tone: i % 4,
      }));
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const c of [bg, fx]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    // ---- con trỏ ----
    let px = -1e4;
    let py = -1e4;
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const onLeave = () => {
      px = -1e4;
      py = -1e4;
    };
    let clicks = 0;
    const onClick = (e: MouseEvent) => {
      if (reduce.matches || e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.(NO_FX)) return;
      const now = performance.now() / 1000;
      const tone = clicks++ % 4;
      ripples.push({ x: e.clientX, y: e.clientY, tone, born: now, size: 46 });
      ripples.push({ x: e.clientX, y: e.clientY, tone: (tone + 1) % 4, born: now + 0.1, size: 28 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rnd(-0.3, 0.3);
        const sp = rnd(70, 150);
        bursts.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          rot: rnd(-0.4, 0.4),
          spin: rnd(-6, 6),
          size: rnd(3.5, 5.5),
          kind: (k % 4) as Kind,
          tone: (tone + k) % 4,
          born: now,
        });
      }
      if (bursts.length > 70) bursts.splice(0, bursts.length - 70);
      if (ripples.length > 12) ripples.splice(0, ripples.length - 12);
      // nốt nền gần chỗ bấm cũng bị luồng sóng đẩy dạt ra
      for (const f of floaters) {
        const fxp = f.x * w + f.ox;
        const fyp = floaterY(f) + f.oy;
        const dx = fxp - e.clientX;
        const dy = fyp - e.clientY;
        const d = Math.hypot(dx, dy);
        if (d < 220 && d > 0.1) {
          const k = (1 - d / 220) * 420;
          f.vx += (dx / d) * k;
          f.vy += (dy / d) * k;
        }
      }
      if (!running) start();
    };

    // ---- vẽ ----
    let scroll = window.scrollY;
    let t = 0;
    const range = () => h + 120; // khoảng quay vòng dọc, thừa ra để nốt khuất hẳn rồi mới vòng lại
    const floaterY = (f: Floater) => {
      const r = range();
      const y = f.y * r - t * f.speed * r - scroll * (0.15 + f.depth * 0.35);
      return ((y % r) + r) % r - 60;
    };

    const drawBg = (dt: number) => {
      if (!ambient) return;
      bctx.clearRect(0, 0, w, h);
      // bụi sáng
      for (const m of motes) {
        const tw = reduce.matches ? 0.7 : 0.45 + 0.55 * Math.sin(t * (0.8 + (m.seed % 1.7)) + m.seed);
        const y = (((m.y * h - t * 6 - scroll * 0.08) % h) + h) % h;
        bctx.globalAlpha = 0.75 * tw;
        bctx.fillStyle = colors[m.tone];
        bctx.beginPath();
        bctx.arc(m.x * w + Math.sin(t * 0.3 + m.seed) * 6, y, m.r, 0, Math.PI * 2);
        bctx.fill();
      }
      // nốt nhạc lơ lửng
      const damp = Math.exp(-3.4 * dt);
      for (const f of floaters) {
        const baseX = f.x * w + Math.sin(t * 0.35 + f.sway) * (10 + f.depth * 14);
        const baseY = floaterY(f);
        if (dt > 0) {
          const dx = baseX + f.ox - px;
          const dy = baseY + f.oy - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH_R * PUSH_R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const k = (1 - d / PUSH_R) ** 2 * 1800 * dt;
            f.vx += (dx / d) * k;
            f.vy += (dy / d) * k;
          }
          f.vx = (f.vx - f.ox * 9 * dt) * damp;
          f.vy = (f.vy - f.oy * 9 * dt) * damp;
          f.ox += f.vx * dt;
          f.oy += f.vy * dt;
        }
        const x = baseX + f.ox;
        const y = baseY + f.oy;
        if (y < -80 || y > h + 80) continue;
        const push = Math.min(1, Math.hypot(f.ox, f.oy) / 40);
        bctx.save();
        bctx.translate(x, y);
        bctx.rotate(f.rot + Math.sin(t * 0.5 + f.sway) * 0.2 + f.ox * 0.004);
        // tầng xa nhạt và nhỏ, tầng gần đậm hơn; nốt bị đẩy thì sáng lên một chút
        bctx.globalAlpha = Math.min(1, 0.32 + f.depth * 0.4 + push * 0.25);
        bctx.fillStyle = colors[f.tone];
        bctx.strokeStyle = colors[f.tone];
        bctx.lineCap = 'round';
        drawNote(bctx, f.kind, f.size);
        bctx.restore();
      }
      bctx.globalAlpha = 1;
    };

    const drawFx = (dt: number) => {
      fctx.clearRect(0, 0, w, h);
      const now = performance.now() / 1000;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = now - r.born;
        if (age >= RIPPLE_LIFE) {
          ripples.splice(i, 1);
          continue;
        }
        if (age < 0) continue;
        const k = age / RIPPLE_LIFE;
        fctx.globalAlpha = (1 - k) ** 1.6 * 0.7;
        fctx.strokeStyle = colors[r.tone];
        fctx.lineWidth = 2.2 * (1 - k) + 0.6;
        fctx.beginPath();
        fctx.arc(r.x, r.y, 6 + (1 - (1 - k) ** 3) * r.size, 0, Math.PI * 2);
        fctx.stroke();
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const age = now - b.born;
        if (age >= BURST_LIFE) {
          bursts.splice(i, 1);
          continue;
        }
        b.vx *= Math.exp(-2.2 * dt);
        b.vy = b.vy * Math.exp(-2.2 * dt) - 30 * dt; // bay bổng lên
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.spin * dt;
        const k = age / BURST_LIFE;
        fctx.save();
        fctx.translate(b.x, b.y);
        fctx.rotate(b.rot);
        fctx.globalAlpha = (1 - k) ** 1.4 * 0.9;
        fctx.fillStyle = colors[b.tone];
        fctx.strokeStyle = colors[b.tone];
        fctx.lineCap = 'round';
        drawNote(fctx, b.kind, b.size * Math.min(1, age / 0.12));
        fctx.restore();
      }
      fctx.globalAlpha = 1;
    };

    // ---- vòng vẽ ----
    let raf = 0;
    let running = false;
    let prev = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
      prev = now;
      t += dt;
      scroll += (window.scrollY - scroll) * (1 - Math.pow(0.02, dt));
      drawBg(dt);
      drawFx(dt);
      // không có nền chuyển động: hết hiệu ứng bấm thì nghỉ, lần bấm sau gọi start() lại
      if (!ambient && !bursts.length && !ripples.length) stop();
    };
    const start = () => {
      if (running || document.hidden) return;
      if (!ambient && !bursts.length && !ripples.length) return;
      if (reduce.matches) {
        drawBg(0);
        return;
      }
      running = true;
      prev = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (document.hidden || reduce.matches) {
        stop();
        drawBg(0);
        fctx.clearRect(0, 0, w, h);
      } else start();
    };

    const themeObserver = new MutationObserver(() => {
      readColors();
      if (!running) drawBg(0);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    resize();
    sync();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);

    return () => {
      stop();
      themeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', sync);
      reduce.removeEventListener('change', sync);
    };
  }, [density, ambient]);

  // lớp hiệu ứng bấm là anh em chứ không nằm trong khối nền: khối nền có z-index âm nên con của nó luôn dưới nội dung
  return (
    <>
      <div ref={hostRef} className={`ambient-notes${ambient ? '' : ' ambient-notes--bare'}`} aria-hidden="true">
        <canvas ref={bgRef} className="ambient-notes__bg" />
      </div>
      <canvas ref={fxRef} className="ambient-notes__fx" aria-hidden="true" />
    </>
  );
}
