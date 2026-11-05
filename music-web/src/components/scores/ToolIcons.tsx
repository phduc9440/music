import type { ReactNode } from 'react';

/** Biểu tượng công cụ vẽ bằng SVG (không dùng ký tự Unicode nhạc vì nhiều font không có glyph, hiện thành ô vuông). */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Đầu nốt hình elip nghiêng; filled = nốt đặc (đen, móc), không đặc = nốt rỗng (tròn, trắng). */
const Head = ({ filled }: { filled: boolean }) => (
  <ellipse cx="9" cy="18" rx="4.6" ry="3.3" transform="rotate(-20 9 18)" fill={filled ? 'currentColor' : 'none'} />
);

export const ToolSelect = () => (
  <Svg>
    <path d="M6 3l12 8-5.5 1.5L10 18z" fill="currentColor" />
  </Svg>
);
export const ToolPencil = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </Svg>
);
export const ToolWhole = () => (
  <Svg>
    <ellipse cx="12" cy="12" rx="6" ry="4" />
    <ellipse cx="12" cy="12" rx="2" ry="3.2" transform="rotate(-30 12 12)" />
  </Svg>
);
export const ToolHalf = () => (
  <Svg>
    <Head filled={false} />
    <path d="M13.4 17V3.5" />
  </Svg>
);
export const ToolQuarter = () => (
  <Svg>
    <Head filled />
    <path d="M13.4 17V3.5" />
  </Svg>
);
export const ToolEighth = () => (
  <Svg>
    <Head filled />
    <path d="M13.4 17V3.5c0 4 5 4.5 5 9" />
  </Svg>
);
export const ToolSixteenth = () => (
  <Svg>
    <Head filled />
    <path d="M13.4 17V3.5c0 3.5 5 4 5 8M13.4 9c0 3.5 5 4 5 8" />
  </Svg>
);
export const ToolSharp = () => (
  <Svg>
    <path d="M9 4v16M15 3v16M6 9.5l12-3M6 16.5l12-3" />
  </Svg>
);
export const ToolFlat = () => (
  <Svg>
    <path d="M8 3v17c6-2.5 9-5.5 7-8.5-1.500-2-5-1.500-7 1" />
  </Svg>
);
export const ToolNatural = () => (
  <Svg>
    <path d="M8 4v11.5l9-2.500M16 20V8.5L7 11" />
  </Svg>
);
export const ToolTie = () => (
  <Svg>
    <ellipse cx="6" cy="9" rx="2.6" ry="1.9" transform="rotate(-20 6 9)" fill="currentColor" stroke="none" />
    <ellipse cx="18" cy="9" rx="2.6" ry="1.9" transform="rotate(-20 18 9)" fill="currentColor" stroke="none" />
    <path d="M5 14.5q7 7 14 0" />
  </Svg>
);
export const ToolSlur = () => (
  <Svg>
    <path d="M3.5 16q8.500-11 17 0" />
    <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="19" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
export const ToolLyric = () => (
  <Svg>
    <path d="M4 7h16M4 12h10" />
    <path d="M8 19v-4.500M8 16.500l8-1.500M16 15v3.500" />
    <circle cx="7" cy="19" r="1.600" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18.500" r="1.600" fill="currentColor" stroke="none" />
  </Svg>
);
export const ToolDot = () => (
  <Svg>
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
  </Svg>
);
export const ToolRest = () => (
  <Svg>
    <path d="M9 4l6 6-5 5 5 5" />
  </Svg>
);
export const ToolDelete = () => (
  <Svg>
    <path d="M9 5h10a2 2 0 012 2v10a2 2 0 01-2 2H9l-6-7zM12 9.500l5 5M17 9.500l-5 5" />
  </Svg>
);

/** Nhóm Cao độ: mũi tên lên/xuống, kèm dấu thăng/giáng cho nửa cung và hai mũi tên chồng cho quãng tám. */
export const ToolStepUp = () => (
  <Svg>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const ToolStepDown = () => (
  <Svg>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const ToolSemitoneUp = () => (
  <Svg>
    <path d="M8 19V6M3.5 10.5L8 6l4.5 4.5" />
    <path d="M17 8v11M20.5 7v11M15 11.5l7-1.5M15 16.5l7-1.5" />
  </Svg>
);
export const ToolSemitoneDown = () => (
  <Svg>
    <path d="M8 5v13M3.5 13.5L8 18l4.5-4.5" />
    <path d="M16.5 5v14M16.5 14.5c3-2.5 5.5 0 4 2.5-1 1.6-3 2-4 2" />
  </Svg>
);
export const ToolOctaveUp = () => (
  <Svg>
    <path d="M6 11l6-6 6 6M6 19l6-6 6 6" />
  </Svg>
);
export const ToolOctaveDown = () => (
  <Svg>
    <path d="M6 5l6 6 6-6M6 13l6 6 6-6" />
  </Svg>
);
