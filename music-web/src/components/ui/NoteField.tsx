import './note-field.css';

/** Vị trí các nốt: [x, y, lớp]. Lớp 1 trôi nhanh nhất khi cuộn, lớp 3 chậm nhất (parallax nhiều lớp). */
const NOTES: [number, number, 1 | 2 | 3][] = [
  [90, 96, 2],
  [230, 66, 1],
  [360, 126, 3],
  [500, 86, 1],
  [640, 106, 2],
  [780, 56, 3],
  [910, 116, 1],
  [1040, 76, 2],
  [1150, 96, 3],
];

/**
 * Minh họa nhạc động, chỉ để trang trí (ẩn với trình đọc màn hình): năm dòng kẻ khuông và các nốt nhạc bồng bềnh nhẹ.
 * Ba lớp nốt trôi ngang với tốc độ khác nhau khi cuộn trang (CSS scroll-driven animation) và còn trôi ngang liên tục, chậm, tắt hẳn khi người dùng bật "Giảm chuyển động". Màu lấy từ `color` của phần tử cha.
 */
export default function NoteField({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`notef ${className}`}
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g className="notef__staff">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="-1500" x2="2700" y1={70 + i * 20} y2={70 + i * 20} />
        ))}
      </g>
      {[1, 2, 3].map((layer) => (
        <g key={layer} className={`notef__layer notef__layer--${layer}`}>
          {/* ba bản sao cách nhau 1200 để dòng nốt trôi liền mạch, kể cả màn hình rộng */}
          <g className="notef__flow">
            {[-1200, 0, 1200].map((offset) => (
              <g key={offset} transform={`translate(${offset} 0)`}>
                {NOTES.filter((n) => n[2] === layer).map(([x, y], i) => (
                  <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
                    <g className="notef__note" style={{ animationDelay: `${(x % 7) * -0.6 - i * 0.4}s` }}>
                      <ellipse rx="11" ry="8" transform="rotate(-20)" />
                      <rect x="9" y="-52" width="2.6" height="52" />
                      {(x + y) % 2 === 0 && <path d="M11.6 -52 q16 8 12 28 q-3 -12 -12 -14z" />}
                    </g>
                  </g>
                ))}
              </g>
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}
