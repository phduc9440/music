/**
 * Ghi file nhị phân cho xuất file ngay trên trình duyệt (khi máy chủ chưa cài MuseScore): ZIP (chỉ lưu, không nén),
 * WAV PCM 16 bit và PDF gồm mỗi trang một ảnh xám nén Flate. Không phụ thuộc thư viện ngoài nên chạy được cả trong test
 * Node.
 */

const encoder = new TextEncoder();

// ------------------------------------------------------------------------------------------------ CRC-32 / ZIP

let crcTable: Uint32Array | null = null;

/** CRC-32 (đa thức 0xEDB88320) như ZIP và PNG dùng. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Ngày giờ dạng MS-DOS của ZIP. */
const dosTime = (date: Date): { time: number; day: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  day: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

/** Gói các file thành một ZIP kiểu "store" (không nén; SVG là chữ nên trình giải nén nào cũng mở được). */
export function makeZip(entries: readonly ZipEntry[], date = new Date()): Uint8Array<ArrayBuffer> {
  const { time, day } = dosTime(date);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // tên file UTF-8
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

// ------------------------------------------------------------------------------------------------ WAV

/** Âm thanh PCM 16 bit (WAV), các kênh xen kẽ; mẫu vượt [-1, 1] bị cắt. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const count = channels.length;
  const frames = count > 0 ? channels[0].length : 0;
  const dataBytes = frames * count * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => out.set(encoder.encode(text), at);
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(at, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      at += 2;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ PDF

export interface PdfImagePage {
  /** Khổ trang theo điểm PDF (1/72 inch). */
  widthPt: number;
  heightPt: number;
  /** Ảnh xám 8 bit phủ kín trang, đã nén zlib (FlateDecode). */
  imageWidth: number;
  imageHeight: number;
  deflated: Uint8Array;
}

/** PDF 1.4: mỗi trang là một ảnh xám phủ kín trang. Giữ được dấu tiếng Việt và font nhạc mà không cần nhúng font. */
export function makeImagePdf(pages: readonly PdfImagePage[], title = ''): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  // Đối tượng: 1 Catalog, 2 Pages, 3 Info, rồi mỗi trang 3 đối tượng (trang, ảnh, nội dung)
  const pageId = (i: number) => 4 + i * 3;
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () =>
    push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`),
  );
  object(3, () => push(`<< /Producer (music-web) /Title <${utf16Hex(title)}> >>`));
  pages.forEach((page, i) => {
    const w = round(page.widthPt);
    const h = round(page.heightPt);
    const id = pageId(i);
    object(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >>` +
          ` /Contents ${id + 2} 0 R >>`,
      ),
    );
    object(id + 1, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight}` +
          ` /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.deflated.length} >>\nstream\n`,
      );
      push(page.deflated);
      push('\nendstream');
    });
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(id + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return concat(parts);
}

const round = (n: number): string => (Math.round(n * 100) / 100).toString();

/** Chuỗi PDF dạng UTF-16BE có BOM, viết hex (để tiêu đề có dấu tiếng Việt). */
const utf16Hex = (text: string): string => {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return hex;
};

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Nén zlib (FlateDecode của PDF) bằng CompressionStream có sẵn của trình duyệt / Node. */
export async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
