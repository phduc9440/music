import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { playPianoNote } from '../../utils/pianoSynth';

/*
 * Khuông nhạc 3D làm nền trang làm việc (three.js, tải lười), như đang mở một bản nhạc và bấm phát:
 * - Một dòng khuông lớn (khoá Sol + khoá Fa) ở phía trước, thêm hai khuông mờ phía sau tạo chiều sâu. Khuông uốn nhẹ
 *   trong không gian như trang giấy thở, có vạch nhịp chia ô.
 * - Nốt nhạc (móc đơn, đen, trắng, tròn) chạy dọc khuông từ phải sang trái; vạch phát đứng yên, nốt đi qua thì sáng lên
 *   và làm dây khuông rung khẽ, như con trỏ phát lại trong trình xem bản nhạc.
 * - Rê chuột gần khuông: dòng kẻ rung như dây đàn. Bấm vào chỗ trống gần khuông: đặt một nốt vào đúng dòng/khe đó,
 *   phát tiếng piano đúng cao độ (Đô trưởng) và một làn sóng chạy dọc khuông. Bấm vào nút/liên kết thì không kêu.
 * - Cuộn trang thì bản nhạc trôi theo, và nhạt bớt khi đã xuống phần bảng điều khiển để chữ vẫn dễ đọc.
 * Màu đọc từ token CSS, đổi theo theme. Giảm chuyển động: một khung tĩnh. Dừng khi ra khỏi màn hình hoặc ẩn tab.
 * Nốt sinh theo hạt giống của từng ô nhịp nên cuộn ngược vẫn thấy lại đúng những nốt cũ.
 */

const FOV = 45;
const CAM_Z = 10;
const PLUCKS = 8;
const GAP = 0.26; // khoảng cách hai dòng kẻ
const PAD = GAP * 0.9; // phần trống trên/dưới khuông để quầng sáng có chỗ
const STAFF_H = GAP * 4 + PAD * 2;
const STAFF_W = 34;
const BEAT = 1.05; // độ dài một phách theo chiều ngang
const MEASURE = BEAT * 4;
const SPEED = 0.5; // đơn vị/giây
const EDGE = STAFF_W / 2;
const LOW_STEP = -1; // khe ngay dưới dòng 1
const HIGH_STEP = 9; // khe ngay trên dòng 5: không cần dòng kẻ phụ
const GLYPH_W = 128;
const GLYPH_H = 256;
const GLYPH_GAP_PX = 36; // một khe trên ảnh nốt = 36px
const NOTE_W = (GLYPH_W / GLYPH_GAP_PX) * GAP;
const NOTE_H = (GLYPH_H / GLYPH_GAP_PX) * GAP;
const MAX_NOTES = 192; // mỗi loại nốt, mỗi khuông

const f = (n: number) => n.toFixed(4);

/* ---------------- shader: dòng kẻ + vạch nhịp ---------------- */

const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uAmp;
  float wave(float x) {
    return uAmp * (0.8 * sin(x * 0.22 + uTime * 0.55 + uPhase) + 0.6 * sin(x * 0.09 - uTime * 0.31 + uPhase * 2.0));
  }
  float depthAt(float x) {
    return cos(x * 0.17 + uTime * 0.4 + uPhase) * 0.7;
  }
`;

const STAFF_VERT = /* glsl */ `
  ${WAVE_GLSL}
  uniform float uStaffY;
  uniform vec2 uMouse;
  uniform float uStrength;
  uniform vec4 uPlucks[${PLUCKS}];
  varying vec2 vUv;
  varying float vX;
  varying float vGlow;

  void main() {
    vUv = uv;
    vec3 p = position;
    vX = p.x;
    float y = p.y + uStaffY;

    // con trỏ ở gần: dây khuông rung khẽ như dây đàn
    float dx = p.x - uMouse.x;
    float dy = y - uMouse.y;
    float near = exp(-dx * dx * 0.08 - dy * dy * 0.25) * uStrength;
    float v = near * sin(uTime * 15.0 + p.x * 1.7) * 0.05;
    float energy = near * 0.6;

    // mỗi lần gảy (bấm chuột hoặc nốt đi qua vạch phát): một bó sóng chạy dọc khuông rồi tắt dần
    for (int i = 0; i < ${PLUCKS}; i++) {
      vec4 q = uPlucks[i];
      float age = uTime - q.z;
      if (age > 0.0 && age < 2.5) {
        float d = abs(p.x - q.x);
        float r = d - age * 6.0;
        float band = exp(-r * r * 0.35) + exp(-d * d * 0.6);
        float yy = y - q.y;
        float env = q.w * exp(-age * 1.6) * exp(-yy * yy * 0.15);
        v += sin(d * 2.4 - age * 16.0) * band * env * 0.16;
        energy += band * env;
      }
    }

    p.y += wave(p.x) + v;
    p.z += depthAt(p.x);
    vGlow = energy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const STAFF_FRAG = /* glsl */ `
  uniform vec3 uLine;
  uniform vec3 uGlow;
  uniform float uOpacity;
  uniform float uFlow;
  varying vec2 vUv;
  varying float vX;
  varying float vGlow;

  void main() {
    // năm dòng kẻ: s = 0..4 là dòng 1..5, khử răng cưa theo độ rộng một điểm ảnh
    float s = (vUv.y * ${f(STAFF_H)} - ${f(PAD)}) / ${f(GAP)};
    float k = clamp(floor(s + 0.5), 0.0, 4.0);
    float d = abs(s - k) * ${f(GAP)};
    float aa = fwidth(s) * ${f(GAP)} * 1.2;
    float line = 1.0 - smoothstep(0.011, 0.011 + aa, d);

    // vạch nhịp, trôi cùng nốt
    float bx = vX + uFlow;
    float bd = abs(fract(bx / ${f(MEASURE)} + 0.5) - 0.5) * ${f(MEASURE)};
    float bar = (1.0 - smoothstep(0.013, 0.013 + fwidth(bx) * 1.2, bd))
      * smoothstep(-0.03, 0.0, s) * smoothstep(4.03, 4.0, s);

    float ends = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float glow = clamp(vGlow, 0.0, 1.0);
    vec3 col = mix(uLine, uGlow, glow);
    float a = max(line, bar * 0.75) * ends * uOpacity * (0.55 + glow * 0.45);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

/* ---------------- shader: vạch phát ---------------- */

const HEAD_W = 0.8;

const PLAYHEAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLAYHEAD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHit;
  varying vec2 vUv;
  void main() {
    float x = (vUv.x - 0.5) * ${f(HEAD_W)};
    float core = 1.0 - smoothstep(0.012, 0.012 + fwidth(x) * 1.5, abs(x));
    float halo = exp(-x * x * 45.0) * (0.22 + uHit * 0.35);
    float fade = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    gl_FragColor = vec4(uColor, (core * 0.8 + halo) * fade * uOpacity);
    #include <colorspace_fragment>
  }
`;

/* ---------------- ảnh nốt nhạc (vẽ bằng đường, không phụ thuộc font) ---------------- */

type Glyph = 0 | 1 | 2 | 3; // móc đơn, đen, trắng, tròn
const GLYPHS: Glyph[] = [0, 1, 2, 3];
const DUR_TO_GLYPH: Record<number, Glyph> = { 0.5: 0, 1: 1, 2: 2, 4: 3 };

function makeGlyph(kind: Glyph) {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_W;
  canvas.height = GLYPH_H;
  const g = canvas.getContext('2d')!;
  const cx = GLYPH_W / 2;
  const cy = GLYPH_H / 2;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';

  // đầu nốt: hình bầu dục nghiêng; nốt trắng/tròn rỗng ruột
  const hollow = kind >= 2;
  const rx = kind === 3 ? 25 : 21;
  const ry = kind === 3 ? 16 : 15;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, kind === 3 ? 0.25 : -0.38, 0, Math.PI * 2);
  g.fill();
  if (hollow) {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(cx, cy, kind === 3 ? 11 : 15, kind === 3 ? 9 : 7, kind === 3 ? 1.1 : -0.38, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  if (kind !== 3) {
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

/* ---------------- bản nhạc sinh theo hạt giống ---------------- */

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Clef = 'treble' | 'bass';

const RHYTHMS: Record<Clef, number[][]> = {
  treble: [
    [1, 1, 1, 1],
    [0.5, 0.5, 1, 2],
    [2, 1, 1],
    [1, 0.5, 0.5, 1, 1],
    [1, 1, 2],
    [0.5, 0.5, 0.5, 0.5, 1, 1],
    [4],
    [1, 0.5, 0.5, 2],
  ],
  bass: [[2, 2], [4], [1, 1, 2], [2, 1, 1], [4], [2, 2]],
};
const MOVES = [-2, -1, -1, 0, 1, 1, 2];

interface NoteSpec {
  beat: number; // phách tuyệt đối tính từ đầu bản
  dur: number;
  step: number; // 0 = dòng 1, 1 = khe 1, ... 8 = dòng 5
}

function measureNotes(seed: number, clef: Clef, m: number): NoteSpec[] {
  const r = rng(m * 7919 + seed * 104729);
  const pattern = RHYTHMS[clef][Math.floor(r() * RHYTHMS[clef].length)];
  let step = clef === 'treble' ? 2 + Math.floor(r() * 5) : 1 + Math.floor(r() * 5);
  let beat = 0;
  return pattern.map((dur) => {
    const note = { beat: m * 4 + beat + 0.45, dur, step };
    beat += dur;
    step = Math.min(HIGH_STEP, Math.max(LOW_STEP, step + MOVES[Math.floor(r() * MOVES.length)]));
    return note;
  });
}

// cao độ theo bậc trong Đô trưởng: dòng 1 khoá Sol là Mi4, dòng 1 khoá Fa là Son2
const SCALE = [0, 2, 4, 5, 7, 9, 11];
function stepToMidi(clef: Clef, step: number) {
  const d = step + (clef === 'treble' ? 2 : -10); // số bậc tính từ Đô giữa
  const oct = Math.floor(d / 7);
  return 60 + oct * 12 + SCALE[((d % 7) + 7) % 7];
}

/* ---------------- cấu hình các dòng khuông ---------------- */

interface SystemSpec {
  pos: [number, number, number];
  rot: number;
  scale: number;
  phase: number;
  amp: number;
  speed: number;
  opacity: number;
  staves: { y: number; clef: Clef }[];
  front?: boolean;
}

const SYSTEMS: SystemSpec[] = [
  {
    pos: [0, 1.5, -2],
    rot: -0.05,
    scale: 0.82,
    phase: 0,
    amp: 0.3,
    speed: 1,
    opacity: 1,
    front: true,
    staves: [
      { y: 1.0, clef: 'treble' },
      { y: -1.0, clef: 'bass' },
    ],
  },
  {
    pos: [1.5, 3.9, -6],
    rot: 0.09,
    scale: 1.3,
    phase: 2.4,
    amp: 0.45,
    speed: 0.7,
    opacity: 0.4,
    staves: [{ y: 0, clef: 'treble' }],
  },
  {
    pos: [-1, -3.4, -8],
    rot: -0.11,
    scale: 1.5,
    phase: 4.4,
    amp: 0.5,
    speed: 0.55,
    opacity: 0.3,
    staves: [{ y: 0, clef: 'bass' }],
  },
];

// bản sao của wave()/depthAt() trong shader để nốt nằm đúng trên dòng kẻ đang uốn
const waveAt = (x: number, t: number, phase: number, amp: number) =>
  amp * (0.8 * Math.sin(x * 0.22 + t * 0.55 + phase) + 0.6 * Math.sin(x * 0.09 - t * 0.31 + phase * 2));
const depthAt = (x: number, t: number, phase: number) => Math.cos(x * 0.17 + t * 0.4 + phase) * 0.7;
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const c = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    ink: c('--ui-primary'),
    lit: dark ? c('--ui-cta') : c('--ui-hue-rose'),
    bg: c('--ui-bg'),
    dark,
  };
}

// bấm vào đây thì không đặt nốt: nút, liên kết, ô nhập và các thẻ nội dung (để bôi chọn chữ không bật tiếng)
const NO_PLAY =
  'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],[role="tab"],[contenteditable="true"],[tabindex],.wh-panel,.wh-sec,.wh-cta,.wh-quick,.wh-streak';

interface UserNote {
  beat: number;
  step: number;
  staff: number;
  born: number;
}

export default function ScoreStaff3D() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // không có WebGL: trang vẫn đủ, chỉ thiếu khuông nhạc
    }
    const canvas = renderer.domElement;
    host.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);

    const uTime = { value: 14 };
    const colors = {
      ink: new THREE.Color(),
      lit: new THREE.Color(),
      bg: new THREE.Color(),
      fadeTo: new THREE.Color(), // màu "biến mất": nền giấy khi phủ thường, đen khi cộng sáng
    };
    const lineColor = { value: colors.ink };
    const glowColor = { value: colors.lit };

    const textures = GLYPHS.map(makeGlyph);
    const noteGeo = new THREE.PlaneGeometry(NOTE_W, NOTE_H);
    const staffGeo = new THREE.PlaneGeometry(STAFF_W, STAFF_H, window.innerWidth < 720 ? 120 : 220, 4);
    const disposables: { dispose: () => void }[] = [noteGeo, staffGeo, ...textures];

    let order = 0;
    const systems = SYSTEMS.map((spec, sysIdx) => {
      const group = new THREE.Group();
      group.position.set(...spec.pos);
      group.rotation.z = spec.rot;
      scene.add(group);

      const shared = {
        uTime,
        uPhase: { value: spec.phase },
        uAmp: { value: spec.amp },
        uMouse: { value: new THREE.Vector2(99, 99) },
        uStrength: { value: 0 },
        uPlucks: { value: Array.from({ length: PLUCKS }, () => new THREE.Vector4(0, 0, -99, 0)) },
        uOpacity: { value: spec.opacity },
        uFlow: { value: 0 },
        uLine: lineColor,
        uGlow: glowColor,
      };

      const staffMats = spec.staves.map((st) => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: STAFF_VERT,
          fragmentShader: STAFF_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { ...shared, uStaffY: { value: st.y } },
        });
        const mesh = new THREE.Mesh(staffGeo, mat);
        mesh.position.y = st.y;
        mesh.frustumCulled = false;
        mesh.renderOrder = order++;
        group.add(mesh);
        disposables.push(mat);
        return mat;
      });

      // mỗi loại nốt một InstancedMesh; màu từng nốt qua instanceColor
      const noteMats: THREE.MeshBasicMaterial[] = [];
      const noteMeshes = textures.map((map) => {
        const mat = new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide, // nốt đuôi xuống được lật dọc
          opacity: spec.opacity,
        });
        const mesh = new THREE.InstancedMesh(noteGeo, mat, MAX_NOTES * spec.staves.length);
        mesh.setColorAt(0, new THREE.Color());
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.renderOrder = order++;
        group.add(mesh);
        noteMats.push(mat);
        disposables.push(mat, mesh);
        return mesh;
      });

      let playhead: THREE.Mesh | null = null;
      let playheadMat: THREE.ShaderMaterial | null = null;
      if (spec.front) {
        const top = Math.max(...spec.staves.map((s) => s.y)) + STAFF_H / 2 + 0.25;
        const bottom = Math.min(...spec.staves.map((s) => s.y)) - STAFF_H / 2 - 0.25;
        const geo = new THREE.PlaneGeometry(HEAD_W, top - bottom);
        playheadMat = new THREE.ShaderMaterial({
          vertexShader: PLAYHEAD_VERT,
          fragmentShader: PLAYHEAD_FRAG,
          transparent: true,
          depthWrite: false,
          uniforms: { uColor: glowColor, uOpacity: { value: spec.opacity }, uHit: { value: 0 } },
        });
        playhead = new THREE.Mesh(geo, playheadMat);
        playhead.userData.mid = (top + bottom) / 2;
        playhead.frustumCulled = false;
        playhead.renderOrder = order++;
        group.add(playhead);
        disposables.push(geo, playheadMat);
      }

      return {
        spec,
        seed: sysIdx + 1,
        group,
        shared,
        staffMats,
        noteMats,
        noteMeshes,
        playhead,
        playheadMat,
        playheadX: -3,
        flow: 0,
        pluckIdx: 0,
        hit: 0,
        lastStruck: spec.staves.map(() => -Infinity),
        users: [] as UserNote[],
        mouse: new THREE.Vector2(99, 99),
        mouseTarget: new THREE.Vector2(99, 99),
      };
    });
    type Sys = (typeof systems)[number];

    let baseOpacity = 1;
    let blending: THREE.Blending = THREE.NormalBlending;
    const applyColors = () => {
      const c = readColors();
      colors.ink.copy(c.ink);
      colors.lit.copy(c.lit);
      colors.bg.copy(c.bg);
      colors.fadeTo.copy(c.dark ? new THREE.Color(0, 0, 0) : c.bg);
      // nền tối: cộng sáng cho khuông phát quang; nền giấy: phủ thường, nhạt hơn để chữ đầu trang vẫn rõ
      baseOpacity = c.dark ? 0.6 : 0.48;
      blending = c.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      for (const s of systems) {
        for (const m of [...s.staffMats, ...s.noteMats, ...(s.playheadMat ? [s.playheadMat] : [])]) {
          m.blending = blending;
          m.needsUpdate = true;
        }
      }
    };

    /* ---- gảy dây khuông ---- */
    const pluck = (s: Sys, x: number, y: number, amp: number) => {
      s.shared.uPlucks.value[s.pluckIdx].set(x, y, uTime.value, amp);
      s.pluckIdx = (s.pluckIdx + 1) % PLUCKS;
    };
    const vibAt = (s: Sys, x: number, y: number) => {
      const t = uTime.value;
      const dx = x - s.shared.uMouse.value.x;
      const dy = y - s.shared.uMouse.value.y;
      let v = Math.exp(-dx * dx * 0.08 - dy * dy * 0.25) * s.shared.uStrength.value * Math.sin(t * 15 + x * 1.7) * 0.05;
      for (const q of s.shared.uPlucks.value) {
        const age = t - q.z;
        if (age > 0 && age < 2.5) {
          const d = Math.abs(x - q.x);
          const r = d - age * 6;
          const band = Math.exp(-r * r * 0.35) + Math.exp(-d * d * 0.6);
          const yy = y - q.y;
          v += Math.sin(d * 2.4 - age * 16) * band * q.w * Math.exp(-age * 1.6) * Math.exp(-yy * yy * 0.15) * 0.16;
        }
      }
      return v;
    };

    /* ---- đặt nốt theo khung hình ---- */
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const counts = [0, 0, 0, 0];

    const placeNote = (
      s: Sys,
      staff: number,
      x: number,
      step: number,
      glyph: Glyph,
      pop: number,
      user: boolean,
    ) => {
      const mesh = s.noteMeshes[glyph];
      const i = counts[glyph];
      if (i >= mesh.instanceMatrix.count) return;
      const t = uTime.value;
      const { phase, amp } = s.spec;
      const staffY = s.spec.staves[staff].y;
      const baseY = staffY - 2 * GAP + (step * GAP) / 2;
      const y = baseY + waveAt(x, t, phase, amp) + vibAt(s, x, baseY);
      const slope = (waveAt(x + 0.05, t, phase, amp) - waveAt(x - 0.05, t, phase, amp)) / 0.1;

      pos.set(x, y, depthAt(x, t, phase) + 0.01);
      quat.setFromAxisAngle(zAxis, Math.atan(slope));
      const k = 1 + pop * 0.3;
      scl.set(k, step >= 4 ? -k : k, 1); // từ dòng 3 trở lên đuôi quay xuống
      mesh.setMatrixAt(i, mat4.compose(pos, quat, scl));

      // nốt chưa phát nhạt hơn, nốt đang qua vạch phát sáng màu nhấn, mờ dần ở hai đầu khuông
      const played = !s.playhead || x <= s.playheadX;
      const edge = smooth(-EDGE, -EDGE + 2.6, x) * smooth(EDGE, EDGE - 2.6, x);
      col.copy(colors.ink).lerp(colors.lit, Math.min(1, pop + (user ? 0.55 : 0)));
      col.lerp(colors.fadeTo, 1 - edge * (played ? 1 : 0.6));
      mesh.setColorAt(i, col);
      counts[glyph] = i + 1;
    };

    const updateSystem = (s: Sys, dt: number) => {
      const t = uTime.value;
      counts.fill(0);
      s.shared.uFlow.value = s.flow;
      s.hit = Math.max(0, s.hit - dt * 2.5);
      if (s.playheadMat) s.playheadMat.uniforms.uHit.value = s.hit;

      const firstM = Math.floor((s.flow - EDGE) / MEASURE) - 1;
      const lastM = Math.ceil((s.flow + EDGE) / MEASURE);
      s.spec.staves.forEach((st, staff) => {
        for (let m = firstM; m <= lastM; m++) {
          for (const n of measureNotes(s.seed * 10 + staff, st.clef, m)) {
            const x = n.beat * BEAT - s.flow;
            if (x < -EDGE || x > EDGE) continue;
            let pop = 0;
            if (s.playhead) {
              const dx = (x - s.playheadX) / 0.35;
              pop = Math.exp(-dx * dx);
              if (x <= s.playheadX && n.beat > s.lastStruck[staff]) {
                s.lastStruck[staff] = n.beat;
                pluck(s, x, st.y - 2 * GAP + (n.step * GAP) / 2, 0.3);
                s.hit = 1;
              }
            }
            placeNote(s, staff, x, n.step, DUR_TO_GLYPH[n.dur], pop, false);
          }
        }
      });

      // nốt người dùng đặt: hiện ra bằng một nhịp phóng to rồi trôi theo bản nhạc
      s.users = s.users.filter((u) => u.beat * BEAT - s.flow > -EDGE - 4);
      for (const u of s.users) {
        const x = u.beat * BEAT - s.flow;
        if (x > EDGE) continue;
        const age = t - u.born;
        const pop = age < 0.6 ? Math.sin((age / 0.6) * Math.PI) * 1.4 : 0;
        placeNote(s, u.staff, x, u.step, 1, pop, true);
      }

      s.noteMeshes.forEach((mesh, g) => {
        mesh.count = counts[g];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });

      if (s.playhead) {
        const x = s.playheadX;
        s.playhead.position.set(
          x,
          s.playhead.userData.mid + waveAt(x, t, s.spec.phase, s.spec.amp),
          depthAt(x, t, s.spec.phase) + 0.02,
        );
      }
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // màn hẹp (điện thoại): thu khuông lại; vạch phát đặt ở khoảng 14% bề ngang (lề trái, không cắt qua chữ đầu trang) tính từ trái
      const k = Math.min(1, Math.max(0.55, camera.aspect / 1.6));
      for (const s of systems) {
        s.group.scale.setScalar(s.spec.scale * k);
        const halfW = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (CAM_Z - s.spec.pos[2]) * camera.aspect;
        s.playheadX = (-halfW * 0.72 - s.spec.pos[0]) / (s.spec.scale * k);
      }
      scene.updateMatrixWorld();
      draw(0);
    };

    // ---- con trỏ: toạ độ trong khung (khung không nhận sự kiện nên nghe trên window) ----
    const ndc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let inside = false;
    let lastMove = -1e9;

    const locate = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      ndc.set(x * 2 - 1, -y * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      for (const s of systems) {
        plane.constant = -s.spec.pos[2];
        if (raycaster.ray.intersectPlane(plane, hit)) {
          s.group.worldToLocal(hit);
          s.mouseTarget.set(hit.x, hit.y);
        }
      }
      return inside;
    };
    const onMove = (e: PointerEvent) => {
      if (!locate(e)) return;
      for (const s of systems) if (s.shared.uStrength.value < 0.01) s.shared.uMouse.value.copy(s.mouseTarget);
      lastMove = performance.now();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !locate(e)) return;
      const target = e.target as Element | null;
      if (target?.closest?.(NO_PLAY)) return;
      const s = systems[0];
      const { x, y } = s.mouseTarget;
      if (x < -EDGE + 2 || x > EDGE - 2) return;
      const t = uTime.value;
      const wy = waveAt(x, t, s.spec.phase, s.spec.amp);
      // tìm khuông gần nhất và dòng/khe gần nhất ở chỗ bấm
      let staff = -1;
      let step = 0;
      let bestDist = 3; // xa khuông hơn 3 nửa-khe thì bỏ qua
      s.spec.staves.forEach((st, i) => {
        const raw = (y - wy - (st.y - 2 * GAP)) / (GAP / 2);
        const dist = raw < LOW_STEP ? LOW_STEP - raw : raw > HIGH_STEP ? raw - HIGH_STEP : 0;
        if (dist < bestDist) {
          bestDist = dist;
          staff = i;
          step = Math.min(HIGH_STEP, Math.max(LOW_STEP, Math.round(raw)));
        }
      });
      if (staff < 0) return;
      const clef = s.spec.staves[staff].clef;
      s.users.push({ beat: (x + s.flow) / BEAT, step, staff, born: t });
      if (s.users.length > 40) s.users.shift();
      pluck(s, x, s.spec.staves[staff].y - 2 * GAP + (step * GAP) / 2, 1);
      playPianoNote(stepToMidi(clef, step), 0.7);
      if (!running) draw(0);
    };

    // ---- cuộn trang: bản nhạc trôi theo, nhạt bớt khi đã qua phần đầu trang ----
    let scrollTarget = window.scrollY;
    let scrollFlow = scrollTarget * 0.006;
    const onScroll = () => {
      scrollTarget = window.scrollY;
    };
    let playTime = 0;

    const draw = (dt: number) => {
      const k = dt ? 1 - Math.pow(0.03, dt) : 1;
      scrollFlow += (scrollTarget * 0.006 - scrollFlow) * k;
      const dim = Math.min(1, scrollTarget / 700);
      const opacity = baseOpacity * (1 - dim * 0.55);
      for (const s of systems) {
        s.flow = playTime * SPEED * s.spec.speed + scrollFlow * s.spec.speed;
        const o = opacity * s.spec.opacity;
        s.shared.uOpacity.value = o;
        for (const m of s.noteMats) m.opacity = o;
        if (s.playheadMat) s.playheadMat.uniforms.uOpacity.value = o;
        updateSystem(s, dt);
      }
      renderer.render(scene, camera);
    };

    // ---- vòng vẽ ----
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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(tick(), 0.05);
      uTime.value += dt;
      playTime += dt;
      const now = performance.now();
      const want = inside && now - lastMove < 2500 ? 1 : 0;
      const follow = 1 - Math.pow(0.002, dt);
      const ease = 1 - Math.pow(0.08, dt);
      for (const s of systems) {
        s.shared.uMouse.value.lerp(s.mouseTarget, follow);
        s.shared.uStrength.value += (want - s.shared.uStrength.value) * ease;
      }

      // máy quay nghiêng nhẹ theo chuột để thấy chiều sâu giữa các khuông
      const c = 1 - Math.pow(0.05, dt);
      camera.position.x += ((want ? ndc.x * 0.6 : 0) - camera.position.x) * c;
      camera.position.y += ((want ? ndc.y * 0.35 : 0) - camera.position.y) * c;
      camera.lookAt(0, 0.4, -3);
      draw(dt);
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
    const sync = () => {
      if (motion.matches || document.hidden || !visible) {
        stop();
        if (motion.matches) {
          for (const s of systems) s.shared.uStrength.value = 0;
          draw(0);
        }
      } else start();
    };

    const themeObserver = new MutationObserver(() => {
      applyColors();
      if (!running) draw(0);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    applyColors();
    camera.lookAt(0, 0.4, -3);
    for (const s of systems) s.flow = scrollFlow * s.spec.speed;
    // đổi cỡ khung làm vạch phát dời sang phải: nốt vừa lọt qua bên trái coi như đã phát, không gảy dồn một lượt
    const ro = new ResizeObserver(() => {
      resize();
      for (const s of systems) s.lastStruck = s.lastStruck.map((b) => Math.max(b, (s.playheadX + s.flow) / BEAT));
    });
    ro.observe(host);
    resize();
    // nốt đã nằm bên trái vạch phát lúc mở trang cũng vậy
    for (const s of systems) s.lastStruck = s.lastStruck.map(() => (s.playheadX + s.flow) / BEAT);
    start();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(host);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="wh-staff" aria-hidden="true" />;
}
