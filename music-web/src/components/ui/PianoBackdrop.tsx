import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { playPianoNote } from '../../utils/pianoSynth';
import './piano-backdrop.css';

const WHITE_KEYS = 30;
const BLACK_AFTER = [0, 1, 3, 4, 5]; // vị trí phím đen trong mỗi quãng tám 7 phím trắng (C D F G A)
const PRESSED = [3, 8, 12, 17, 21, 26]; // phím trắng được "nhấn" lần lượt
const SCALE = [0, 2, 4, 5, 7, 9, 11]; // khoảng cách nửa cung của 7 phím trắng trong một quãng tám
const FIRST_MIDI = 48; // phím trắng đầu tiên là Đô 3

/**
 * Hàng phím đàn piano ở đáy một khung (trang đăng nhập). Mặc định chỉ để trang trí: vài phím tự nhấn xuống và sáng lên.
 * Có `playable` thì chơi được: bấm (hoặc vuốt lướt) lên phím là phím lún xuống, sáng màu đồng và phát tiếng đàn;
 * `onKey` nhận vị trí phím (0..1 theo chiều ngang) và lực bấm để khung chứa làm hiệu ứng đi kèm (dây đàn rung).
 * Đây là đồ chơi trang trí nên ẩn với trình đọc màn hình và không nằm trong thứ tự Tab của form.
 * Màu đổi bằng biến --pk-white, --pk-black, --pk-hot, --pk-line của khung chứa.
 */
export default function PianoBackdrop({
  className = '',
  playable = false,
  onKey,
}: {
  className?: string;
  playable?: boolean;
  onKey?: (ratio: number, velocity: number) => void;
}) {
  const w = 1500 / WHITE_KEYS;
  // người dùng đã tự chơi thì dừng các phím tự nhấn, để không lẫn với tiếng mình chơi
  const [touched, setTouched] = useState(false);
  const lastKey = useRef<Element | null>(null);

  const strike = (key: Element, e: ReactPointerEvent<SVGSVGElement>) => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    const midi = Number(key.getAttribute('data-midi'));
    const ratio = Number(key.getAttribute('data-x'));
    // bấm gần mép dưới phím mạnh hơn bấm gần mép trên, như đàn thật
    const r = key.getBoundingClientRect();
    const velocity = 0.45 + 0.5 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    playPianoNote(midi, velocity);
    onKey?.(ratio, velocity);
    key.setAttribute('data-down', '');
    window.setTimeout(() => key.removeAttribute('data-down'), 260);
    if (!touched) setTouched(true);
  };

  /** Phím dưới con trỏ: phím đen nằm trên phím trắng nên elementFromPoint trả đúng phím đen khi chạm vào nó. */
  const keyAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[data-midi]') ?? null;
  };

  const handlers = playable
    ? {
        onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => {
          lastKey.current = null;
          const key = keyAt(e.clientX, e.clientY);
          if (key) strike(key, e);
        },
        onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => {
          if (!(e.buttons & 1)) return;
          const key = keyAt(e.clientX, e.clientY);
          if (key) strike(key, e);
        },
        onPointerUp: () => {
          lastKey.current = null;
        },
        onPointerLeave: () => {
          lastKey.current = null;
        },
      }
    : {};

  return (
    <svg
      className={`piano${playable ? ' piano--play' : ''}${touched ? ' piano--touched' : ''} ${className}`}
      viewBox="0 0 1500 150"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      {...handlers}
    >
      {Array.from({ length: WHITE_KEYS }, (_, i) => {
        const pressed = PRESSED.indexOf(i);
        return (
          <rect
            key={i}
            className={pressed >= 0 ? 'piano__white piano__white--press' : 'piano__white'}
            style={pressed >= 0 ? { animationDelay: `${pressed * -1.1}s` } : undefined}
            data-midi={FIRST_MIDI + 12 * Math.floor(i / 7) + SCALE[i % 7]}
            data-x={((i + 0.5) / WHITE_KEYS).toFixed(4)}
            x={i * w + 1}
            y="0"
            width={w - 2}
            height="150"
            rx="5"
          />
        );
      })}
      {Array.from({ length: WHITE_KEYS }, (_, i) =>
        BLACK_AFTER.includes(i % 7) && i < WHITE_KEYS - 1 ? (
          <rect
            key={`b${i}`}
            className="piano__black"
            data-midi={FIRST_MIDI + 12 * Math.floor(i / 7) + SCALE[i % 7] + 1}
            data-x={((i + 1) / WHITE_KEYS).toFixed(4)}
            x={(i + 1) * w - w * 0.3}
            y="0"
            width={w * 0.6}
            height="92"
            rx="4"
          />
        ) : null,
      )}
    </svg>
  );
}
