/**
 * Lõi dữ liệu của trình chỉnh sửa: bọc DOM MusicXML và gán id ổn định cho từng nốt.
 * Không phụ thuộc React hay OSMD nên dễ kiểm thử.
 */

/** Mẫu số dùng để làm tròn thời điểm (đơn vị: nốt tròn) khi so khớp với OSMD. */
const ONSET_PRECISION = 100000;

/** Thông tin một thẻ <note> sau khi đã phân tích vị trí. */
export interface NoteInfo {
  /** Id ổn định `m{ô}-s{khuông}-v{bè}-{thứ tự}`, nốt thứ k (k ≥ 1) trong hợp âm có thêm hậu tố `c{k}`. */
  id: string;
  element: Element;
  /** Chỉ số phần nhạc (part) bắt đầu từ 0. */
  partIndex: number;
  /** Chỉ số ô nhịp bắt đầu từ 0. */
  measureIndex: number;
  /** Khuông (staff) bắt đầu từ 1. */
  staff: number;
  /** Bè (voice) theo MusicXML, bắt đầu từ 1. */
  voice: number;
  /** Thứ tự phần tử (không tính nốt hợp âm) trong cùng ô, khuông, bè. */
  entryIndex: number;
  /** Chỉ số trong hợp âm: 0 là nốt đầu, ≥ 1 là nốt thêm. */
  chordIndex: number;
  isRest: boolean;
  isGrace: boolean;
  /** Thời điểm bắt đầu trong ô, làm tròn từ phần của nốt tròn (để so khớp với OSMD). */
  onsetKey: number;
  /** Cao độ MIDI; null với dấu lặng. */
  midi: number | null;
}

/** Bước nửa cung của các bậc C D E F G A B. */
const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Cao độ MIDI của một thẻ <note>; null nếu là dấu lặng hoặc thiếu dữ liệu. */
export const noteMidi = (note: Element): number | null => {
  const pitch = note.getElementsByTagName('pitch')[0];
  if (!pitch) return null;
  const step = pitch.getElementsByTagName('step')[0]?.textContent?.trim() ?? '';
  const octave = Number(pitch.getElementsByTagName('octave')[0]?.textContent);
  const alter = Number(pitch.getElementsByTagName('alter')[0]?.textContent ?? 0) || 0;
  if (!(step in STEP_SEMITONE) || !Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + STEP_SEMITONE[step] + Math.round(alter);
};

const childNumber = (parent: Element, tag: string): number | null => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/** Tài liệu MusicXML đang chỉnh sửa. */
export class ScoreDocument {
  private readonly doc: Document;
  private noteMap = new Map<string, Element>();
  private infoMap = new Map<string, NoteInfo>();
  private ordered: NoteInfo[] = [];
  /** Số khuông của từng part, dùng để đổi sang chỉ số khuông toàn cục của OSMD. */
  private partStaves: number[] = [];

  private constructor(doc: Document) {
    this.doc = doc;
    this.reindex();
  }

  /**
   * Phân tích chuỗi MusicXML.
   * @throws Error nếu XML hỏng, root không phải score-partwise hoặc không có ô nhịp nào.
   */
  static parse(xml: string): ScoreDocument {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.nodeName !== 'score-partwise') {
      throw new Error('MusicXML không hợp lệ');
    }
    if (doc.getElementsByTagName('measure').length === 0) {
      throw new Error('MusicXML không có ô nhịp nào');
    }
    return new ScoreDocument(doc);
  }

  /** Tất cả nốt theo thứ tự xuất hiện trong file. */
  get notes(): readonly NoteInfo[] {
    return this.ordered;
  }

  /** Số ô nhịp của part đầu tiên. */
  get measureCount(): number {
    return this.parts()[0]?.getElementsByTagName('measure').length ?? 0;
  }

  getNote(id: string): Element | undefined {
    return this.noteMap.get(id);
  }

  getInfo(id: string): NoteInfo | undefined {
    return this.infoMap.get(id);
  }

  /** Thẻ <measure> chứa nốt có id cho trước. */
  measureOf(id: string): Element | undefined {
    return this.getNote(id)?.closest('measure') ?? undefined;
  }

  /** Số dấu hóa (fifths) có hiệu lực ở ô nhịp cho trước của part đầu tiên; mặc định 0. */
  keyAt(measureIndex: number): number {
    const measures = this.measuresOf(0);
    let fifths = 0;
    for (let i = 0; i <= measureIndex && i < measures.length; i++) {
      for (const attributes of Array.from(measures[i].children).filter((c) => c.tagName === 'attributes')) {
        const key = Array.from(attributes.children).find((c) => c.tagName === 'key');
        const value = key ? childNumber(key, 'fifths') : null;
        if (value !== null) fifths = value;
      }
    }
    return fifths;
  }

  /** Giá trị divisions có hiệu lực ở ô nhịp cho trước của part đầu tiên; mặc định 1. */
  divisionsAt(measureIndex: number): number {
    return this.divisionsInPart(0, measureIndex);
  }

  /** Số khuông của một part (0 nếu part không tồn tại). */
  staffCountOfPart(partIndex: number): number {
    return this.partStaves[partIndex] ?? 0;
  }

  /** Chỉ số khuông toàn cục (bắt đầu từ 0) của một khuông trong một part, theo cách OSMD đánh số. */
  globalStaffIndex(partIndex: number, staff: number): number {
    const before = this.partStaves.slice(0, partIndex).reduce((sum, n) => sum + n, 0);
    return before + staff - 1;
  }

  /** Dựng lại chỉ mục id sau khi DOM thay đổi (id phụ thuộc vị trí nên được tính lại). */
  reindex(): void {
    this.noteMap = new Map();
    this.infoMap = new Map();
    this.ordered = [];
    this.partStaves = [];
    this.parts().forEach((part, partIndex) => {
      let staves = 1;
      let divisions = 1;
      this.measuresOfPart(part).forEach((measure, measureIndex) => {
        const result = this.indexMeasure(measure, partIndex, measureIndex, divisions);
        staves = Math.max(staves, result.staves);
        divisions = result.divisions;
      });
      this.partStaves.push(staves);
    });
  }

  /** Xuất MusicXML. Bỏ DOCTYPE vì BE từ chối mọi DOCTYPE (chống XXE). */
  serialize(): string {
    const body = new XMLSerializer().serializeToString(this.doc.documentElement);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
  }

  // ---------------------------------------------------------------- nội bộ

  private parts(): Element[] {
    return Array.from(this.doc.documentElement.children).filter((c) => c.tagName === 'part');
  }

  private measuresOfPart(part: Element): Element[] {
    return Array.from(part.children).filter((c) => c.tagName === 'measure');
  }

  private measuresOf(partIndex: number): Element[] {
    const part = this.parts()[partIndex];
    return part ? this.measuresOfPart(part) : [];
  }

  private divisionsInPart(partIndex: number, measureIndex: number): number {
    const measures = this.measuresOf(partIndex);
    let divisions = 1;
    for (let i = 0; i <= measureIndex && i < measures.length; i++) {
      for (const attributes of Array.from(measures[i].children).filter((c) => c.tagName === 'attributes')) {
        const value = childNumber(attributes, 'divisions');
        if (value !== null && value > 0) divisions = value;
      }
    }
    return divisions;
  }

  /**
   * Duyệt một ô nhịp, gán id và thời điểm cho từng nốt.
   * @param startDivisions divisions có hiệu lực khi bắt đầu ô
   * @returns số khuông lớn nhất thấy trong ô (từ <staves> hoặc <staff>) và divisions có hiệu lực khi kết thúc ô
   */
  private indexMeasure(
    measure: Element,
    partIndex: number,
    measureIndex: number,
    startDivisions: number,
  ): { staves: number; divisions: number } {
    let divisions = startDivisions;
    let cursor = 0;
    let lastOnset = 0;
    let lastEntry: { staff: number; voice: number; entryIndex: number } | null = null;
    let chordCount = 0;
    let maxStaff = 1;
    const entryCounters = new Map<string, number>();
    const prefix = partIndex > 0 ? `p${partIndex}-` : '';

    for (const child of Array.from(measure.children)) {
      if (child.tagName === 'attributes') {
        const d = childNumber(child, 'divisions');
        if (d !== null && d > 0) divisions = d;
        const staves = childNumber(child, 'staves');
        if (staves !== null) maxStaff = Math.max(maxStaff, staves);
      } else if (child.tagName === 'backup') {
        cursor -= childNumber(child, 'duration') ?? 0;
      } else if (child.tagName === 'forward') {
        cursor += childNumber(child, 'duration') ?? 0;
      } else if (child.tagName === 'note') {
        const isChord = Array.from(child.children).some((c) => c.tagName === 'chord');
        const isGrace = Array.from(child.children).some((c) => c.tagName === 'grace');
        const isRest = Array.from(child.children).some((c) => c.tagName === 'rest');
        const staff = childNumber(child, 'staff') ?? 1;
        const voice = childNumber(child, 'voice') ?? 1;
        maxStaff = Math.max(maxStaff, staff);

        let onset: number;
        let entryIndex: number;
        let chordIndex: number;
        if (isChord && lastEntry) {
          onset = lastOnset;
          entryIndex = lastEntry.entryIndex;
          chordCount += 1;
          chordIndex = chordCount;
        } else {
          onset = cursor;
          const counterKey = `${staff}|${voice}`;
          entryIndex = entryCounters.get(counterKey) ?? 0;
          entryCounters.set(counterKey, entryIndex + 1);
          lastEntry = { staff, voice, entryIndex };
          lastOnset = onset;
          chordCount = 0;
          chordIndex = 0;
          if (!isGrace) cursor += childNumber(child, 'duration') ?? 0;
        }
        const id = `${prefix}m${measureIndex}-s${staff}-v${voice}-${entryIndex}${chordIndex > 0 ? `c${chordIndex}` : ''}`;
        const info: NoteInfo = {
          id,
          element: child,
          partIndex,
          measureIndex,
          staff,
          voice,
          entryIndex,
          chordIndex,
          isRest,
          isGrace,
          onsetKey: Math.round((onset / (4 * divisions)) * ONSET_PRECISION),
          midi: noteMidi(child),
        };
        this.noteMap.set(id, child);
        this.infoMap.set(id, info);
        this.ordered.push(info);
      }
    }
    return { staves: maxStaff, divisions };
  }
}

/** Làm tròn thời điểm (đơn vị nốt tròn) theo cùng quy tắc với {@link NoteInfo.onsetKey}. */
export const toOnsetKey = (wholeNotes: number): number => Math.round(wholeNotes * ONSET_PRECISION);
