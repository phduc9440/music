import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DownloadMenu from '../../components/scores/DownloadMenu';
import VersionHistoryPanel from '../../components/editor/VersionHistoryPanel';
import InstrumentMenu from '../../components/scores/InstrumentMenu';
import EditorToolPanel from '../../components/scores/EditorToolPanel';
import ChordBar from '../../components/scores/ChordBar';
import NotationModal from '../../components/scores/NotationModal';
import { readNotation } from '../../components/editor/staves';
import type { NotationChange } from '../../components/editor/staves';
import LyricBar from '../../components/scores/LyricBar';
import Modal from '../../components/scores/Modal';
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
  IconStop,
  IconScroll,
  IconShrink,
  IconUndo,
} from '../../components/scores/ViewerIcons';
import { syncTitle } from '../../components/editor/header';
import { ScoreDocument } from '../../components/editor/ScoreDocument';
import { DURATION_LABELS, dotsLabel } from '../../components/editor/durations';
import { PlayerBar } from '../../components/player/PlayerBar';
import { usePlayer } from '../../components/player/usePlayer';
import { useScoreEditor } from '../../components/editor/useScoreEditor';
import { countView } from '../../services/playbackApi';
import { fetchMusicXmlWithVersion, scoreApi } from '../../services';
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';

/** Danh sách phím tắt trong hộp thoại "Phím tắt" (mở bằng phím ?). */
const SHORTCUTS: [string, string][] = [
  ['Bấm / Shift + bấm', 'Chọn nốt / chọn thêm hoặc bỏ bớt'],
  ['Kéo khung / kéo nốt (chuột, bút)', 'Chọn vùng / kéo nốt lên xuống để đổi cao độ'],
  ['Tab / Shift + Tab', 'Sang nốt kế tiếp / trước đó'],
  ['[  /  ]', 'Chọn nốt thấp hơn / cao hơn trong hợp âm'],
  ['↑ / ↓', 'Lên / xuống một bậc'],
  [`${ALT} + ↑ / ↓`, 'Lên / xuống nửa cung'],
  [`${MOD} + ↑ / ↓`, 'Lên / xuống một quãng tám'],
  [`${MOD} + Z`, 'Hoàn tác'],
  [`${MOD} + Shift + Z  hoặc  ${MOD} + Y`, 'Làm lại'],
  [`${MOD} + S`, 'Lưu'],
  [
    '1 – 7',
    'Trường độ: móc kép, móc đơn, đen, trắng, tròn (1–5), móc ba, móc tứ (6–7); tròn đôi ở nút "Khác" (áp lên nốt chọn)',
  ],
  ['.', 'Chấm dôi: bấm lần 1 chấm dôi, lần 2 chấm dôi kép, lần 3 bỏ chấm'],
  [
    `${MOD} + 3`,
    'Chùm ba từ nốt/dấu lặng đang chọn (nhóm Trường độ → "Chùm…" còn có chùm hai, bốn, năm, sáu, bảy và "Bỏ chùm")',
  ],
  ['Bấm vào khuông (chế độ Nhập nốt)', 'Mở khung chọn nốt tại đúng dòng/khe đã bấm rồi bấm Thêm'],
  ['Kéo nút trường độ vào khuông', 'Thêm nốt có trường độ đó tại chỗ thả'],
  ['A – G (chế độ Nhập nốt)', 'Biến nốt/dấu lặng đang chọn thành nốt đó rồi sang mục kế tiếp'],
  ['Bấm vào tiêu đề, tên tác giả hoặc nhịp độ', 'Sửa nội dung; tiêu đề và tác giả sửa được cả cỡ chữ, đậm, nghiêng'],
  ['Chế độ Lời', 'Chọn nốt, gõ âm tiết rồi Space sang nốt kế; "-" khi một chữ trải qua nhiều nốt; Esc để thoát'],
  ['Chế độ Hợp âm', 'Chọn nốt, gõ hợp âm (C, Am7, G/B, C6/9, N.C....) rồi Space sang nốt kế; ô trống để xóa'],
  [
    'Nhóm Khuông nhạc',
    'Thêm khuông Fa cho đàn, thêm khuông Sol/Fa/Tenor riêng (SATB), xóa khuông; "Khóa · Dấu hóa · Nhịp…" đổi khóa (Sol, Sol 8 dưới, Fa, Đô), dấu hóa đầu khuông, nhịp giữa bài',
  ],
  ['Nhóm Ô nhịp', 'Thêm ô sau / chèn ô trước / xóa các ô đang chọn (hoàn tác được)'],
  [
    'Nhóm Viết bè',
    'Bè thân: thêm nốt chung thân cùng trường độ. Bè riêng: bè mới nhịp điệu riêng (bấm vào dấu lặng để nhập). Chép bè: sao cả ô sang bè mới',
  ],
  [
    'Nhóm Sắc thái',
    'Staccato, Accent, Tenuto, Fermata, Cresc./Dim. (chọn nốt đầu đến nốt cuối), pp…ff (đặt ở nốt đầu)',
  ],
  [
    'Nhóm Lặp lại & chỉ dẫn',
    'Dấu lặp |: :|, Nhà 1 / Nhà 2 (lời 2 hát đoạn khác), Segno, Coda, D.C., D.S., Fine, To Coda',
  ],
  ['T', 'Dấu nối: nối nốt đang chọn với nốt cùng cao độ liền sau (bấm lại để bỏ)'],
  ['S', 'Dấu luyến: chọn từ nốt đầu đến nốt cuối rồi bấm (bấm lại để bỏ)'],
  ['Delete', 'Xóa nốt đang chọn (hợp âm còn nốt khác thì giữ lại)'],
  ['Esc', 'Bỏ chọn'],
  ['+  /  -  /  0', 'Phóng to / thu nhỏ / về 100%'],
  ['?', 'Mở bảng này'],
];

/**
 * Trang /scores/:id/edit: tải thông tin bản nhạc và MusicXML hiện hành, hiện các màn hình trạng thái
 * (đang tải, không thấy, chưa số hóa xong, lỗi) hoặc trình chỉnh sửa {@link ScoreWorkspace}.
 */
export default function ScoreViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phaseRaw, setPhase] = useState<Phase>('loading');
  const phase: Phase = isValidScoreId(id) ? phaseRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [xmlVersion, setXmlVersion] = useState<number | null>(null);
  const [info, setInfo] = useState<MusicXmlInfo | null>(null);
  const [doc, setDoc] = useState<ScoreDocument | null>(null);

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
          const fetched = await fetchMusicXmlWithVersion(id);
          text = fetched.xml;
          setXmlVersion(fetched.version);
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
        if (!parsed.valid) {
          setPhase('parseError');
          return;
        }
        try {
          const opened = ScoreDocument.parse(text);
          // Tiêu đề trên bản nhạc theo tên bài hát trong ứng dụng (trừ khi đã tự sửa tiêu đề trong trình sửa)
          if (syncTitle(opened, detail.data.result.title)) setXml(opened.serialize());
          setDoc(opened);
          setPhase('ready');
        } catch {
          setPhase('parseError');
        }
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

  const goBack = () => navigate(id ? `/scores/${id}` : '/scores');

  if (phase === 'ready' && score && xml && info && doc) {
    return <ScoreWorkspace key={score.id} score={score} xml={xml} info={info} doc={doc} xmlVersion={xmlVersion} />;
  }

  // ---- Các màn hình không xem được ----
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
  } else if (phase === 'parseError' || (phase === 'ready' && !doc)) {
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
            {phase === 'parseError' && score && (
              <DownloadMenu scoreId={score.id} files={score.files} title={score.title} staffCount={score.staffCount} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface WorkspaceProps {
  score: ScoreDetailData;
  xml: string;
  info: MusicXmlInfo;
  doc: ScoreDocument;
  /** Version của MusicXML vừa tải (từ ETag); null thì dùng score.currentVersion. */
  xmlVersion: number | null;
}

/**
 * Khung làm việc: bản nhạc vẽ bằng OSMD, thanh công cụ có thu phóng 50–200%, chế độ xem Trang / Cuộn ngang,
 * toàn màn hình, tải MusicXML/MIDI. Khi `canEdit` có thêm chọn nốt, đổi cao độ, hoàn tác/làm lại, lưu (đặc tả 3.0,
 * 1.18, 3.6), bản nháp và xử lý xung đột phiên bản. Responsive Desktop / iPad / Mobile.
 */
function ScoreWorkspace({ score, xml, info, doc, xmlVersion }: WorkspaceProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const [prefs, setPrefs] = useState(loadViewerPrefs);
  const [pageCount, setPageCount] = useState(1);
  const [notationOpen, setNotationOpen] = useState(false);
  const [progress, setProgress] = useState(1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hideWarning, setHideWarning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [parseFailed, setParseFailed] = useState(false);
  const [focusMeasure, setFocusMeasure] = useState<{ index: number; key: number } | null>(null);
  const [issueCursor, setIssueCursor] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const playAfterLoad = useRef(false);

  const { zoom, mode } = prefs;
  const canEdit = score.canEdit;

  const editor = useScoreEditor({
    scoreId: score.id,
    title: score.title,
    doc,
    initialVersion: xmlVersion ?? score.currentVersion ?? 1,
    canEdit,
    canForce: score.canDelete,
    blocked: helpOpen,
  });

  const player = usePlayer(doc, {
    scoreId: score.id,
    enabled: playerOpen,
    fallbackBpm: score.tempoBpm ?? 100,
    revision: editor.revision,
    onFirstPlay: () => void countView(score.id),
  });
  const selectionRef = useRef(editor.selection);
  useEffect(() => {
    selectionRef.current = editor.selection;
  });
  const { canPlay, playFrom, stop: stopPlayer, status: playerStatus } = player;
  const { a: loopA, b: loopB, enabled: loopOn } = player.loop;
  const loopRange = useMemo(
    () => (playerOpen && loopA !== null && loopB !== null ? { start: loopA, end: loopB, active: loopOn } : null),
    [playerOpen, loopA, loopB, loopOn],
  );

  // Mở thanh Player bằng nút Phát: đợi mẫu âm tải xong rồi mới phát
  useEffect(() => {
    if (playerOpen && playAfterLoad.current && canPlay) {
      playAfterLoad.current = false;
      playFrom(selectionRef.current);
    }
  }, [playerOpen, canPlay, playFrom]);

  // Sửa bản nhạc khi đang phát: dừng để không phát lệch nội dung mới
  const lastRevision = useRef(editor.revision);
  useEffect(() => {
    if (lastRevision.current === editor.revision) return;
    lastRevision.current = editor.revision;
    if (playerStatus !== 'stopped') stopPlayer();
  }, [editor.revision, playerStatus, stopPlayer]);

  const onPlayButton = () => {
    if (!playerOpen) {
      playAfterLoad.current = true;
      setPlayerOpen(true);
    } else player.playFrom(editor.selection);
  };
  const closePlayer = () => {
    playAfterLoad.current = false;
    stopPlayer();
    setPlayerOpen(false);
  };
  const issueMeasures = useMemo(() => new Set(editor.issues.map((i) => i.measureIndex)), [editor.issues]);

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

  // Phím tắt: + / - / 0 để thu phóng, ? mở bảng phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') setZoom(zoom + ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') setZoom(zoom - ZOOM_STEP);
      else if (e.key === '0') setZoom(ZOOM_DEFAULT);
      else if (e.key === '?' && canEdit) setHelpOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, setZoom, canEdit]);

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

  const warning = useMemo(() => performanceWarning(info), [info]);
  const notTwoStaves = info.valid && info.staves !== 2;
  const goBack = () => {
    if (editor.confirmLeave()) navigate(`/scores/${score.id}`);
  };

  const goToIssue = () => {
    if (editor.issues.length === 0) return;
    const issue = editor.issues[issueCursor % editor.issues.length];
    setFocusMeasure({ index: issue.measureIndex, key: Date.now() });
    setIssueCursor((n) => n + 1);
  };

  if (parseFailed) {
    return (
      <div className="sc-page sv-root sv-root--center">
        <div className="sv-state" role="alert">
          <h2>Không đọc được bản nhạc</h2>
          <p>File MusicXML bị lỗi nên không vẽ được. Bạn có thể tải file về để kiểm tra.</p>
          <div className="sv-state__actions">
            <button className="sc-btn sc-btn--primary" onClick={goBack}>
              Về trang chi tiết
            </button>
            <DownloadMenu scoreId={score.id} files={score.files} title={score.title} staffCount={score.staffCount} />
          </div>
        </div>
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
    canEdit ? `Phiên bản ${editor.version}` : score.currentVersion ? `Phiên bản ${score.currentVersion}` : '',
  ].filter(Boolean);

  const saveLabel = editor.saving
    ? 'Đang lưu…'
    : editor.dirty
      ? 'Có thay đổi chưa lưu'
      : `Đã lưu · phiên bản ${editor.version}`;
  const saveClass = editor.saving ? ' is-saving' : editor.dirty ? ' is-dirty' : '';
  const firstIssue = editor.issues[0];

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
          {canEdit ? (
            <span className={`sv-savestate${saveClass}`} role="status" aria-live="polite">
              {saveLabel}
            </span>
          ) : (
            <span className="sv-badge">Chỉ xem</span>
          )}
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
          {canEdit && (
            <div className="sv-group sv-desktop-only">
              <button
                className="sc-btn sv-icon"
                disabled={!editor.canUndo || editor.saving}
                onClick={editor.undo}
                title={`Hoàn tác (${MOD}+Z)`}
                aria-label="Hoàn tác"
              >
                <IconUndo />
              </button>
              <button
                className="sc-btn sv-icon"
                disabled={!editor.canRedo || editor.saving}
                onClick={editor.redo}
                title={`Làm lại (${MOD}+Shift+Z)`}
                aria-label="Làm lại"
              >
                <IconRedo />
              </button>
              <button
                className="sc-btn sc-btn--primary"
                disabled={!editor.dirty || editor.saving}
                onClick={() => void editor.save()}
                title={`Lưu (${MOD}+S)`}
              >
                <IconSave /> Lưu
              </button>
            </div>
          )}
          {canEdit && (
            <button className="sc-btn sv-mobile-only" onClick={() => setToolsOpen(true)}>
              <IconEdit /> Sửa
            </button>
          )}
          <button
            className="sc-btn"
            onClick={onPlayButton}
            aria-pressed={player.status === 'playing'}
            title={
              player.status === 'playing'
                ? 'Tạm dừng'
                : editor.selection.size > 0
                  ? 'Phát từ nốt đang chọn'
                  : 'Phát cả bản nhạc'
            }
          >
            {player.status === 'playing' ? <IconStop /> : <IconPlay />}{' '}
            {player.status === 'playing' ? 'Tạm dừng' : 'Phát'}
          </button>
          <InstrumentMenu parts={player.parts} onChange={player.setInstrument} />
          <button className="sc-btn" onClick={() => setHistoryOpen(true)} title="Lịch sử phiên bản">
            Lịch sử
          </button>
          <DownloadMenu scoreId={score.id} files={score.files} title={score.title} staffCount={score.staffCount} />
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

      <div className={`sv-body${canEdit ? ' has-tools' : ''}`}>
        {canEdit && (
          <EditorToolPanel
            open={toolsOpen}
            onClose={() => setToolsOpen(false)}
            hasSelection={editor.selection.size > 0}
            busy={editor.saving}
            onPitch={editor.applyPitch}
            onSymbol={editor.applySymbol}
            inputMode={editor.inputMode}
            onInputModeChange={editor.setInputMode}
            inputDuration={editor.inputDuration}
            lyricMode={editor.lyricMode}
            onLyricModeChange={editor.setLyricMode}
            chordMode={editor.chordMode}
            onChordModeChange={editor.setChordMode}
            onMark={editor.applyMark}
            onStaves={editor.editStaves}
            onOpenNotation={() => setNotationOpen(true)}
            onMeasures={editor.editMeasures}
            onVoice={editor.editVoice}
            onTuplet={editor.editTuplet}
            onDuration={editor.chooseDuration}
            onDot={editor.toggleDot}
            previewTone={editor.previewTone}
            onPreviewToneChange={editor.setPreviewTone}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            canSave={editor.dirty}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onSave={() => void editor.save()}
          />
        )}
        <div className="sv-stage">
          <ScoreCanvas
            xml={xml}
            zoom={zoom}
            mode={mode}
            onZoomChange={setZoom}
            onRendered={setPageCount}
            onProgress={setProgress}
            onError={() => setParseFailed(true)}
            doc={canEdit ? doc : null}
            revision={editor.revision}
            selected={editor.selection}
            issueMeasures={issueMeasures}
            focusMeasure={focusMeasure}
            playing={player.activeIds}
            mutedStaves={player.mutedStaves}
            loopRange={loopRange}
            followMeasure={player.status === 'playing' ? player.followMeasure : null}
            onSelectNotes={canEdit ? editor.select : undefined}
            onDragPitch={canEdit ? editor.dragPitch : undefined}
            inputMode={editor.inputMode}
            inputDuration={editor.inputDuration}
            onInsertNote={canEdit ? editor.insertNoteAt : undefined}
            onConfirmMeasure={canEdit ? editor.confirmMeasureOk : undefined}
            onEditHeader={canEdit ? editor.editHeader : undefined}
            onEditTempo={canEdit ? editor.editTempo : undefined}
          />
          <div className="sv-pos" aria-live="polite">
            {progressLabel}
          </div>
        </div>
      </div>

      {canEdit && notationOpen && (
        <NotationHost
          doc={doc}
          selection={editor.selection}
          onApply={(change) => {
            editor.editNotation(change);
            setNotationOpen(false);
          }}
          onClose={() => setNotationOpen(false)}
        />
      )}
      {canEdit && editor.chordMode && (
        <ChordBar
          doc={doc}
          revision={editor.revision}
          selectedId={[...editor.selection][0] ?? null}
          onEnter={editor.enterChord}
          onMove={editor.moveChord}
          onPaste={editor.pasteChordText}
          onExit={() => editor.setInputMode(false)}
        />
      )}
      {canEdit && editor.lyricMode && (
        <LyricBar
          doc={doc}
          revision={editor.revision}
          selectedId={[...editor.selection][0] ?? null}
          verse={editor.lyricVerse}
          onVerseChange={editor.setLyricVerse}
          onEnter={editor.enterLyric}
          onMove={editor.moveLyric}
          onPaste={editor.pasteLyricsText}
          onExit={() => editor.setInputMode(false)}
        />
      )}
      {playerOpen && (
        <PlayerBar
          player={player}
          onClose={closePlayer}
          onApplyTranspose={
            canEdit
              ? (semitones) => {
                  const done = editor.transposeScore(semitones);
                  if (done) player.setTranspose(0); // bản nhạc đã ở giọng mới, không cộng thêm khi nghe
                  return done;
                }
              : undefined
          }
          applyTransposeHint="Bạn có thể hoàn tác (Ctrl+Z) và cần bấm Lưu để giữ lại."
        />
      )}
      <footer className="sv-status">
        <span>{summary.join(' · ') || 'Bản nhạc'}</span>
        <div className="sv-status__right">
          {canEdit && editor.inputMode && (
            <span className="sv-status__sel">
              Nhập nốt · trường độ {DURATION_LABELS[editor.inputDuration.type]}
              {dotsLabel(editor.inputDuration.dots)} · bấm vào khuông để thêm nốt, hoặc chọn dấu lặng rồi bấm A–G
            </span>
          )}
          {canEdit && editor.statusText && <span className="sv-status__sel">{editor.statusText}</span>}
          {canEdit && firstIssue && (
            <button
              className="sv-status__warn"
              onClick={goToIssue}
              title="Bấm để cuộn tới ô nhịp sai"
              aria-label={`Cảnh báo: ${firstIssue.message}. Bấm để cuộn tới ô nhịp`}
            >
              {firstIssue.message}
              {editor.issues.length > 1 ? ` (+${editor.issues.length - 1} ô khác)` : ''}
            </button>
          )}
          {editor.notice && (
            <span key={editor.notice.key} className="sv-status__notice" role="status">
              {editor.notice.text}
            </span>
          )}
          <span className="sv-status__hint">
            {canEdit ? 'Phím ? xem phím tắt · ' : ''}Ctrl + cuộn hoặc chụm hai ngón để thu phóng
          </span>
        </div>
      </footer>

      {helpOpen && (
        <Modal title="Phím tắt" onClose={() => setHelpOpen(false)}>
          <dl className="sv-help-list">
            {SHORTCUTS.map(([keys, text]) => (
              <div key={keys} style={{ display: 'contents' }}>
                <dt>{keys}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="sc-modal__actions">
            <button className="sc-btn sc-btn--primary" onClick={() => setHelpOpen(false)}>
              Đóng
            </button>
          </div>
        </Modal>
      )}

      {editor.draft && (
        <Modal title="Khôi phục bản nháp chưa lưu?" onClose={() => undefined}>
          <p className="sv-modal-text">
            Lần sửa trước chưa được lưu. Bản nháp tự lưu lúc {new Date(editor.draft.savedAt).toLocaleString('vi-VN')}.
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={editor.discardDraft}>
              Bỏ nháp
            </button>
            <button className="sc-btn sc-btn--primary" onClick={editor.restoreDraft}>
              Khôi phục
            </button>
          </div>
        </Modal>
      )}

      {historyOpen && (
        <VersionHistoryPanel
          scoreId={score.id}
          canEdit={canEdit}
          dirty={editor.dirty}
          busy={editor.saving}
          onRestore={editor.restoreVersion}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {editor.conflict && (
        <Modal title="Bản nhạc vừa được lưu ở nơi khác" onClose={editor.dismissConflict}>
          <p className="sv-modal-text">
            {editor.conflict.latestVersion > 0
              ? `Trên máy chủ đã có phiên bản ${editor.conflict.latestVersion}, mới hơn bản bạn đang sửa (phiên bản ${editor.version}). `
              : 'Trên máy chủ đã có phiên bản mới hơn bản bạn đang sửa. '}
            Hãy chọn cách xử lý thay đổi chưa lưu của bạn.
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={editor.downloadMine}>
              Tải bản của tôi về máy
            </button>
            <button className="sc-btn" onClick={editor.reloadLatest}>
              Tải bản mới nhất (bỏ thay đổi của tôi)
            </button>
            {score.canDelete && (
              <button
                className="sc-btn sc-btn--danger-solid"
                disabled={editor.saving}
                onClick={() => void editor.overwrite()}
              >
                Ghi đè bản của tôi
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Đọc đầu khuông tại vùng chọn rồi hiện hộp thoại (không hiện nếu chưa chọn nốt nào). */
function NotationHost({
  doc,
  selection,
  onApply,
  onClose,
}: {
  doc: ScoreDocument;
  selection: ReadonlySet<string>;
  onApply: (change: NotationChange) => void;
  onClose: () => void;
}) {
  const info = readNotation(doc, [...selection]);
  return info ? <NotationModal info={info} onApply={onApply} onClose={onClose} /> : null;
}
