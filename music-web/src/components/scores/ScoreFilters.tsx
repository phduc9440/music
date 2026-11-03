import { MAX_KEYWORD } from '../../utils/score';
import type { ProcessingStatus, ScoreSort, ScoreSource } from '../../types';

interface Props {
  keyword: string;
  status: ProcessingStatus | '';
  source: ScoreSource | '';
  sort: ScoreSort;
  onKeyword: (v: string) => void;
  onStatus: (v: ProcessingStatus | '') => void;
  onSource: (v: ScoreSource | '') => void;
  onSort: (v: ScoreSort) => void;
}

/** Thanh tìm kiếm + bộ lọc + sắp xếp. */
export default function ScoreFilters(p: Props) {
  return (
    <div className="sc-filters">
      <label className="sc-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          className="sc-input"
          placeholder="Tìm theo tên hoặc tác giả..."
          value={p.keyword}
          maxLength={MAX_KEYWORD}
          onChange={(e) => p.onKeyword(e.target.value)}
        />
      </label>
      <select
        className="sc-input"
        aria-label="Lọc theo trạng thái"
        value={p.status}
        onChange={(e) => p.onStatus(e.target.value as ProcessingStatus | '')}
      >
        <option value="">Mọi trạng thái</option>
        <option value="PENDING">Đang chờ</option>
        <option value="PROCESSING">Đang xử lý</option>
        <option value="COMPLETED">Hoàn tất</option>
        <option value="FAILED">Thất bại</option>
      </select>
      <select
        className="sc-input"
        aria-label="Lọc theo nguồn"
        value={p.source}
        onChange={(e) => p.onSource(e.target.value as ScoreSource | '')}
      >
        <option value="">Mọi nguồn</option>
        <option value="OMR">Quét từ ảnh</option>
        <option value="IMPORT">Nhập file</option>
        <option value="MANUAL">Tự soạn</option>
      </select>
      <select
        className="sc-input"
        aria-label="Sắp xếp"
        value={p.sort}
        onChange={(e) => p.onSort(e.target.value as ScoreSort)}
      >
        <option value="newest">Mới cập nhật</option>
        <option value="oldest">Cũ nhất</option>
        <option value="title">Tên A → Z</option>
      </select>
    </div>
  );
}
