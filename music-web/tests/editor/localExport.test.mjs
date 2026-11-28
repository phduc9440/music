import assert from 'node:assert/strict';
import test from 'node:test';

import { crc32, deflate, encodeWav, makeImagePdf, makeZip } from '../../src/components/export/local/fileWriters.ts';
import { pageGeometry } from '../../src/components/export/local/scorePages.ts';
import { audioSeconds, handsMixer } from '../../src/components/export/local/offlineAudio.ts';

const ascii = (bytes) => new TextDecoder('latin1').decode(bytes);

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('makeZip writes stored entries with a central directory that points at them', () => {
  const data = new TextEncoder().encode('<svg/>');
  const zip = makeZip(
    [
      { name: 'Bài-trang-1.svg', data },
      { name: 'b.svg', data: new Uint8Array([1, 2, 3]) },
    ],
    new Date(2026, 10, 28, 9, 30, 10),
  );
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 16, true), crc32(data));
  assert.equal(view.getUint32(central + 42, true), 0); // entry 1 starts the file
  const nameLength = view.getUint16(central + 28, true);
  assert.equal(new TextDecoder().decode(zip.slice(central + 46, central + 46 + nameLength)), 'Bài-trang-1.svg');
  // the stored bytes follow the local header unchanged
  const localName = view.getUint16(26, true);
  assert.deepEqual([...zip.slice(30 + localName, 30 + localName + data.length)], [...data]);
});

test('encodeWav writes a 16-bit PCM header and clips samples', () => {
  const left = new Float32Array([0, 1, -1, 2]);
  const right = new Float32Array([0.5, -0.5, 0, -2]);
  const wav = encodeWav([left, right], 44100);
  const view = new DataView(wav.buffer);
  assert.equal(ascii(wav.slice(0, 4)), 'RIFF');
  assert.equal(ascii(wav.slice(8, 16)), 'WAVEfmt ');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(40, true), 4 * 2 * 2);
  assert.equal(wav.length, 44 + 16);
  assert.equal(view.getInt16(44 + 2 * 2, true), 0x7fff); // left[1] = 1
  assert.equal(view.getInt16(44 + 4 * 2, true), -0x8000); // left[2] = -1
  assert.equal(view.getInt16(44 + 6 * 2, true), 0x7fff); // left[3] = 2, clipped
  assert.equal(view.getInt16(44 + 7 * 2, true), -0x8000); // right[3] = -2, clipped
});

test('makeImagePdf writes one image page per entry with a valid cross-reference table', async () => {
  const gray = new Uint8Array(4 * 3).fill(255);
  const deflated = await deflate(gray);
  const page = { widthPt: 595.28, heightPt: 841.89, imageWidth: 4, imageHeight: 3, deflated };
  const pdf = makeImagePdf([page, page], 'Lòng Con Ước Ao');
  const text = ascii(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Type \/Pages \/Count 2 \/Kids \[4 0 R 7 0 R\]/);
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  // every xref offset points at "<id> 0 obj"
  const start = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(start).startsWith('xref\n0 10\n'));
  const rows = text.slice(start).split('\n').slice(3, 12);
  rows.forEach((row, i) => {
    const offset = Number(row.slice(0, 10));
    assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`);
  });
  // the image stream inflates back to the page pixels
  const inflated = new Uint8Array(
    await new Response(new Blob([deflated]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(),
  );
  assert.deepEqual([...inflated], [...gray]);
});

test('pageGeometry sizes the page so one OSMD unit is the chosen staff space', () => {
  const base = {
    pageSize: 'A4',
    orientation: 'PORTRAIT',
    staffSpaceMm: 1.75,
    marginMm: 15,
    showTitle: true,
    measureNumbers: 'SYSTEM',
    showChords: true,
  };
  assert.deepEqual(pageGeometry(base), {
    widthMm: 210,
    heightMm: 297,
    hostWidthPx: 1200,
    marginUnits: 15 / 1.75,
    pageFormat: 'A4 P',
  });
  const letter = pageGeometry({ ...base, pageSize: 'LETTER', orientation: 'LANDSCAPE', staffSpaceMm: 2 });
  assert.equal(letter.widthMm, 279.4);
  assert.equal(letter.heightMm, 215.9);
  assert.equal(letter.hostWidthPx, 1397);
  assert.equal(letter.pageFormat, 'Letter L');
});

test('handsMixer mutes the other hand and the chord accompaniment', () => {
  const timeline = {
    tracks: [
      { id: '0:1', part: 0, staff: 1, label: '' },
      { id: '0:2', part: 0, staff: 2, label: '' },
      { id: 'chords', part: 0, staff: 0, label: '' },
    ],
  };
  assert.deepEqual(handsMixer(timeline, 'BOTH'), {});
  assert.deepEqual(Object.keys(handsMixer(timeline, 'RIGHT')).sort(), ['0:2', 'chords']);
  assert.deepEqual(Object.keys(handsMixer(timeline, 'LEFT')).sort(), ['0:1', 'chords']);
  assert.equal(audioSeconds({ total: 60 }, 50), 120);
});
