/**
 * Khoảng ô nhịp cần vẽ cho OpenSheetMusicDisplay, theo số thứ tự ô của hệ thống ("Ô n": đếm từ 1, ô lấy đà là ô 1).
 *
 * OSMD nhận `drawFromMeasureNumber`/`drawUpToMeasureNumber` theo SỐ ô của nó; khi ô đầu bài là ô lấy đà (ngắn hơn số
 * chỉ nhịp) OSMD coi ô đó là ô 0 và lúc vẽ đổi lại chỉ số ô thành đúng con số đó. Truyền thẳng "Ô n" thì khung xem trước
 * vẽ nhầm sang ô n + 1 (bài có ô lấy đà: chọn ô 12 lại hiện ô 13). Hàm này tính sẵn các giá trị trong `EngravingRules`
 * sao cho sau bước đổi của OSMD, chỉ số ô được vẽ luôn là `n - 1`.
 */
export interface MeasureRangeRules {
  MinMeasureToDrawIndex?: number;
  MinMeasureToDrawNumber?: number;
  MaxMeasureToDrawIndex?: number;
  MaxMeasureToDrawNumber?: number;
}

/** `pickup`: ô đầu bài là ô lấy đà theo OSMD (`Sheet.SourceMeasures[0].ImplicitMeasure`). */
export function measureRangeRules(
  first: number | null | undefined,
  last: number | null | undefined,
  pickup: boolean,
): MeasureRangeRules {
  const rules: MeasureRangeRules = {};
  if (first != null) {
    const index = Math.max(first - 1, 0);
    rules.MinMeasureToDrawIndex = index;
    // OSMD (có ô lấy đà): số > 1 thì chỉ số = số, ngược lại giữ chỉ số đã đặt
    rules.MinMeasureToDrawNumber = pickup ? index : first;
  }
  if (last != null) {
    const index = Math.max(last - 1, 0);
    rules.MaxMeasureToDrawIndex = index;
    // OSMD (có ô lấy đà): số > 0 thì chỉ số = số, ngược lại giữ chỉ số đã đặt
    rules.MaxMeasureToDrawNumber = pickup ? index : last;
  }
  return rules;
}
