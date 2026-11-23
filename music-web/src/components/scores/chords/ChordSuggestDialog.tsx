import { useState } from 'react';
import { CHORD_CREATIVITIES, CHORD_DENSITIES, CHORD_STYLES, chordApi } from '../../../services';
import type { ChordCreativity, ChordDensity, ChordStyle } from '../../../services';
import type { AiTaskInfo } from '../../../types';
import { hasKey, t } from '../../../i18n/core';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { getErrorCode, getErrorMessage, useScoreBase } from '../../../utils/score';
import { reportPlanLimit } from '../../../utils/planLimit';
import { useExportTask } from '../../export/useExportTask';
import { suggestionPath } from '../suggestions/suggestionUtils';
import Modal from '../common/Modal';
import './chordSuggest.css';

/** Mã lỗi BE: đã có một gợi ý hợp âm đang chờ duyệt (kèm result.suggestionId). */
const PENDING_CODE = 3132;
/** Mã lỗi của tác vụ khi mọi ô nhịp đã có hợp âm. */
const HARMONIZED_ERROR = 'CHORD_ALREADY_HARMONIZED';

interface Props {
  scoreId: string;
  onClose: () => void;
  /**
   * Gợi ý xong: nơi mở hộp tự xử lý (ví dụ nạp vào trình chỉnh sửa làm bản nháp). Không truyền thì mở trang duyệt đề
   * xuất như cũ.
   */
  onCompleted?: (suggestionId: string) => void;
  /** Biết trước mọi ô đã có hợp âm (trình chỉnh sửa tự kiểm): hỏi thay hợp âm cũ ngay, không phải chạy thử. */
  allHarmonized?: boolean;
  /** Xóa hết hợp âm (người sửa được). Không truyền thì không hiện nút. */
  onClearAll?: () => void;
}

/** Lỗi của tác vụ (mã đứng trước dấu ":" trong errorMessage) dịch theo chords.taskErrors, mã lạ thì báo chung. */
function taskErrorText(message?: string | null): string {
  const code = (message ?? '').split(':')[0].trim();
  return hasKey(`chords.taskErrors.${code}`) ? t(`chords.taskErrors.${code}`) : t('chords.failed');
}

/**
 * Hộp "Gợi ý hợp âm" (R3): chọn phong cách, tạo tác vụ, chờ xong rồi mở trang duyệt đề xuất do hệ thống gửi.
 * Đóng hộp khi đang chạy thì tác vụ vẫn chạy ở máy chủ; đề xuất sẽ có ở tab Đề xuất và trong thông báo.
 */
export default function ChordSuggestDialog({ scoreId, onClose, onCompleted, allHarmonized, onClearAll }: Props) {
  const navigate = useNavigate();
  const base = useScoreBase();
  const [style, setStyle] = useState<ChordStyle>('POP');
  const [creativity, setCreativity] = useState<ChordCreativity>('BALANCED');
  const [density, setDensity] = useState<ChordDensity>('NORMAL');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Mọi ô đã có hợp âm: hỏi có muốn gợi ý lại (thay hợp âm cũ) hoặc xóa hết không
  const [harmonized, setHarmonized] = useState(!!allHarmonized);

  const onFinished = (task: AiTaskInfo) => {
    const suggestionId = task.resultData?.suggestionId;
    if (task.status === 'COMPLETED' && typeof suggestionId === 'string') {
      if (onCompleted) onCompleted(suggestionId);
      else navigate(suggestionPath(base, scoreId, suggestionId));
      return;
    }
    if (task.status === 'FAILED' && (task.errorMessage ?? '').split(':')[0].trim() === HARMONIZED_ERROR) {
      setHarmonized(true);
      return;
    }
    setError(task.status === 'CANCELLED' ? t('chords.cancelled') : taskErrorText(task.errorMessage));
  };
  const { task, track, reset } = useExportTask(onFinished);
  const running = !!task && (task.status === 'PENDING' || task.status === 'PROCESSING');
  const busy = sending || running;

  const submit = async () => {
    if (busy) return;
    setSending(true);
    setError(null);
    setPendingId(null);
    reset();
    try {
      const res = await chordApi.request(scoreId, style, { replaceExisting: harmonized, creativity, density });
      track(res.data.result);
    } catch (err) {
      if (reportPlanLimit(err)) {
        onClose();
        return;
      }
      if (getErrorCode(err) === PENDING_CODE) {
        const result = (err as { response?: { data?: { result?: { suggestionId?: string } } } }).response?.data?.result;
        setPendingId(result?.suggestionId ?? null);
      }
      setError(getErrorMessage(err, t('chords.failed')));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={t('chords.dialog.title')} onClose={onClose} className="cs-modal">
      <p className="cs-hint">{t('chords.dialog.hint')}</p>

      <fieldset className="cs-styles" disabled={busy}>
        <legend className="sc-label">{t('chords.dialog.styleLabel')}</legend>
        {CHORD_STYLES.map((value) => (
          <label key={value} className={`cs-style${style === value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="chord-style"
              value={value}
              checked={style === value}
              onChange={() => setStyle(value)}
            />
            <span className="cs-style__text">
              <strong>{t(`chords.styles.${value}.name`)}</strong>
              <span>{t(`chords.styles.${value}.description`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="cs-knobs">
        <fieldset className="cs-knob" disabled={busy}>
          <legend className="sc-label">{t('chords.dialog.creativityLabel')}</legend>
          <div className="cs-segment">
            {CHORD_CREATIVITIES.map((value) => (
              <label key={value} className={`cs-segment__item${creativity === value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="chord-creativity"
                  value={value}
                  checked={creativity === value}
                  onChange={() => setCreativity(value)}
                />
                {t(`chords.creativity.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="cs-knob" disabled={busy}>
          <legend className="sc-label">{t('chords.dialog.densityLabel')}</legend>
          <div className="cs-segment">
            {CHORD_DENSITIES.map((value) => (
              <label key={value} className={`cs-segment__item${density === value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="chord-density"
                  value={value}
                  checked={density === value}
                  onChange={() => setDensity(value)}
                />
                {t(`chords.density.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {harmonized && (
        <div className="cs-harmonized" role="status">
          <strong>{t('chords.dialog.harmonizedTitle')}</strong>
          <p className="cs-hint">{t('chords.dialog.harmonizedHint')}</p>
          {onClearAll && (
            <button
              type="button"
              className="sc-btn sc-btn--danger cs-clear"
              onClick={onClearAll}
              disabled={busy}
              title={t('chords.dialog.clearAllHint')}
            >
              {t('chords.dialog.clearAll')}
            </button>
          )}
        </div>
      )}

      <div className="cs-status" aria-live="polite">
        {running && (
          <p className="cs-running">
            <span className="cs-spinner" aria-hidden="true" />
            {t('chords.dialog.running')}
          </p>
        )}
        {running && <p className="cs-hint">{t('chords.dialog.closeHint')}</p>}
      </div>

      {error && (
        <div className="sc-error cs-error" role="alert">
          <span>{error}</span>
          {pendingId && (
            <button
              type="button"
              className="sc-btn sc-btn--sm cs-open"
              onClick={() =>
                onCompleted ? onCompleted(pendingId) : navigate(suggestionPath(base, scoreId, pendingId))
              }
            >
              {t('chords.dialog.openPending')}
            </button>
          )}
        </div>
      )}

      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          {running ? t('chords.dialog.hide') : t('chords.dialog.cancel')}
        </button>
        <button type="button" className="sc-btn sc-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? t('chords.dialog.creating') : harmonized ? t('chords.dialog.replace') : t('chords.dialog.submit')}
        </button>
      </div>
    </Modal>
  );
}
