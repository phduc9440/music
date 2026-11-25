/**
 * Các bè có thể làm giai điệu cho gợi ý hợp âm (CH-04). Khớp cách music-ai chọn bè: chỉ part có nốt có cao độ (bỏ
 * part bộ gõ), mỗi khuông có nốt là một lựa chọn. `partIndex` đếm từ 0 theo thứ tự `<part>` trong file (như trình
 * chỉnh sửa), `staff` đếm từ 1 trong part đó.
 */
export interface MelodyChoice {
  partIndex: number;
  staff: number;
  /** Tên part trong `<part-list>`; rỗng nếu file không ghi. */
  partName: string;
  /** Part này có bao nhiêu khuông có nốt (piano hai tay: 2). Dùng để chỉ ghi "khuông n" khi cần. */
  staffCount: number;
}

const childrenOf = (el: Element, tag: string): Element[] => Array.from(el.children).filter((c) => c.tagName === tag);

/** Danh sách lựa chọn theo thứ tự part rồi khuông; rỗng nếu không đọc được hoặc không có nốt nào. */
export function listMelodyChoices(xml: string): MelodyChoice[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'score-partwise' || doc.getElementsByTagName('parsererror').length > 0) return [];

  const names = new Map<string, string>();
  for (const list of childrenOf(root, 'part-list')) {
    for (const sp of childrenOf(list, 'score-part')) {
      const name = childrenOf(sp, 'part-name')[0]?.textContent?.trim();
      if (name) names.set(sp.getAttribute('id') ?? '', name);
    }
  }

  const out: MelodyChoice[] = [];
  childrenOf(root, 'part').forEach((part, partIndex) => {
    const staves = new Set<number>();
    for (const note of Array.from(part.getElementsByTagName('note'))) {
      if (!Array.from(note.children).some((c) => c.tagName === 'pitch')) continue;
      const staffText = Array.from(note.children).find((c) => c.tagName === 'staff')?.textContent?.trim();
      const staff = Number(staffText);
      staves.add(Number.isInteger(staff) && staff >= 1 ? staff : 1);
    }
    const sorted = [...staves].sort((a, b) => a - b);
    for (const staff of sorted) {
      out.push({ partIndex, staff, partName: names.get(part.getAttribute('id') ?? '') ?? '', staffCount: sorted.length });
    }
  });
  return out;
}

/** Giá trị cho thẻ chọn: "part:khuông". */
export const melodyChoiceKey = (c: Pick<MelodyChoice, 'partIndex' | 'staff'>): string => `${c.partIndex}:${c.staff}`;
