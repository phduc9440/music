/** Tiếng gõ đếm nhịp (tổng hợp, không dùng mẫu âm): phách đầu cao hơn các phách còn lại. */
import { getMaster } from '../editor/instruments';
import type { Voice } from '../editor/instruments';

const CLICK_S = 0.06;

/** Hẹn một tiếng gõ tại thời điểm `start` (giây của context). Đi thẳng vào chuỗi chung nên không bị Mute / Solo của khuông. */
export function scheduleClick(ctx: BaseAudioContext, start: number, accent: boolean): Voice {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1320 : 880;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.4, start + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, start + CLICK_S);
  osc.connect(env).connect(getMaster(ctx));
  osc.start(start);
  osc.stop(start + CLICK_S + 0.01);
  return {
    endsAt: start + CLICK_S + 0.01,
    kill: () => {
      try {
        osc.stop(ctx.currentTime);
      } catch {
        // đã dừng
      }
    },
  };
}
