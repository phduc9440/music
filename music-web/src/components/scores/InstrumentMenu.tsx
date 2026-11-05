import { useEffect, useRef, useState } from 'react';
import { INSTRUMENTS } from '../editor/instruments';
import type { InstrumentId } from '../editor/instruments';
import type { PartInstrument } from '../editor/usePlayback';

/**
 * Menu "Nhạc cụ" cạnh nút Phát: mỗi part (khuông/đàn/giọng hát) chọn một âm sắc riêng. Mặc định theo file
 * (chương trình MIDI hoặc tên part); đổi tay thì có nút "Theo file" để về lại. Đổi giữa lúc đang phát có hiệu lực
 * ở lần phát sau.
 */
export default function InstrumentMenu({
  parts,
  onChange,
}: {
  parts: PartInstrument[];
  onChange: (partIndex: number, instrument: InstrumentId | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng menu
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

  if (parts.length === 0) return null;
  return (
    <div className="sc-menu" ref={ref}>
      <button
        className="sc-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Chọn nhạc cụ khi phát"
      >
        Nhạc cụ
      </button>
      {open && (
        <div className="sc-menu__list sv-instruments" role="dialog" aria-label="Chọn nhạc cụ cho từng khuông">
          {parts.map((part) => (
            <div key={part.index} className="sv-instrument-row">
              <label htmlFor={`sv-instrument-${part.index}`} className="sv-instrument-row__name">
                {part.label}
              </label>
              <select
                id={`sv-instrument-${part.index}`}
                className="sv-instrument-row__select"
                value={part.instrument}
                onChange={(e) => onChange(part.index, e.target.value as InstrumentId)}
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              {part.custom && (
                <button
                  className="sv-instrument-row__reset"
                  onClick={() => onChange(part.index, null)}
                  title="Về nhạc cụ nhận diện từ file"
                >
                  Theo file
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
