import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import { statusTone, staleMessage, SUGGESTION_NOTE_MAX } from '../../../components/scores/suggestions/suggestionUtils';
import { useDialog } from '../../../components/ui/dialog-context';
import Skeleton from '../../../components/ui/Skeleton';
import { t } from '../../../i18n/core';
import { fetchMusicXml, suggestionApi } from '../../../services';
import type { SuggestionChange, SuggestionDetail } from '../../../types';
import { formatDateTime, getErrorCode, getErrorMessage, useScoreBase } from '../../../utils/score';
import '../../../components/scores/scores.css';
import '../../../components/scores/suggestions/suggestions.css';
import './SuggestionReview.css';

type Load = { phase: 'loading' } | { phase: 'ready'; detail: SuggestionDetail } | { phase: 'error'; message: string };

/** Mã lỗi BE khi bản chính vừa có phiên bản mới (If-Match lệch). */
const VERSION_CONFLICT_CODE = 2014;

/** Mọi ô còn chờ xử lý, chọn sẵn để nhận. */
const pendingIds = (detail: SuggestionDetail): Set<string> =>
  new Set(detail.changes.filter((c) => c.status === 'PENDING').map((c) => c.id));

/**
 * Trang xem xét một đề xuất sửa (mục 4.3): danh sách ô nhịp đã đổi, xem trước bản chính / bản đề xuất của từng ô, chọn ô
 * để nhận rồi Áp dụng, Từ chối kèm lý do, hoặc Rút lại (người đề xuất). Nút bị khóa khi đề xuất lỗi thời.
 */
export default function SuggestionReview() {
  const { id: scoreId, suggestionId } = useParams<{ id: string; suggestionId: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();
  const { confirm, prompt } = useDialog();

  const [load, setLoad] = useState<Load>({ phase: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  // Bản xem trước: mở một lần thì giữ nguyên XML của hai bên
  const [preview, setPreview] = useState<{ open: Set<string>; current: string | null; proposed: string | null }>({
    open: new Set(),
    current: null,
    proposed: null,
  });
  const [previewError, setPreviewError] = useState(false);

  const detailPath = scoreId ? `${base}/${scoreId}` : base;

  // Tăng lên để tải lại đề xuất (sau khi bản chính có phiên bản mới)
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!suggestionId) return;
    let cancelled = false;
    suggestionApi
      .get(suggestionId)
      .then((res) => {
        if (cancelled) return;
        setLoad({ phase: 'ready', detail: res.data.result });
        setSelected(pendingIds(res.data.result));
        // XML đã tải thuộc về lần trước nên bỏ đi, xem trước lấy lại từ đầu
        setPreview({ open: new Set(), current: null, proposed: null });
        setPreviewError(false);
      })
      .catch((err) => {
        if (!cancelled) setLoad({ phase: 'error', message: getErrorMessage(err, t('suggestions.review.notFound')) });
      });
    return () => {
      cancelled = true;
    };
  }, [suggestionId, tick]);

  const selectedCount = selected.size;
  const detail = load.phase === 'ready' ? load.detail : null;
  const isOpen = detail?.status === 'OPEN';
  const locked = busy || !detail?.canDecide || !isOpen || detail.stale;

  const toggleSelected = (changeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) next.delete(changeId);
      else next.add(changeId);
      return next;
    });

  const togglePreview = async (change: SuggestionChange) => {
    if (!detail) return;
    const open = new Set(preview.open);
    if (open.has(change.id)) {
      open.delete(change.id);
      setPreview({ ...preview, open });
      return;
    }
    open.add(change.id);
    setPreview({ ...preview, open });
    if (preview.current !== null && preview.proposed !== null) return;
    try {
      const [current, proposed] = await Promise.all([fetchMusicXml(detail.scoreId), suggestionApi.content(detail.id)]);
      setPreview((prev) => ({ ...prev, current, proposed }));
    } catch {
      setPreviewError(true);
    }
  };

  const onActionError = async (err: unknown) => {
    if (getErrorCode(err) === VERSION_CONFLICT_CODE) {
      const reloadNow = await confirm({
        title: t('suggestions.review.conflictTitle'),
        message: t('suggestions.review.conflictMessage'),
        confirmLabel: t('suggestions.review.reload'),
        cancelLabel: t('suggestions.review.keep'),
      });
      if (reloadNow) reload();
      return;
    }
    toast.error(getErrorMessage(err, t('suggestions.review.actionFailed')));
  };

  const apply = async () => {
    if (!detail || locked) return;
    if (!detail.structural && selected.size === 0) {
      toast.warn(t('suggestions.review.pickAtLeastOne'));
      return;
    }
    setBusy(true);
    try {
      const res = await suggestionApi.accept(
        detail.id,
        detail.currentVersion,
        detail.structural ? undefined : { changeIds: [...selected] },
      );
      setLoad({ phase: 'ready', detail: res.data.result });
      toast.success(t('suggestions.review.applied', { version: res.data.result.appliedVersion ?? '' }));
    } catch (err) {
      await onActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!detail || busy) return;
    const note = await prompt({
      title: t('suggestions.review.rejectTitle'),
      label: t('suggestions.review.rejectNote'),
      confirmLabel: t('suggestions.review.rejectConfirm'),
      tone: 'danger',
      maxLength: SUGGESTION_NOTE_MAX,
    });
    if (note === null) return;
    setBusy(true);
    try {
      const res = await suggestionApi.reject(detail.id, note.trim() ? { note: note.trim() } : undefined);
      setLoad({ phase: 'ready', detail: res.data.result });
      toast.success(t('suggestions.review.rejected'));
    } catch (err) {
      await onActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!detail || busy) return;
    const ok = await confirm({
      title: t('suggestions.review.withdrawConfirm'),
      confirmLabel: t('suggestions.review.withdraw'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await suggestionApi.withdraw(detail.id);
      toast.success(t('suggestions.review.withdrawn'));
      navigate(`${detailPath}?tab=suggestions`);
    } catch (err) {
      await onActionError(err);
      setBusy(false);
    }
  };

  const back = (
    <div className="sc-backbar">
      <button type="button" className="sc-backlink" onClick={() => navigate(`${detailPath}?tab=suggestions`)}>
        {t('suggestions.review.back')}
      </button>
    </div>
  );

  if (load.phase === 'loading') {
    return (
      <div className="sc-page">
        {back}
        <main className="sc-container" aria-busy="true">
          <Skeleton lines={5} />
        </main>
      </div>
    );
  }

  if (load.phase === 'error' || !detail) {
    return (
      <div className="sc-page">
        {back}
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{load.phase === 'error' ? load.message : t('suggestions.review.notFound')}</h3>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {back}
      <main className="sc-container sr-page">
        <header className="sr-head">
          <div className="sr-head__text">
            <div className="sr-head__badges">
              <span className={`sg-badge ${statusTone(detail.status)}`}>
                {t(`suggestions.status.${detail.status}`)}
              </span>
              {detail.structural && <span className="sg-badge">{t('suggestions.section.structural')}</span>}
            </div>
            <h1 className="sr-title">{detail.title}</h1>
            <p className="sr-meta">
              {t('suggestions.review.author')}: {detail.author?.name ?? t('suggestions.section.system')} ·{' '}
              {formatDateTime(detail.createdAt)} ·{' '}
              {t('suggestions.review.baseVersion', { version: detail.baseVersion })} ·{' '}
              {t('suggestions.review.currentVersion', { version: detail.currentVersion })}
            </p>
            {detail.description && <p className="sr-desc">{detail.description}</p>}
            {detail.decidedBy && (
              <p className="sr-meta">
                {t('suggestions.review.decidedBy', { name: detail.decidedBy.name })}
                {detail.appliedVersion
                  ? ` · ${t('suggestions.review.appliedVersion', { version: detail.appliedVersion })}`
                  : ''}
                {detail.decisionNote ? ` · ${t('suggestions.review.note', { note: detail.decisionNote })}` : ''}
              </p>
            )}
          </div>
          <div className="sr-actions">
            {detail.canDecide && isOpen && (
              <>
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  disabled={locked || (!detail.structural && selectedCount === 0)}
                  onClick={() => void apply()}
                >
                  {busy
                    ? t('suggestions.review.applying')
                    : detail.structural
                      ? t('suggestions.review.applyAll')
                      : t('suggestions.review.applySelected')}
                </button>
                <button type="button" className="sc-btn sc-btn--danger" disabled={busy} onClick={() => void reject()}>
                  {t('suggestions.review.reject')}
                </button>
              </>
            )}
            {detail.canWithdraw && (
              <button type="button" className="sc-btn" disabled={busy} onClick={() => void withdraw()}>
                {t('suggestions.review.withdraw')}
              </button>
            )}
          </div>
        </header>

        {isOpen && detail.stale && (
          <div className="sc-error" role="alert">
            {staleMessage(detail.staleReason)}
          </div>
        )}

        <section aria-label={t('suggestions.review.changes')}>
          <h2 className="sr-subtitle">
            {t('suggestions.review.changes')}
            {!detail.structural && isOpen && detail.canDecide && (
              <span className="sr-selected">{t('suggestions.review.selected', { count: selectedCount })}</span>
            )}
          </h2>
          {detail.structural ? (
            <p className="sr-meta">{t('suggestions.review.structuralNote')}</p>
          ) : detail.changes.length === 0 ? (
            <p className="sr-meta">{t('suggestions.review.noChanges')}</p>
          ) : (
            <ul className="sr-changes">
              {detail.changes.map((change) => {
                const decidable = isOpen && detail.canDecide && change.status === 'PENDING';
                const taken = selected.has(change.id);
                return (
                  <li key={change.id} className={`sr-change${decidable && !taken ? ' is-skipped' : ''}`}>
                    <div className="sr-change__row">
                      <div className="sr-change__label">
                        <strong>{t('suggestions.review.measure', { number: change.measureNumber })}</strong>
                        <span className="sr-meta">{change.partName}</span>
                        {change.conflict && (
                          <span className="sg-badge is-stale" title={t('suggestions.review.conflict')}>
                            {t('suggestions.review.conflict')}
                          </span>
                        )}
                        {!decidable && (
                          <span className="sg-badge">{t(`suggestions.changeStatus.${change.status}`)}</span>
                        )}
                      </div>
                      <div className="sr-change__actions">
                        <button type="button" className="sc-btn sc-btn--sm" onClick={() => void togglePreview(change)}>
                          {preview.open.has(change.id)
                            ? t('suggestions.review.hidePreview')
                            : t('suggestions.review.preview')}
                        </button>
                        {decidable && (
                          <button
                            type="button"
                            className={`sc-btn sc-btn--sm${taken ? ' sc-btn--primary' : ''}`}
                            aria-pressed={taken}
                            disabled={locked}
                            onClick={() => toggleSelected(change.id)}
                          >
                            {taken ? t('suggestions.review.take') : t('suggestions.review.skip')}
                          </button>
                        )}
                      </div>
                    </div>
                    {preview.open.has(change.id) && (
                      <ChangePreview
                        change={change}
                        current={preview.current}
                        proposed={preview.proposed}
                        failed={previewError}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/** Ô nhịp trước (bản chính) và sau (đề xuất), vẽ cạnh nhau. */
function ChangePreview({
  change,
  current,
  proposed,
  failed,
}: {
  change: SuggestionChange;
  current: string | null;
  proposed: string | null;
  failed: boolean;
}) {
  if (failed) return <p className="sc-error">{t('suggestions.review.previewFailed')}</p>;
  if (current === null || proposed === null) return <Skeleton height={120} />;
  const ordinal = change.measureIndex + 1;
  return (
    <div className="sr-preview">
      <figure>
        <figcaption>{t('suggestions.review.before')}</figcaption>
        <MusicXmlViewer xml={current} firstMeasure={ordinal} lastMeasure={ordinal} />
      </figure>
      <figure>
        <figcaption>{t('suggestions.review.after')}</figcaption>
        <MusicXmlViewer xml={proposed} firstMeasure={ordinal} lastMeasure={ordinal} />
      </figure>
    </div>
  );
}
