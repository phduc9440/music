import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DownloadMenu from '../../components/scores/DownloadMenu';
import EditorToolPanel from '../../components/scores/EditorToolPanel';
import ScoreCanvas from '../../components/scores/ScoreCanvas';
import ZoomControl from '../../components/scores/ZoomControl';
import {
  IconBack,
  IconEdit,
  IconExpand,
  IconPages,
  IconPlay,
  IconRedo,
  IconSave,
  IconScroll,
  IconShrink,
  IconUndo,
} from '../../components/scores/ViewerIcons';
import { fetchMusicXml, scoreApi } from '../../services';
import type { ScoreDetail as ScoreDetailData } from '../../types';
import { isValidScoreId } from '../../utils/omr';
import { getHttpStatus } from '../../utils/score';
import {
  ZOOM_DEFAULT,
  ZOOM_STEP,
  clampZoom,
  inspectMusicXml,
  loadViewerPrefs,
  performanceWarning,
  saveViewerPrefs,
} from '../../utils/viewer';
import type { MusicXmlInfo, ViewMode } from '../../utils/viewer';
import '../../components/scores/scores.css';
import './ScoreViewer.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'notReady' | 'parseError' | 'error';

/**
 * Trang /scores/:id/edit (đặc tả 1.17, bản chỉ xem): bản nhạc vẽ bằng OSMD, thanh công cụ có thu phóng 50–200%,
 * chế độ xem Trang / Cuộn ngang, toàn màn hình, tải MusicXML/MIDI. Bảng công cụ chỉnh sửa hiện khi canEdit nhưng
 * đang khóa, sẽ bật ở các nhánh editor-*. Responsive Desktop / iPad / Mobile.
 */
export default function ScoreViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const [phaseRaw, setPhase] = useState<Phase>('loading');
  const phase: Phase = isValidScoreId(id) ? phaseRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [info, setInfo] = useState<MusicXmlInfo | null>(null);
  const [prefs, setPrefs] = useState(loadViewerPrefs);
  const [pageCount, setPageCount] = useState(1);
  const [progress, setProgress] = useState(1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hideWarning, setHideWarning] = useState(false);

  const { zoom, mode } = prefs;

  // Tải thông tin bản nhạc rồi MusicXML hiện hành
  useEffect(() => {
    if (!isValidScoreId(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await scoreApi.detail(id);
        if (cancelled) return;
        setScore(detail.data.result);
        let text: string;
        try {
          text = await fetchMusicXml(id);
        } catch (err) {
          if (cancelled) return;
          // 409 = MUSICXML_NOT_READY (2012): chưa số hóa xong
          setPhase(getHttpStatus(err) === 409 ? 'notReady' : 'error');
          return;
        }
        if (cancelled) return;
        const parsed = inspectMusicXml(text);
        setInfo(parsed);
        setXml(text);
        setPhase(parsed.valid ? 'ready' : 'parseError');
      } catch (err) {
        if (cancelled) return;
        const status = getHttpStatus(err);
        setPhase(status === 404 || status === 403 ? 'notFound' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveViewerPrefs(next);
      return next;
    });
  }, []);

  const setZoom = useCallback((value: number) => updatePrefs({ zoom: clampZoom(value) }), [updatePrefs]);
  const setMode = (value: ViewMode) => {
    updatePrefs({ mode: value });
    setProgress(1);
  };

  // Phím tắt: + / - / 0 để thu phóng
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') setZoom(zoom + ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') setZoom(zoom - ZOOM_STEP);
      else if (e.key === '0') setZoom(ZOOM_DEFAULT);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, setZoom]);

  // Theo dõi trạng thái toàn màn hình (người dùng có thể thoát bằng Esc)
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      // trình duyệt không cho phép toàn màn hình: bỏ qua
    }
  };

  const warning = useMemo(() => (info ? performanceWarning(info) : ''), [info]);
  const notTwoStaves = info != null && info.valid && info.staves !== 2;
  const goBack = () => navigate(id ? `/scores/${id}` : '/scores');

  // ---- Các màn hình không xem được ----
  if (phase !== 'ready' || !score || !xml || !info) {
    let title = 'Đang tải bản nhạc...';
    let text = '';
    let action: { label: string; run: () => void } | null = null;
    if (phase === 'notFound') {
      title = 'Không tìm thấy bản nhạc';
      text = 'Bản nhạc không tồn tại hoặc bạn không có quyền xem.';
      action = { label: 'Về thư viện', run: () => navigate('/scores') };
    } else if (phase === 'notReady') {
      title = 'Bản nhạc chưa số hóa xong';
      text = 'Bản nhạc chưa có MusicXML. Hãy đợi nhận diện xong hoặc xem trang tiến độ.';
      action = { label: 'Về trang tiến độ', run: () => navigate(`/scores/${id}/processing`) };
    } else if (phase === 'parseError') {
      title = 'Không đọc được bản nhạc';
      text = 'File MusicXML bị lỗi nên không vẽ được. Bạn có thể tải file về để kiểm tra.';
      action = { label: 'Về trang chi tiết', run: goBack };
    } else if (phase === 'error') {
      title = 'Không tải được bản nhạc';
      text = 'Vui lòng thử lại sau.';
      action = { label: 'Tải lại', run: () => window.location.reload() };
    }
    return (
      <div className="sc-page sv-root sv-root--center">
        {phase === 'loading' ? (
          <div className="sv-state" aria-busy="true">
            <span className="sv-spinner" aria-hidden="true" />
            <p>{title}</p>
          </div>
        ) : (
          <div className="sv-state" role="alert">
            <h2>{title}</h2>
            <p>{text}</p>
            <div className="sv-state__actions">
              {action && (
                <button className="sc-btn sc-btn--primary" onClick={action.run}>
                  {action.label}
                </button>
              )}
              {phase === 'parseError' && score && <DownloadMenu scoreId={score.id} files={score.files} />}
            </div>
          </div>
        )}
      </div>
    );
  }

  const progressLabel =
    mode === 'scroll' ? `Vị trí ${progress}%` : `Trang ${Math.min(progress, pageCount)}/${pageCount}`;
  const measures = score.measureCount ?? info.measureCount;
  const summary = [
    measures ? `${measures} ô nhịp` : '',
    score.keySignature ? `Khóa ${score.keySignature}` : '',
    score.timeSignature ? `Nhịp ${score.timeSignature}` : '',
    score.tempoBpm ? `${score.tempoBpm} BPM` : '',
    score.currentVersion ? `Phiên bản ${score.currentVersion}` : '',
  ].filter(Boolean);

  return (
    <div className="sc-page sv-root" ref={rootRef}>
      <header className="sv-toolbar">
        <div className="sv-toolbar__left">
          <button className="sc-btn sv-icon" onClick={goBack} aria-label="Về trang chi tiết" title="Về trang chi tiết">
            <IconBack />
          </button>
          <div className="sv-title">
            <h1 title={score.title}>{score.title}</h1>
            <p>{score.composer || 'Chưa rõ tác giả'}</p>
          </div>
          <span className={`sv-badge${score.canEdit ? ' is-soon' : ''}`}>
            {score.canEdit ? 'Chỉ xem · chưa bật sửa' : 'Chỉ xem'}
          </span>
        </div>

        <div className="sv-toolbar__center">
          <div className="sv-segment" role="group" aria-label="Chế độ xem">
            <button aria-pressed={mode === 'page'} onClick={() => setMode('page')}>
              <IconPages /> Trang
            </button>
            <button aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>
              <IconScroll /> Cuộn ngang
            </button>
          </div>
          <ZoomControl zoom={zoom} onChange={setZoom} />
        </div>

        <div className="sv-toolbar__right">
          {score.canEdit && (
            <div className="sv-group sv-desktop-only">
              <button className="sc-btn sv-icon" disabled title="Hoàn tác (có ở nhánh editor-pitch)">
                <IconUndo />
              </button>
              <button className="sc-btn sv-icon" disabled title="Làm lại (có ở nhánh editor-pitch)">
                <IconRedo />
              </button>
              <button className="sc-btn" disabled title="Lưu (có ở nhánh editor-pitch)">
                <IconSave /> Lưu
              </button>
            </div>
          )}
          {score.canEdit && (
            <button className="sc-btn sv-mobile-only" onClick={() => setToolsOpen(true)}>
              <IconEdit /> Sửa
            </button>
          )}
          <button className="sc-btn sc-btn--primary" disabled title="Trình phát sẽ có ở nhánh playback-basic">
            <IconPlay /> Phát
          </button>
          <DownloadMenu scoreId={score.id} files={score.files} />
          <button
            className="sc-btn sv-icon"
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            title={fullscreen ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'}
            aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          >
            {fullscreen ? <IconShrink /> : <IconExpand />}
          </button>
        </div>
      </header>

      {(warning || notTwoStaves) && !hideWarning && (
        <div className="sv-banner" role="status">
          <span>
            {warning}
            {warning && notTwoStaves ? ' ' : ''}
            {notTwoStaves &&
              `Bản nhạc có ${info.staves} khuông (không phải 2) nên sau này không tách được tay trái/phải.`}
          </span>
          {warning && mode === 'page' && (
            <button className="sc-btn" onClick={() => setMode('scroll')}>
              Chuyển sang cuộn ngang
            </button>
          )}
          <button className="sv-banner__close" onClick={() => setHideWarning(true)} aria-label="Ẩn cảnh báo">
            ×
          </button>
        </div>
      )}

      <div className={`sv-body${score.canEdit ? ' has-tools' : ''}`}>
        {score.canEdit && <EditorToolPanel open={toolsOpen} onClose={() => setToolsOpen(false)} />}
        <div className="sv-stage">
          <ScoreCanvas
            xml={xml}
            zoom={zoom}
            mode={mode}
            onZoomChange={setZoom}
            onRendered={setPageCount}
            onProgress={setProgress}
            onError={() => setPhase('parseError')}
          />
          <div className="sv-pos" aria-live="polite">
            {progressLabel}
          </div>
        </div>
      </div>

      <footer className="sv-status">
        <span>{summary.join(' · ') || 'Bản nhạc'}</span>
        <span className="sv-status__hint">Ctrl + cuộn hoặc chụm hai ngón để thu phóng</span>
      </footer>
    </div>
  );
}
