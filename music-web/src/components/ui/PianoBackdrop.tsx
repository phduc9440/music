import './piano-backdrop.css';

const WHITE_KEYS = 30;
const BLACK_AFTER = [0, 1, 3, 4, 5]; // vị trí phím đen trong mỗi quãng tám 7 phím trắng (C D F G A)
const PRESSED = [3, 8, 12, 17, 21, 26]; // phím trắng được "nhấn" lần lượt

/**
 * Hàng phím đàn piano làm hình nền ở đáy một khung (hero, trang đăng nhập): vài phím tự nhấn xuống và sáng lên. Chỉ để
 * trang trí (ẩn với trình đọc màn hình). Màu đổi bằng biến --pk-white, --pk-black, --pk-hot, --pk-line của khung chứa.
 */
export default function PianoBackdrop({ className = '' }: { className?: string }) {
  const w = 1500 / WHITE_KEYS;
  return (
    <svg
      className={`piano ${className}`}
      viewBox="0 0 1500 150"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: WHITE_KEYS }, (_, i) => {
        const pressed = PRESSED.indexOf(i);
        return (
          <rect
            key={i}
            className={pressed >= 0 ? 'piano__white piano__white--press' : 'piano__white'}
            style={pressed >= 0 ? { animationDelay: `${pressed * -1.1}s` } : undefined}
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
