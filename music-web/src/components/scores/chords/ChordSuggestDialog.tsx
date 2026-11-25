import { useEffect, useState } from 'react';
import { CHORD_CREATIVITIES, CHORD_DENSITIES, CHORD_STYLES, billingApi, chordApi, fetchMusicXml } from '../../../services';
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
import { listMelodyChoices, melodyChoiceKey } from './melodyChoices';
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
  /** Biết trước bè nào đã có hợp âm ở mọi ô (trình chỉnh sửa tự kiểm): đổi bè giai điệu thì hỏi lại theo bè mới. */
  harmonizedOfPart?: (partIndex: number) => boolean;
  /** Số ô nhịp của bản nhạc (nếu đã biết): báo trước giới hạn ô của gói và khóa nút khi vượt, khỏi chờ máy chủ từ chối. */
  measureCount?: number | null;
}

/** Tùy chọn chỉ gói có quyền lợi chordAdvanced mới dùng được (khớp ChordStyle.isAdvanced, BOLD, DENSE ở BE). */
const ADVANCED: ReadonlySet<string> = new Set<string>(['COLORFUL', 'JAZZY', 'BOLD', 'DENSE']);

/** Gói thấp nhất cùng nhóm, xếp sau gói hiện tại và thỏa `fits`; null nếu không có. */
async function nextPlanWhere(current: PlanInfo, fits: (p: PlanInfo) => boolean): Promise<string | null> {
  try {
    const res = await billingApi.plans();
    const next = res.data.result
      .filter((p) => p.audience === current.audience && p.sortOrder > current.sortOrder && fits(p))
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
export default function ChordSuggestDialog({
  scoreId,
  onClose,
  onCompleted,
  allHarmonized,
  onClearAll,
  harmonizedOfPart,
  measureCount,
}: Props) {
  const navigate = useNavigate();
  const base = useScoreBase();
  const [style, setStyle] = useState<ChordStyle>('NATURAL');
  const [creativity, setCreativity] = useState<ChordCreativity>('BALANCED');
  const [density, setDensity] = useState<ChordDensity>('NORMAL');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Mọi ô đã có hợp âm: hỏi có muốn gợi ý lại (thay hợp âm cũ) hoặc xóa hết không
  const [harmonized, setHarmonized] = useState(!!allHarmonized);
  // Gói của người bấm: khóa tùy chọn nâng cao và hiện số lượt còn lại. Chưa tải được thì không khóa gì (BE vẫn kiểm).
  const [sub, setSub] = useState<MySubscription | null>(null);
  // Bè giai điệu (CH-04): đọc danh sách bè từ bản nhạc đã lưu; chỉ hiện ô chọn khi có từ hai lựa chọn trở lên
  const [melodies, setMelodies] = useState<MelodyChoice[]>([]);
  const [melodyKey, setMelodyKey] = useState('');

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

  useEffect(() => {
    let alive = true;
    fetchMusicXml(scoreId)
      .then((xml) => {
        if (!alive) return;
        const choices = listMelodyChoices(xml);
        setMelodies(choices);
        setMelodyKey(choices[0] ? melodyChoiceKey(choices[0]) : '');
        if (choices[0] && harmonizedOfPart) setHarmonized(harmonizedOfPart(choices[0].partIndex));
      })
      .catch(() => undefined); // không đọc được: không hiện ô chọn, BE tự lấy bè mặc định
    return () => {
      alive = false;
    };
    // harmonizedOfPart là hàm tạo lại mỗi lần vẽ: chỉ đọc lúc bản nhạc vừa tải xong
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId]);
  const melody = melodies.find((c) => melodyKey === melodyChoiceKey(c));
  const melodyLabel = (c: MelodyChoice) => {
    const part = c.partName || t('chords.dialog.melodyPart', { n: c.partIndex + 1 });
    return c.staffCount > 1 ? t('chords.dialog.melodyPartStaff', { part, staff: c.staff }) : part;
  };

  const unlimited = sub?.status === 'UNLIMITED';
  const limits = sub?.limits;
  const locked = (value: string) => !!sub && !unlimited && !limits?.chordAdvanced && ADVANCED.has(value);
  const anyLocked = !!sub && !unlimited && !limits?.chordAdvanced;
  const quota = unlimited ? null : (limits?.chordGenerationsPerMonth ?? null);
  const left = quota == null ? null : Math.max(0, quota - (sub?.chordGenerationsUsed ?? 0));
  const options = unlimited ? 3 : Math.min(3, Math.max(1, limits?.chordOptions ?? 3));
  // Giới hạn số ô của gói (null: không giới hạn). Biết trước số ô thì báo ngay và khóa nút khi vượt (CH-05)
  const maxMeasures = unlimited ? null : (limits?.chordMaxMeasures ?? null);
  const knownMeasures = typeof measureCount === 'number' && measureCount > 0 ? measureCount : null;
  const overMeasures = knownMeasures != null && maxMeasures != null && knownMeasures > maxMeasures;

  /** Bấm tùy chọn bị khóa: không chọn, mở hộp mời nâng cấp (nằm trên hộp này, đóng xong vẫn ở lại). */
  const openUpgrade = async () => {
    const upgradeTo = sub ? await nextPlanWhere(sub.plan, (p) => !!p.limits.chordAdvanced) : null;
    showPlanLimit({ metric: 'CHORD_ADVANCED', limit: 0, used: 0, upgradeTo });
  };

  /** Bài dài hơn giới hạn ô của gói: mở hộp mời nâng cấp lên gói đủ ô (hoặc không giới hạn). */
  const openMeasuresUpgrade = async () => {
    const need = knownMeasures ?? 0;
    const upgradeTo = sub
      ? await nextPlanWhere(sub.plan, (p) => p.limits.chordMaxMeasures == null || p.limits.chordMaxMeasures >= need)
      : null;
    showPlanLimit({ metric: 'CHORD_MEASURES', limit: maxMeasures, used: need, upgradeTo });
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
      const res = await chordApi.request(scoreId, style, {
        replaceExisting: harmonized,
        creativity,
        density,
        // Chỉ gửi khi người dùng có thật sự để chọn (từ hai bè/khuông); một lựa chọn duy nhất là mặc định của BE
        ...(melodies.length > 1 && melody ? { melodyPart: melody.partIndex, melodyStaff: melody.staff } : {}),
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

      {melodies.length > 1 && (
        <fieldset className="cs-melody" disabled={busy}>
          <legend className="sc-label">{t('chords.dialog.melodyLabel')}</legend>
          <select
            className="sc-input"
            value={melodyKey}
            onChange={(e) => {
              setMelodyKey(e.target.value);
              // Mỗi bè có hợp âm riêng: hỏi "thay hợp âm cũ" theo bè vừa chọn, và bỏ cảnh báo của lần thử trước
              const next = melodies.find((c) => e.target.value === melodyChoiceKey(c));
              setHarmonized(next && harmonizedOfPart ? harmonizedOfPart(next.partIndex) : false);
              setError(null);
            }}
            aria-label={t('chords.dialog.melodyLabel')}
          >
            {melodies.map((c) => (
              <option key={melodyChoiceKey(c)} value={melodyChoiceKey(c)}>
                {melodyLabel(c)}
              </option>
            ))}
          </select>
          <p className="cs-hint">{t('chords.dialog.melodyHint')}</p>
        </fieldset>
      )}

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

      {knownMeasures != null && maxMeasures != null && (
        <p className={`cs-quota${overMeasures ? ' is-empty' : ''}`} role={overMeasures ? 'alert' : undefined}>
          {overMeasures
            ? t('chords.dialog.measuresOver', { count: knownMeasures, limit: maxMeasures })
            : t('chords.dialog.measures', { count: knownMeasures, limit: maxMeasures })}
          {overMeasures && (
            <button type="button" className="sc-btn sc-btn--sm cs-open" onClick={() => void openMeasuresUpgrade()}>
              {t('chords.dialog.measuresUpgrade')}
            </button>
          )}
        </p>
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
          disabled={busy || overMeasures}
          title={overMeasures ? t('chords.dialog.measuresOverHint') : undefined}
        >
          {busy ? t('chords.dialog.creating') : harmonized ? t('chords.dialog.replace') : t('chords.dialog.submit')}
        </button>
      </div>
    </Modal>
  );
}
