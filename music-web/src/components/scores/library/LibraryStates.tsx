/** Khung xương hiển thị lúc đang tải lần đầu. */
export function LibrarySkeleton() {
  return (
    <div className="sc-grid" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="sc-card sc-card--skeleton">
          <div className="sc-skeleton sc-skeleton--cover" />
          <div className="sc-card__body">
            <div className="sc-skeleton sc-skeleton--line" />
            <div className="sc-skeleton sc-skeleton--line sc-skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyProps {
  filtered: boolean;
  onReset: () => void;
}

/** Trạng thái rỗng: chưa có bản nhạc nào, hoặc bộ lọc không khớp. */
export function LibraryEmpty({ filtered, onReset }: EmptyProps) {
  return (
    <div className="sc-empty">
      <div className="sc-empty__icon">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" aria-hidden>
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
        </svg>
      </div>
      <h3>{filtered ? 'Không có bản nhạc nào khớp' : 'Thư viện của bạn còn trống'}</h3>
      <p>
        {filtered ? 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.' : 'Các bản nhạc bạn tải lên hoặc soạn sẽ xuất hiện ở đây.'}
      </p>
      {filtered && (
        <button className="sc-btn" onClick={onReset}>
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}
