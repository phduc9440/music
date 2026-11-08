import AuthImage from './AuthImage';
import type { ScoreFileInfo } from '../../types';

interface Props {
  /** Các ảnh trang đã xử lý (PNG), theo thứ tự trang. */
  pages: ScoreFileInfo[];
  /** Tổng số trang dự kiến, để hiện ô giữ chỗ cho trang chưa xử lý xong. */
  total: number;
  onSelect: (page: ScoreFileInfo) => void;
}

/** Dải ảnh thu nhỏ các trang đã xử lý; bấm vào một trang để so sánh với ảnh gốc. */
export default function PageStrip({ pages, total, onSelect }: Props) {
  const waiting = Math.max(0, total - pages.length);
  return (
    <ul className="sp-strip">
      {pages.map((page, index) => (
        <li key={page.id}>
          <button
            type="button"
            className="sp-strip__item"
            onClick={() => onSelect(page)}
            aria-label={`Xem và so sánh trang ${page.pageNumber ?? index + 1}`}
          >
            <AuthImage src={page.downloadUrl} alt={`Trang ${page.pageNumber ?? index + 1} sau xử lý`} />
            <span className="sp-strip__no">{page.pageNumber ?? index + 1}</span>
          </button>
        </li>
      ))}
      {Array.from({ length: waiting }, (_, i) => (
        <li key={`wait-${i}`}>
          <div className="sp-strip__item sp-strip__item--wait" aria-hidden="true">
            <span className="sp-strip__no">{pages.length + i + 1}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
