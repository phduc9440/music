import { getExtension } from './score';

/** Loại file nhận ra từ byte đầu (kèm đuôi): PDF/ảnh đi đường số hóa, MusicXML/MXL/MIDI đi đường nhập file. */
export type FileKind = 'PDF' | 'PNG' | 'JPG' | 'MIDI' | 'MXL' | 'MUSICXML';
export type FileKindResult = FileKind | 'EMPTY' | 'UNKNOWN';

export type KindGroup = 'SCAN' | 'IMPORT';

const GROUP_OF: Record<FileKind, KindGroup> = {
  PDF: 'SCAN',
  PNG: 'SCAN',
  JPG: 'SCAN',
  MIDI: 'IMPORT',
  MXL: 'IMPORT',
  MUSICXML: 'IMPORT',
};

const EXTENSIONS: Record<FileKind, string[]> = {
  PDF: ['pdf'],
  PNG: ['png'],
  JPG: ['jpg', 'jpeg'],
  MIDI: ['mid', 'midi'],
  MXL: ['mxl'],
  MUSICXML: ['musicxml', 'xml'],
};

const SNIFF_BYTES = 2048;

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

const looksLikeMusicXml = (bytes: Uint8Array): boolean => {
  // TextDecoder tự bỏ BOM đầu file
  const text = new TextDecoder().decode(bytes);
  return text.trimStart().startsWith('<?xml') || text.includes('<score-partwise') || text.includes('<score-timewise');
};

const sniff = (bytes: Uint8Array): FileKind | null => {
  if (startsWith(bytes, ascii('%PDF'))) return 'PDF';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'PNG';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'JPG';
  if (startsWith(bytes, ascii('MThd'))) return 'MIDI';
  if (startsWith(bytes, ascii('PK'))) return 'MXL';
  if (looksLikeMusicXml(bytes)) return 'MUSICXML';
  return null;
};

/**
 * Nhận loại file bằng byte đầu (tối đa 2KB) rồi đối chiếu với đuôi: đuôi không khớp nội dung (ví dụ .docx là file nén)
 * thì coi là không hỗ trợ. File 0 byte trả về EMPTY.
 */
export async function detectFileKind(file: File): Promise<FileKindResult> {
  if (file.size === 0) return 'EMPTY';
  const bytes = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const kind = sniff(bytes);
  return kind && EXTENSIONS[kind].includes(getExtension(file.name)) ? kind : 'UNKNOWN';
}

export const groupOfKind = (kind: FileKind): KindGroup => GROUP_OF[kind];
