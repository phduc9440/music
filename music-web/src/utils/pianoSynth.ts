/**
 * Tiếng đàn piano tổng hợp bằng Web Audio (không cần file âm thanh): vài hoạ âm sine, bộ lọc thông thấp đóng dần như
 * dây đàn mất độ sáng, đường bao tắt dần theo hàm mũ (nốt cao tắt nhanh hơn), cộng một tiếng "búa" ngắn bằng tiếng ồn.
 * AudioContext chỉ được tạo ở lần chơi đầu tiên (luôn nằm trong một thao tác của người dùng nên trình duyệt cho phép).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master: master!, noise: noise! };
}

const PARTIALS: [ratio: number, gain: number, detune: number][] = [
  [1, 1, 0],
  [1, 0.5, 5], // một bản lệch vài cent cho tiếng dày, hơi "chorus" như hai dây cùng nốt
  [2, 0.42, 0],
  [3, 0.18, 0],
  [4.02, 0.09, 0],
  [5.03, 0.04, 0],
];

/** Chơi một nốt. `midi` 60 = Đô giữa, `velocity` 0..1. */
export function playPianoNote(midi: number, velocity = 0.8) {
  try {
    const { ctx: ac, master: out, noise: hammerBuf } = audio();
    const now = ac.currentTime;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const dur = Math.max(0.9, 3.2 - (midi - 36) * 0.045);
    const v = Math.min(1, Math.max(0.05, velocity));

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(v * 0.55, now + 0.006);
    env.gain.exponentialRampToValueAtTime(v * 0.2, now + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(Math.min(16000, f * (6 + v * 10)), now);
    lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 2.2), now + dur * 0.6);
    lp.connect(env).connect(out);

    for (const [ratio, gain, detune] of PARTIALS) {
      const osc = ac.createOscillator();
      osc.frequency.value = f * ratio;
      osc.detune.value = detune;
      const g = ac.createGain();
      g.gain.value = gain / PARTIALS.length;
      osc.connect(g).connect(lp);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }

    const hammer = ac.createBufferSource();
    hammer.buffer = hammerBuf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(9000, f * 4);
    bp.Q.value = 1.2;
    const hg = ac.createGain();
    hg.gain.value = 0.12 * v;
    hammer.connect(bp).connect(hg).connect(out);
    hammer.start(now);
  } catch {
    // trình duyệt không có Web Audio: phím vẫn sáng, chỉ không có tiếng
  }
}
