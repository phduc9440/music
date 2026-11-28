import assert from 'node:assert/strict';
import test from 'node:test';

import { measureRangeRules } from '../../src/components/scores/viewer/measureRange.ts';

/** Bước OSMD làm lúc render() khi ô đầu bài là ô lấy đà (OpenSheetMusicDisplay.render). */
function osmdRender(rules, pickup) {
  const out = { ...rules };
  if (pickup) {
    if (out.MinMeasureToDrawNumber > 1) out.MinMeasureToDrawIndex = out.MinMeasureToDrawNumber;
    if (out.MaxMeasureToDrawNumber > 0) out.MaxMeasureToDrawIndex = out.MaxMeasureToDrawNumber;
  }
  return [out.MinMeasureToDrawIndex, out.MaxMeasureToDrawIndex];
}

test('khung xem trước vẽ đúng "Ô n" kể cả khi bài có ô lấy đà', () => {
  for (const pickup of [false, true]) {
    for (const n of [1, 2, 3, 12, 13, 40]) {
      assert.deepEqual(osmdRender(measureRangeRules(n, n, pickup), pickup), [n - 1, n - 1], `ô ${n}, lấy đà=${pickup}`);
    }
    assert.deepEqual(osmdRender(measureRangeRules(5, 9, pickup), pickup), [4, 8]);
  }
});

test('bỏ trống thì không đặt giới hạn', () => {
  assert.deepEqual(measureRangeRules(null, undefined, true), {});
});
