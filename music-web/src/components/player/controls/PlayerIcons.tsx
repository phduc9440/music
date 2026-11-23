import type { ReactNode } from 'react';

/** Biểu tượng của thanh Player (SVG nội tuyến, đổi màu theo chữ). */
const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconPlayBig = () => (
  <Svg size={26}>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
  </Svg>
);
export const IconPauseBig = () => (
  <Svg size={26}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </Svg>
);
export const IconStopSmall = () => (
  <Svg>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
  </Svg>
);
export const IconPrevMeasure = () => (
  <Svg>
    <path d="M6 5v14" />
    <path d="M19 5.5v13L9 12z" fill="currentColor" />
  </Svg>
);
export const IconNextMeasure = () => (
  <Svg>
    <path d="M18 5v14" />
    <path d="M5 5.5v13L15 12z" fill="currentColor" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconMixer = () => (
  <Svg size={18}>
    <path d="M5 4v16M12 4v16M19 4v16" />
    <circle cx="5" cy="14" r="2.2" fill="currentColor" />
    <circle cx="12" cy="8" r="2.2" fill="currentColor" />
    <circle cx="19" cy="15" r="2.2" fill="currentColor" />
  </Svg>
);
export const IconLoop = () => (
  <Svg size={18}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
);
export const IconTranspose = () => (
  <Svg size={18}>
    <path d="M8 20V5" />
    <path d="M4 9l4-4 4 4" />
    <path d="M16 4v15" />
    <path d="M12 15l4 4 4-4" />
  </Svg>
);
export const IconMore = () => (
  <Svg>
    <circle cx="5.5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
  </Svg>
);
