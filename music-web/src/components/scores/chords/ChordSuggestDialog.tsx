import { useEffect, useState } from 'react';
import {
  CHORD_CREATIVITIES,
  CHORD_DENSITIES,
  CHORD_STYLES,
  billingApi,
  chordApi,
  fetchMusicXml,
} from '../../../services';
import type { ChordCreativity, ChordDensity, ChordStyle } from '../../../services';
import type { AiTaskInfo, MySubscription, PlanInfo } from '../../../types';
import { Icon } from '../../ui';
import { hasKey, t } from '../../../i18n/core';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { getErrorCode, getErrorMessage, useScoreBase } from '../../../utils/score';
import { reportPlanLimit, showPlanLimit } from '../../../utils/planLimit';
import { useExportTask } from '../../export/useExportTask';
import { suggestionPath } from '../suggestions/suggestionUtils';
import Modal from '../common/Modal';
import { melodyChoicesOf } from './melodyChoices';
import type { MelodyChoice } from './melodyChoices';
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

/** Tùy chọn chỉ gói có quyền lợi chordAdvanced mới dùng được (khớp ChordStyle.isAdvanced, BOLD, DENSE ở BE). */
const ADVANCED: ReadonlySet<string> = new Set<string>(['COLORFUL', 'JAZZY', 'BOLD', 'DENSE']);

/** Gói thấp nhất cùng nhóm, xếp sau gói hiện tại và có tùy chọn nâng cao; null nếu không có. */
async function planWithAdvanced(current: PlanInfo): Promise<string | null> {
  try {
    const res = await billingApi.plans();
    const next = res.data.result
      .filter((p) => p.audience === current.audience && p.sortOrder > current.sortOrder && p.limits.chordAdvanced)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return next?.code ?? null;
  } catch {
    return null;
  }
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
  const [style, setStyle] = useState<ChordStyle>('NATURAL');
  const [creativity, setCreativity] = useState<ChordCreativity>('BALANCED');
  const [density, setDensity] = useState<ChordDensity>('NORMAL');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Mọi ô đã có hợp âm: hỏi có muốn gợi ý lại (thay hợp âm cũ) hoặc xóa hết không
  // CH-06: biết trước từ bản đã lưu (bè đang chọn đã đủ hợp âm), không phải chạy thử một tác vụ lỗi; lỗi
  // ALREADY_HARMONIZED từ tác vụ vẫn bật lại cho trường hợp đọc bản nhạc thất bại
  const [harmonizedByTask, setHarmonized] = useState(false);
  // Gói của người bấm: khóa tùy chọn nâng cao và hiện số lượt còn lại. Chưa tải được thì không khóa gì (BE vẫn kiểm).
  const [sub, setSub] = useState<MySubscription | null>(null);
  // Bè giai điệu (CH-04): đọc từ bản đã lưu, vì AI gợi ý trên version hiện hành; chỉ hiện khi có từ hai lựa chọn
  const [melodies, setMelodies] = useState<MelodyChoice[]>([]);
  const [melody, setMelody] = useState(0);
  // Số ô của bản đã lưu (CH-05): biết trước bài dài hơn giới hạn gói thay vì bấm xong mới báo
  const [measureCount, setMeasureCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMusicXml(scoreId)
      .then((xml) => {
        if (!alive) return;
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        setMelodies(melodyChoicesOf(doc));
        const firstPart = doc.getElementsByTagName('part')[0];
        setMeasureCount(firstPart ? firstPart.getElementsByTagName('measure').length : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [scoreId]);

  useEffect(() => {
    let alive = true;
    billingApi
      .mine()
      .then((res) => alive && setSub(res.data.result))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const chosenMelody = melodies.length > 0 ? melodies[Math.min(melody, melodies.length - 1)] : undefined;
  const harmonized = !!allHarmonized || harmonizedByTask || !!chosenMelody?.harmonized;
  const unlimited = sub?.status === 'UNLIMITED';
  const limits = sub?.limits;
  const locked = (value: string) => !!sub && !unlimited && !limits?.chordAdvanced && ADVANCED.has(value);
  const anyLocked = !!sub && !unlimited && !limits?.chordAdvanced;
  const quota = unlimited ? null : (limits?.chordGenerationsPerMonth ?? null);
  const left = quota == null ? null : Math.max(0, quota - (sub?.chordGenerationsUsed ?? 0));
  const options = unlimited ? 3 : Math.min(3, Math.max(1, limits?.chordOptions ?? 3));
  const maxMeasures = unlimited ? null : (limits?.chordMaxMeasures ?? null);
  const tooLong = maxMeasures != null && measureCount != null && measureCount > maxMeasures;

  /** Bấm tùy chọn bị khóa: không chọn, mở hộp mời nâng cấp (nằm trên hộp này, đóng xong vẫn ở lại). */
  const openUpgrade = async () => {
    const upgradeTo = sub ? await planWithAdvanced(sub.plan) : null;
    showPlanLimit({ metric: 'CHORD_ADVANCED', limit: 0, used: 0, upgradeTo });
  };

  /** Chọn một giá trị; giá trị bị khóa theo gói thì mời nâng cấp thay vì chọn. */
  const pick = <T extends string>(value: T, set: (v: T) => void) => {
    if (locked(value)) void openUpgrade();
    else set(value);
  };

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
      const chosen = melodies.length > 1 ? melodies[melody] : undefined;
      const res = await chordApi.request(scoreId, style, {
        replaceExisting: harmonized,
        creativity,
        density,
        partIndex: chosen?.partIndex,
        staff: chosen?.staff,
      });
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

      {melodies.length > 1 && (
        <label className="cs-melody">
          <span className="sc-label">{t('chords.dialog.melodyLabel')}</span>
          <select
            className="sc-input"
            value={melody}
            disabled={busy}
            onChange={(e) => setMelody(Number(e.target.value))}
          >
            {melodies.map((choice, index) => (
              <option key={`${choice.partIndex}-${choice.staff}`} value={index}>
                {choice.label}
              </option>
            ))}
          </select>
          <span className="cs-hint">{t('chords.dialog.melodyHint')}</span>
        </label>
      )}

      <fieldset className="cs-styles" disabled={busy}>
        <legend className="sc-label">{t('chords.dialog.styleLabel')}</legend>
        {CHORD_STYLES.map((value) => (
          <label
            key={value}
            className={`cs-style${style === value ? ' is-selected' : ''}${locked(value) ? ' is-locked' : ''}`}
          >
            <input
              type="radio"
              name="chord-style"
              value={value}
              checked={style === value}
              onChange={() => pick(value, setStyle)}
            />
            <span className="cs-style__text">
              <strong>{t(`chords.styles.${value}.name`)}</strong>
              <span>{t(`chords.styles.${value}.description`)}</span>
            </span>
            {locked(value) && (
              <span className="cs-lock">
                <Icon name="lock" size={14} />
                {t('chords.dialog.lockedBadge')}
              </span>
            )}
          </label>
        ))}
      </fieldset>

      <div className="cs-knobs">
        <fieldset className="cs-knob" disabled={busy}>
          <legend className="sc-label">{t('chords.dialog.creativityLabel')}</legend>
          <div className="cs-segment">
            {CHORD_CREATIVITIES.map((value) => (
              <label
                key={value}
                className={`cs-segment__item${creativity === value ? ' is-selected' : ''}${locked(value) ? ' is-locked' : ''}`}
              >
                <input
                  type="radio"
                  name="chord-creativity"
                  value={value}
                  checked={creativity === value}
                  onChange={() => pick(value, setCreativity)}
                />
                {locked(value) && <Icon name="lock" size={13} />}
                {t(`chords.creativity.${value}`)}
                {locked(value) && <span className="cs-sr">{t('chords.dialog.lockedSr')}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="cs-knob" disabled={busy}>
          <legend className="sc-label">{t('chords.dialog.densityLabel')}</legend>
          <div className="cs-segment">
            {CHORD_DENSITIES.map((value) => (
              <label
                key={value}
                className={`cs-segment__item${density === value ? ' is-selected' : ''}${locked(value) ? ' is-locked' : ''}`}
              >
                <input
                  type="radio"
                  name="chord-density"
                  value={value}
                  checked={density === value}
                  onChange={() => pick(value, setDensity)}
                />
                {locked(value) && <Icon name="lock" size={13} />}
                {t(`chords.density.${value}`)}
                {locked(value) && <span className="cs-sr">{t('chords.dialog.lockedSr')}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {anyLocked && (
        <p className="cs-hint cs-locked-hint">
          <Icon name="lock" size={14} />
          {t('chords.dialog.lockedHint')}
        </p>
      )}

      {tooLong && (
        <div className="cs-harmonized" role="status">
          <strong>{t('chords.dialog.tooLongTitle', { count: measureCount ?? 0, max: maxMeasures ?? 0 })}</strong>
          <p className="cs-hint">{t('chords.dialog.tooLongHint')}</p>
          <button
            type="button"
            className="sc-btn sc-btn--sm"
            onClick={() =>
              showPlanLimit({
                metric: 'CHORD_MEASURES',
                limit: maxMeasures ?? 0,
                used: measureCount ?? 0,
                upgradeTo: null,
              })
            }
          >
            {t('chords.dialog.seePlans')}
          </button>
        </div>
      )}

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

      {sub && (
        <p className={`cs-quota${left === 0 ? ' is-empty' : ''}`}>
          {left == null
            ? t('chords.dialog.quotaUnlimited', { options })
            : t('chords.dialog.quota', { left, limit: quota ?? 0, options })}
        </p>
      )}

      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          {running ? t('chords.dialog.hide') : t('chords.dialog.cancel')}
        </button>
        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => void submit()}
          disabled={busy || tooLong}
        >
          {busy ? t('chords.dialog.creating') : harmonized ? t('chords.dialog.replace') : t('chords.dialog.submit')}
        </button>
      </div>
    </Modal>
  );
}
