import { useId } from 'react';

/**
 * Biểu tượng thương hiệu Scorewise, vẽ giống hệt favicon (public/favicon.svg): ô bo góc nền xanh thương hiệu → xanh
 * đêm, năm dòng khuông mảnh, nốt móc đơn cam chủ đạo. Dùng cạnh chữ "Scorewise" ở các thanh đầu trang, trang đăng nhập và chân trang.
 * Màu cố định ở cả hai theme để luôn nhận ra là Scorewise. Chỉ để trang trí: chữ thương hiệu đi kèm đã nói tên.
 */
export default function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  // id gradient riêng cho mỗi lần dùng, tránh trùng khi nhiều biểu tượng cùng nằm trên một trang
  const gradient = `brand-bg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#01796a" />
          <stop offset="1" stopColor="#04201c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
      <path
        d="M5 8.5h22M5 12.5h22M5 16.5h22M5 20.5h22M5 24.5h22"
        stroke="#f4efd9"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <g fill="#FD550A">
        <ellipse cx="13.2" cy="21.2" rx="4.3" ry="3.1" transform="rotate(-20 13.2 21.2)" />
        <rect x="16.3" y="6.5" width="2" height="15" rx="1" />
        <path d="M18.3 6.6c.3 3.1 4.7 4 4.7 8.3 0 1.6-.6 2.7-1.3 3.4.4-3.3-1.9-5.1-3.4-5.5z" />
      </g>
    </svg>
  );
}
