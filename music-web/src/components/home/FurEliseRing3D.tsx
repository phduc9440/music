import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Icon } from '../ui';
import { t } from '../../i18n/core';
import { playPianoNote } from '../../utils/pianoSynth';
import { glyphSize, makeGlyph } from './musicGlyphs';
import type { Glyph } from './musicGlyphs';

/*
 * Vòng khuông "hộp nhạc" làm nền trang chủ khách (three.js, tải lười): một dải khuông 5 dòng cuộn thành vòng tròn như
 * trống của hộp nhạc, quây quanh phần đầu trang, in sẵn giai điệu thật của Für Elise (Beethoven, 1810, phạm vi công
 * cộng). Mỗi lần bấm vào khoảng trống trên trang (hoặc nút gợi ý ở góc, dùng được bằng bàn phím) là chơi nốt kế tiếp
 * của bài bằng tiếng piano, đầu ô nhịp có thêm hợp âm tay trái rải nhẹ. Vòng quay đưa nốt kế tiếp ra giữa, chỗ có
 * "đèn đọc" rọi sáng; nốt vừa chơi bừng sáng, toả tia lên, và một vệt sáng chạy vòng quanh khuông. Hết bài thì quay lại
 * từ đầu. Bấm nút, liên kết, chữ hay thẻ nội dung thì không kêu. Chạm để cuộn trên điện thoại không tính là bấm.
 * Màu đọc từ token CSS, đổi theo theme. Giảm chuyển động: vòng đứng yên và chỉ vẽ lại khi bấm (vẫn có tiếng).
 */

/* ---------------- bản nhạc ---------------- */

// Mỗi chuỗi là một ô nhịp (3/8) của bè tay phải; "A4:A2.E3.A3" = nốt A4 kèm hợp âm tay trái A2 E3 A3.
const PHRASE = [
  'E5 D#5 E5 B4 D5 C5',
  'A4:A2.E3.A3 C4 E4 A4',
  'B4:E2.E3.G#3 E4 G#4 B4',
  'C5:A2.E3.A3 E4 E5 D#5',
  'E5 D#5 E5 B4 D5 C5',
  'A4:A2.E3.A3 C4 E4 A4',
  'B4:E2.E3.G#3 E4 C5 B4',
];
const SCORE: { bars: string; pickup?: boolean }[] = [
  { bars: 'E5 D#5', pickup: true },
  ...PHRASE.map((bars) => ({ bars })),
  { bars: 'A4:A2.E3.A3 E5 D#5' }, // khung 1: quay lại đầu
  ...PHRASE.map((bars) => ({ bars })),
  { bars: 'A4:A2.E3.A3 B4 C5 D5' }, // khung 2: sang đoạn giữa
  { bars: 'E5:C3.G3.C4 G4 F5 E5' },
  { bars: 'D5:G2.G3.B3 F4 E5 D5' },
  { bars: 'C5:A2.E3.A3 E4 D5 C5' },
  { bars: 'B4:E2.E3.E4 E4 E5 E4 E5 D#5' },
  { bars: 'E5 D#5' },
  ...PHRASE.map((bars) => ({ bars })),
  { bars: 'A4:A2.E3.A3' },
];

const LETTERS = 'CDEFGAB';
const SEMIS = [0, 2, 4, 5, 7, 9, 11];
const parsePitch = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name)!;
  const li = LETTERS.indexOf(m[1]);
  const oct = Number(m[3]);
  return {
    midi: 12 * (oct + 1) + SEMIS[li] + (m[2] ? 1 : 0),
    step: oct * 7 + li - (4 * 7 + 2), // 0 = dòng 1 khoá Sol (Mi4)
    sharp: !!m[2],
  };
};

interface Note {
  midi: number;
  step: number;
  sharp: boolean;
  bass: number[];
  barStart: boolean; // có vạch nhịp ngay trước nốt này
  glyph: number; // chỉ số ảnh nốt trong GLYPH_SET
}

// ảnh nốt: [loại, dòng kẻ phụ, dấu thăng]; nốt đầu ô nhịp (có bè trầm) là nốt đen, còn lại móc đơn
const GLYPH_SET: [Glyph, boolean, boolean][] = [
  [0, false, false],
  [0, false, true],
  [0, true, false],
  [1, false, false],
  [1, false, true],
  [1, true, false],
];

const NOTES: Note[] = SCORE.flatMap(({ bars, pickup }) =>
  bars.split(' ').map((tok, i) => {
    const [mel, bass] = tok.split(':');
    const p = parsePitch(mel);
    const kind: Glyph = bass ? 1 : 0;
    const ledger = p.step <= -2;
    return {
      ...p,
      bass: bass ? bass.split('.').map((b) => parsePitch(b).midi) : [],
      barStart: i === 0 && !pickup,
      glyph: GLYPH_SET.findIndex(([k, l, s]) => k === kind && l === ledger && s === p.sharp),
    };
  }),
);
const N = NOTES.length;

/** Chơi nốt thứ i: giai điệu, cộng hợp âm tay trái rải nhanh (nếu có). Trả về các hẹn giờ để huỷ khi rời trang. */
function soundNote(i: number) {
  const note = NOTES[i];
  playPianoNote(note.midi, 0.75);
  return note.bass.map((m, k) => window.setTimeout(() => playPianoNote(m, 0.38), k * 85));
}

/* ---------------- hình học ---------------- */

const FOV = 45;
const CAM = new THREE.Vector3(0, 4.9, 16);
const LOOK = new THREE.Vector3(0, -4.5, 0);
const R = 8; // bán kính vòng khuông
const GAP = 0.2;
const PAD = GAP * 0.9;
const STAFF_H = GAP * 4 + PAD * 2;
const STEP_A = (Math.PI * 2) / N; // góc giữa hai nốt
const [NOTE_W, NOTE_H] = glyphSize(GAP);
const SPARKS = 180;
const SPARKS_PER_HIT = 14;

const f = (n: number) => n.toFixed(4);

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const RING_FRAG = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uLit;
  uniform vec3 uCenter;
  uniform float uFocus;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uHit;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  void main() {
    float s = (vUv.y * ${f(STAFF_H)} - ${f(PAD)}) / ${f(GAP)};
    float k = clamp(floor(s + 0.5), 0.0, 4.0);
    float d = abs(s - k) * ${f(GAP)};
    float line = 1.0 - smoothstep(0.01, 0.01 + fwidth(s) * ${f(GAP)} * 1.2, d);

    // mặt sau của vòng (nhìn xuyên qua) mờ hơn mặt trước
    float facing = dot(normalize(vNormalW), normalize(cameraPosition - vWorld));
    float side = mix(0.3, 1.0, smoothstep(-0.15, 0.25, facing));

    // "đèn đọc" rọi ở chính giữa phía trước, và vệt sáng chạy vòng quanh sau mỗi lần bấm
    // góc so với điểm đọc, quy về -pi..pi
    float ang = atan(vWorld.x - uCenter.x, vWorld.z - uCenter.z) - uFocus;
    ang = abs(mod(ang + 3.14159265, 6.2831853) - 3.14159265);
    float spot = exp(-ang * ang * 9.0);
    float age = uTime - uHit;
    float r = ang - age * 1.8;
    float ripple = age > 0.0 ? exp(-r * r * 40.0) * exp(-age * 1.1) : 0.0;
    float glow = clamp(spot * 0.6 + ripple, 0.0, 1.0);

    vec3 col = mix(uInk, uLit, glow);
    gl_FragColor = vec4(col, line * side * uOpacity * (0.45 + glow * 0.55));
    #include <colorspace_fragment>
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute float aBorn;
  uniform float uTime;
  uniform float uPx;
  varying float vLife;
  void main() {
    float age = uTime - aBorn;
    vLife = age > 0.0 && age < 1.6 ? 1.0 - age / 1.6 : 0.0;
    vec3 p = aOrigin + aVel * age + vec3(0.0, 0.6, 0.0) * age * age;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = vLife * uPx / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAG = /* glsl */ `
  uniform vec3 uLit;
  uniform float uOpacity;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vLife * uOpacity;
    gl_FragColor = vec4(uLit, a);
    #include <colorspace_fragment>
  }
`;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const c = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
  const dark = document.documentElement.dataset.theme === 'dark';
  return { ink: c('--ui-primary'), lit: dark ? c('--ui-cta') : c('--ui-hue-rose'), bg: c('--ui-bg'), dark };
}

// bấm vào đây thì không chơi nốt: phần tử tương tác, chữ, thẻ nội dung
const NO_PLAY = [
  'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],[tabindex],[contenteditable="true"]',
  'h1,h2,h3,p,li,dt,dd,figure',
  '.gh-bar,.gh-score,.gh-composer,.gh-strip-wrap,.gh-faq,.gh-features,.gh-stats',
].join(',');

export default function FurEliseRing3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<() => void>(() => {});
  const [played, setPlayed] = useState(0); // số nốt đã chơi trong lượt hiện tại
  const [hidden, setHidden] = useState(false); // nút gợi ý ẩn khi đã cuộn qua phần đầu trang

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const timers: number[] = [];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      // không có WebGL: nút gợi ý vẫn chơi nhạc được, chỉ thiếu hình
      let n = 0;
      playRef.current = () => {
        timers.push(...soundNote(n % N));
        n++;
        setPlayed(n % N);
      };
      return () => {
        playRef.current = () => {};
        timers.forEach((id) => clearTimeout(id));
      };
    }
    const canvas = renderer.domElement;
    host.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    camera.position.copy(CAM);
    camera.lookAt(LOOK);

    const ring = new THREE.Group();
    scene.add(ring);

    const colors = { ink: new THREE.Color(), lit: new THREE.Color(), fadeTo: new THREE.Color() };
    const uTime = { value: 0 };
    const uOpacity = { value: 1 };
    const uInk = { value: colors.ink };
    const uLit = { value: colors.lit };
    const disposables: { dispose: () => void }[] = [];

    // ---- dải khuông cuộn tròn ----
    const ringGeo = new THREE.CylinderGeometry(R, R, STAFF_H, 320, 1, true);
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uInk, uLit, uOpacity, uTime, uHit: { value: -99 }, uCenter: { value: new THREE.Vector3() }, uFocus: { value: 0 } },
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 0;
    ring.add(ringMesh);
    disposables.push(ringGeo, ringMat);

    // ---- vạch nhịp ----
    const bars = NOTES.map((n, i) => (n.barStart ? i : -1)).filter((i) => i >= 0);
    const barGeo = new THREE.PlaneGeometry(0.016, GAP * 4);
    const barMat = new THREE.MeshBasicMaterial({
      color: colors.ink,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const barMesh = new THREE.InstancedMesh(barGeo, barMat, bars.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    bars.forEach((i, k) => {
      const a = (i - 0.5) * STEP_A;
      v3.set(Math.sin(a) * (R + 0.005), 0, Math.cos(a) * (R + 0.005));
      barMesh.setMatrixAt(k, m4.compose(v3, q.setFromAxisAngle(yAxis, a), s3.set(1, 1, 1)));
    });
    barMesh.renderOrder = 1;
    barMesh.frustumCulled = false;
    ring.add(barMesh);
    disposables.push(barGeo, barMat, barMesh);

    // ---- nốt nhạc: mỗi loại ảnh một InstancedMesh, nằm áp trên mặt vòng ----
    const noteGeo = new THREE.PlaneGeometry(NOTE_W, NOTE_H);
    disposables.push(noteGeo);
    const noteMats: THREE.MeshBasicMaterial[] = [];
    const noteMeshes = GLYPH_SET.map(([kind, ledger, sharp]) => {
      const map = makeGlyph(kind, { ledger, sharp });
      const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(noteGeo, mat, N);
      mesh.setColorAt(0, new THREE.Color());
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      ring.add(mesh);
      noteMats.push(mat);
      disposables.push(map, mat, mesh);
      return mesh;
    });

    // ---- tia sáng toả ra từ nốt vừa chơi ----
    const sparkGeo = new THREE.BufferGeometry();
    const origin = new Float32Array(SPARKS * 3);
    const vel = new Float32Array(SPARKS * 3);
    const born = new Float32Array(SPARKS).fill(-99);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeo.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 3));
    sparkGeo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    sparkGeo.setAttribute('aBorn', new THREE.BufferAttribute(born, 1));
    const uPx = { value: 60 };
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime, uLit, uOpacity, uPx },
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = 3;
    scene.add(sparks);
    disposables.push(sparkGeo, sparkMat);
    let sparkIdx = 0;

    const blended: THREE.Material[] = [ringMat, barMat, ...noteMats, sparkMat];
    let baseOpacity = 1;
    const applyColors = () => {
      const c = readColors();
      colors.ink.copy(c.ink);
      colors.lit.copy(c.lit);
      colors.fadeTo.copy(c.dark ? new THREE.Color(0, 0, 0) : c.bg);
      barMat.color.copy(c.ink);
      baseOpacity = c.dark ? 0.75 : 0.6;
      for (const m of blended) {
        m.blending = c.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    };

    // ---- trạng thái chơi ----
    let count = 0; // tổng số lần bấm (không quay vòng) để góc quay luôn đi một chiều
    // điểm đọc (chỗ nốt sắp chơi dừng lại): phía trước lệch trái, chỗ trống bên cạnh chữ và nút đầu trang; màn dọc
    // thì gần giữa hơn cho khỏi lọt ra ngoài khung
    let focus = -0.55;
    let spin = focus; // góc quay hiện tại của vòng
    const hitAt = new Float32Array(N).fill(-99); // lúc mỗi nốt được chơi gần nhất
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const playNext = () => {
      const i = count % N;
      timers.push(...soundNote(i));
      if (timers.length > 64) timers.splice(0, timers.length - 64);
      const now = uTime.value;
      hitAt[i] = now;
      ringMat.uniforms.uHit.value = now;

      // tia sáng bắn ra từ chỗ nốt đang nằm (chính giữa phía trước)
      const p = parsePos(i);
      for (let k = 0; k < SPARKS_PER_HIT; k++) {
        const j = sparkIdx;
        sparkIdx = (sparkIdx + 1) % SPARKS;
        origin.set([p.x, p.y, p.z], j * 3);
        const a = Math.random() * Math.PI * 2;
        const sp = 0.4 + Math.random() * 0.9;
        vel.set([Math.cos(a) * sp, 0.6 + Math.random() * 1.1, Math.sin(a) * sp * 0.5], j * 3);
        born[j] = now + Math.random() * 0.05;
      }
      for (const name of ['aOrigin', 'aVel', 'aBorn']) sparkGeo.getAttribute(name).needsUpdate = true;

      count++;
      if (count % N === 0) hitAt.fill(-99); // hết bài: các nốt về lại trạng thái chưa chơi
      setPlayed(count % N);
      if (!running) {
        spin = focus - count * STEP_A;
        draw();
      }
    };
    playRef.current = playNext;

    // vị trí thế giới hiện tại của nốt i
    const parsePos = (i: number) => {
      const a = i * STEP_A;
      const y = -2 * GAP + (NOTES[i].step * GAP) / 2;
      return ring.localToWorld(new THREE.Vector3(Math.sin(a) * R, y, Math.cos(a) * R));
    };

    const col = new THREE.Color();
    const counts = new Array(GLYPH_SET.length).fill(0);
    const updateNotes = () => {
      const now = uTime.value;
      const cur = count % N;
      counts.fill(0);
      for (let i = 0; i < N; i++) {
        const n = NOTES[i];
        const mesh = noteMeshes[n.glyph];
        const k = counts[n.glyph]++;
        const a = i * STEP_A;
        const y = -2 * GAP + (n.step * GAP) / 2;
        const age = now - hitAt[i];
        const hit = age >= 0 && age < 2 ? Math.exp(-age * 3.5) : 0;
        // nốt sắp chơi "thở" nhẹ để mời bấm
        const next = i === cur ? 0.18 + Math.sin(now * 4) * 0.1 : 0;
        const pop = 1 + hit * 0.55 + next;
        v3.set(Math.sin(a) * (R + 0.01), y, Math.cos(a) * (R + 0.01));
        s3.set(pop, n.step >= 4 ? -pop : pop, 1); // từ dòng 3 trở lên đuôi quay xuống
        // đầu nốt bám đúng dòng kẻ, nhưng mặt nốt xoay phần lớn về phía người xem để khỏi dẹp lại ở hai bên vòng
        const wa = a + spin; // góc thế giới: 0 là chính diện máy quay
        mesh.setMatrixAt(k, m4.compose(v3, q.setFromAxisAngle(yAxis, a - wa * 0.7), s3));

        // đã chơi: màu mực; sắp chơi: màu nhấn; chưa chơi: nhạt; mặt sau vòng mờ thêm
        // ở hai mép trái/phải vòng nhìn từ cạnh nên nốt dồn sát nhau: mờ bớt để không chồng thành mảng chói
        const crowd = 1 - 0.65 * Math.abs(Math.sin(wa)) ** 6;
        const front = (0.35 + 0.65 * Math.min(1, Math.max(0, (Math.cos(wa) + 0.15) / 0.4))) * crowd;
        const done = hitAt[i] > -99;
        col.copy(colors.ink).lerp(colors.lit, Math.min(1, hit + (i === cur ? 0.8 : 0)));
        col.lerp(colors.fadeTo, 1 - front * (done || i === cur ? 1 : 0.55));
        mesh.setColorAt(k, col);
      }
      noteMeshes.forEach((mesh, g) => {
        mesh.count = counts[g];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    };

    // ---- cuộn trang: vòng trôi lên và nhạt bớt ----
    let scrollTarget = window.scrollY;
    let scrollY = scrollTarget;
    const onScroll = () => {
      scrollTarget = window.scrollY;
      setHidden(scrollTarget > 520);
    };
    onScroll();

    const draw = () => {
      ring.rotation.y = spin;
      ring.position.y = scrollY * 0.006;
      ring.updateMatrixWorld();
      ringMat.uniforms.uCenter.value.setFromMatrixPosition(ring.matrixWorld);
      uOpacity.value = baseOpacity * (1 - Math.min(1, scrollY / 700) * 0.6);
      for (const m of noteMats) m.opacity = uOpacity.value;
      barMat.opacity = uOpacity.value * 0.7;
      updateNotes();
      renderer.render(scene, camera);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const nextFocus = camera.aspect < 1 ? -0.2 : -0.55;
      spin += nextFocus - focus;
      focus = nextFocus;
      ringMat.uniforms.uFocus.value = focus;
      // màn dọc (điện thoại): lùi máy quay để vòng không quá to
      camera.position.copy(CAM).multiplyScalar(camera.aspect < 1 ? 1.25 : 1);
      camera.lookAt(LOOK);
      camera.updateProjectionMatrix();
      uPx.value = h * dpr * 0.1;
      draw();
    };

    // ---- con trỏ: máy quay nghiêng nhẹ theo (thị sai) ----
    const pointer = new THREE.Vector2();
    let lastMove = -1e9;
    const onMove = (e: PointerEvent) => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      lastMove = performance.now();
    };
    // "click" thay cho pointerdown: chạm để cuộn trên điện thoại không phát ra tiếng
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.(NO_PLAY)) return;
      if (window.getSelection()?.toString()) return;
      playNext();
    };

    // ---- vòng vẽ ----
    let prev = performance.now();
    let raf = 0;
    let running = false;
    let visible = true;
    const camBase = new THREE.Vector3();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const n = performance.now();
      const dt = Math.min((n - prev) / 1000, 0.05);
      prev = n;
      uTime.value += dt;
      // vòng quay mượt tới nốt kế tiếp, cộng một nhịp đung đưa rất nhẹ khi đứng chờ
      const target = focus - count * STEP_A + Math.sin(uTime.value * 0.35) * STEP_A * 0.35;
      spin += (target - spin) * (1 - Math.pow(0.0005, dt));
      scrollY += (scrollTarget - scrollY) * (1 - Math.pow(0.02, dt));

      const want = n - lastMove < 3000 ? 1 : 0;
      camBase.copy(CAM).multiplyScalar(camera.aspect < 1 ? 1.25 : 1);
      const k = 1 - Math.pow(0.06, dt);
      camera.position.x += (camBase.x + pointer.x * want * 1.2 - camera.position.x) * k;
      camera.position.y += (camBase.y + pointer.y * want * 0.6 - camera.position.y) * k;
      camera.lookAt(LOOK);
      draw();
    };
    const start = () => {
      if (running || motion.matches || document.hidden || !visible) return;
      running = true;
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (motion.matches || document.hidden || !visible) {
        stop();
        spin = focus - count * STEP_A;
        scrollY = scrollTarget;
        draw();
      } else start();
    };

    const themeObserver = new MutationObserver(() => {
      applyColors();
      if (!running) draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    applyColors();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    start();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(host);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);

    return () => {
      stop();
      playRef.current = () => {};
      timers.forEach((id) => clearTimeout(id));
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <>
      <div ref={hostRef} className="gh-ring" aria-hidden="true" />
      <button
        type="button"
        className={`gh-melody${hidden ? ' is-hidden' : ''}`}
        tabIndex={hidden ? -1 : 0}
        aria-label={t('home.guest.melody.play', { n: played + 1, total: N })}
        onClick={() => playRef.current()}
      >
        <span className="gh-melody__icon" aria-hidden="true">
          <Icon name="music" size={16} />
        </span>
        <span className="gh-melody__text">
          <strong>{t('home.guest.melody.title')}</strong>
          <small>
            {t('home.guest.melody.hint')} · {t('home.guest.melody.progress', { n: played, total: N })}
          </small>
        </span>
      </button>
    </>
  );
}
