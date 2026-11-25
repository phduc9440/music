import { useCallback, useEffect, useMemo, useState } from 'react';
import { omrApi, scoreApi } from '../../../services';
import type { OmrMeasure, OmrResult, ScoreDetail, ScoreFileInfo } from '../../../types';
import { flaggedMeasures, loadCheckedMeasures, saveCheckedMeasures } from '../../../utils/omr';

export interface OmrCheckState {
  /** Bản nhạc số hóa xong và có ô nghi ngờ: hiện nút "Cần kiểm tra" trong Editor. */
  available: boolean;
  result: OmrResult | null;
  /** Ảnh trang đã tiền xử lý theo số trang (khung ô tính theo ảnh này). */
  pages: Map<number, ScoreFileInfo>;
  flagged: OmrMeasure[];
  checked: Set<number>;
  toggleChecked: (measure: number) => void;
  /** Bản nhạc đã được lưu thêm sau lần số hóa: số ô có thể lệch nếu người dùng đã thêm/xóa ô. */
  editedSinceOmr: boolean;
}

/**
 * Kết quả nhận diện cho bảng "Cần kiểm tra" của Editor (OMR-03): ô nghi ngờ lấy từ measureMap, ảnh trang gốc để cắt đúng ô,
 * và các ô người dùng đã đánh dấu "Đã kiểm" (nhớ trong trình duyệt theo lần nhận diện). Chỉ tải với bản số hóa từ file.
 */
export function useOmrCheck(score: Pick<ScoreDetail, 'id' | 'sourceType' | 'canEdit'>): OmrCheckState {
  const [result, setResult] = useState<OmrResult | null>(null);
  const [pageFiles, setPageFiles] = useState<ScoreFileInfo[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const enabled = score.sourceType === 'OMR';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([omrApi.result(score.id), scoreApi.files(score.id, 'PNG')])
      .then(([res, png]) => {
        if (cancelled) return;
        const data = res.data.result;
        setResult(data);
        setPageFiles(png.data.result);
        setChecked(loadCheckedMeasures(score.id, data.taskId));
      })
      .catch(() => undefined); // chưa từng số hóa thành công hoặc không có quyền: không hiện bảng
    return () => {
      cancelled = true;
    };
  }, [enabled, score.id]);

  const flagged = useMemo(() => (result?.status === 'COMPLETED' ? flaggedMeasures(result.measureMap) : []), [result]);
  const pages = useMemo(() => {
    const map = new Map<number, ScoreFileInfo>();
    for (const f of pageFiles) if (f.pageNumber != null) map.set(f.pageNumber, f);
    return map;
  }, [pageFiles]);

  const taskId = result?.taskId;
  const toggleChecked = useCallback(
    (measure: number) => {
      if (!taskId) return;
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(measure)) next.delete(measure);
        else next.add(measure);
        saveCheckedMeasures(score.id, taskId, next);
        return next;
      });
    },
    [score.id, taskId],
  );

  return {
    available: enabled && flagged.length > 0,
    result,
    pages,
    flagged,
    checked,
    toggleChecked,
    editedSinceOmr:
      result?.omrVersion != null && result.musicXmlVersion != null && result.musicXmlVersion !== result.omrVersion,
  };
}
