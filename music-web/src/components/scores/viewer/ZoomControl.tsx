import { useEffect, useRef, useState } from 'react';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../../utils/viewer';
import { IconMinus, IconPlus } from './ViewerIcons';

interface Props {
  /** Mức thu phóng hiện tại (%). */
  zoom: number;
  onChange: (zoom: number) => void;
}

/** Các mức chọn nhanh trong danh sách thả xuống. */
const PRESETS = [50, 75, 100, 125, 150, 200];

/**
 * Điều khiển thu phóng dạng viên thuốc: nút −, ô hiện số % (bấm để mở danh sách mức chọn nhanh và thanh trượt) và nút +.
 */
export default function ZoomControl({ zoom, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng danh sách
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sv-zoom" ref={ref} role="group" aria-label="Thu phóng">
      <button
        className="sv-zoom__step"
        onClick={() => onChange(zoom - ZOOM_STEP)}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Thu nhỏ"
        title="Thu nhỏ (phím -)"
      >
        <IconMinus />
      </button>
      <button
        className="sv-zoom__value"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Chọn mức thu phóng"
      >
        {zoom}%<span className="sv-zoom__caret" aria-hidden="true" />
      </button>
      <button
        className="sv-zoom__step"
        onClick={() => onChange(zoom + ZOOM_STEP)}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Phóng to"
        title="Phóng to (phím +)"
      >
        <IconPlus />
      </button>

      {open && (
        <div className="sv-zoom__pop" role="dialog" aria-label="Mức thu phóng">
          <div className="sv-zoom__title">
            Thu phóng <span>{zoom}%</span>
          </div>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={zoom}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Mức thu phóng"
          />
          <div className="sv-zoom__scale" aria-hidden="true">
            <span>{ZOOM_MIN}%</span>
            <span>{ZOOM_MAX}%</span>
          </div>
          <ul className="sv-zoom__presets">
            {PRESETS.map((value) => (
              <li key={value}>
                <button
                  className={zoom === value ? 'is-active' : ''}
                  aria-pressed={zoom === value}
                  onClick={() => {
                    onChange(value);
                    setOpen(false);
                  }}
                >
                  {value}%
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
