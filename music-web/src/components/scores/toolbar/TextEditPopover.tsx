import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DURATION_LABELS } from '../editor/durations';
import type { DurationType } from '../editor/durations';
import { DEFAULT_SIZE, SIZE_MAX, SIZE_MIN } from '../editor/header';
import type { HeaderField, HeaderState, TextStyle } from '../editor/header';
import { BPM_MAX, BPM_MIN } from '../editor/tempo';
import type { TempoInfo } from '../editor/tempo';

export type TextKind = HeaderField | 'tempo';

interface Props {
  kind: TextKind;
  /** Vị trí khung (toạ độ màn hình, góc trên trái). */
  left: number;
  top: number;
  header: HeaderState;
  tempo: TempoInfo | null;
  /** Áp dụng tiêu đề/tác giả; trả về true nếu thành công (khung đóng). */
  onApplyHeader: (field: HeaderField, text: string, style: TextStyle) => boolean;
  onApplyTempo: (info: TempoInfo) => boolean;
  onClose: () => void;
}

const UNITS: DurationType[] = ['whole', 'half', 'quarter', 'eighth', '16th'];

const TITLES: Record<TextKind, string> = {
  title: 'Sửa tiêu đề',
  composer: 'Sửa tên tác giả',
  tempo: 'Sửa nhịp độ',
};

/** Khung sửa chữ ở đầu bản nhạc: tiêu đề, tác giả (nội dung, cỡ chữ, đậm, nghiêng) và nhịp độ (tempo). */
export default function TextEditPopover({
  kind,
  left,
  top,
  header,
  tempo,
  onApplyHeader,
  onApplyTempo,
  onClose,
}: Props) {
  const field: HeaderField | null = kind === 'tempo' ? null : kind;
  const [text, setText] = useState(field ? header[field] : '');
  const [size, setSize] = useState(field && header.styles[field].size ? String(header.styles[field].size) : '');
  const [bold, setBold] = useState(field ? header.styles[field].bold : false);
  const [italic, setItalic] = useState(field ? header.styles[field].italic : false);
  const [bpm, setBpm] = useState(String(tempo?.bpm ?? 100));
  const [unit, setUnit] = useState<DurationType>(tempo?.unit ?? 'quarter');
  const [dotted, setDotted] = useState(tempo?.dotted ?? false);
  const [words, setWords] = useState(tempo?.words ?? '');
  const [error, setError] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  const apply = () => {
    if (field) {
      const value = size.trim() === '' ? null : Number(size);
      if (value !== null && (!Number.isFinite(value) || value < SIZE_MIN || value > SIZE_MAX)) {
        setError(`Cỡ chữ từ ${SIZE_MIN} đến ${SIZE_MAX}`);
        return;
      }
      if (onApplyHeader(field, text, { size: value, bold, italic })) onClose();
      return;
    }
    const value = Number(bpm);
    if (!Number.isFinite(value) || value < BPM_MIN || value > BPM_MAX) {
      setError(`Nhịp độ từ ${BPM_MIN} đến ${BPM_MAX}`);
      return;
    }
    if (onApplyTempo({ bpm: value, unit, dotted, words })) onClose();
  };

  // Giữ phím trong khung, không để phím tắt toàn trang (số, A–G, Delete...) chạy lên bản nhạc phía sau
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      apply();
    }
  };

  return (
    <div
      className="ed-pop ed-pop--text"
      style={{ left, top }}
      role="dialog"
      aria-label={TITLES[kind]}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ed-pop__name">
        <strong>{TITLES[kind]}</strong>
      </div>

      {field ? (
        <>
          <input
            ref={firstRef}
            className="ed-pop__input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Nội dung"
            maxLength={200}
          />
          <div className="ed-pop__row ed-pop__row--text">
            <label className="ed-pop__field">
              Cỡ chữ
              <input
                className="ed-pop__input ed-pop__input--num"
                type="number"
                min={SIZE_MIN}
                max={SIZE_MAX}
                value={size}
                placeholder={String(DEFAULT_SIZE[field])}
                onChange={(e) => setSize(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`ed-pop__btn${bold ? ' is-active' : ''}`}
              aria-pressed={bold}
              title="In đậm"
              onClick={() => setBold((v) => !v)}
              style={{ fontWeight: 700 }}
            >
              B
            </button>
            <button
              type="button"
              className={`ed-pop__btn${italic ? ' is-active' : ''}`}
              aria-pressed={italic}
              title="In nghiêng"
              onClick={() => setItalic((v) => !v)}
              style={{ fontStyle: 'italic' }}
            >
              I
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ed-pop__row ed-pop__row--text">
            <label className="ed-pop__field">
              Nốt
              <select className="ed-pop__input" value={unit} onChange={(e) => setUnit(e.target.value as DurationType)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {DURATION_LABELS[u]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ed-pop__check">
              <input type="checkbox" checked={dotted} onChange={(e) => setDotted(e.target.checked)} /> chấm dôi
            </label>
            <label className="ed-pop__field">
              = BPM
              <input
                ref={firstRef}
                className="ed-pop__input ed-pop__input--num"
                type="number"
                min={BPM_MIN}
                max={BPM_MAX}
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
              />
            </label>
          </div>
          <label className="ed-pop__field ed-pop__field--block">
            Chữ tốc độ (không bắt buộc)
            <input
              className="ed-pop__input"
              value={words}
              placeholder="Ví dụ: Allegro, Vui tươi"
              onChange={(e) => setWords(e.target.value)}
              maxLength={60}
            />
          </label>
        </>
      )}

      {error && (
        <div className="ed-pop__error" role="alert">
          {error}
        </div>
      )}
      <div className="ed-pop__actions">
        <button type="button" className="ed-pop__cancel" onClick={onClose}>
          Hủy
        </button>
        <button type="button" className="ed-pop__add" onClick={apply}>
          Lưu
        </button>
      </div>
    </div>
  );
}
