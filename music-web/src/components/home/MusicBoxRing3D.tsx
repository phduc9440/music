import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Icon } from '../ui';
import { t } from '../../i18n/core';
import { playPianoNote } from '../../utils/pianoSynth';
import { glyphSize, makeBeamedGlyph, makeGlyph } from './musicGlyphs';
import type { Glyph } from './musicGlyphs';
import { SONGS } from './songs';
import type { Song } from './songs';

/*
 * Vòng khuông "hộp nhạc" làm nền trang chủ khách (three.js, tải lười): một dải khuông 5 dòng cuộn thành vòng tròn như
 * trống của hộp nhạc, quây quanh phần đầu trang, in sẵn giai điệu của bài đang chọn (các bài phạm vi công cộng trong
 * songs.ts). Mỗi lần bấm vào khoảng trống trên trang (hoặc nút nốt nhạc ở góc, dùng được bằng bàn phím) là chơi nốt kế
 * tiếp bằng tiếng piano kèm hợp âm đệm; nút Tự chạy chơi cả bài đúng tiết tấu và lặp lại khi hết bài. Vòng quay đưa nốt
 * kế tiếp ra "điểm đọc" được rọi sáng; nốt vừa chơi bừng sáng, toả tia lên, và một vệt sáng chạy vòng quanh khuông.
 * Bấm vào nền còn có vòng sóng loang ra, chùm nốt nhỏ bắn ra, và các nốt bay xung quanh bị luồng sóng đẩy dạt ra.
 * Quanh vòng là một không gian nốt nhạc lơ lửng, bụi sáng và đốm bokeh trôi theo cuộn trang (thị sai).
 * Bấm nút, liên kết, chữ hay thẻ nội dung thì không kêu. Chạm để cuộn trên điện thoại không tính là bấm.
 * Màu đọc từ token CSS, đổi theo theme. Giảm chuyển động: vòng đứng yên và chỉ vẽ lại khi bấm (vẫn có tiếng).
 */

/* ---------------- hình học ---------------- */

const FOV = 45;
const CAM = new THREE.Vector3(0, 4.9, 16);
const LOOK = new THREE.Vector3(0, -4.5, 0);
const R = 8; // bán kính vòng khuông
const GAP = 0.2;
const PAD = GAP * 0.9;
const STAFF_H = GAP * 4 + PAD * 2;
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

/* ---------------- không gian trang trí quanh vòng ---------------- */

// cả không gian trôi lên chậm và theo cuộn trang (thị sai); vượt khỏi khoảng FIELD_RANGE thì quay vòng xuống dưới
const FIELD_RANGE = 24;
const FIELD_CENTER_Y = -3.5;
const FIELD_SCROLL = 0.011; // đơn vị thế giới mỗi px cuộn
const [FLOAT_W, FLOAT_H] = glyphSize(0.3);

const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uScroll;
  uniform float uSpeed;
  uniform float uPx;
  varying float vSeed;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    float r = ${f(FIELD_RANGE)};
    p.y = mod(p.y + uTime * uSpeed * (0.4 + aSeed) + uScroll, r) - r * 0.5 + ${f(FIELD_CENTER_Y)};
    p.x += sin(uTime * 0.25 + aSeed * 40.0) * 0.5;
    vSeed = aSeed;
    vTwinkle = 0.45 + 0.55 * sin(uTime * (1.0 + aSeed * 2.5) + aSeed * 60.0);
    // mờ dần ở hai đầu khoảng quay vòng để không thấy hạt bật ra / biến mất
    float yr = p.y - ${f(FIELD_CENTER_Y)};
    vTwinkle *= smoothstep(r * 0.5, r * 0.5 - 2.0, abs(yr));
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPx / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uOpacity;
  uniform float uSoft; // 0: hạt bụi nhỏ có lõi sáng; 1: đốm bokeh to, mềm hoàn toàn
  varying float vSeed;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(1.0, 0.0, d);
    float a = mix(core * core * (0.6 + 0.4 * smoothstep(0.35, 0.0, d)), exp(-d * d * 3.0) * 0.9, uSoft);
    gl_FragColor = vec4(mix(uColA, uColB, vSeed), a * vTwinkle * uOpacity);
    #include <colorspace_fragment>
  }
`;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const c = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    ink: c('--ui-primary'),
    lit: dark ? c('--ui-cta') : c('--ui-hue-rose'),
    brass: c('--ui-cta'),
    bg: c('--ui-bg'),
    dark,
  };
}

// bấm vào đây thì không chơi nốt: phần tử tương tác, chữ, thẻ nội dung
const NO_PLAY = [
  'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],[tabindex],[contenteditable="true"]',
  'h1,h2,h3,p,li,dt,dd', // bảng nốt nhạc dưới đầu trang (figure) vẫn tính là nền: bấm vào đó cũng chơi nốt
  '.gh-bar,.gh-score,.gh-composer,.gh-strip-wrap,.gh-faq,.gh-features,.gh-stats,.gh-melody',
].join(',');

const BURSTS = 40; // nốt nhỏ bắn ra khi bấm
const BURST_LIFE = 1.5;
const RIPPLES = 6;
const RIPPLE_LIFE = 1.1;
const PUSH_R = 4.5; // bán kính luồng sóng đẩy nốt bay khi bấm

/** Phát nốt thứ i của bài: giai điệu và hợp âm đệm. Bấm tay thì rải nhanh; tự chạy thì rải theo nhịp của bài. */
function soundNote(song: Song, i: number, auto: boolean) {
  const note = song.notes[i];
  playPianoNote(note.midi, 0.75);
  const gap = auto ? song.arpMs : Math.min(85, song.arpMs);
  return note.bass.map((m, k) => window.setTimeout(() => playPianoNote(m, 0.38), k * gap));
}

const songTitle = (s: Song) => t(`home.guest.melody.songs.${s.id}.title`);
const songBy = (s: Song) => t(`home.guest.melody.songs.${s.id}.by`);

export default function MusicBoxRing3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<() => void>(() => {});
  const autoRef = useRef<() => void>(() => {});
  const selectRef = useRef<(i: number) => void>(() => {});
  const [songIdx, setSongIdx] = useState(0);
  const [played, setPlayed] = useState(0); // số nốt đã chơi trong lượt hiện tại
  const [auto, setAuto] = useState(false); // đang tự chạy
  const song = SONGS[songIdx];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const timers: number[] = [];
    const remember = (ids: number[]) => {
      timers.push(...ids);
      if (timers.length > 64) timers.splice(0, timers.length - 64);
    };

    // ---- bài đang chơi và nốt kế tiếp; có WebGL thì các hàm này được thay bằng bản có hình bên dưới ----
    let current = SONGS[0];
    let count = 0; // tổng số nốt đã chơi của bài này (không quay vòng) để vòng luôn quay một chiều
    let advance = (isAuto: boolean) => {
      const i = count % current.notes.length;
      remember(soundNote(current, i, isAuto));
      count++;
      setPlayed(count % current.notes.length);
      return i;
    };
    let loadSong = (idx: number) => {
      current = SONGS[idx];
      count = 0;
      setPlayed(0);
    };

    // ---- tự chạy: mỗi nốt hẹn nốt sau theo trường độ; hết bài nghỉ một nhịp rồi chơi lại từ đầu ----
    let autoOn = false;
    let autoTimer = 0;
    const stopAuto = () => {
      autoOn = false;
      clearTimeout(autoTimer);
      setAuto(false);
    };
    const autoStep = () => {
      if (!autoOn) return;
      const i = advance(true);
      const last = i === current.notes.length - 1;
      const wait = current.notes[i].dur * current.unitMs + (last ? current.unitMs * 6 : 0);
      autoTimer = window.setTimeout(autoStep, wait);
    };
    autoRef.current = () => {
      if (autoOn) {
        stopAuto();
        return;
      }
      autoOn = true;
      setAuto(true);
      autoStep();
    };
    playRef.current = () => {
      if (!autoOn) advance(false);
    };
    selectRef.current = (idx: number) => {
      clearTimeout(autoTimer);
      loadSong(idx);
      setSongIdx(idx);
      if (autoOn) autoTimer = window.setTimeout(autoStep, 700); // đang tự chạy thì sang bài mới chơi luôn
    };
    // chuyển tab thì dừng tự chạy (trình duyệt hãm hẹn giờ ở tab ẩn, nhạc sẽ bị giật)
    const onHidden = () => {
      if (document.hidden && autoOn) stopAuto();
    };
    document.addEventListener('visibilitychange', onHidden);
    const cleanupSound = () => {
      autoOn = false;
      clearTimeout(autoTimer);
      timers.forEach((id) => clearTimeout(id));
      playRef.current = () => {};
      autoRef.current = () => {};
      selectRef.current = () => {};
      document.removeEventListener('visibilitychange', onHidden);
    };

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return cleanupSound; // không có WebGL: các nút vẫn chơi nhạc được, chỉ thiếu hình
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

    const colors = { ink: new THREE.Color(), lit: new THREE.Color(), brass: new THREE.Color(), fadeTo: new THREE.Color() };
    const uTime = { value: 0 };
    const uOpacity = { value: 1 };
    const uInk = { value: colors.ink };
    const uLit = { value: colors.lit };
    const disposables: { dispose: () => void }[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const eul = new THREE.Euler();
    const col = new THREE.Color();
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // ---- dải khuông cuộn tròn ----
    const ringGeo = new THREE.CylinderGeometry(R, R, STAFF_H, 320, 1, true);
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uInk,
        uLit,
        uOpacity,
        uTime,
        uHit: { value: -99 },
        uCenter: { value: new THREE.Vector3() },
        uFocus: { value: 0 },
      },
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 0;
    ring.add(ringMesh);
    disposables.push(ringGeo, ringMat);

    // ---- nốt và vạch nhịp của bài đang chọn: dựng lại mỗi khi đổi bài ----
    const noteGeo = new THREE.PlaneGeometry(NOTE_W, NOTE_H);
    const barGeo = new THREE.PlaneGeometry(0.016, GAP * 4);
    disposables.push(noteGeo, barGeo);
    let stepA = (Math.PI * 2) / current.notes.length; // góc giữa hai nốt
    let noteMeshes: THREE.InstancedMesh[] = [];
    let noteMats: THREE.MeshBasicMaterial[] = [];
    let noteGlyph: number[] = []; // nốt i dùng mesh nào
    let barMat: THREE.MeshBasicMaterial | null = null;
    let songParts: { dispose: () => void }[] = [];
    let songObjects: THREE.Object3D[] = [];
    let hitAt = new Float32Array(current.notes.length).fill(-99); // lúc mỗi nốt được chơi gần nhất

    const buildSong = () => {
      songObjects.forEach((o) => ring.remove(o));
      songParts.forEach((d) => d.dispose());
      songObjects = [];
      songParts = [];
      const notes = current.notes;
      stepA = (Math.PI * 2) / notes.length;
      hitAt = new Float32Array(notes.length).fill(-99);

      // mỗi kiểu ảnh nốt (loại, dòng kẻ phụ, dấu thăng) một InstancedMesh
      const keys: string[] = [];
      noteGlyph = notes.map((n) => {
        const key = `${n.kind}${n.ledger ? 1 : 0}${n.sharp ? 1 : 0}`;
        let k = keys.indexOf(key);
        if (k < 0) k = keys.push(key) - 1;
        return k;
      });
      noteMats = [];
      noteMeshes = keys.map((key, k) => {
        const map = makeGlyph(Number(key[0]) as Glyph, { ledger: key[1] === '1', sharp: key[2] === '1' });
        const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.InstancedMesh(noteGeo, mat, noteGlyph.filter((g) => g === k).length);
        mesh.setColorAt(0, new THREE.Color());
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        ring.add(mesh);
        noteMats.push(mat);
        songObjects.push(mesh);
        songParts.push(map, mat, mesh);
        return mesh;
      });

      const bars = notes.map((n, i) => (n.barStart ? i : -1)).filter((i) => i >= 0);
      barMat = new THREE.MeshBasicMaterial({ color: colors.ink, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const barMesh = new THREE.InstancedMesh(barGeo, barMat, Math.max(1, bars.length));
      barMesh.count = bars.length;
      bars.forEach((i, k) => {
        const a = (i - 0.5) * stepA;
        v3.set(Math.sin(a) * (R + 0.005), 0, Math.cos(a) * (R + 0.005));
        barMesh.setMatrixAt(k, m4.compose(v3, q.setFromAxisAngle(yAxis, a), s3.set(1, 1, 1)));
      });
      barMesh.renderOrder = 1;
      barMesh.frustumCulled = false;
      ring.add(barMesh);
      songObjects.push(barMesh);
      songParts.push(barMat, barMesh);
      applyBlending();
    };

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
    const emitSparks = (p: THREE.Vector3, n: number, power: number) => {
      const now = uTime.value;
      for (let k = 0; k < n; k++) {
        const j = sparkIdx;
        sparkIdx = (sparkIdx + 1) % SPARKS;
        origin.set([p.x, p.y, p.z], j * 3);
        const a = Math.random() * Math.PI * 2;
        const sp = (0.4 + Math.random() * 0.9) * power;
        vel.set([Math.cos(a) * sp, (0.6 + Math.random() * 1.1) * power, Math.sin(a) * sp * 0.5], j * 3);
        born[j] = now + Math.random() * 0.05;
      }
      for (const name of ['aOrigin', 'aVel', 'aBorn']) sparkGeo.getAttribute(name).needsUpdate = true;
    };

    // ---- không gian trang trí: nốt bay, bụi sáng, đốm bokeh ----
    const narrow = window.innerWidth < 720;
    const floatTex = [makeGlyph(0), makeGlyph(1), makeGlyph(2), makeGlyph(3), makeBeamedGlyph()];
    const floatGeo = new THREE.PlaneGeometry(FLOAT_W, FLOAT_H);
    disposables.push(floatGeo, ...floatTex);
    const FLOATS = narrow ? 30 : 64;
    const floats = Array.from({ length: FLOATS }, (_, i) => {
      const z = rnd(-15, 3);
      let x = rnd(-17, 17);
      // chừa cột giữa phía trước cho tiêu đề và nút đầu trang
      if (Math.abs(x) < 5.5 && z > -5) x = Math.sign(x || 1) * rnd(5.5, 15);
      return {
        x,
        z,
        y0: rnd(0, FIELD_RANGE),
        vy: rnd(0.12, 0.35),
        sway: rnd(0, Math.PI * 2),
        rot: rnd(-0.45, 0.45),
        scale: rnd(0.8, 1.9),
        tone: i % 3,
        glyph: i % floatTex.length,
        // độ lệch do luồng sóng khi bấm, lò xo kéo về
        ox: 0,
        oy: 0,
        vx: 0,
        vy2: 0,
        spinKick: 0,
      };
    });
    const makeGlyphMeshes = (count: number, order: number) => {
      const mats: THREE.MeshBasicMaterial[] = [];
      const meshes = floatTex.map((map) => {
        const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.InstancedMesh(floatGeo, mat, count);
        mesh.setColorAt(0, new THREE.Color());
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        scene.add(mesh);
        mats.push(mat);
        disposables.push(mat, mesh);
        return mesh;
      });
      return { meshes, mats };
    };
    const floatSet = makeGlyphMeshes(FLOATS, -2); // nằm sau vòng khuông
    const burstSet = makeGlyphMeshes(BURSTS, 5); // nốt bắn ra khi bấm: nằm trên cùng

    const uScroll = { value: 0 };
    const makeMotes = (count: number, size: [number, number], speed: number, soft: number, order: number) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      const sz = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos.set([rnd(-20, 20), rnd(0, FIELD_RANGE), rnd(-18, 6)], i * 3);
        seed[i] = Math.random();
        sz[i] = rnd(size[0], size[1]);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime,
          uScroll,
          uPx,
          uSpeed: { value: speed },
          uSoft: { value: soft },
          uOpacity: { value: 1 },
          uColA: { value: colors.lit },
          uColB: { value: colors.brass },
        },
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = order;
      scene.add(pts);
      disposables.push(geo, mat);
      return mat;
    };
    const dustMat = makeMotes(narrow ? 160 : 380, [0.6, 1.6], 0.18, 0, -3);
    const bokehMat = makeMotes(narrow ? 8 : 16, [9, 20], 0.08, 1, -4);
    const toneColors = [colors.ink, colors.lit, colors.brass];

    // ---- hiệu ứng bấm: vòng sóng loang ra và chùm nốt nhỏ bắn ra từ chỗ bấm ----
    const rippleGeo = new THREE.RingGeometry(0.965, 1, 96); // vòng mảnh
    disposables.push(rippleGeo);
    const ripples = Array.from({ length: RIPPLES }, () => {
      const mat = new THREE.MeshBasicMaterial({ color: colors.lit, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(rippleGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      disposables.push(mat);
      return { mesh, mat, born: -99, size: 1 };
    });
    let rippleIdx = 0;
    const bursts = Array.from({ length: BURSTS }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: 0,
      spin: 0,
      scale: 1,
      glyph: 0,
      tone: 0,
      born: -99,
    }));
    let burstIdx = 0;

    const clickPoint = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const splash = (clientX: number, clientY: number) => {
      if (!running) return; // giảm chuyển động: chỉ có tiếng
      ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      clickPoint.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 10);
      const now = uTime.value;
      // hai vòng sóng nối nhau
      for (const [delay, size] of [
        [0, 1.25],
        [0.16, 0.8],
      ]) {
        const r = ripples[rippleIdx];
        rippleIdx = (rippleIdx + 1) % RIPPLES;
        r.born = now + delay;
        r.size = size;
        r.mesh.position.copy(clickPoint);
        r.mesh.lookAt(camera.position);
      }
      // chùm nốt nhỏ bay toả ra, xoay tít rồi tan
      for (let k = 0; k < 9; k++) {
        const b = bursts[burstIdx];
        burstIdx = (burstIdx + 1) % BURSTS;
        const a = (k / 9) * Math.PI * 2 + rnd(-0.3, 0.3);
        const sp = rnd(1.6, 3.4);
        b.pos.copy(clickPoint);
        b.vel.set(Math.cos(a) * sp, Math.sin(a) * sp + 1.2, rnd(-0.5, 0.5));
        b.rot = rnd(-0.5, 0.5);
        b.spin = rnd(-5, 5);
        b.scale = rnd(0.35, 0.65);
        b.glyph = Math.floor(Math.random() * floatTex.length);
        b.tone = k % 3;
        b.born = now;
      }
      emitSparks(clickPoint, 18, 1.6);
      // luồng sóng đẩy các nốt bay xung quanh dạt ra
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      for (const n of floats) {
        const tz = (n.z - o.z) / d.z;
        if (tz <= 0) continue;
        const cx = o.x + d.x * tz;
        const cy = o.y + d.y * tz;
        const dx = n.x + n.ox - cx;
        const dy = floatY(n) + n.oy - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < PUSH_R && dist > 0.01) {
          const f = (1 - dist / PUSH_R) * 9;
          n.vx += (dx / dist) * f;
          n.vy2 += (dy / dist) * f;
          n.spinKick += rnd(-1, 1) * f * 0.4;
        }
      }
    };

    // ---- màu và độ đậm theo theme ----
    let baseOpacity = 1;
    let floatOpacity = 1; // nốt bay trang trí: theme tối cộng sáng nên phải nhạt hơn để không lấn vòng khuông
    let dark = false;
    const applyBlending = () => {
      const all: THREE.Material[] = [
        ringMat,
        sparkMat,
        dustMat,
        bokehMat,
        ...floatSet.mats,
        ...burstSet.mats,
        ...ripples.map((r) => r.mat),
        ...noteMats,
        ...(barMat ? [barMat] : []),
      ];
      for (const m of all) {
        m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    };
    const applyColors = () => {
      const c = readColors();
      dark = c.dark;
      colors.ink.copy(c.ink);
      colors.lit.copy(c.lit);
      colors.brass.copy(c.brass);
      colors.fadeTo.copy(c.dark ? new THREE.Color(0, 0, 0) : c.bg);
      barMat?.color.copy(c.ink);
      for (const r of ripples) r.mat.color.copy(c.lit);
      baseOpacity = c.dark ? 0.75 : 0.6;
      floatOpacity = c.dark ? 0.4 : 0.6;
      dustMat.uniforms.uOpacity.value = c.dark ? 0.9 : 0.75;
      bokehMat.uniforms.uOpacity.value = c.dark ? 0.16 : 0.12;
      applyBlending();
    };

    // ---- trạng thái chơi ----
    // điểm đọc (chỗ nốt sắp chơi dừng lại): phía trước lệch trái, chỗ trống bên cạnh chữ và nút đầu trang; màn dọc
    // thì gần giữa hơn cho khỏi lọt ra ngoài khung
    let focus = -0.55;
    let spin = focus; // góc quay hiện tại của vòng
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // vị trí thế giới hiện tại của nốt i
    const notePos = (i: number) => {
      const a = i * stepA;
      const y = -2 * GAP + (current.notes[i].step * GAP) / 2;
      return ring.localToWorld(new THREE.Vector3(Math.sin(a) * R, y, Math.cos(a) * R));
    };

    advance = (isAuto: boolean) => {
      const len = current.notes.length;
      const i = count % len;
      remember(soundNote(current, i, isAuto));
      const now = uTime.value;
      hitAt[i] = now;
      ringMat.uniforms.uHit.value = now;
      emitSparks(notePos(i), SPARKS_PER_HIT, 1);
      count++;
      if (count % len === 0) hitAt.fill(-99); // hết bài: các nốt về lại trạng thái chưa chơi
      setPlayed(count % len);
      if (!running) {
        spin = focus - count * stepA;
        draw();
      }
      return i;
    };
    loadSong = (idx: number) => {
      current = SONGS[idx];
      count = 0;
      setPlayed(0);
      // quay ngắn nhất về điểm đọc thay vì tua cả chục vòng
      const turn = Math.PI * 2;
      spin = focus + ((((spin - focus) % turn) + turn) % turn);
      buildSong();
      ringMat.uniforms.uHit.value = uTime.value; // vệt sáng chạy quanh khuông báo đã đổi bài
      if (!running) {
        spin = focus;
        draw();
      }
    };

    const updateNotes = () => {
      const now = uTime.value;
      const notes = current.notes;
      const cur = count % notes.length;
      const counts = new Array(noteMeshes.length).fill(0);
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const mesh = noteMeshes[noteGlyph[i]];
        const k = counts[noteGlyph[i]]++;
        const a = i * stepA;
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

    // ---- cuộn trang: vòng chỉ nhích lên một chút và nhạt bớt vừa phải (vẫn luôn thấy); không gian trang trí trôi theo ----
    let scrollTarget = window.scrollY;
    let scrollY = scrollTarget;
    const onScroll = () => {
      scrollTarget = window.scrollY;
    };

    const floatY = (n: (typeof floats)[number]) => {
      const yr = (((n.y0 + uTime.value * n.vy + scrollY * FIELD_SCROLL) % FIELD_RANGE) + FIELD_RANGE) % FIELD_RANGE;
      return yr - FIELD_RANGE / 2 + FIELD_CENTER_Y;
    };

    const updateField = (dt: number) => {
      const t = uTime.value;
      const lift = scrollY * FIELD_SCROLL;
      uScroll.value = lift;
      const fc = [0, 0, 0, 0, 0];
      const damp = Math.exp(-3.2 * dt);
      for (const n of floats) {
        // lò xo kéo nốt bị luồng sóng đẩy về chỗ cũ
        n.vx = (n.vx - n.ox * 6 * dt) * damp;
        n.vy2 = (n.vy2 - n.oy * 6 * dt) * damp;
        n.ox += n.vx * dt;
        n.oy += n.vy2 * dt;
        n.spinKick *= damp;
        n.rot += n.spinKick * dt;

        const yr = (((n.y0 + t * n.vy + lift) % FIELD_RANGE) + FIELD_RANGE) % FIELD_RANGE;
        const y = yr - FIELD_RANGE / 2 + FIELD_CENTER_Y;
        v3.set(n.x + n.ox + Math.sin(t * 0.4 + n.sway) * 0.6, y + n.oy, n.z);
        // lắc nghiêng và lật nhẹ quanh trục đứng như chiếc lá rơi ngược lên
        q.setFromEuler(eul.set(0, Math.sin(t * 0.3 + n.sway) * 0.7, n.rot + Math.sin(t * 0.5 + n.sway) * 0.25));
        s3.setScalar(n.scale);
        const mesh = floatSet.meshes[n.glyph];
        const k = fc[n.glyph]++;
        mesh.setMatrixAt(k, m4.compose(v3, q, s3));
        // xa thì nhạt, gần hai đầu khoảng quay vòng thì mờ hẳn
        const depth = Math.min(1, Math.max(0.3, (n.z + 18) / 21));
        const ends = Math.min(1, yr / 2, (FIELD_RANGE - yr) / 2);
        col.copy(toneColors[n.tone]).lerp(colors.fadeTo, 1 - 0.5 * depth * Math.max(0, ends));
        mesh.setColorAt(k, col);
      }
      floatSet.meshes.forEach((mesh, g) => {
        mesh.count = fc[g];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    };

    const updateClickFx = (dt: number) => {
      const now = uTime.value;
      for (const r of ripples) {
        const age = now - r.born;
        const on = age >= 0 && age < RIPPLE_LIFE;
        r.mesh.visible = on;
        if (!on) continue;
        const k = age / RIPPLE_LIFE;
        r.mesh.scale.setScalar(0.2 + (1 - (1 - k) ** 3) * r.size);
        r.mat.opacity = (1 - k) ** 1.5 * 0.6;
      }
      const bc = [0, 0, 0, 0, 0];
      for (const b of bursts) {
        const age = now - b.born;
        if (age < 0 || age >= BURST_LIFE) continue;
        b.vel.multiplyScalar(Math.exp(-1.6 * dt));
        b.vel.y += 0.6 * dt; // bay bổng lên như bọt khí
        b.pos.addScaledVector(b.vel, dt);
        b.rot += b.spin * dt;
        const k = age / BURST_LIFE;
        const grow = Math.min(1, age / 0.15);
        const mesh = burstSet.meshes[b.glyph];
        const i = bc[b.glyph]++;
        q.setFromEuler(eul.set(0, 0, b.rot));
        s3.setScalar(b.scale * grow * (1 - k * 0.4));
        mesh.setMatrixAt(i, m4.compose(b.pos, q, s3));
        col.copy(toneColors[b.tone]).lerp(colors.lit, 0.4).lerp(colors.fadeTo, k * k);
        mesh.setColorAt(i, col);
      }
      burstSet.meshes.forEach((mesh, g) => {
        mesh.count = bc[g];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    };

    const draw = (dt = 0) => {
      ring.rotation.y = spin;
      ring.position.y = Math.min(scrollY, 900) * 0.0022;
      ring.updateMatrixWorld();
      ringMat.uniforms.uCenter.value.setFromMatrixPosition(ring.matrixWorld);
      uOpacity.value = baseOpacity * (1 - Math.min(1, scrollY / 900) * 0.3);
      for (const m of noteMats) m.opacity = uOpacity.value;
      if (barMat) barMat.opacity = uOpacity.value * 0.7;
      for (const m of floatSet.mats) m.opacity = floatOpacity;
      for (const m of burstSet.mats) m.opacity = Math.min(1, baseOpacity + 0.25);
      updateNotes();
      updateField(dt);
      updateClickFx(dt);
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
      splash(e.clientX, e.clientY);
      playRef.current(); // đang tự chạy thì bấm nền chỉ có hiệu ứng, không chen nốt vào
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
      const target = focus - count * stepA + Math.sin(uTime.value * 0.35) * stepA * 0.35;
      spin += (target - spin) * (1 - Math.pow(0.0005, dt));
      scrollY += (scrollTarget - scrollY) * (1 - Math.pow(0.02, dt));

      const want = n - lastMove < 3000 ? 1 : 0;
      camBase.copy(CAM).multiplyScalar(camera.aspect < 1 ? 1.25 : 1);
      const k = 1 - Math.pow(0.06, dt);
      camera.position.x += (camBase.x + pointer.x * want * 1.2 - camera.position.x) * k;
      camera.position.y += (camBase.y + pointer.y * want * 0.6 - camera.position.y) * k;
      camera.lookAt(LOOK);
      draw(dt);
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
        spin = focus - count * stepA;
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
    buildSong();
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
      cleanupSound();
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      songParts.forEach((d) => d.dispose());
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  const total = song.notes.length;
  return (
    <>
      <div ref={hostRef} className="gh-ring" aria-hidden="true" />
      <div className="gh-melody">
        <button
          type="button"
          className="gh-melody__next"
          disabled={auto}
          aria-label={t('home.guest.melody.play', { song: songTitle(song), n: played + 1, total })}
          onClick={() => playRef.current()}
        >
          <span className="gh-melody__icon" aria-hidden="true">
            <Icon name="music" size={16} />
          </span>
        </button>
        <span className="gh-melody__text">
          <select
            className="gh-melody__song"
            value={songIdx}
            aria-label={t('home.guest.melody.choose')}
            onChange={(e) => selectRef.current(Number(e.target.value))}
          >
            {SONGS.map((s, i) => (
              <option key={s.id} value={i}>
                {songTitle(s)} · {songBy(s)}
              </option>
            ))}
          </select>
          {/* bộ đếm đứng trước: lời gợi ý dài có bị cắt bớt thì vẫn thấy đang ở nốt nào */}
          <small>
            {t('home.guest.melody.progress', { n: played, total })} ·{' '}
            {auto ? t('home.guest.melody.playing') : t('home.guest.melody.hint')}
          </small>
        </span>
        <button
          type="button"
          className="gh-melody__auto"
          aria-pressed={auto}
          onClick={() => autoRef.current()}
        >
          <Icon name={auto ? 'pause' : 'play'} size={16} />
          {auto ? t('home.guest.melody.stop') : t('home.guest.melody.auto')}
        </button>
      </div>
    </>
  );
}
