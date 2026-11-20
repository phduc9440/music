import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';

/*
 * Dây đàn 3D cho cột sân khấu trang đăng nhập (three.js, tải lười): như nhìn vào lòng một cây đàn piano cánh, các dây
 * chạy từ hàng phím ở đáy vào sâu trong bóng tối. Rê chuột (hoặc vuốt) ngang qua dây là gảy: dây rung theo phương trình
 * sóng, sáng màu đồng thau rồi tắt dần, bắn ra vài tia lửa. Bấm vào sân khấu là lướt một hợp âm rải qua mọi dây. Khi
 * không ai động vào, thỉnh thoảng một dây tự rung khẽ.
 * Sân khấu luôn tối nên dùng hoà màu cộng sáng. Màu đọc từ token CSS. Giảm chuyển động: chỉ vẽ dây đứng yên.
 * Không có WebGL thì hiện `fallback`. `strikeRef` nhận một hàm strike(ratio, velocity) để hàng phím đàn bên dưới gõ vào
 * dây ở vị trí ngang `ratio` (0..1), như búa đàn đập lên dây.
 */

const SEG = 120; // số đoạn mỗi dây
const SPARKS = 260;
const FOV = 50;
const CAM_Z = 9;

interface StringState {
  u: Float32Array; // độ lệch ngang
  v: Float32Array; // vận tốc
  c2: number; // "độ căng": dây càng căng sóng chạy càng nhanh, nghe như nốt cao hơn
  damp: number;
  a: THREE.Vector3; // đầu gần (sau hàng phím)
  b: THREE.Vector3; // đầu xa (chìm vào bóng tối)
  side: number; // con trỏ đang ở bên trái (-1) hay phải (1) dây, trên màn hình
}

interface Pluck {
  at: number;
  s: number;
  t: number;
  amp: number;
}

const RIBBON_VERT = /* glsl */ `
  attribute float aSide;
  attribute float aT;
  attribute float aEnergy;
  uniform float uWidth;
  varying float vSide;
  varying float vT;
  varying float vEnergy;
  varying float vDepth;
  void main() {
    vec3 p = position;
    p.x += aSide * uWidth * (1.0 + aEnergy * 2.2);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vSide = aSide;
    vT = aT;
    vEnergy = aEnergy;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uRest;
  uniform vec3 uHot;
  varying float vSide;
  varying float vT;
  varying float vEnergy;
  varying float vDepth;
  void main() {
    float e = clamp(vEnergy, 0.0, 1.0);
    float core = exp(-pow(vSide * 3.4, 2.0));
    float halo = 1.0 - abs(vSide);
    float a = (core * 0.85 + halo * halo * 0.35 * (0.25 + e)) * (0.32 + e * 0.95);
    a *= smoothstep(1.0, 0.72, vT);          // đầu xa tan vào bóng tối
    a *= smoothstep(26.0, 9.0, vDepth);
    vec3 col = mix(uRest, uHot, smoothstep(0.0, 0.6, e));
    gl_FragColor = vec4(col, a);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aLife;
  uniform float uPixelRatio;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife <= 0.0 ? 0.0 : (2.0 + 9.0 * aLife) * uPixelRatio * (8.0 / -mv.z);
  }
`;

const SPARK_FRAG = /* glsl */ `
  uniform vec3 uHot;
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 2.0) * vLife;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uHot, a);
  }
`;

export default function HarpStrings3D({
  className = '',
  fallback,
  strikeRef,
}: {
  className?: string;
  fallback?: ReactNode;
  strikeRef?: MutableRefObject<((ratio: number, velocity: number) => void) | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // kiểm tra WebGL một lần lúc dựng component: không có thì hiện `fallback` thay cho dây đàn
  const [supported] = useState(() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const host = hostRef.current;
    // nghe sự kiện trên khung chứa (cột sân khấu), vì canvas không nhận sự kiện chuột
    const stage = host?.parentElement;
    if (!supported || !host || !stage) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // hiếm: có WebGL nhưng tạo renderer lỗi, sân khấu chỉ thiếu dây đàn
    }
    const canvas = renderer.domElement;
    host.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);

    const cs = getComputedStyle(stage);
    const color = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
    const rest = color('--ui-stage-accent');
    const hot = color('--ui-brass');

    const count = window.innerWidth < 880 ? 9 : 15;
    const strings: StringState[] = Array.from({ length: count }, (_, s) => {
      const k = s / (count - 1);
      return {
        u: new Float32Array(SEG),
        v: new Float32Array(SEG),
        c2: 0.16 + 0.3 * k, // dây bên trái trầm, bên phải cao
        damp: 0.9965 - 0.0015 * k,
        a: new THREE.Vector3(),
        b: new THREE.Vector3(),
        side: 0,
      };
    });

    // ---- hình học: mỗi dây là một dải băng mỏng (2 đỉnh mỗi điểm), gộp hết vào một lần vẽ ----
    const vCount = count * SEG * 2;
    const pos = new Float32Array(vCount * 3);
    const side = new Float32Array(vCount);
    const tAttr = new Float32Array(vCount);
    const energy = new Float32Array(vCount);
    const index: number[] = [];
    for (let s = 0; s < count; s++) {
      for (let i = 0; i < SEG; i++) {
        const base = (s * SEG + i) * 2;
        side[base] = -1;
        side[base + 1] = 1;
        tAttr[base] = tAttr[base + 1] = i / (SEG - 1);
        if (i < SEG - 1) index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const energyAttr = new THREE.BufferAttribute(energy, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aT', new THREE.BufferAttribute(tAttr, 1));
    geo.setAttribute('aEnergy', energyAttr);
    geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uWidth: { value: 0.05 }, uRest: { value: rest }, uHot: { value: hot } },
    });
    const ribbons = new THREE.Mesh(geo, mat);
    ribbons.frustumCulled = false;
    scene.add(ribbons);

    // ---- tia lửa ----
    const sPos = new Float32Array(SPARKS * 3);
    const sVel = new Float32Array(SPARKS * 3);
    const sLife = new Float32Array(SPARKS);
    const sGeo = new THREE.BufferGeometry();
    const sPosAttr = new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage);
    const sLifeAttr = new THREE.BufferAttribute(sLife, 1).setUsage(THREE.DynamicDrawUsage);
    sGeo.setAttribute('position', sPosAttr);
    sGeo.setAttribute('aLife', sLifeAttr);
    const sMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uHot: { value: hot }, uPixelRatio: { value: 1 } },
    });
    const sparks = new THREE.Points(sGeo, sMat);
    sparks.frustumCulled = false;
    scene.add(sparks);
    let sparkIdx = 0;
    const spawnSparks = (at: THREE.Vector3, n: number, power: number) => {
      for (let j = 0; j < n; j++) {
        const i = sparkIdx;
        sparkIdx = (sparkIdx + 1) % SPARKS;
        sPos.set([at.x, at.y, at.z], i * 3);
        const ang = Math.random() * Math.PI * 2;
        const sp = (0.6 + Math.random() * 1.8) * power;
        sVel.set([Math.cos(ang) * sp, Math.abs(Math.sin(ang)) * sp + 0.6, (Math.random() - 0.5) * sp], i * 3);
        sLife[i] = 0.7 + Math.random() * 0.3;
      }
    };

    // ---- bố cục dây theo kích thước khung ----
    const layout = () => {
      const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
      const visW = visH * camera.aspect;
      const near = Math.max(visW * 1.15, 5);
      strings.forEach((st, s) => {
        const k = s / (count - 1) - 0.5;
        st.a.set(k * near, -visH / 2 - 0.6, 1.2); // chui xuống dưới hàng phím
        st.b.set(k * near * 0.42 + 1.2, visH * 0.15, -12); // chạy chéo vào sâu, hơi lệch phải
      });
    };

    const resize = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      sMat.uniforms.uPixelRatio.value = dpr;
      layout();
      writeGeometry();
      renderer.render(scene, camera);
    };

    // ---- ghi vị trí dây (điểm nghỉ + độ lệch) vào hình học ----
    const tmp = new THREE.Vector3();
    const writeGeometry = () => {
      for (let s = 0; s < count; s++) {
        const st = strings[s];
        for (let i = 0; i < SEG; i++) {
          tmp.lerpVectors(st.a, st.b, i / (SEG - 1));
          tmp.x += st.u[i];
          const base = (s * SEG + i) * 2;
          pos.set([tmp.x, tmp.y, tmp.z, tmp.x, tmp.y, tmp.z], base * 3);
          const e = Math.min(1, Math.abs(st.u[i]) * 2.6 + Math.abs(st.v[i]) * 9);
          energy[base] = energy[base + 1] = e;
        }
      }
      posAttr.needsUpdate = true;
      energyAttr.needsUpdate = true;
    };

    // ---- gảy dây: một chỗ gập hình tam giác (đúng như ngón tay kéo dây rồi thả) ----
    const pluck = (s: number, t: number, amp: number) => {
      const st = strings[s];
      const c = Math.min(SEG - 12, Math.max(11, Math.round(t * (SEG - 1))));
      const width = 14;
      for (let i = 1; i < SEG - 1; i++) {
        const f = 1 - Math.abs(i - c) / width;
        if (f > 0) st.u[i] += amp * f;
      }
      tmp.lerpVectors(st.a, st.b, c / (SEG - 1));
      spawnSparks(tmp, 5 + Math.round(Math.abs(amp) * 18), 0.6 + Math.abs(amp) * 2);
    };

    // ---- con trỏ: tìm dây vừa bị vạch qua trên màn hình ----
    const mouse = new THREE.Vector2(9, 9);
    const prevMouse = new THREE.Vector2(9, 9);
    let hasPointer = false;
    let lastInput = performance.now();
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    /** Vị trí trên màn hình của dây s ở độ cao chuột: trả về [x NDC, t thật dọc dây] hoặc null nếu chuột ngoài dây. */
    const crossAt = (st: StringState, my: number): [number, number] | null => {
      pa.copy(st.a).project(camera);
      pb.copy(st.b).project(camera);
      const span = pb.y - pa.y;
      if (Math.abs(span) < 1e-5) return null;
      const tt = (my - pa.y) / span;
      if (tt < 0.02 || tt > 0.9) return null;
      // tham số trên màn hình khác tham số thật vì phối cảnh: đổi lại qua độ sâu w của hai đầu
      const wa = CAM_Z - st.a.z;
      const wb = CAM_Z - st.b.z;
      const t = (tt * wa) / (tt * wa + (1 - tt) * wb);
      return [pa.x + (pb.x - pa.x) * tt, t];
    };

    const toNdc = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const detect = () => {
      if (!hasPointer) return;
      const speed = mouse.distanceTo(prevMouse);
      for (let s = 0; s < count; s++) {
        const st = strings[s];
        const hit = crossAt(st, mouse.y);
        if (!hit) {
          st.side = 0;
          continue;
        }
        const now = Math.sign(mouse.x - hit[0]) || 1;
        if (st.side !== 0 && now !== st.side) {
          pluck(s, hit[1], now * Math.min(0.55, 0.12 + speed * 4));
        }
        st.side = now;
      }
      prevMouse.copy(mouse);
    };
    const onPiano = (e: PointerEvent) => !!(e.target as Element | null)?.closest('.piano');
    const onMove = (e: PointerEvent) => {
      // trên hàng phím thì người dùng đang chơi đàn: phím tự gõ vào dây, chuột không gảy thêm
      if (onPiano(e)) {
        for (const st of strings) st.side = 0;
        return;
      }
      toNdc(e);
      if (!hasPointer) prevMouse.copy(mouse);
      hasPointer = true;
      lastInput = performance.now();
      if (running) detect();
    };
    const onLeave = () => {
      hasPointer = false;
      for (const st of strings) st.side = 0;
    };

    // bấm: lướt hợp âm rải qua mọi dây, bắt đầu từ dây gần chuột nhất
    const queue: Pluck[] = [];
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('a, button, input, .piano')) return;
      toNdc(e);
      lastInput = performance.now();
      const order = strings
        .map((st, s) => ({ s, hit: crossAt(st, mouse.y) }))
        .filter((o): o is { s: number; hit: [number, number] } => o.hit !== null)
        .sort((x, y) => Math.abs(x.hit[0] - mouse.x) - Math.abs(y.hit[0] - mouse.x));
      const now = performance.now();
      order.forEach((o, i) => queue.push({ at: now + i * 45, s: o.s, t: o.hit[1], amp: 0.32 }));
    };

    // ---- vòng vẽ ----
    // thời gian giữa hai khung (giây); THREE.Clock đã bị bỏ nên tự đo bằng performance.now()
    let prevTick = performance.now();
    const tick = () => {
      const n = performance.now();
      const d = (n - prevTick) / 1000;
      prevTick = n;
      return d;
    };
    let raf = 0;
    let running = false;
    let visible = true;
    let nextGhost = performance.now() + 1500;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(tick(), 0.05);
      const now = performance.now();

      for (let q = queue.length - 1; q >= 0; q--) {
        if (queue[q].at <= now) {
          pluck(queue[q].s, queue[q].t, queue[q].amp);
          queue.splice(q, 1);
        }
      }
      // không ai động vào: thỉnh thoảng một dây tự rung khẽ cho sân khấu có hơi thở
      if (now - lastInput > 3000 && now > nextGhost) {
        pluck(Math.floor(Math.random() * count), 0.15 + Math.random() * 0.35, (Math.random() < 0.5 ? -1 : 1) * 0.16);
        nextGhost = now + 2200 + Math.random() * 2600;
      }

      // phương trình sóng trên dây, hai đầu cố định; hai bước con mỗi khung cho ổn định
      for (let step = 0; step < 2; step++) {
        for (const st of strings) {
          const { u, v, c2, damp } = st;
          for (let i = 1; i < SEG - 1; i++) v[i] = (v[i] + c2 * (u[i - 1] - 2 * u[i] + u[i + 1])) * damp;
          for (let i = 1; i < SEG - 1; i++) u[i] += v[i];
        }
      }
      writeGeometry();

      // tia lửa bay lên rồi tắt
      for (let i = 0; i < SPARKS; i++) {
        if (sLife[i] <= 0) continue;
        sVel[i * 3 + 1] -= 1.4 * dt;
        sPos[i * 3] += sVel[i * 3] * dt;
        sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
        sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
        sLife[i] = Math.max(0, sLife[i] - dt * 0.9);
      }
      sPosAttr.needsUpdate = true;
      sLifeAttr.needsUpdate = true;

      // máy quay lệch nhẹ theo chuột
      const k = 1 - Math.pow(0.05, dt);
      const tx = hasPointer ? mouse.x * 0.6 : 0;
      const ty = hasPointer ? mouse.y * 0.35 : 0;
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (ty - camera.position.y) * k;
      camera.lookAt(0, 0.5, -3);

      renderer.render(scene, camera);
    };

    const start = () => {
      if (running || motion.matches || document.hidden || !visible) return;
      running = true;
      tick();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => (motion.matches || document.hidden || !visible ? stop() : start());

    // búa đàn: phím ở vị trí ngang ratio gõ vào dây gần nhất, sát hàng phím (dây trải rộng 1,15 lần khung)
    if (strikeRef) {
      strikeRef.current = (ratio, velocity) => {
        const s = Math.round(Math.min(1, Math.max(0, (ratio - 0.5) / 1.15 + 0.5)) * (count - 1));
        lastInput = performance.now();
        if (motion.matches) return;
        pluck(s, 0.2 + Math.random() * 0.06, (Math.random() < 0.5 ? -1 : 1) * (0.18 + velocity * 0.32));
      };
    }

    camera.lookAt(0, 0.5, -3);
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();
    start();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(stage);

    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerdown', onDown, { passive: true });
    stage.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);

    return () => {
      stop();
      if (strikeRef) strikeRef.current = null;
      ro.disconnect();
      io.disconnect();
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      geo.dispose();
      mat.dispose();
      sGeo.dispose();
      sMat.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [supported, strikeRef]);

  if (!supported) return <>{fallback}</>;
  return <div ref={hostRef} className={`harp3d ${className}`} aria-hidden="true" />;
}
