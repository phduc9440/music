import { t } from '../../i18n/core';

/**
 * Khung xương thay cho chữ "Đang tải" (mục 5.6): vài dòng xám lấp lánh đúng chỗ nội dung sẽ hiện. Có role="status" và
 * nhãn để trình đọc màn hình vẫn biết trang đang tải; tắt chuyển động khi người dùng bật "Giảm chuyển động".
 */
export default function Skeleton({
  lines = 3,
  height,
  className = '',
}: {
  lines?: number;
  /** Có height thì vẽ một khối đặc cao chừng đó (ví dụ vùng xem trước) thay vì các dòng. */
  height?: number | string;
  className?: string;
}) {
  return (
    <div
      className={`ui-skeleton-stack ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      {height !== undefined ? (
        <span className="ui-skeleton" style={{ height }} />
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={`ui-skeleton ui-skeleton--line${i === lines - 1 && lines > 1 ? ' ui-skeleton--short' : ''}`}
          />
        ))
      )}
    </div>
  );
}
