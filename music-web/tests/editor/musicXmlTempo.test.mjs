import assert from 'node:assert/strict';
import test from 'node:test';

import { setMusicXmlTempo } from '../../src/utils/musicXmlTempo.ts';

const score = (measure1) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
<part id="P1"><measure number="1">${measure1}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
<measure number="2"><note><rest/><duration>4</duration></note></measure></part></score-partwise>`;

const read = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const metronome = doc.getElementsByTagName('metronome')[0];
  return {
    perMinute: metronome?.getElementsByTagName('per-minute')[0]?.textContent,
    sound: doc.getElementsByTagName('sound')[0]?.getAttribute('tempo'),
    directions: doc.getElementsByTagName('direction').length,
    firstChildOfMeasure: doc.getElementsByTagName('measure')[0].children[1]?.tagName,
  };
};

test('bản số hóa chưa có nhịp độ: thêm ♩ = 70 vào ô đầu, sau attributes', () => {
  const out = setMusicXmlTempo(score('<attributes><divisions>1</divisions></attributes>'), 70);
  assert.deepEqual(read(out), { perMinute: '70', sound: '70', directions: 1, firstChildOfMeasure: 'direction' });
  assert.ok(out.startsWith('<?xml'));
});

test('đã có nhịp độ: sửa đúng chỗ đó, không thêm direction mới', () => {
  const existing =
    '<attributes><divisions>1</divisions></attributes><direction placement="above"><direction-type><metronome>' +
    '<beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>';
  const r = read(setMusicXmlTempo(score(existing), 72));
  assert.equal(r.perMinute, '72');
  assert.equal(r.sound, '72');
  assert.equal(r.directions, 1);
});
