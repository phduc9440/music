import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
 * Dải lụa 3D làm nền trang làm việc (three.js, tải lười): vài dải lụa rộng uốn lượn và xoắn chậm trong không gian, mặt
 * lụa óng ánh nhiều màu như màng mỏng (rượu vang → hồng → đồng thau theo góc nhìn). Con trỏ như một làn gió: lụa gần
 * chuột gợn sóng và dạt ra, vệt sáng bóng chạy theo chuột như có đèn rọi. Bấm chuột thổi một đợt gió lan qua các dải.
 * Phủ kín khung nhìn và ở yên khi cuộn; cuộn trang thì lụa trôi dọc theo chiều dài dải, và nhạt bớt khi đã xuống
 * phần bảng điều khiển để chữ ngoài thẻ vẫn dễ đọc.
 * Màu đọc từ token CSS, đổi theo theme. Giảm chuyển động: một khung tĩnh. Dừng khi ra khỏi màn hình hoặc ẩn tab.
 */

const FOV = 45;
const CAM_Z = 10;
const GUSTS = 3;

const SILK_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec3 uCam;
  uniform float uStrength;
  uniform vec4 uGusts[${GUSTS}];
  uniform float uPhase;
  uniform float uAmp;
  uniform float uTwist;
  uniform float uScroll;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vRipple;

  vec2 atDepth(vec2 m, float z) {
    return uCam.xy + (m - uCam.xy) * (uCam.z - z) / uCam.z;
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uTime * 0.22 + uScroll;

    // xoắn quanh đường giữa dải (như lụa lật mặt), rồi uốn sóng theo chiều dài
    float twist = sin(p.x * 0.23 + t * 1.3 + uPhase) * uTwist;
    float c = cos(twist);
    float s = sin(twist);
    p.yz = vec2(p.y * c - p.z * s, p.y * s + p.z * c);
    p.y += sin(p.x * 0.34 + t * 1.7 + uPhase) * uAmp + sin(p.x * 0.11 - t + uPhase * 2.0) * uAmp * 0.8;
    p.z += cos(p.x * 0.27 + t * 1.1 + uPhase) * 0.9;

    vec4 world = modelMatrix * vec4(p, 1.0);

    // gió từ con trỏ: dạt ra xa chuột và gợn vòng tròn lan quanh nó
    vec2 m = atDepth(uMouse, world.z);
    vec2 d = world.xy - m;
    float dist = length(d);
    float near = exp(-dist * dist * 0.09) * uStrength;
    float ripple = sin(dist * 2.4 - uTime * 3.2) * exp(-dist * 0.45) * uStrength;
    world.xy += d / (dist + 0.6) * near * 0.45;
    world.z += near * 0.8 + ripple * 0.16;
    float energy = near + abs(ripple) * 0.4;

    // đợt gió sau mỗi lần bấm: một vòng sóng lan ra
    for (int i = 0; i < ${GUSTS}; i++) {
      vec4 g = uGusts[i];
      float age = uTime - g.z;
      if (age > 0.0 && age < 3.0) {
        float gd = length(world.xy - atDepth(g.xy, world.z));
        float band = exp(-pow((gd - age * 6.0) * 0.9, 2.0)) * (1.0 - age / 3.0);
        world.z += band * 1.8;
        world.y += band * 0.6;
        energy += band;
      }
    }

    vRipple = energy;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SILK_FRAG = /* glsl */ `
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uSheen;
  uniform vec3 uCam;
  uniform vec3 uLight;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDark;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vRipple;

  void main() {
    // pháp tuyến từ đạo hàm màn hình (lụa mịn vì lưới dày), lật về phía máy quay
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 v = normalize(uCam - vWorld);
    if (dot(n, v) < 0.0) n = -n;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);

    // màng mỏng: màu trôi dọc dải và đổi theo góc nhìn
    // dải màu tuần hoàn mượt (cos) thay cho fract: không có chỗ nhảy màu đột ngột gây răng cưa ở mép
    float k = 0.5 - 0.5 * cos(6.2831 * (vUv.x * 0.8 + fres * 0.65 + uTime * 0.02));
    vec3 film = k < 0.5 ? mix(uC0, uC1, k * 2.0) : mix(uC1, uC2, (k - 0.5) * 2.0);

    // vệt sáng bóng từ "đèn" đặt ở con trỏ
    vec3 l = normalize(uLight - vWorld);
    float spec = pow(max(dot(reflect(-l, n), v), 0.0), 36.0);
    // nền sáng: ánh sáng chỉ làm sáng lên chứ không tối đi, để lụa không xám đục trên giấy ngà
    float diff = mix(0.85, 0.55, uDark) + mix(0.25, 0.45, uDark) * max(dot(n, l), 0.0);

    vec3 col = film * diff + uSheen * (spec * 0.9 + clamp(vRipple, 0.0, 1.0) * 0.25);
    float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float a = (0.28 + fres * 0.55 + spec * 0.5) * edge * ends * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`;

interface RibbonSpec {
  y: number;
  z: number;
  h: number;
  rot: number;
  phase: number;
  amp: number;
  twist: number;
}

const RIBBONS: RibbonSpec[] = [
  { y: 1.6, z: -2.5, h: 2.4, rot: -0.16, phase: 0, amp: 0.7, twist: 1.1 },
  { y: 0.2, z: -0.8, h: 1.6, rot: 0.08, phase: 2.1, amp: 0.55, twist: 1.5 },
  { y: -1.4, z: -4, h: 3.0, rot: -0.05, phase: 4.2, amp: 0.9, twist: 0.8 },
  { y: 2.8, z: -6, h: 2.0, rot: 0.12, phase: 5.6, amp: 0.6, twist: 1.3 },
];

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const c = (name: string) => new THREE.Color(cs.getPropertyValue(name).trim() || undefined);
  return {
    primary: c('--ui-primary'),
    rose: c('--ui-hue-rose'),
    brass: c('--ui-cta'),
    deep: c('--ui-velvet'),
    dark: document.documentElement.dataset.theme === 'dark',
  };
}

export default function SilkRibbons3D() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // không có WebGL: đầu trang vẫn đủ, chỉ thiếu lụa
    }
    const canvas = renderer.domElement;
    host.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);

    const shared = {
      uTime: { value: 14 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uCam: { value: camera.position.clone() },
      uStrength: { value: 0 },
      uLight: { value: new THREE.Vector3(3, 3, 6) },
      uGusts: { value: Array.from({ length: GUSTS }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uOpacity: { value: 1 },
      uDark: { value: 0 },
      uScroll: { value: 0 },
      uC0: { value: new THREE.Color() },
      uC1: { value: new THREE.Color() },
      uC2: { value: new THREE.Color() },
      uSheen: { value: new THREE.Color() },
    };

    const segX = window.innerWidth < 720 ? 110 : 200;
    const geos: THREE.PlaneGeometry[] = [];
    const mats: THREE.ShaderMaterial[] = [];
    const meshes = RIBBONS.map((r) => {
      const geo = new THREE.PlaneGeometry(30, r.h, segX, 40);
      const mat = new THREE.ShaderMaterial({
        vertexShader: SILK_VERT,
        fragmentShader: SILK_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared,
          uPhase: { value: r.phase },
          uAmp: { value: r.amp },
          uTwist: { value: r.twist },
        },
      });
      geos.push(geo);
      mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, r.y, r.z);
      mesh.rotation.z = r.rot;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });

    let baseOpacity = 0.62;
    const applyColors = () => {
      const c = readColors();
      shared.uC0.value.copy(c.dark ? c.deep : c.primary);
      shared.uC1.value.copy(c.rose);
      shared.uC2.value.copy(c.brass);
      shared.uSheen.value.copy(c.dark ? c.brass : c.primary);
      // nền tối: cộng sáng cho lụa phát quang; nền giấy sáng: phủ thường và nhạt hơn để chữ đầu trang vẫn rõ
      baseOpacity = c.dark ? 0.85 : 0.62;
      shared.uDark.value = c.dark ? 1 : 0;
      for (const m of mats) {
        m.blending = c.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    };
    applyColors();

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // màn hẹp (điện thoại): thu dải lụa lại cho vừa khung
      const s = Math.min(1, Math.max(0.6, camera.aspect / 1.6));
      for (const mesh of meshes) mesh.scale.set(1, s, 1);
      renderer.render(scene, camera);
    };

    // ---- con trỏ: toạ độ trong khung (khung không nhận sự kiện nên nghe trên window) ----
    const ndc = new THREE.Vector2();
    const target = new THREE.Vector2(99, 99);
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let inside = false;
    let lastMove = -1e9;
    let gustIdx = 0;

    const locate = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      ndc.set(x * 2 - 1, -y * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) target.set(hit.x, hit.y);
      return inside;
    };
    const onMove = (e: PointerEvent) => {
      if (locate(e)) {
        if (shared.uStrength.value < 0.01) shared.uMouse.value.copy(target);
        lastMove = performance.now();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!locate(e)) return;
      shared.uGusts.value[gustIdx].set(target.x, target.y, shared.uTime.value, 0);
      gustIdx = (gustIdx + 1) % GUSTS;
    };

    // ---- cuộn trang: lụa trôi theo, nhạt bớt khi đã qua phần đầu trang ----
    let scrollTarget = window.scrollY;
    const onScroll = () => {
      scrollTarget = window.scrollY;
    };
    const applyScroll = (k: number) => {
      shared.uScroll.value += (scrollTarget * 0.0025 - shared.uScroll.value) * k;
      const dim = Math.min(1, scrollTarget / 700);
      shared.uOpacity.value = baseOpacity * (1 - dim * 0.4);
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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(tick(), 0.05);
      shared.uTime.value += dt;
      const now = performance.now();

      shared.uMouse.value.lerp(target, 1 - Math.pow(0.002, dt));
      applyScroll(1 - Math.pow(0.03, dt));
      const want = inside && now - lastMove < 2500 ? 1 : 0;
      shared.uStrength.value += (want - shared.uStrength.value) * (1 - Math.pow(0.08, dt));

      // đèn rọi đi theo chuột, lùi ra trước mặt lụa; không có chuột thì đèn tự lượn chậm
      const lx = want ? shared.uMouse.value.x : Math.sin(shared.uTime.value * 0.3) * 5;
      const ly = want ? shared.uMouse.value.y : 2 + Math.cos(shared.uTime.value * 0.23) * 1.5;
      shared.uLight.value.x += (lx - shared.uLight.value.x) * 0.08;
      shared.uLight.value.y += (ly - shared.uLight.value.y) * 0.08;

      const k = 1 - Math.pow(0.05, dt);
      camera.position.x += ((want ? ndc.x * 0.7 : 0) - camera.position.x) * k;
      camera.position.y += ((want ? ndc.y * 0.4 : 0) - camera.position.y) * k;
      camera.lookAt(0, 0.4, -3);
      shared.uCam.value.copy(camera.position);

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
    const sync = () => {
      if (motion.matches || document.hidden || !visible) {
        stop();
        if (motion.matches) {
          shared.uStrength.value = 0;
          renderer.render(scene, camera);
        }
      } else start();
    };

    const themeObserver = new MutationObserver(() => {
      applyColors();
      applyScroll(1);
      if (!running) renderer.render(scene, camera);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    applyScroll(1);
    camera.lookAt(0, 0.4, -3);
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
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="wh-silk" aria-hidden="true" />;
}
