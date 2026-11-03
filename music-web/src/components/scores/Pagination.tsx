interface Props {
  page: number; // bắt đầu từ 0
  totalPages: number;
  totalElements: number;
  onChange: (page: number) => void;
}

/** Phân trang gọn: Trước / số trang hiện tại / Sau. */
export default function Pagination({ page, totalPages, totalElements, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav className="sc-pager" aria-label="Phân trang">
      <button className="sc-btn sc-btn--sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        ‹ Trước
      </button>
      <span className="sc-pager__info">
        Trang <strong>{page + 1}</strong> / {totalPages} · {totalElements} bản nhạc
      </span>
      <button className="sc-btn sc-btn--sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
        Sau ›
      </button>
    </nav>
  );
}
