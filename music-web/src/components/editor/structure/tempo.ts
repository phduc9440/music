/**
 * Chỉ số nhịp (tempo) hiện ở đầu bản nhạc, ví dụ "♩ = 100" và chữ tốc độ ("Allegro"). Lấy từ <direction> đầu tiên
 * có <metronome> hoặc <sound tempo>; sửa cả hai để hiển thị và phát nhạc khớp nhau.
 */
import { childOf, commitEdit } from '../core/commands';
import type { EditResult, Touched } from '../core/commands';
import { DURATION_QUARTERS } from '../notes/durations';
import type { DurationType } from '../notes/durations';
import type { ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

export interface TempoInfo {
  bpm: number;
  unit: DurationType;
  dotted: boolean;
  /** Chữ tốc độ kèm theo (có thể rỗng). */
  words: string;
}

export const BPM_MIN = 20;
export const BPM_MAX = 400;

const isUnit = (v: string): v is DurationType => v in DURATION_QUARTERS;

interface Found {
  direction: Element;
  partIndex: number;
  measureIndex: number;
}

const findTempo = (doc: ScoreDocument): Found | null => {
  const measures = doc.getMeasures(0);
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
    for (const direction of Array.from(measures[measureIndex].children).filter((c) => c.tagName === 'direction')) {
      const hasMetronome = direction.getElementsByTagName('metronome').length > 0;
      const sound = childOf(direction, 'sound');
      if (hasMetronome || sound?.getAttribute('tempo')) return { direction, partIndex: 0, measureIndex };
    }
  }
  return null;
};

/** Đọc chỉ số nhịp đầu tiên; null nếu bản nhạc không có. */
export function readTempo(doc: ScoreDocument): TempoInfo | null {
  const found = findTempo(doc);
  if (!found) return null;
  const { direction } = found;
  const metronome = direction.getElementsByTagName('metronome')[0];
  const words = direction.getElementsByTagName('words')[0]?.textContent?.trim() ?? '';
  if (metronome) {
    const unitText = metronome.getElementsByTagName('beat-unit')[0]?.textContent?.trim() ?? 'quarter';
    const bpm = parseFloat(metronome.getElementsByTagName('per-minute')[0]?.textContent ?? '');
    if (Number.isFinite(bpm)) {
      return {
        bpm,
        unit: isUnit(unitText) ? unitText : 'quarter',
        dotted: metronome.getElementsByTagName('beat-unit-dot').length > 0,
        words,
      };
    }
  }
  const tempo = Number(childOf(direction, 'sound')?.getAttribute('tempo'));
  return Number.isFinite(tempo) && tempo > 0 ? { bpm: tempo, unit: 'quarter', dotted: false, words } : null;
}

/** Sửa chỉ số nhịp (một bước hoàn tác được). */
export function setTempo(doc: ScoreDocument, info: TempoInfo): EditResult {
  const found = findTempo(doc);
  if (!found) return { ok: false, reason: 'empty' };
  if (!Number.isFinite(info.bpm) || info.bpm < BPM_MIN || info.bpm > BPM_MAX) return { ok: false, reason: 'badValue' };
  const current = readTempo(doc);
  const bpm = Math.round(info.bpm * 10) / 10;
  const words = info.words.trim();
  if (
    current &&
    current.bpm === bpm &&
    current.unit === info.unit &&
    current.dotted === info.dotted &&
    current.words === words
  ) {
    return { ok: false, reason: 'unchanged' };
  }

  const { direction } = found;
  const owner = direction.ownerDocument;
  const touched: Touched = new Map([[`0|${found.measureIndex}`, { partIndex: 0, measureIndex: found.measureIndex }]]);
  const command = commitEdit(doc, t('editor.cmd.tempo'), touched, [], () => {
    // <metronome>
    let metronome = direction.getElementsByTagName('metronome')[0];
    if (!metronome) {
      const type = owner.createElement('direction-type');
      metronome = owner.createElement('metronome');
      type.appendChild(metronome);
      const sound = childOf(direction, 'sound');
      if (sound) sound.before(type);
      else direction.appendChild(type);
    }
    metronome.replaceChildren();
    const unit = owner.createElement('beat-unit');
    unit.textContent = info.unit;
    metronome.appendChild(unit);
    if (info.dotted) metronome.appendChild(owner.createElement('beat-unit-dot'));
    const perMinute = owner.createElement('per-minute');
    perMinute.textContent = String(bpm);
    metronome.appendChild(perMinute);

    // <sound tempo> luôn tính theo số nốt đen mỗi phút
    const quarters = DURATION_QUARTERS[info.unit] * (info.dotted ? 1.5 : 1);
    let sound = childOf(direction, 'sound');
    if (!sound) {
      sound = owner.createElement('sound');
      direction.appendChild(sound);
    }
    sound.setAttribute('tempo', String(Math.round(bpm * quarters * 100) / 100));

    // chữ tốc độ
    const existing = direction.getElementsByTagName('words')[0];
    if (!words) {
      if (existing) {
        const holder = existing.parentElement;
        existing.remove();
        if (holder && holder.tagName === 'direction-type' && holder.children.length === 0) holder.remove();
      }
    } else if (existing) {
      existing.textContent = words;
    } else {
      const type = owner.createElement('direction-type');
      const el = owner.createElement('words');
      el.textContent = words;
      type.appendChild(el);
      const first = Array.from(direction.children).find((c) => c.tagName === 'direction-type');
      if (first) first.before(type);
      else direction.insertBefore(type, direction.firstChild);
    }
  });
  return { ok: true, command };
}
