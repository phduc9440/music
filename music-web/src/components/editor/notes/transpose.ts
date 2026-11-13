/**
 * Chuyển giọng: đọc khóa nhạc đầu bài, chọn cách viết giọng mới ít dấu hóa nhất và gọi tên giọng bằng tiếng Việt.
 * Chỉ chứa hàm thuần (phần Player dùng để hiện nhãn "G trưởng → A trưởng"; phần áp dụng vào bản nhạc dùng lại ở đây).
 */
import { readPitch, refreshAccidentals, writePitch } from '../core/commands';
import type { EditResult } from '../core/commands';
import { inRange, keyAlter, pitchToMidi, spellMidiRelative } from './pitch';
import type { Pitch, Step } from './pitch';
import type { ScoreDocument } from '../core/ScoreDocument';
import { runStructural } from '../structure/structure';
import { t } from '../../../i18n/core';

/** Khóa nhạc: số dấu hóa (dương = thăng, âm = giáng) và thể trưởng / thứ. */
export interface KeySignature {
  fifths: number;
  minor: boolean;
}

export const MAX_FIFTHS = 7;

const MAJOR_TONICS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR_TONICS = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

/** Khóa nhạc khai báo đầu tiên của part đầu (mặc định Đô trưởng khi bản nhạc không khai báo). */
export function readStartingKey(doc: ScoreDocument): KeySignature {
  for (const measure of doc.getMeasures(0)) {
    const key = measure.getElementsByTagName('key')[0];
    if (!key) continue;
    const fifths = Number(key.getElementsByTagName('fifths')[0]?.textContent);
    const mode = key.getElementsByTagName('mode')[0]?.textContent?.trim().toLowerCase();
    return {
      fifths: Number.isInteger(fifths) ? Math.max(-MAX_FIFTHS, Math.min(MAX_FIFTHS, fifths)) : 0,
      minor: mode === 'minor',
    };
  }
  return { fifths: 0, minor: false };
}

/** Số dấu hóa của giọng trưởng có âm chủ ở cao độ `pitchClass` (0 = C … 11 = B): chọn cách viết ít dấu hóa nhất. */
export function fifthsOfMajorTonic(pitchClass: number): number {
  const sharpSide = (((pitchClass * 7) % 12) + 12) % 12; // 0…11 dấu thăng
  const flatSide = sharpSide - 12; // cùng âm chủ viết bằng dấu giáng
  const sharpOk = sharpSide <= MAX_FIFTHS;
  const flatOk = flatSide >= -MAX_FIFTHS;
  if (sharpOk && flatOk) return Math.abs(flatSide) < sharpSide ? flatSide : sharpSide; // hòa thì chọn dấu thăng
  return sharpOk ? sharpSide : flatSide;
}

/**
 * Số dấu hóa của giọng mới sau khi chuyển `semitones` nửa cung. Giọng thứ đi theo giọng trưởng song song của nó nên
 * cùng một công thức; hai cách viết bằng nhau (ví dụ F♯ và G♭) thì chọn dấu thăng.
 */
export function transposeFifths(fifths: number, semitones: number): number {
  const majorPitchClass = (((fifths * 7) % 12) + 12) % 12;
  return fifthsOfMajorTonic((((majorPitchClass + semitones) % 12) + 12) % 12);
}

export function transposeKey(key: KeySignature, semitones: number): KeySignature {
  return { fifths: transposeFifths(key.fifths, semitones), minor: key.minor };
}

const pretty = (tonic: string): string => tonic.replace('#', '♯').replace(/^([A-G])b$/, '$1♭');

/** Tên giọng tiếng Việt, ví dụ "G trưởng", "B♭ thứ". */
export function keyName(key: KeySignature): string {
  const index = Math.max(-MAX_FIFTHS, Math.min(MAX_FIFTHS, key.fifths)) + MAX_FIFTHS;
  return t(key.minor ? 'editor.key.minor' : 'editor.key.major', {
    tonic: pretty((key.minor ? MINOR_TONICS : MAJOR_TONICS)[index]),
  });
}

/** "+2" / "-3" / "0" (dấu trừ là ký tự "−" cho dễ nhìn). */
export const signedSemitones = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Nhãn mô tả giọng: "G trưởng → A trưởng"; chưa chuyển thì chỉ "G trưởng (giọng gốc)". */
export function describeTranspose(key: KeySignature, semitones: number): string {
  if (semitones === 0) return t('editor.key.original', { key: keyName(key) });
  return `${keyName(key)} → ${keyName(transposeKey(key, semitones))}`;
}

// ------------------------------------------------------------------ áp dụng vào bản nhạc

const childEl = (parent: Element, tag: string): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag);

/** Khóa nhạc (số dấu hóa) trước và sau khi chuyển, tại một vị trí của một part. */
interface KeyPair {
  from: number;
  to: number;
}

/**
 * Cao độ viết mới của một nốt sau khi dịch `semitones` nửa cung. Nốt giữ vai trò của nó so với khóa nhạc (thuộc giọng,
 * nâng hoặc hạ) nên nốt thuộc giọng được viết theo khóa mới còn nốt ngoài giọng vẫn là nốt nâng/hạ của giọng mới.
 * Giữ phần vi cung (±0,5).
 */
function shiftPitch(pitch: Pitch, semitones: number, key: KeyPair): Pitch {
  const fraction = pitch.alter - Math.trunc(pitch.alter); // 0 hoặc ±0,5
  const whole = pitch.alter - fraction;
  const target = pitchToMidi(pitch) - fraction + semitones;
  const spelled = spellMidiRelative(target, key.to, whole - keyAlter(key.from, pitch.step));
  return { ...spelled, alter: spelled.alter + fraction };
}

/** Ghi lại một tên bậc + dấu hóa của hợp âm (<root> hoặc <bass>) theo cao độ mới. */
function shiftChordNote(holder: Element, stepTag: string, alterTag: string, semitones: number, key: KeyPair): void {
  const stepEl = childEl(holder, stepTag);
  const step = stepEl?.textContent?.trim() ?? '';
  const pitchClass: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (!stepEl || !(step in pitchClass)) return;
  const alter = Math.round(Number(childEl(holder, alterTag)?.textContent ?? 0) || 0);
  const target = 60 + pitchClass[step] + alter + semitones; // quãng tám chỉ để tính, hợp âm không có quãng tám
  const spelled = spellMidiRelative(target, key.to, alter - keyAlter(key.from, step as Step));
  stepEl.textContent = spelled.step;
  const alterEl = childEl(holder, alterTag);
  if (spelled.alter === 0) alterEl?.remove();
  else if (alterEl) alterEl.textContent = String(spelled.alter);
  else {
    const created = holder.ownerDocument.createElement(alterTag);
    created.textContent = String(spelled.alter);
    stepEl.after(created);
  }
}

/** Thêm khóa nhạc rõ ràng vào ô đầu của một part chưa khai báo khóa (đang ngầm hiểu là Đô trưởng hoặc theo part đầu). */
function insertKey(firstMeasure: Element, fifths: number): void {
  const owner = firstMeasure.ownerDocument;
  let attributes = childEl(firstMeasure, 'attributes');
  if (!attributes) {
    attributes = owner.createElement('attributes');
    firstMeasure.insertBefore(attributes, firstMeasure.firstChild);
  }
  const key = owner.createElement('key');
  const fifthsEl = owner.createElement('fifths');
  fifthsEl.textContent = String(fifths);
  key.appendChild(fifthsEl);
  const divisions = childEl(attributes, 'divisions');
  if (divisions) divisions.after(key);
  else attributes.insertBefore(key, attributes.firstChild);
}

/**
 * Chuyển giọng cả bản nhạc `semitones` nửa cung (−12…+12, khác 0) thành một lệnh hoàn tác được. Mọi part dịch cùng số nửa
 * cung (nhạc cụ chuyển âm giữ nguyên độ chuyển âm riêng nên nốt viết và nốt nghe cùng dịch): khóa nhạc từng part đổi sang cách
 * viết ít dấu hóa nhất, nốt được viết lại theo khóa mới, dấu hóa hiển thị tính lại, ký hiệu hợp âm dịch theo.
 * Có nốt (viết hoặc nghe) vượt A0–C8 thì không sửa gì và trả `range`.
 */
export function transposeDocument(doc: ScoreDocument, semitones: number): EditResult {
  if (!Number.isInteger(semitones) || semitones === 0 || Math.abs(semitones) > 12) {
    return { ok: false, reason: 'unchanged' };
  }
  const n = semitones;

  // Gom hết thông tin theo khóa CŨ trước khi sửa DOM (keyAtPart đọc từ DOM)
  const notes: { element: Element; pitch: Pitch; key: KeyPair }[] = [];
  const touched = new Set<string>();
  for (const info of doc.notes) {
    if (info.isRest) continue;
    const pitch = readPitch(info.element);
    if (!pitch) continue; // nốt không có cao độ (gõ nhịp) giữ nguyên
    if (info.midi !== null && !inRange(info.midi + n)) return { ok: false, reason: 'range' };
    if (info.soundingMidi !== null && !inRange(info.soundingMidi + n)) return { ok: false, reason: 'range' };
    const from = doc.keyAtPart(info.partIndex, info.measureIndex);
    notes.push({ element: info.element, pitch, key: { from, to: transposeFifths(from, n) } });
    touched.add(`${info.partIndex}|${info.measureIndex}`);
  }
  if (notes.length === 0) return { ok: false, reason: 'empty' };

  const keys: { fifthsEl: Element; value: number; cancel: Element[] }[] = [];
  const missing: { part: number; fifths: number }[] = [];
  const chords: { holder: Element; stepTag: string; alterTag: string; key: KeyPair }[] = [];
  for (let part = 0; part < doc.partCount; part++) {
    const measures = doc.getMeasures(part);
    let declared = false;
    measures.forEach((measure, index) => {
      for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
        for (const key of Array.from(attributes.children).filter((c) => c.tagName === 'key')) {
          const fifthsEl = childEl(key, 'fifths');
          const old = Number(fifthsEl?.textContent);
          if (!fifthsEl || !Number.isInteger(old)) continue; // khóa không theo dấu hóa (key-step) giữ nguyên
          if (index === 0) declared = true;
          keys.push({
            fifthsEl,
            value: transposeFifths(old, n),
            cancel: Array.from(key.children).filter((c) => c.tagName === 'cancel'),
          });
        }
      }
      for (const harmony of Array.from(measure.getElementsByTagName('harmony'))) {
        const from = doc.keyAtPart(part, index);
        const key = { from, to: transposeFifths(from, n) };
        const root = childEl(harmony, 'root');
        const bass = childEl(harmony, 'bass');
        if (root) chords.push({ holder: root, stepTag: 'root-step', alterTag: 'root-alter', key });
        if (bass) chords.push({ holder: bass, stepTag: 'bass-step', alterTag: 'bass-alter', key });
      }
    });
    const implicit = transposeFifths(doc.keyAtPart(part, 0), n);
    if (!declared && implicit !== 0) missing.push({ part, fifths: implicit });
  }

  const start = readStartingKey(doc);
  const label = t('editor.cmd.transpose', { semitones: signedSemitones(n), description: describeTranspose(start, n) });
  return runStructural(doc, label, () => {
    for (const k of keys) {
      k.fifthsEl.textContent = String(k.value);
      k.cancel.forEach((c) => c.remove()); // dấu hủy khóa cũ không còn đúng; OSMD tự tính khi đổi khóa
    }
    for (const m of missing) {
      const first = doc.getMeasures(m.part)[0];
      if (first) insertKey(first, m.fifths);
    }
    for (const item of notes) writePitch(item.element, shiftPitch(item.pitch, n, item.key));
    for (const c of chords) shiftChordNote(c.holder, c.stepTag, c.alterTag, n, c.key);
    for (const id of touched) {
      const [part, measure] = id.split('|').map(Number);
      refreshAccidentals(doc, part, measure);
    }
    return 0;
  });
}
