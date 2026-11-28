import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INSTRUMENTS,
  INSTRUMENT_FAMILIES,
  accompanimentInstrument,
  detectInstrument,
  instrumentForProgram,
} from '../../src/components/editor/audio/instruments.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';

const partXml = (name, program) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>${name}</part-name>
${program ? `<midi-instrument id="P1-I1"><midi-program>${program}</midi-program></midi-instrument>` : ''}
</score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>`;

const detect = (name, program) => detectInstrument(ScoreDocument.parse(partXml(name, program)), 0);

test('every instrument belongs to a listed family, once', () => {
  const ids = INSTRUMENTS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const i of INSTRUMENTS) assert.ok(INSTRUMENT_FAMILIES.includes(i.family), i.id);
});

test('General MIDI programs map to the closest sound', () => {
  const cases = {
    1: 'piano',
    5: 'epiano',
    10: 'bells',
    11: 'musicbox',
    13: 'marimba',
    20: 'organ',
    22: 'accordion',
    25: 'guitar',
    34: 'bass',
    41: 'strings',
    47: 'harp',
    53: 'choir',
    57: 'brass',
    66: 'sax',
    72: 'clarinet',
    74: 'flute',
    90: 'synth',
    108: 'zither',
    128: 'piano',
  };
  for (const [program, id] of Object.entries(cases)) assert.equal(instrumentForProgram(Number(program)), id, program);
});

test('part names pick the sound when the file has no MIDI program', () => {
  assert.equal(detect('Electric Piano'), 'epiano');
  assert.equal(detect('Đàn tranh'), 'zither');
  assert.equal(detect('Harp'), 'harp');
  assert.equal(detect('Bass Guitar'), 'bass');
  assert.equal(detect('Bass'), 'choir'); // giọng bass của hợp xướng
  assert.equal(detect('Alto Sax'), 'sax');
  assert.equal(detect('Clarinet in B♭'), 'clarinet');
  assert.equal(detect('Marimba'), 'marimba');
  assert.equal(detect('Accordion'), 'accordion');
  assert.equal(detect('Guitar'), 'guitar');
  assert.equal(detect('Piano'), 'piano');
  assert.equal(detect('Không rõ'), 'piano');
  assert.equal(detect('Harp', 1), 'piano'); // chương trình MIDI đứng trước tên
});

test('polyphonic sounds accompany chords themselves, single-line ones use piano', () => {
  for (const id of ['organ', 'guitar', 'epiano', 'accordion', 'harp', 'zither', 'synth'])
    assert.equal(accompanimentInstrument(id), id);
  for (const id of ['flute', 'sax', 'clarinet', 'brass', 'choir', 'strings', 'bass', 'bells'])
    assert.equal(accompanimentInstrument(id), 'piano');
});
