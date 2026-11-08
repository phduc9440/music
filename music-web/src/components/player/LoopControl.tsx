import { useState } from 'react';
import { IconLoop } from './PlayerIcons';
import { PlayerPopover } from './PlayerPopover';
import { isLoopComplete } from './loop';
import type { LoopSettings } from './loop';

interface Props {
  loop: LoopSettings;
  /** Số ô nhịp của bản nhạc. */
  measureCount: number;
  /** Chỉ số ô (từ 0) đang phát, dùng cho nút "Đặt A / B". */
  currentMeasure: number;
  /** Đã đặt đủ A và B nhưng B không bao giờ được phát sau A (do thứ tự lặp lại của bản nhạc). */
  unreachable: boolean;
  onMark: (which: 'a' | 'b') => void;
  onChange: (patch: Partial<LoopSettings>) => void;
  onClear: () => void;
  /** Hiện mẹo chọn đoạn bằng Shift + kéo trên bản nhạc (trang phát). */
  showDragHint?: boolean;
  disabled?: boolean;
}

/** Ô nhập số ô nhịp (tính từ 1). Chỉ áp dụng khi rời ô hoặc nhấn Enter để gõ "12" không bị đổi chỗ A/B ở chữ số đầu. */
function MeasureField({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number | null;
  max: number;
  onCommit: (index: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === '') return onCommit(null);
    const n = Number(text);
    if (Number.isInteger(n)) onCommit(Math.min(max, Math.max(1, n)) - 1);
  };
  return (
    <label className="pl-loop__field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className="pl-loop__input"
        min={1}
        max={max}
        value={draft ?? (value === null ? '' : String(value + 1))}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}

/**
 * Lặp đoạn A-B theo ô nhịp: đặt A / B tại ô đang phát hoặc gõ số ô, bật/tắt lặp, xóa đoạn. Trên trang phát còn chọn được
 * bằng Shift + kéo (hoặc Shift + bấm lần lượt hai ô) ngay trên bản nhạc.
 */
export function LoopControl({
  loop,
  measureCount,
  currentMeasure,
  unreachable,
  onMark,
  onChange,
  onClear,
  showDragHint,
  disabled,
}: Props) {
  const complete = isLoopComplete(loop);
  const hasAny = loop.a !== null || loop.b !== null;
  const summary = complete
    ? `Ô ${(loop.a ?? 0) + 1}–${(loop.b ?? 0) + 1}`
    : loop.a !== null
      ? `A ${loop.a + 1}`
      : 'A–B';

  return (
    <PlayerPopover
      label={loop.enabled ? `Lặp đoạn ${summary}` : 'Lặp đoạn A-B'}
      title="Lặp đoạn A-B"
      disabled={disabled}
      buttonClassName={loop.enabled ? 'pl-chip--on' : undefined}
      trigger={
        <span className="pl-chip__inner">
          <IconLoop />
          <span className="pl-chip__text">{summary}</span>
        </span>
      }
    >
      <div className="pl-loop">
        <div className="pl-loop__head">Lặp đoạn A-B</div>
        <div className="pl-loop__marks" role="group" aria-label="Đặt điểm A và B tại ô đang phát">
          <button type="button" className="pl-preset" onClick={() => onMark('a')}>
            Đặt A (ô {currentMeasure + 1})
          </button>
          <button type="button" className="pl-preset" onClick={() => onMark('b')}>
            Đặt B (ô {currentMeasure + 1})
          </button>
        </div>
        <div className="pl-loop__fields">
          <MeasureField label="Từ ô" value={loop.a} max={measureCount} onCommit={(a) => onChange({ a })} />
          <MeasureField label="Đến ô" value={loop.b} max={measureCount} onCommit={(b) => onChange({ b })} />
        </div>
        <button
          type="button"
          className={`pl-loop__toggle${loop.enabled ? ' pl-loop__toggle--on' : ''}`}
          aria-pressed={loop.enabled}
          disabled={!complete}
          title={complete ? undefined : 'Đặt cả A và B để bật lặp'}
          onClick={() => onChange({ enabled: !loop.enabled })}
        >
          {loop.enabled ? 'Đang lặp' : 'Bật lặp'}
        </button>
        {!complete && <p className="pl-loop__note">Đặt cả A và B để bật lặp.</p>}
        {unreachable && (
          <p className="pl-loop__note pl-loop__note--warn" role="status">
            Đoạn này không được phát theo thứ tự lặp lại của bản nhạc nên chưa lặp được.
          </p>
        )}
        {showDragHint && (
          <p className="pl-loop__note">
            Mẹo: giữ Shift rồi kéo qua các ô trên bản nhạc (hoặc Shift + bấm hai ô) để chọn đoạn.
          </p>
        )}
        <button type="button" className="pl-link pl-loop__clear" onClick={onClear} disabled={!hasAny}>
          Xóa A-B
        </button>
      </div>
    </PlayerPopover>
  );
}
