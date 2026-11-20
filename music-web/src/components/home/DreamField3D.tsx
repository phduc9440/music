import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
 * Nền 3D "mơ màng" của trang chủ khách (three.js, tải lười để không nằm trong gói chính):
 *   - một trường hạt bụi đồng thau / hồng trôi lững lờ theo chiều sâu, xoáy và dạt ra quanh con trỏ chuột
 *   - năm dòng kẻ khuông uốn lượn trong không gian, bị con trỏ hút cong về phía nó như trọng lực
 *   - các nốt nhạc 3D (nốt đen, móc đơn, móc đôi, cặp nối dây) bay lên như giai điệu, lật xoay trong không gian; gần
 *     con trỏ thì dạt ra, xoay nhanh và sáng màu đồng
 *   - một quầng sáng mềm đi theo con trỏ; bấm chuột (hoặc chạm) thả ra một gợn sóng lan qua trường hạt
 *   - máy quay nghiêng theo chuột (thị sai) và trôi theo cuộn trang
 * Màu đọc từ token CSS (không có mã màu trong TSX), đổi theo theme. Bật "Giảm chuyển động" thì chỉ vẽ một khung tĩnh.
 * Canvas không nhận sự kiện (pointer-events: none) nên không cản thao tác trên trang.
 */

const CAM_Z = 10;
const FOV = 55;
const RIPPLES = 4;
const STAFF_POINTS = 220;

interface Palette {
  brass: THREE.Color;
  accent: THREE.Color;
  rose: THREE.Color;
  deep: THREE.Color;
  dark: boolean;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const c = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
  return {
    brass: c('--ui-cta'),
    accent: c('--ui-primary'),
    rose: c('--ui-hue-rose'),
    deep: c('--ui-velvet'),
    dark: document.documentElement.dataset.theme === 'dark',
  };
}

/** Kích thước mặt phẳng z = 0 mà máy quay nhìn thấy. */
function viewSize(aspect: number) {
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
  return { w: h * aspect, h };
}

// Đoạn GLSL chung: đưa vị trí chuột (trên mặt z = 0) về đúng độ sâu của điểm, theo tia từ máy quay
const MOUSE_AT_DEPTH = /* glsl */ `
  uniform vec2 uMouse;
  uniform vec3 uCam;
  uniform float uStrength;
  vec2 atDepth(vec2 m, float z) {
    return uCam.xy + (m - uCam.xy) * (uCam.z - z) / uCam.z;
  }
  vec2 mouseAt(float z) {
    return atDepth(uMouse, z);
  }
`;

const PARTICLE_VERT = /* glsl */ `
  ${MOUSE_AT_DEPTH}
  uniform float uTime;
  uniform float uScroll;
  uniform float uPixelRatio;
  uniform float uSpanY;
  uniform vec4 uRipples[${RIPPLES}];
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  attribute float aSeed;
  attribute float aTone;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float t = uTime * 0.18;
    // trôi lững lờ, mỗi hạt một nhịp
    p.x += sin(t + aSeed * 6.2831 + p.y * 0.35) * 0.6;
    p.y += cos(t * 0.8 + aSeed * 12.0 + p.x * 0.25) * 0.5;
    p.z += sin(t * 0.6 + aSeed * 20.0) * 0.7;
    // cuộn trang: hạt gần trôi nhanh hơn hạt xa (thị sai), quấn vòng để trường hạt không bao giờ hết
    p.y += uScroll * (0.35 + (p.z + 7.0) / 10.0);
    p.y = mod(p.y + uSpanY * 0.5, uSpanY) - uSpanY * 0.5;

    // con trỏ: đẩy ra và xoáy quanh
    vec2 d = p.xy - mouseAt(p.z);
    float dist = length(d);
    vec2 dir = d / (dist + 1e-4);
    float infl = smoothstep(3.2, 0.0, dist) * uStrength;
    p.xy += dir * infl * 1.4 + vec2(-dir.y, dir.x) * infl * 1.1;
    p.z += infl * 1.6;
    float glow = infl;

    // gợn sóng sau mỗi lần bấm
    for (int i = 0; i < ${RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age > 0.0 && age < 2.6) {
        vec2 rd = p.xy - atDepth(r.xy, p.z);
        float rl = length(rd);
        float band = exp(-pow((rl - age * 5.5) * 1.5, 2.0)) * (1.0 - age / 2.6);
        p.xy += rd / (rl + 1e-4) * band * 0.9;
        p.z += band * 1.4;
        glow += band;
      }
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.6 + aSeed * 40.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + glow * 1.3) * (14.0 / -mv.z);

    vec3 c = aTone < 0.5 ? uC0 : aTone < 1.5 ? uC1 : aTone < 2.5 ? uC2 : uC3;
    vColor = mix(c, uC0, clamp(glow, 0.0, 1.0) * 0.7);
    vAlpha = twinkle * (0.5 + glow * 0.7) * smoothstep(-22.0, -5.0, mv.z);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.7) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

const STAFF_VERT = /* glsl */ `
  ${MOUSE_AT_DEPTH}
  uniform float uTime;
  uniform float uScroll;
  attribute float aLine;
  varying float vEdge;
  void main() {
    vec3 p = position;
    float t = uTime * 0.5;
    // năm dòng kẻ uốn sóng chậm, lệch pha nhẹ để khuông "thở"
    p.y += sin(p.x * 0.32 + t + aLine * 0.18) * 0.55 + sin(p.x * 0.11 - t * 0.6) * 0.4;
    p.y += uScroll * 0.6;
    p.z += cos(p.x * 0.2 + t * 0.7) * 0.8;
    // con trỏ hút dòng kẻ về phía nó
    vec2 m = mouseAt(p.z);
    float dx = p.x - m.x;
    float pull = exp(-dx * dx * 0.22) * uStrength;
    p.y += (m.y - p.y) * pull * 0.45;
    p.z += pull * 1.2;
    vEdge = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const STAFF_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vEdge;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vEdge);
  }
`;

const ORB_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
    float a = pow(max(0.0, 1.0 - d), 2.4) * uOpacity * pulse;
    gl_FragColor = vec4(mix(uColor, uColor2, smoothstep(0.0, 0.8, d)), a);
  }
`;

const ORB_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NOTE_KINDS = 4;

const NOTE_VERT = /* glsl */ `
  ${MOUSE_AT_DEPTH}
  uniform float uTime;
  uniform float uScroll;
  uniform float uSpanY;
  uniform float uStretch;
  uniform vec4 uRipples[${RIPPLES}];
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  attribute vec3 aBase;
  attribute float aSeed;
  attribute float aKind;
  attribute float aScale;
  attribute float aTone;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float t = uTime;
    vec3 c = aBase;
    // bay lên chậm như giai điệu, lắc nhẹ sang ngang và theo chiều sâu
    c.y += t * (0.12 + aSeed * 0.2);
    c.x += sin(t * 0.35 + aSeed * 12.0) * 0.8;
    c.z += sin(t * 0.25 + aSeed * 7.0) * 0.8;
    c.x *= uStretch;
    c.y += uScroll * (0.35 + (c.z + 7.0) / 10.0);
    c.y = mod(c.y + uSpanY * 0.5, uSpanY) - uSpanY * 0.5;

    // con trỏ hất nốt ra và làm nốt xoay nhanh, sáng lên
    vec2 d = c.xy - mouseAt(c.z);
    float dist = length(d);
    float infl = smoothstep(3.6, 0.0, dist) * uStrength;
    c.xy += d / (dist + 1e-4) * infl * 1.8;
    c.z += infl * 1.2;
    float glow = infl;
    for (int i = 0; i < ${RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age > 0.0 && age < 2.6) {
        vec2 rd = c.xy - atDepth(r.xy, c.z);
        float rl = length(rd);
        float band = exp(-pow((rl - age * 5.5) * 1.3, 2.0)) * (1.0 - age / 2.6);
        c.xy += rd / (rl + 1e-4) * band * 1.2;
        c.z += band * 1.5;
        glow += band;
      }
    }

    // lật quanh trục đứng (thấy rõ là vật 3D) và lắc quanh trục nhìn
    float dir = aSeed > 0.5 ? 1.0 : -1.0;
    float ay = sin(t * 0.4 + aSeed * 10.0) * 1.1 + glow * 2.2 * dir;
    float az = sin(t * 0.5 + aSeed * 6.2831) * 0.35 + glow * 0.8 * dir;
    vec3 v = position * aScale * (1.0 + glow * 0.3);
    float cy = cos(ay);
    float sy = sin(ay);
    v = vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
    float cz = cos(az);
    float sz = sin(az);
    v = vec3(v.x * cz - v.y * sz, v.x * sz + v.y * cz, v.z);

    vec4 mv = modelViewMatrix * vec4(c + v, 1.0);
    gl_Position = projectionMatrix * mv;
    vUv = vec2((uv.x + aKind) / ${NOTE_KINDS}.0, uv.y);
    vec3 col = aTone < 0.5 ? uC0 : aTone < 1.5 ? uC1 : aTone < 2.5 ? uC2 : uC3;
    vColor = mix(col, uC0, clamp(glow, 0.0, 1.0) * 0.8);
    vAlpha = (0.6 + glow * 0.6) * smoothstep(-22.0, -5.0, mv.z) * (0.75 + 0.25 * sin(t * 1.3 + aSeed * 30.0));
  }
`;

const NOTE_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uAtlas, vUv).a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/**
 * Vẽ 4 kiểu nốt (đen, móc đơn, móc đôi, cặp móc đơn nối dây) màu trắng có quầng mờ lên một dải ô 256px. Chỉ dùng kênh
 * alpha (màu tô trong shader), tự vẽ bằng hình để không phụ thuộc font có ký tự nhạc.
 */
function paintNoteAtlas() {
  const cell = 256;
  const cv = document.createElement('canvas');
  cv.width = cell * NOTE_KINDS;
  cv.height = cell;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.fillStyle = 'white';
  g.strokeStyle = 'white';
  g.lineCap = 'round';
  g.shadowColor = 'white';
  g.shadowBlur = 14;

  const head = (x: number, y: number) => {
    g.beginPath();
    g.ellipse(x, y, 30, 21, -0.4, 0, Math.PI * 2);
    g.fill();
  };
  const stem = (x: number, y1: number, y2: number) => {
    g.fillRect(x - 4, y2, 8, y1 - y2);
  };
  const flag = (x: number, y: number) => {
    g.beginPath();
    g.moveTo(x + 3, y);
    g.bezierCurveTo(x + 10, y + 34, x + 58, y + 44, x + 34, y + 104);
    g.bezierCurveTo(x + 44, y + 60, x + 22, y + 46, x + 3, y + 40);
    g.closePath();
    g.fill();
  };

  // 0: nốt đen
  head(108, 186);
  stem(132, 180, 44);
  // 1: nốt móc đơn
  g.translate(cell, 0);
  head(96, 186);
  stem(120, 180, 40);
  flag(120, 40);
  // 2: nốt móc đôi
  g.translate(cell, 0);
  head(96, 190);
  stem(120, 184, 34);
  flag(120, 34);
  flag(120, 76);
  // 3: hai nốt móc đơn nối dây
  g.translate(cell, 0);
  head(62, 196);
  head(176, 176);
  stem(86, 190, 58);
  stem(200, 170, 40);
  g.beginPath();
  g.moveTo(82, 58);
  g.lineTo(204, 38);
  g.lineTo(204, 64);
  g.lineTo(82, 84);
  g.closePath();
  g.fill();
  return cv;
}

export default function DreamField3D() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // máy không có WebGL: trang vẫn đầy đủ, chỉ thiếu nền trang trí
    }
    const canvas = renderer.domElement;
    host.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const count = coarse || window.innerWidth < 720 ? 900 : 2600;
    const { w: initW, h: initH } = viewSize(window.innerWidth / window.innerHeight);
    const spanY = initH * 1.6;

    // ---- trường hạt ----
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const tones = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * initW * 1.5;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spanY;
      positions[i * 3 + 2] = -7 + Math.random() * 10;
      seeds[i] = Math.random();
      const r = Math.random();
      tones[i] = r < 0.42 ? 0 : r < 0.72 ? 1 : r < 0.88 ? 2 : 3;
      sizes[i] = 2.5 + Math.pow(Math.random(), 3) * 9;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    pGeo.setAttribute('aTone', new THREE.BufferAttribute(tones, 1));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const shared = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uCam: { value: camera.position.clone() },
      uStrength: { value: 0 },
    };
    const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...shared,
        uPixelRatio: { value: 1 },
        uSpanY: { value: spanY },
        uRipples: { value: ripples },
        uOpacity: { value: 1 },
        uC0: { value: new THREE.Color() },
        uC1: { value: new THREE.Color() },
        uC2: { value: new THREE.Color() },
        uC3: { value: new THREE.Color() },
      },
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    scene.add(points);

    // ---- năm dòng kẻ khuông ----
    const staffGeo = new THREE.BufferGeometry();
    const sPos: number[] = [];
    const sUv: number[] = [];
    const sLine: number[] = [];
    const sIndex: number[] = [];
    for (let line = 0; line < 5; line++) {
      for (let i = 0; i < STAFF_POINTS; i++) {
        const u = i / (STAFF_POINTS - 1);
        sPos.push((u - 0.5) * initW * 1.4, (line - 2) * 0.42 - 0.6, -2.5);
        sUv.push(u, line / 4);
        sLine.push(line);
        if (i > 0) sIndex.push(line * STAFF_POINTS + i - 1, line * STAFF_POINTS + i);
      }
    }
    staffGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
    staffGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
    staffGeo.setAttribute('aLine', new THREE.Float32BufferAttribute(sLine, 1));
    staffGeo.setIndex(sIndex);
    const staffMat = new THREE.ShaderMaterial({
      vertexShader: STAFF_VERT,
      fragmentShader: STAFF_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { ...shared, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.4 } },
    });
    const staff = new THREE.LineSegments(staffGeo, staffMat);
    staff.frustumCulled = false;
    staff.rotation.z = -0.08;
    scene.add(staff);

    // ---- quầng sáng theo con trỏ ----
    const orbGeo = new THREE.PlaneGeometry(4.2, 4.2);
    const orbMat = new THREE.ShaderMaterial({
      vertexShader: ORB_VERT,
      fragmentShader: ORB_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uColor: { value: new THREE.Color() },
        uColor2: { value: new THREE.Color() },
        uOpacity: { value: 0 },
      },
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(999, 999, 0.6);
    scene.add(orb);

    // ---- nốt nhạc 3D: một lần vẽ cho mọi nốt (instancing), hình nốt lấy từ dải ảnh vẽ sẵn ----
    const noteCount = coarse || window.innerWidth < 720 ? 20 : 46;
    const atlas = new THREE.CanvasTexture(paintNoteAtlas());
    atlas.anisotropy = 4;
    const notePlane = new THREE.PlaneGeometry(1, 1);
    const nGeo = new THREE.InstancedBufferGeometry();
    nGeo.index = notePlane.index;
    nGeo.setAttribute('position', notePlane.getAttribute('position'));
    nGeo.setAttribute('uv', notePlane.getAttribute('uv'));
    const nBase = new Float32Array(noteCount * 3);
    const nSeed = new Float32Array(noteCount);
    const nKind = new Float32Array(noteCount);
    const nScale = new Float32Array(noteCount);
    const nTone = new Float32Array(noteCount);
    for (let i = 0; i < noteCount; i++) {
      nBase[i * 3] = (Math.random() - 0.5) * initW * 1.3;
      nBase[i * 3 + 1] = (Math.random() - 0.5) * spanY;
      nBase[i * 3 + 2] = -7 + Math.random() * 8.5;
      nSeed[i] = Math.random();
      nKind[i] = Math.floor(Math.random() * NOTE_KINDS);
      nScale[i] = 0.55 + Math.random() * 0.75;
      const r = Math.random();
      nTone[i] = r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3;
    }
    nGeo.setAttribute('aBase', new THREE.InstancedBufferAttribute(nBase, 3));
    nGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(nSeed, 1));
    nGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(nKind, 1));
    nGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(nScale, 1));
    nGeo.setAttribute('aTone', new THREE.InstancedBufferAttribute(nTone, 1));
    nGeo.instanceCount = noteCount;
    const nMat = new THREE.ShaderMaterial({
      vertexShader: NOTE_VERT,
      fragmentShader: NOTE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...shared,
        uSpanY: { value: spanY },
        uStretch: { value: 1 },
        uRipples: pMat.uniforms.uRipples,
        uAtlas: { value: atlas },
        uOpacity: { value: 1 },
        uC0: pMat.uniforms.uC0,
        uC1: pMat.uniforms.uC1,
        uC2: pMat.uniforms.uC2,
        uC3: pMat.uniforms.uC3,
      },
    });
    const notes = new THREE.Mesh(nGeo, nMat);
    notes.frustumCulled = false;
    scene.add(notes);

    // ---- màu theo theme ----
    let palette = readPalette();
    const applyPalette = () => {
      palette = readPalette();
      const u = pMat.uniforms;
      u.uC0.value.copy(palette.brass);
      u.uC1.value.copy(palette.accent);
      u.uC2.value.copy(palette.rose);
      u.uC3.value.copy(palette.deep);
      // nền tối: cộng sáng cho cảm giác phát quang; nền giấy sáng: phủ thường, nhạt hơn để chữ vẫn dễ đọc
      const blending = palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      pMat.blending = staffMat.blending = orbMat.blending = nMat.blending = blending;
      pMat.needsUpdate = staffMat.needsUpdate = orbMat.needsUpdate = nMat.needsUpdate = true;
      nMat.uniforms.uOpacity.value = palette.dark ? 0.75 : 0.58;
      u.uOpacity.value = palette.dark ? 0.9 : 0.5;
      staffMat.uniforms.uColor.value.copy(palette.dark ? palette.brass : palette.deep);
      staffMat.uniforms.uOpacity.value = palette.dark ? 0.42 : 0.28;
      orbMat.uniforms.uColor.value.copy(palette.brass);
      orbMat.uniforms.uColor2.value.copy(palette.accent);
    };
    applyPalette();
    const themeObserver = new MutationObserver(() => {
      applyPalette();
      if (!running) renderer.render(scene, camera);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- kích thước ----
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      pMat.uniforms.uPixelRatio.value = dpr;
      // màn hình rộng ra thì kéo giãn trường hạt và khuông theo, khỏi phải dựng lại
      const sx = Math.max(1, viewSize(camera.aspect).w / initW);
      points.scale.x = staff.scale.x = sx;
      nMat.uniforms.uStretch.value = sx; // nốt chỉ giãn vị trí, không giãn hình
      if (!running) renderer.render(scene, camera);
    };

    // ---- con trỏ, cuộn, bấm ----
    const ndc = new THREE.Vector2(0, 0);
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const target = new THREE.Vector2(999, 999);
    let lastMove = -1e9;
    let hasPointer = false;
    let rippleIdx = 0;

    const toWorld = (x: number, y: number) => {
      ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) target.set(hit.x, hit.y);
    };
    const onMove = (e: PointerEvent) => {
      toWorld(e.clientX, e.clientY);
      if (!hasPointer) shared.uMouse.value.copy(target);
      hasPointer = true;
      lastMove = performance.now();
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      ripples[rippleIdx].set(target.x, target.y, shared.uTime.value, 0);
      rippleIdx = (rippleIdx + 1) % RIPPLES;
    };
    const onLeave = () => {
      lastMove = -1e9;
    };

    let scrollTarget = window.scrollY;
    const onScroll = () => {
      scrollTarget = window.scrollY;
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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(tick(), 0.05);
      shared.uTime.value += dt;
      const now = performance.now();

      // chuột đi theo mượt; lâu không động thì lực xoáy dịu dần
      const k = 1 - Math.pow(0.0008, dt);
      shared.uMouse.value.lerp(target, k);
      const active = now - lastMove < 2200;
      const strengthTarget = hasPointer ? (active ? 1 : 0.25) : 0;
      shared.uStrength.value += (strengthTarget - shared.uStrength.value) * (1 - Math.pow(0.05, dt));

      // máy quay nghiêng theo chuột
      const camK = 1 - Math.pow(0.04, dt);
      camera.position.x += (ndc.x * 0.9 * (hasPointer ? 1 : 0) - camera.position.x) * camK;
      camera.position.y += (ndc.y * 0.55 * (hasPointer ? 1 : 0) - camera.position.y) * camK;
      camera.lookAt(0, 0, 0);
      shared.uCam.value.copy(camera.position);

      shared.uScroll.value += (scrollTarget * 0.004 - shared.uScroll.value) * (1 - Math.pow(0.02, dt));

      orb.position.x = shared.uMouse.value.x;
      orb.position.y = shared.uMouse.value.y;
      orbMat.uniforms.uOpacity.value = shared.uStrength.value * (palette.dark ? 0.32 : 0.2);

      renderer.render(scene, camera);
    };

    const start = () => {
      if (running || motion.matches || document.hidden) return;
      running = true;
      tick();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => {
      if (motion.matches) {
        stop();
        shared.uStrength.value = 0;
        orbMat.uniforms.uOpacity.value = 0;
        renderer.render(scene, camera);
      } else start();
    };

    resize();
    shared.uTime.value = 12; // khung tĩnh (giảm chuyển động) đã có hạt rải đều, không bắt đầu từ thời điểm 0
    renderer.render(scene, camera);
    start();

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onMotion);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', onMotion);
      themeObserver.disconnect();
      pGeo.dispose();
      pMat.dispose();
      staffGeo.dispose();
      staffMat.dispose();
      orbGeo.dispose();
      orbMat.dispose();
      notePlane.dispose();
      nGeo.dispose();
      nMat.dispose();
      atlas.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="gh-dream" aria-hidden="true" />;
}
