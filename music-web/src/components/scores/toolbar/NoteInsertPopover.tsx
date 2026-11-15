import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { durationLabel, nextDots } from '../../editor/notes/durations';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../../editor/notes/durations';
import { STEPS } from '../../editor/notes/pitch';
import { solfegeName } from '../../editor/core/staffHit';
import {
  ToolEighth,
  ToolFlat,
  ToolHalf,
  ToolNatural,
  ToolQuarter,
  ToolSharp,
  ToolSixteenth,
  ToolSixtyFourth,
  ToolThirtySecond,
  ToolWhole,
} from './ToolIcons';
import { t } from '../../../i18n/core';

interface Props {
  /** Vị trí khuông được bấm (kèm cao độ ban đầu). */
  target: InsertTarget;
  /** Toạ độ màn hình để đặt khung (góc trên trái, đã giới hạn trong cửa sổ). */
  left: number;
  top: number;
  initialDuration: DurationChoice;
  /** Thêm nốt; trả về true nếu thành công (khung sẽ đóng). */
  onAdd: (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice) => boolean;
  onClose: () => void;
}

const DURATIONS: { type: DurationType; icon: ReactNode; key: string }[] = [
  { type: 'whole', icon: <ToolWhole />, key: '5' },
  { type: 'half', icon: <ToolHalf />, key: '4' },
  { type: 'quarter', icon: <ToolQuarter />, key: '3' },
  { type: 'eighth', icon: <ToolEighth />, key: '2' },
  { type: '16th', icon: <ToolSixteenth />, key: '1' },
  { type: '32nd', icon: <ToolThirtySecond />, key: '6' },
  { type: '64th', icon: <ToolSixtyFourth />, key: '7' },
];

const ACCIDENTALS: { value: AccidentalChoice; icon?: ReactNode }[] = [
  { value: 'auto' },
  { value: 'sharp', icon: <ToolSharp /> },
  { value: 'flat', icon: <ToolFlat /> },
  { value: 'natural', icon: <ToolNatural /> },
];

/** Khung nhỏ hiện khi bấm vào khuông ở chế độ Nhập nốt: chọn trường độ, dấu hóa, chỉnh cao độ rồi bấm "Thêm". */
export default function NoteInsertPopover({ target, left, top, initialDuration, onAdd, onClose }: Props) {
  const [duration, setDuration] = useState<DurationChoice>(initialDuration);
  const [accidental, setAccidental] = useState<AccidentalChoice>('auto');
  const [shift, setShift] = useState(0);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    addRef.current?.focus();
  }, []);

  const base = STEPS.indexOf(target.step) + target.octave * 7;
  const index = base + shift;
  const step = STEPS[((index % 7) + 7) % 7];
  const octave = Math.floor(index / 7);
  const name = solfegeName(step, octave);

  const add = () => {
    if (onAdd({ ...target, step, octave }, duration, accidental)) onClose();
  };

  // Chặn phím lọt ra ngoài để các phím tắt toàn trang (số 1–5, A–G, Delete...) không đổi bản nhạc phía sau
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setShift((s) => s + (e.key === 'ArrowUp' ? 1 : -1));
    } else if (/^[1-7]$/.test(e.key)) {
      const found = DURATIONS.find((d) => d.key === e.key);
      if (found) setDuration((d) => ({ ...d, type: found.type }));
    } else if (e.key === '.') {
      setDuration((d) => ({ ...d, dots: nextDots(d.dots) }));
    }
  };

  return (
    <div
      className="ed-pop"
      style={{ left, top }}
      role="dialog"
      aria-label={t('editor.toolbar.insert.title')}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ed-pop__head">
        <div className="ed-pop__name">
          {t(target.restEntry !== null ? 'editor.toolbar.insert.replaceRest' : 'editor.toolbar.insert.title')}{' '}
          <strong>{name}</strong>
          <span className="ed-pop__latin">
            {' '}
            ({step}
            {octave})
          </span>
        </div>
        <div className="ed-pop__step">
          <button
            type="button"
            onClick={() => setShift((s) => s + 1)}
            aria-label={t('editor.toolbar.insert.higher')}
            title={t('editor.toolbar.insert.higherTitle')}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => setShift((s) => s - 1)}
            aria-label={t('editor.toolbar.insert.lower')}
            title={t('editor.toolbar.insert.lowerTitle')}
          >
            ▼
          </button>
        </div>
      </div>

      <div className="ed-pop__row" role="group" aria-label={t('editor.toolbar.insert.durationGroup')}>
        {DURATIONS.map((d) => (
          <button
            key={d.type}
            type="button"
            className={`ed-pop__btn${duration.type === d.type ? ' is-active' : ''}`}
            aria-pressed={duration.type === d.type}
            title={`${durationLabel(d.type)} (${d.key})`}
            onClick={() => setDuration((cur) => ({ ...cur, type: d.type }))}
          >
            {d.icon}
          </button>
        ))}
        <button
          type="button"
          className={`ed-pop__btn ed-pop__btn--dot${duration.dots > 0 ? ' is-active' : ''}`}
          aria-pressed={duration.dots > 0}
          title={t('editor.toolbar.insert.dotTitle')}
          onClick={() => setDuration((cur) => ({ ...cur, dots: nextDots(cur.dots) }))}
        >
          {'•'.repeat(Math.max(duration.dots, 1))}
        </button>
      </div>

      <div className="ed-pop__row" role="group" aria-label={t('editor.toolbar.insert.accidentalGroup')}>
        {ACCIDENTALS.map((a) => (
          <button
            key={a.value}
            type="button"
            className={`ed-pop__btn ed-pop__btn--wide${accidental === a.value ? ' is-active' : ''}`}
            aria-pressed={accidental === a.value}
            title={t(`editor.toolbar.accidental.${a.value}`)}
            onClick={() => setAccidental(a.value)}
          >
            {a.icon ?? t(`editor.toolbar.accidental.${a.value}`)}
          </button>
        ))}
      </div>

      <div className="ed-pop__actions">
        <button type="button" className="ed-pop__cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button ref={addRef} type="button" className="ed-pop__add" onClick={add}>
          {t('editor.toolbar.insert.add')}
        </button>
      </div>
    </div>
  );
}
