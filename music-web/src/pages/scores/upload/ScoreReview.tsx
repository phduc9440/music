import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import AuthImage from '../../../components/scores/common/AuthImage';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import OmrRedoDialog from '../../../components/scores/omr/OmrRedoDialog';
import {
  downloadScoreExport,
  fetchKern,
  fetchMusicXml,
  fetchMusicXmlWithVersion,
  omrApi,
  saveBlob,
  saveMusicXml,
  scoreApi,
} from '../../../services';
import type { OmrMeasure, OmrResult, ScoreDetail as ScoreDetailData, ScoreFileInfo } from '../../../types';
import {
  boxToPercent,
  confidencePercent,
  fixMeasures,
  fixText,
  flaggedMeasures,
  isValidScoreId,
  MEASURE_FLAG_LABELS,
  resultWarnings,
} from '../../../utils/omr';
import { setMusicXmlTempo } from '../../../utils/musicXmlTempo';
import { reportPlanLimit } from '../../../utils/planLimit';
import {
  getErrorMessage,
  getHttpStatus,
  getSaveErrorMessage,
  toSafeFileName,
  useScoreBase,
} from '../../../utils/score';
import '../../../components/scores/scores.css';
import '../library/ScoreLibrary.css';
import '../library/ScoreDetail.css';
import './ScoreProcessing.css';
import './ScoreReview.css';
import { t } from '../../../i18n/core';
import Skeleton from '../../../components/ui/Skeleton';
import { BackLink } from '../../../components/ui';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';
type Tab = 'score' | 'check' | 'warnings' | 'fixes';

/** Khoảng nhịp độ cho phép sửa ngay ở trang kết quả (cùng giới hạn với Editor). */
const BPM_MIN = 20;
const BPM_MAX = 400;

/**
 * Trang /scores/:id/review: xem lại kết quả số hóa (đặc tả mục 2.5).
 * Hiện tóm tắt, ảnh từng trang cạnh bản nhạc vẽ từ MusicXML (OSMD), danh sách ô cần kiểm tra (khoanh trên ảnh trang,
 * bấm ô để xem đúng ô đó vẽ từ MusicXML), cảnh báo theo trang, những chỗ máy đã tự sửa, và nút nghe thử, tải MusicXML /
 * MIDI. Chuỗi **kern để gỡ lỗi nằm trong mục "Nâng cao" (OMR-05). Bản gốc có chữ/hợp âm trên khuông hoặc không đọc được
 * nhịp độ thì có cảnh báo và ô sửa nhịp độ ngay tại đây (OMR-13).
 */
export default function ScoreReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();

  const [loadStateRaw, setLoadState] = useState<LoadState>('loading');
  const loadState: LoadState = isValidScoreId(id) ? loadStateRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [result, setResult] = useState<OmrResult | null>(null);
  const [pages, setPages] = useState<ScoreFileInfo[]>([]);
  const [tab, setTab] = useState<Tab>('score');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [kern, setKern] = useState<string | null>(null);
  const [kernError, setKernError] = useState(false);
  const [xml, setXml] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState(false);
  const [exporting, setExporting] = useState<'musicxml' | 'midi' | null>(null);
  const [redoOpen, setRedoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // màn hẹp: các thao tác phụ thu vào một nút
  const [tempo, setTempo] = useState('');
  const [savingTempo, setSavingTempo] = useState(false);
  const [selected, setSelected] = useState<number | null>(null); // số ô đang chọn
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});

  // Tải bản nhạc, kết quả nhận diện và ảnh các trang
  useEffect(() => {
    if (!isValidScoreId(id)) return; // mã trên đường dẫn không hợp lệ: không gọi API
    let cancelled = false;
    (async () => {
      try {
        const [detail, res, png] = await Promise.all([
          scoreApi.detail(id),
          omrApi.result(id),
          scoreApi.files(id, 'PNG'),
        ]);
        if (cancelled) return;
        setScore(detail.data.result);
        setTempo(detail.data.result.tempoBpm ? String(detail.data.result.tempoBpm) : '');
        setResult(res.data.result);
        setPages([...png.data.result].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0)));
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        const status = getHttpStatus(err);
        setLoadState(status === 404 || status === 403 ? 'notFound' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const hasKern = !!result?.kernFileId;

  // Chỉ tải chuỗi kern khi người dùng mở mục Nâng cao lần đầu
  useEffect(() => {
    if (!advancedOpen || !id || !hasKern || kern !== null || kernError) return;
    let cancelled = false;
    fetchKern(id)
      .then((text) => !cancelled && setKern(text))
      .catch(() => !cancelled && setKernError(true));
    return () => {
      cancelled = true;
    };
  }, [advancedOpen, id, hasKern, kern, kernError]);

  const hasMusicXml = !!result?.musicXmlFileId;

  // Tải MusicXML khi mở tab Bản nhạc (mặc định)
  useEffect(() => {
    const needXml = tab === 'score' || tab === 'check' || selected !== null;
    if (!needXml || !id || !hasMusicXml || xml !== null || xmlError) return;
    let cancelled = false;
    fetchMusicXml(id)
      .then((text) => !cancelled && setXml(text))
      .catch(() => !cancelled && setXmlError(true));
    return () => {
      cancelled = true;
    };
  }, [tab, selected, id, hasMusicXml, xml, xmlError]);

  const warnings = useMemo(() => (result ? resultWarnings(result) : []), [result]);
  const fixes = useMemo(() => result?.autoFixes ?? [], [result]);
  const flagged = useMemo(() => flaggedMeasures(result?.measureMap), [result]);
  const textAbovePages = useMemo(() => (result?.textAbove ?? []).map((p) => p.page), [result]);
  /** Ô theo trang, để vẽ khung trên ảnh. */
  const measuresByPage = useMemo(() => {
    const byPage = new Map<number, OmrMeasure[]>();
    for (const m of result?.measureMap ?? []) {
      if (!m.box) continue;
      byPage.set(m.page, [...(byPage.get(m.page) ?? []), m]);
    }
    return byPage;
  }, [result]);
  const flaggedByPage = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of flagged) counts.set(m.page, (counts.get(m.page) ?? 0) + 1);
    return counts;
  }, [flagged]);
  const selectedMeasure = useMemo(
    () => (result?.measureMap ?? []).find((m) => m.measure === selected) ?? null,
    [result, selected],
  );

  /** Cuộn tới ảnh của trang có cảnh báo. */
  const scrollToPage = useCallback((page: number | null) => {
    if (page == null) return;
    pageRefs.current[page]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  /** Chọn một ô: khoanh trên ảnh trang và hiện ô đó vẽ từ MusicXML. */
  const selectMeasure = useCallback(
    (m: OmrMeasure) => {
      setSelected((cur) => (cur === m.measure ? null : m.measure));
      scrollToPage(m.page);
    },
    [scrollToPage],
  );

  const handleDownloadKern = () => {
    if (kern == null || !score) return;
    saveBlob(new Blob([kern], { type: 'text/plain;charset=utf-8' }), `${toSafeFileName(score.title)}.krn`);
  };

  const handleExport = async (kind: 'musicxml' | 'midi') => {
    if (!id || !score) return;
    setExporting(kind);
    try {
      await downloadScoreExport(id, kind, `${toSafeFileName(score.title)}.${kind === 'midi' ? 'mid' : 'musicxml'}`);
    } catch (err) {
      toast.error(getErrorMessage(err, kind === 'midi' ? t('upload.review.midiFailed') : t('upload.review.xmlFailed')));
    } finally {
      setExporting(null);
    }
  };

  const handleCopyKern = async () => {
    if (kern == null) return;
    try {
      await navigator.clipboard.writeText(kern);
      toast.success(t('upload.review.kernCopied'));
    } catch {
      toast.error(t('upload.review.kernCopyFailed'));
    }
  };

  /** Chọn ô theo số ô (từ chỗ tự sửa): mở đúng ô nếu có trong bản đồ ô nhịp. */
  const selectByNumber = (measure: number) => {
    const m = (result?.measureMap ?? []).find((x) => x.measure === measure);
    if (m) selectMeasure(m);
    else setSelected(measure);
  };

  /** Sửa nhịp độ ngay ở trang kết quả (OMR-13): ghi vào MusicXML thành một phiên bản mới. */
  const handleSaveTempo = async () => {
    if (!id || !score) return;
    const bpm = Number(tempo);
    if (!Number.isFinite(bpm) || bpm < BPM_MIN || bpm > BPM_MAX) {
      toast.error(t('upload.review.tempo.invalid', { min: BPM_MIN, max: BPM_MAX }));
      return;
    }
    setSavingTempo(true);
    try {
      const current = await fetchMusicXmlWithVersion(id);
      const saved = await saveMusicXml(
        id,
        setMusicXmlTempo(current.xml, bpm),
        current.version ?? score.currentVersion ?? 1,
      );
      setScore({ ...score, tempoBpm: saved.tempoBpm, currentVersion: saved.version });
      setXml(null); // vẽ lại bản nhạc với nhịp độ mới
      setXmlError(false);
      toast.success(t('upload.review.tempo.saved', { bpm: saved.tempoBpm }));
    } catch (err) {
      if (!reportPlanLimit(err)) toast.error(getSaveErrorMessage(err));
    } finally {
      setSavingTempo(false);
    }
  };

  const navbar = (
    <div className="sc-backbar">
      <BackLink label={t('upload.processing.backToLibrary')} onClick={() => navigate(base)} />
    </div>
  );

  if (loadState === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container sr-container" aria-busy="true">
          <div className="sc-skeleton sp-skeleton" />
        </main>
      </div>
    );
  }

  if (loadState !== 'ready' || !score || !result) {
    const notFound = loadState === 'notFound';
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container sr-container">
          <div className="sc-empty">
            <h3>{notFound ? t('upload.review.noResult') : t('upload.review.loadFailed')}</h3>
            <p>{notFound ? t('upload.review.noResultHint') : t('scores.detail.retryLater')}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(base)}>
              {t('upload.processing.toLibrary')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'score', label: t('upload.review.tabs.score') },
    { key: 'check', label: t('upload.review.tabs.check'), count: flagged.length },
    { key: 'warnings', label: t('upload.review.tabs.warnings'), count: warnings.length },
    // Chỗ máy tự sửa là thông tin, tách khỏi Cảnh báo (OMR-14)
    ...(fixes.length > 0 ? [{ key: 'fixes' as const, label: t('upload.review.tabs.fixes'), count: fixes.length }] : []),
  ];
  /** Mũi tên trái/phải, Home/End chuyển tab theo chuẩn WAI-ARIA. */
  const handleTabKey = (e: React.KeyboardEvent) => {
    const keys = tabs.map((t) => t.key);
    const cur = keys.indexOf(tab);
    let next: number;
    if (e.key === 'ArrowRight') next = (cur + 1) % keys.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + keys.length) % keys.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = keys.length - 1;
    else return;
    e.preventDefault();
    setTab(keys[next]);
    document.getElementById(`sr-tab-${keys[next]}`)?.focus();
  };
  const imageMeasures = result.measureCheck?.imageMeasures ?? null;
  // minor: trên màn hẹp chỉ giữ 4 ô chính (2 dòng) để ảnh trang không bị đẩy xuống dưới màn đầu (UI-02)
  const summary: { label: string; value: string; tone?: 'ok' | 'warn'; minor?: boolean }[] = [
    {
      label: t('upload.review.summary.pages'),
      value: (result.pageCount ?? score.pageCount ?? pages.length).toString(),
    },
    { label: t('upload.review.summary.measures'), value: score.measureCount?.toString() ?? '—' },
    ...(imageMeasures != null
      ? [
          {
            label: t('upload.review.summary.imageMeasures'),
            value: imageMeasures.toString(),
            tone: imageMeasures === score.measureCount ? ('ok' as const) : ('warn' as const),
            minor: true,
          },
        ]
      : []),
    { label: t('scores.hero.key'), value: score.keySignature || '—', minor: true }, // dạng G, Bb, F#m
    { label: t('scores.hero.timeSignature'), value: score.timeSignature || '—', minor: true },
    {
      label: t('upload.review.summary.tempo'),
      value: score.tempoBpm ? `${score.tempoBpm} BPM` : '—',
      tone: result.tempoDefaulted ? 'warn' : undefined,
      minor: true,
    },
    {
      label: t('upload.review.tabs.check'),
      value: flagged.length.toString(),
      tone: flagged.length > 0 ? 'warn' : 'ok',
    },
    {
      label: t('upload.review.tabs.warnings'),
      value: warnings.length.toString(),
      tone: warnings.length > 0 ? 'warn' : 'ok',
    },
  ];
  const editPath = `${base}/${score.id}/edit${score.canEdit && flagged.length > 0 ? '?check=1' : ''}`;
  const showSourceAlert = textAbovePages.length > 0 || !!result.tempoDefaulted;

  return (
    <div className="sc-page">
      {navbar}
      <main className="sc-container sr-container">
        <header className="sc-lib-head">
          <div>
            <h1 className="sc-title-clamp" title={score.title}>
              {score.title}
            </h1>
            <p>{t('upload.review.subtitle')}</p>
          </div>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate(`${base}/${score.id}`)}>
            {t('upload.review.details')}
          </button>
        </header>

        <dl className="sc-facts sr-summary">
          {summary.map(({ label, value, tone, minor }) => (
            <div key={label} className={`sc-fact${tone ? ` sr-fact--${tone}` : ''}${minor ? ' sr-fact--minor' : ''}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {showSourceAlert && (
          <section className="sr-source" role="status" aria-label={t('upload.review.source.label')}>
            {textAbovePages.length > 0 && (
              <p>
                <strong>{t('upload.review.source.textAboveTitle')}</strong>{' '}
                {t('upload.review.source.textAbove', { pages: textAbovePages.join(', ') })}
              </p>
            )}
            {result.tempoDefaulted && (
              <p>
                <strong>{t('upload.review.source.tempoTitle')}</strong> {t('upload.review.source.tempo')}
              </p>
            )}
            {score.canEdit && (
              <form
                className="sr-tempo"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveTempo();
                }}
              >
                <label htmlFor="sr-tempo">{t('upload.review.tempo.label')}</label>
                <input
                  id="sr-tempo"
                  className="sc-input"
                  type="number"
                  inputMode="numeric"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={tempo}
                  disabled={savingTempo}
                  onChange={(e) => setTempo(e.target.value)}
                />
                <span>BPM</span>
                <button
                  type="submit"
                  className="sc-btn sc-btn--sm"
                  disabled={savingTempo || !tempo || Number(tempo) === score.tempoBpm}
                >
                  {savingTempo ? t('upload.review.tempo.saving') : t('upload.review.tempo.save')}
                </button>
              </form>
            )}
          </section>
        )}

        <div className="sr-grid">
          <section className="sr-pages" aria-label={t('upload.review.pageImages')}>
            <div className="sr-pages__head">
              <h2>{t('upload.processing.pages')}</h2>
              {flagged.length > 0 && (
                <ul className="sr-legend" aria-label={t('upload.review.legend')}>
                  <li>
                    <i className="sr-legend__dot sr-legend__dot--flag" /> {t('upload.review.legendFlag')}
                  </li>
                  <li>
                    <i className="sr-legend__dot sr-legend__dot--active" /> {t('upload.review.legendActive')}
                  </li>
                </ul>
              )}
            </div>
            {pages.length === 0 && <p className="sp-pages__hint">{t('upload.review.noPages')}</p>}
            {pages.map((page) => (
              <figure
                key={page.id}
                className="sr-page"
                ref={(el) => {
                  if (page.pageNumber != null) pageRefs.current[page.pageNumber] = el;
                }}
              >
                <div className="sr-page__frame">
                  <AuthImage
                    src={page.downloadUrl}
                    alt={t('upload.review.page', { page: page.pageNumber ?? '' })}
                    className="sr-page__img"
                  />
                  {(page.pageNumber != null ? (measuresByPage.get(page.pageNumber) ?? []) : []).map((m) => {
                    const style = boxToPercent(m.box);
                    const warn = m.flags.length > 0;
                    if (!style || (!warn && m.measure !== selected)) return null; // chỉ vẽ ô nghi ngờ và ô đang chọn
                    return (
                      <button
                        key={m.measure}
                        type="button"
                        style={style}
                        className={`sr-box${warn ? ' sr-box--flag' : ''}${m.measure === selected ? ' sr-box--active' : ''}`}
                        title={`${t('upload.review.measure', { measure: m.measure })}${warn ? `: ${m.flags.map((f) => MEASURE_FLAG_LABELS[f]).join('; ')}` : ''}`}
                        aria-label={t('upload.review.measure', { measure: m.measure })}
                        aria-pressed={m.measure === selected}
                        onClick={() => selectMeasure(m)}
                      />
                    );
                  })}
                </div>
                <figcaption>
                  {t('upload.review.page', { page: page.pageNumber ?? '' })}
                  {page.pageNumber != null && (flaggedByPage.get(page.pageNumber) ?? 0) > 0 && (
                    <span className="sr-page__badge">
                      {t('upload.review.flaggedCount', { count: flaggedByPage.get(page.pageNumber) ?? 0 })}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </section>

          <section className="sr-side">
            <div
              className="sc-tabs sr-tabs"
              role="tablist"
              aria-label={t('upload.review.resultLabel')}
              onKeyDown={handleTabKey}
            >
              {tabs.map((t) => (
                <button
                  key={t.key}
                  id={`sr-tab-${t.key}`}
                  className="sc-tab"
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls="sr-tabpanel"
                  tabIndex={tab === t.key ? 0 : -1}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  {t.count != null && <span className="sc-tab__count">{t.count}</span>}
                </button>
              ))}
            </div>

            {selectedMeasure && xml !== null && (
              <div className="sr-selected">
                <div className="sr-selected__bar">
                  <strong>
                    {t('upload.review.selected', { measure: selectedMeasure.measure, page: selectedMeasure.page })}
                    {selectedMeasure.system != null
                      ? `, ${t('upload.review.system', { system: selectedMeasure.system })}`
                      : ''}
                  </strong>
                  <button className="sc-btn sc-btn--sm" onClick={() => setSelected(null)}>
                    {t('upload.review.deselect')}
                  </button>
                </div>
                {selectedMeasure.flags.length > 0 && confidencePercent(selectedMeasure) !== null && (
                  <p className="sr-selected__confidence">
                    {t('upload.review.confidence', { value: confidencePercent(selectedMeasure) ?? 0 })}
                  </p>
                )}
                {(selectedMeasure.reasons?.length
                  ? selectedMeasure.reasons
                  : selectedMeasure.flags.map((f) => MEASURE_FLAG_LABELS[f] ?? f)
                ).map((text, index) => (
                  <p key={index} className="sr-selected__flag">
                    {text}
                  </p>
                ))}
                <MusicXmlViewer
                  key={selectedMeasure.measure}
                  xml={xml}
                  firstMeasure={selectedMeasure.measure}
                  lastMeasure={selectedMeasure.measure}
                />
              </div>
            )}

            {tab === 'score' && (
              <div className="sr-panel" role="tabpanel" id="sr-tabpanel" aria-labelledby={`sr-tab-${tab}`}>
                {!hasMusicXml && <p className="sr-empty">{t('upload.review.noXml')}</p>}
                {hasMusicXml && xmlError && <div className="sc-error">{t('upload.review.xmlLoadFailed')}</div>}
                {hasMusicXml && !xmlError && xml === null && <Skeleton height={220} />}
                {xml !== null &&
                  (result.pages.some((p) => p.firstMeasure != null && p.lastMeasure != null) ? (
                    [...result.pages]
                      .sort((a, b) => a.pageNumber - b.pageNumber)
                      .map((p) => (
                        <div key={p.pageNumber} className="sr-score-page">
                          <div className="sr-score-page__label">
                            {t('upload.review.page', { page: p.pageNumber ?? '' })}
                          </div>
                          <MusicXmlViewer xml={xml} firstMeasure={p.firstMeasure} lastMeasure={p.lastMeasure} />
                        </div>
                      ))
                  ) : (
                    <MusicXmlViewer xml={xml} />
                  ))}
              </div>
            )}

            {tab === 'check' && (
              <div className="sr-panel" role="tabpanel" id="sr-tabpanel" aria-labelledby={`sr-tab-${tab}`}>
                {flagged.length === 0 ? (
                  <p className="sr-empty">
                    {result.measureMap?.length ? t('upload.review.noFlags') : t('upload.review.noMap')}
                  </p>
                ) : (
                  <ul className="sr-warnings">
                    {flagged.map((m) => (
                      <li key={m.measure}>
                        <button
                          className={`sr-warning${m.measure === selected ? ' sr-warning--active' : ''}`}
                          onClick={() => selectMeasure(m)}
                        >
                          <span className="sr-warning__page">
                            {t('upload.review.selected', { measure: m.measure, page: m.page })}
                          </span>
                          {m.flags.map((f) => MEASURE_FLAG_LABELS[f] ?? f).join('; ')}
                          {confidencePercent(m) !== null &&
                            ` · ${t('upload.review.confidence', { value: confidencePercent(m) ?? 0 })}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'warnings' && (
              <div className="sr-panel" role="tabpanel" id="sr-tabpanel" aria-labelledby={`sr-tab-${tab}`}>
                {warnings.length === 0 ? (
                  <p className="sr-empty">{t('upload.review.noWarnings')}</p>
                ) : (
                  <ul className="sr-warnings">
                    {warnings.map((w, i) => (
                      <li key={i}>
                        {w.page != null ? (
                          <button className="sr-warning" onClick={() => scrollToPage(w.page)}>
                            <span className="sr-warning__page">{t('upload.review.page', { page: w.page ?? '' })}</span>
                            {w.text}
                          </button>
                        ) : (
                          <span className="sr-warning">{w.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'fixes' && (
              <div className="sr-panel" role="tabpanel" id="sr-tabpanel" aria-labelledby={`sr-tab-${tab}`}>
                <p className="sr-fixes__intro">{t('upload.review.fixesIntro')}</p>
                <ul className="sr-warnings">
                  {fixes.map((fix, i) => (
                    <li key={i} className="sr-fix">
                      {fix.page != null && (
                        <span className="sr-warning__page">{t('upload.review.page', { page: fix.page })}</span>
                      )}
                      {fixText(fix)}
                      {fixMeasures(fix).length > 0 && (
                        <span className="sr-fix__measures">
                          {fixMeasures(fix).map((m) => (
                            <button
                              key={m}
                              type="button"
                              className="sc-btn sc-btn--sm"
                              aria-pressed={selected === m}
                              onClick={() => selectByNumber(m)}
                            >
                              {t('upload.review.measure', { measure: m })}
                            </button>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Chuỗi **kern chỉ để gỡ lỗi: thu vào mục Nâng cao, không chiếm một tab cho mọi người (OMR-05) */}
            <details className="sr-advanced" onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
              <summary>{t('upload.review.advanced')}</summary>
              {!hasKern && <p className="sr-empty">{t('upload.review.noKern')}</p>}
              {hasKern && kernError && <div className="sc-error">{t('upload.review.kernLoadFailed')}</div>}
              {hasKern && !kernError && kern === null && advancedOpen && <Skeleton height={160} />}
              {kern !== null && (
                <>
                  <div className="sr-kern__bar">
                    <button className="sc-btn sc-btn--sm" onClick={handleCopyKern}>
                      {t('upload.review.copy')}
                    </button>
                    <button className="sc-btn sc-btn--sm sc-btn--primary" onClick={handleDownloadKern}>
                      {t('upload.review.downloadKrn')}
                    </button>
                  </div>
                  <pre className="sr-kern" tabIndex={0}>
                    {kern}
                  </pre>
                </>
              )}
            </details>
          </section>
        </div>

        <div className="sp-actions sr-actions" role="toolbar" aria-label={t('upload.review.actions')}>
          <button className="sc-btn sc-btn--primary" disabled={!hasMusicXml} onClick={() => navigate(editPath)}>
            {score.canEdit ? t('upload.review.accept') : t('scores.hero.viewScore')}
          </button>
          <button
            className="sc-btn"
            disabled={!hasMusicXml}
            title={hasMusicXml ? undefined : t('scores.hero.noXmlPlay')}
            onClick={() => navigate(`${base}/${score.id}/play`)}
          >
            {t('upload.review.listen')}
          </button>
          <button
            type="button"
            className="sc-btn sr-actions__toggle"
            aria-expanded={moreOpen}
            aria-controls="sr-actions-more"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            {t('upload.review.moreActions')}
          </button>
          <div id="sr-actions-more" className={`sr-actions__more${moreOpen ? ' is-open' : ''}`}>
            {hasMusicXml && (
              <>
                <button className="sc-btn" disabled={exporting !== null} onClick={() => handleExport('musicxml')}>
                  {exporting === 'musicxml' ? t('common.loading') : t('upload.review.downloadXml')}
                </button>
                <button className="sc-btn" disabled={exporting !== null} onClick={() => handleExport('midi')}>
                  {exporting === 'midi' ? t('upload.review.creatingMidi') : t('upload.review.downloadMidi')}
                </button>
              </>
            )}
            {score.canEdit && (
              <button className="sc-btn" onClick={() => setRedoOpen(true)}>
                {t('upload.review.redo')}
              </button>
            )}
          </div>
        </div>
        {score.canEdit && flagged.length > 0 && <p className="sr-hint">{t('upload.review.hint')}</p>}
      </main>

      {redoOpen && (
        <OmrRedoDialog
          scoreId={score.id}
          onClose={() => setRedoOpen(false)}
          onStarted={() => navigate(`${base}/${score.id}/processing`)}
        />
      )}
    </div>
  );
}
