import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthImage from '../../../components/scores/common/AuthImage';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import Modal from '../../../components/scores/common/Modal';
import { downloadScoreExport, fetchKern, fetchMusicXml, omrApi, scoreApi } from '../../../services';
import type { OmrMeasure, OmrResult, ScoreDetail as ScoreDetailData, ScoreFileInfo } from '../../../types';
import { boxToPercent, flaggedMeasures, isValidScoreId, MEASURE_FLAG_LABELS, parseWarning } from '../../../utils/omr';
import {
  getErrorMessage,
  getHttpStatus,
  getUploadErrorMessage,
  toSafeFileName,
  useScoreBase,
} from '../../../utils/score';
import '../../../components/scores/scores.css';
import '../library/ScoreLibrary.css';
import '../library/ScoreDetail.css';
import './ScoreProcessing.css';
import './ScoreReview.css';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';
type Tab = 'score' | 'check' | 'warnings' | 'kern';

/**
 * Trang /scores/:id/review: xem lại kết quả số hóa (đặc tả mục 2.5, bản đầu).
 * Hiện tóm tắt, ảnh từng trang cạnh bản nhạc vẽ từ MusicXML (OSMD), danh sách ô cần kiểm tra (khoanh trên ảnh trang,
 * bấm ô để xem đúng ô đó vẽ từ MusicXML), cảnh báo theo trang, chuỗi **kern đã ghép và nút tải MusicXML / MIDI.
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
  const [kern, setKern] = useState<string | null>(null);
  const [kernError, setKernError] = useState(false);
  const [xml, setXml] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState(false);
  const [exporting, setExporting] = useState<'musicxml' | 'midi' | null>(null);
  const [redoOpen, setRedoOpen] = useState(false);
  const [redoPreprocess, setRedoPreprocess] = useState(true);
  const [busy, setBusy] = useState(false);
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

  // Chỉ tải chuỗi kern khi người dùng mở tab Kern lần đầu
  useEffect(() => {
    if (tab !== 'kern' || !id || !hasKern || kern !== null || kernError) return;
    let cancelled = false;
    fetchKern(id)
      .then((text) => !cancelled && setKern(text))
      .catch(() => !cancelled && setKernError(true));
    return () => {
      cancelled = true;
    };
  }, [tab, id, hasKern, kern, kernError]);

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

  const warnings = useMemo(() => (result?.warnings ?? []).map(parseWarning), [result]);
  const flagged = useMemo(() => flaggedMeasures(result?.measureMap), [result]);
  /** Ô theo trang, để vẽ khung trên ảnh. */
  const measuresByPage = useMemo(() => {
    const byPage = new Map<number, OmrMeasure[]>();
    for (const m of result?.measureMap ?? []) {
      if (!m.box) continue;
      byPage.set(m.page, [...(byPage.get(m.page) ?? []), m]);
    }
    return byPage;
  }, [result]);
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
    const url = URL.createObjectURL(new Blob([kern], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toSafeFileName(score.title)}.krn`;
    link.click();
    // Thu hồi chậm một nhịp để trình duyệt kịp bắt đầu tải
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async (kind: 'musicxml' | 'midi') => {
    if (!id || !score) return;
    setExporting(kind);
    try {
      await downloadScoreExport(id, kind, `${score.title || 'ban-nhac'}.${kind === 'midi' ? 'mid' : 'musicxml'}`);
    } catch (err) {
      toast.error(
        getErrorMessage(err, kind === 'midi' ? 'Không tạo hoặc tải được file MIDI' : 'Không tải được file MusicXML'),
      );
    } finally {
      setExporting(null);
    }
  };

  const handleCopyKern = async () => {
    if (kern == null) return;
    try {
      await navigator.clipboard.writeText(kern);
      toast.success('Đã sao chép chuỗi kern');
    } catch {
      toast.error('Không sao chép được, hãy bôi đen và sao chép thủ công');
    }
  };

  const handleRedo = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await omrApi.retry(id, redoPreprocess);
      toast.success('Đã gửi nhận diện lại');
      navigate(`${base}/${id}/processing`);
    } catch (err) {
      toast.error(getUploadErrorMessage(err));
      setBusy(false);
    }
  };

  const navbar = (
    <div className="sc-backbar">
      <button type="button" className="sc-backlink" onClick={() => navigate(base)}>
        ‹ Thư viện
      </button>
    </div>
  );

  if (loadState === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container" aria-busy="true">
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
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{notFound ? 'Chưa có kết quả số hóa' : 'Không tải được kết quả'}</h3>
            <p>
              {notFound
                ? 'Bản nhạc không tồn tại, bạn không có quyền xem hoặc chưa được số hóa.'
                : 'Vui lòng thử lại sau.'}
            </p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(base)}>
              Về thư viện
            </button>
          </div>
        </main>
      </div>
    );
  }

  const imageMeasures = result.measureCheck?.imageMeasures ?? null;
  const summary: [string, string][] = [
    ['Số trang', (result.pageCount ?? score.pageCount ?? pages.length).toString()],
    ['Số ô nhịp', score.measureCount?.toString() ?? '—'],
    ...(imageMeasures != null ? ([['Số ô đếm trên ảnh', imageMeasures.toString()]] as [string, string][]) : []),
    ['Khóa / dấu hóa', score.keySignature || '—'], // dạng G, Bb, F#m
    ['Nhịp', score.timeSignature || '—'],
    ['Tempo', score.tempoBpm ? `${score.tempoBpm} BPM` : '—'],
    ['Cảnh báo', warnings.length.toString()],
  ];

  return (
    <div className="sc-page">
      {navbar}
      <main className="sc-container sr-container">
        <header className="sc-lib-head">
          <div>
            <h1>{score.title}</h1>
            <p>Kết quả số hóa · kiểm tra trước khi chỉnh sửa</p>
          </div>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate(`${base}/${score.id}`)}>
            Chi tiết bản nhạc
          </button>
        </header>

        <dl className="sc-facts sr-summary">
          {summary.map(([label, value]) => (
            <div key={label} className="sc-fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="sr-grid">
          <section className="sr-pages" aria-label="Ảnh các trang">
            <h2>Các trang</h2>
            {pages.length === 0 && <p className="sp-pages__hint">Chưa có ảnh trang nào.</p>}
            {pages.map((page) => (
              <figure
                key={page.id}
                className="sr-page"
                ref={(el) => {
                  if (page.pageNumber != null) pageRefs.current[page.pageNumber] = el;
                }}
              >
                <div className="sr-page__frame">
                  <AuthImage src={page.downloadUrl} alt={`Trang ${page.pageNumber}`} className="sr-page__img" />
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
                        title={`Ô ${m.measure}`}
                        aria-label={`Ô ${m.measure}`}
                        onClick={() => selectMeasure(m)}
                      />
                    );
                  })}
                </div>
                <figcaption>Trang {page.pageNumber}</figcaption>
              </figure>
            ))}
          </section>

          <section className="sr-side">
            <div className="sc-tabs" role="tablist">
              <button className="sc-tab" role="tab" aria-selected={tab === 'score'} onClick={() => setTab('score')}>
                Bản nhạc
              </button>
              <button className="sc-tab" role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>
                Ô cần kiểm tra <span className="sc-tab__count">{flagged.length}</span>
              </button>
              <button
                className="sc-tab"
                role="tab"
                aria-selected={tab === 'warnings'}
                onClick={() => setTab('warnings')}
              >
                Cảnh báo <span className="sc-tab__count">{warnings.length}</span>
              </button>
              <button className="sc-tab" role="tab" aria-selected={tab === 'kern'} onClick={() => setTab('kern')}>
                Kern
              </button>
            </div>

            {selectedMeasure && xml !== null && (
              <div className="sr-selected">
                <div className="sr-selected__bar">
                  <strong>
                    Ô {selectedMeasure.measure} · Trang {selectedMeasure.page}
                    {selectedMeasure.system != null ? `, hệ ${selectedMeasure.system}` : ''}
                  </strong>
                  <button className="sc-btn sc-btn--sm" onClick={() => setSelected(null)}>
                    Bỏ chọn
                  </button>
                </div>
                {selectedMeasure.flags.map((f) => (
                  <p key={f} className="sr-selected__flag">
                    {MEASURE_FLAG_LABELS[f]}
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
              <div className="sr-panel" role="tabpanel">
                {!hasMusicXml && <p className="sr-empty">Chưa có MusicXML cho bản nhạc này, hãy nhận diện lại.</p>}
                {hasMusicXml && xmlError && <div className="sc-error">Không tải được MusicXML</div>}
                {hasMusicXml && !xmlError && xml === null && <p className="sr-empty">Đang tải...</p>}
                {xml !== null &&
                  (result.pages.some((p) => p.firstMeasure != null && p.lastMeasure != null) ? (
                    [...result.pages]
                      .sort((a, b) => a.pageNumber - b.pageNumber)
                      .map((p) => (
                        <div key={p.pageNumber} className="sr-score-page">
                          <div className="sr-score-page__label">Trang {p.pageNumber}</div>
                          <MusicXmlViewer xml={xml} firstMeasure={p.firstMeasure} lastMeasure={p.lastMeasure} />
                        </div>
                      ))
                  ) : (
                    <MusicXmlViewer xml={xml} />
                  ))}
              </div>
            )}

            {tab === 'check' && (
              <div className="sr-panel" role="tabpanel">
                {flagged.length === 0 ? (
                  <p className="sr-empty">
                    {result.measureMap?.length
                      ? 'Không có ô nào nghi ngờ: tổng trường độ khớp số chỉ nhịp và số ô khớp ảnh.'
                      : 'Kết quả này chưa có bản đồ ô nhịp, hãy nhận diện lại để dùng chức năng này.'}
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
                            Ô {m.measure} · Trang {m.page}
                          </span>
                          {m.flags.map((f) => MEASURE_FLAG_LABELS[f]).join('; ')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'warnings' && (
              <div className="sr-panel" role="tabpanel">
                {warnings.length === 0 ? (
                  <p className="sr-empty">Không có cảnh báo nào. Các ô nhịp đều khớp số chỉ nhịp.</p>
                ) : (
                  <ul className="sr-warnings">
                    {warnings.map((w, i) => (
                      <li key={i}>
                        {w.page != null ? (
                          <button className="sr-warning" onClick={() => scrollToPage(w.page)}>
                            <span className="sr-warning__page">Trang {w.page}</span>
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

            {tab === 'kern' && (
              <div className="sr-panel" role="tabpanel">
                {!hasKern && <p className="sr-empty">Chưa có file kern cho bản nhạc này.</p>}
                {hasKern && kernError && <div className="sc-error">Không tải được chuỗi kern</div>}
                {hasKern && !kernError && kern === null && <p className="sr-empty">Đang tải...</p>}
                {kern !== null && (
                  <>
                    <div className="sr-kern__bar">
                      <button className="sc-btn sc-btn--sm" onClick={handleCopyKern}>
                        Sao chép
                      </button>
                      <button className="sc-btn sc-btn--sm sc-btn--primary" onClick={handleDownloadKern}>
                        Tải .krn
                      </button>
                    </div>
                    <pre className="sr-kern" tabIndex={0}>
                      {kern}
                    </pre>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="sp-actions sr-actions">
          <button
            className="sc-btn sc-btn--primary"
            disabled={!hasMusicXml}
            onClick={() => navigate(`${base}/${score.id}/edit`)}
          >
            {score.canEdit ? 'Chấp nhận và chỉnh sửa' : 'Xem bản nhạc'}
          </button>
          <button className="sc-btn" disabled title="Trình phát sẽ có ở bản sau">
            Nghe thử
          </button>
          {hasMusicXml && (
            <>
              <button className="sc-btn" disabled={exporting !== null} onClick={() => handleExport('musicxml')}>
                {exporting === 'musicxml' ? 'Đang tải...' : 'Tải MusicXML'}
              </button>
              <button className="sc-btn" disabled={exporting !== null} onClick={() => handleExport('midi')}>
                {exporting === 'midi' ? 'Đang tạo MIDI...' : 'Tải MIDI'}
              </button>
            </>
          )}
          {score.canEdit && (
            <button className="sc-btn" onClick={() => setRedoOpen(true)}>
              Nhận diện lại
            </button>
          )}
        </div>
        <p className="sr-hint">
          Chỉnh sửa và nghe thử trực tiếp sẽ có ở bản sau; bạn có thể tải MIDI để nghe thử bằng phần mềm khác.
        </p>
      </main>

      {redoOpen && (
        <Modal title="Nhận diện lại?" onClose={() => !busy && setRedoOpen(false)}>
          <p>Hệ thống sẽ chạy lại từ file gốc và thay kết quả hiện tại bằng kết quả mới.</p>
          <label className="sr-check">
            <input type="checkbox" checked={redoPreprocess} onChange={(e) => setRedoPreprocess(e.target.checked)} />
            Làm sạch và căn thẳng ảnh trước khi nhận diện
          </label>
          <div className="sc-modal__actions">
            <button className="sc-btn" disabled={busy} onClick={() => setRedoOpen(false)}>
              Để sau
            </button>
            <button className="sc-btn sc-btn--primary" disabled={busy} onClick={handleRedo}>
              {busy ? 'Đang gửi...' : 'Nhận diện lại'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
