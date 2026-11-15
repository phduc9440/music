import { useState } from 'react';
import { describeTranspose, signedSemitones } from '../../editor/notes/transpose';
import type { KeySignature } from '../../editor/notes/transpose';
import { IconTranspose } from './PlayerIcons';
import { PlayerPopover } from './PlayerPopover';
import { MAX_TRANSPOSE, MIN_TRANSPOSE } from '../state/transposeRange';
import { t } from '../../../i18n/core';

interface Props {
  /** Số nửa cung đang chuyển (−12…+12). */
  semitones: number;
  /** Khóa nhạc đầu bài, để hiện tên giọng gốc và giọng mới. */
  startKey: KeySignature;
  /** Số nốt vượt âm vực piano sau khi chuyển (bị bỏ khi phát). */
  outOfRange: number;
  /** true: bản nhạc được vẽ lại theo giọng mới (trang phát); false: chỉ đổi âm thanh (Editor). */
  redraws: boolean;
  onChange: (semitones: number) => void;
  /**
   * Có thì hiện nút "Áp dụng vào bản nhạc" (người dùng được sửa): ghi giọng đang nghe thành nội dung bản nhạc. Trả về true
   * nếu đã áp dụng được (khi đó giọng nghe về 0).
   */
  onApply?: (semitones: number) => Promise<boolean> | boolean;
  /** Câu giải thích hậu quả của việc áp dụng, hiện ở bước xác nhận. */
  applyHint?: string;
  disabled?: boolean;
  /** Chỉ vẽ nội dung, dùng trong bottom sheet trên điện thoại. */
  inline?: boolean;
}

const OPTIONS = Array.from({ length: MAX_TRANSPOSE - MIN_TRANSPOSE + 1 }, (_, i) => MAX_TRANSPOSE - i);

/** Chuyển giọng khi nghe: nút −/+ theo nửa cung, danh sách −12…+12, tên giọng gốc → giọng mới và cảnh báo nốt vượt âm vực. */
export function TransposeControl({
  semitones,
  startKey,
  outOfRange,
  redraws,
  onChange,
  onApply,
  applyHint,
  disabled,
  inline,
}: Props) {
  const changed = semitones !== 0;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    if (!onApply || busy) return;
    setBusy(true);
    try {
      if (await onApply(semitones)) setConfirming(false);
    } finally {
      setBusy(false);
    }
  };
  const summary = describeTranspose(startKey, semitones);
  return (
    <PlayerPopover
      inline={inline}
      label={
        changed
          ? t('player.transpose.labelChanged', { value: signedSemitones(semitones) })
          : t('player.transpose.label')
      }
      title={t('player.transpose.title')}
      disabled={disabled}
      buttonClassName={changed ? 'pl-chip--on' : undefined}
      trigger={
        <span className="pl-chip__inner">
          <IconTranspose />
          <strong className="pl-tr__value">{signedSemitones(semitones)}</strong>
        </span>
      }
    >
      <div className="pl-tr">
        <div className="pl-tr__head">{t('player.transpose.label')}</div>
        <div className="pl-tr__stepper">
          <button
            type="button"
            className="pl-tr__step"
            onClick={() => onChange(semitones - 1)}
            disabled={semitones <= MIN_TRANSPOSE}
            aria-label={t('player.transpose.down')}
            title={t('player.transpose.down')}
          >
            −
          </button>
          <select
            className="pl-tr__select"
            value={semitones}
            aria-label={t('player.transpose.select')}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? t('player.transpose.original') : t('player.transpose.option', { value: signedSemitones(n) })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pl-tr__step"
            onClick={() => onChange(semitones + 1)}
            disabled={semitones >= MAX_TRANSPOSE}
            aria-label={t('player.transpose.up')}
            title={t('player.transpose.up')}
          >
            +
          </button>
        </div>
        <p className="pl-tr__key" aria-live="polite">
          {changed ? `${signedSemitones(semitones)} · ${summary}` : summary}
        </p>
        {outOfRange > 0 && (
          <p className="pl-tr__note pl-tr__note--warn" role="status">
            {t('player.transpose.outOfRange', { count: outOfRange })}
          </p>
        )}
        {changed && !redraws && (
          <p className="pl-tr__note">{t('player.transpose.listening', { value: signedSemitones(semitones) })}</p>
        )}
        {onApply && changed && !confirming && (
          <button type="button" className="pl-tr__apply" onClick={() => setConfirming(true)} disabled={outOfRange > 0}>
            {t('player.transpose.apply')}
          </button>
        )}
        {onApply && changed && confirming && (
          <div className="pl-tr__confirm" role="group" aria-label={t('player.transpose.confirm')}>
            <p className="pl-tr__note">
              {t('player.transpose.rewrite', { key: describeTranspose(startKey, semitones), hint: applyHint ?? '' })}
            </p>
            <div className="pl-tr__confirm-actions">
              <button type="button" className="pl-tr__apply" onClick={() => void apply()} disabled={busy}>
                {busy ? t('player.transpose.applying') : t('player.transpose.applyShort')}
              </button>
              <button type="button" className="pl-tr__cancel" onClick={() => setConfirming(false)} disabled={busy}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        <button type="button" className="pl-link pl-tr__reset" onClick={() => onChange(0)} disabled={!changed}>
          {t('player.transpose.reset')}
        </button>
      </div>
    </PlayerPopover>
  );
}
