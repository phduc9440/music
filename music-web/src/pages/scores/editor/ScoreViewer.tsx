import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import DownloadMenu from '../../../components/scores/viewer/DownloadMenu';
import ShowAssignmentBanner from '../../../components/scores/viewer/ShowAssignmentBanner';
import VersionHistoryPanel from '../../../components/editor/version/VersionHistoryPanel';
import InstrumentMenu from '../../../components/scores/viewer/InstrumentMenu';
import EditorToolPanel from '../../../components/scores/toolbar/EditorToolPanel';
import ChordBar from '../../../components/scores/toolbar/ChordBar';
import NotationModal from '../../../components/scores/toolbar/NotationModal';
import { readNotation } from '../../../components/editor/structure/staves';
import type { NotationChange } from '../../../components/editor/structure/staves';
import LyricBar from '../../../components/scores/toolbar/LyricBar';
import Modal from '../../../components/scores/common/Modal';
import ScoreCanvas from '../../../components/scores/viewer/ScoreCanvas';
import type { CommentRange } from '../../../components/scores/viewer/ScoreCanvas';
import CommentsSection from '../../../components/scores/comments/CommentsSection';
import { anchorFromNotes } from '../../../components/scores/comments/viewerAnchor';
import {
  CommentContextMenu,
  InlineCommentComposer,
  SelectionCommentButton,
} from '../../../components/scores/comments/ViewerCommentTools';
import type { ContextMenuState, ScreenRect } from '../../../components/scores/comments/ViewerCommentTools';
import { SELECTED_CLASS, noteIdsFromEvent } from '../../../components/editor/core/osmdBridge';
import type { CommentAnchor } from '../../../components/scores/comments/commentUtils';
import ToolbarMoreMenu from '../../../components/scores/toolbar/ToolbarMoreMenu';
import ZoomControl from '../../../components/scores/viewer/ZoomControl';
import {
  IconBack,
  IconComment,
  IconEdit,
  IconExpand,
  IconHistory,
  IconInvert,
  IconKeyboard,
  IconPages,
  IconPlay,
  IconRedo,
  IconSave,
  IconStop,
  IconScroll,
  IconShrink,
  IconUndo,
} from '../../../components/scores/viewer/ViewerIcons';
import { syncTitle } from '../../../components/editor/structure/header';
import { ScoreDocument } from '../../../components/editor/core/ScoreDocument';
import { DURATION_LABELS, dotsLabel } from '../../../components/editor/notes/durations';
import { PlayerBar } from '../../../components/player/PlayerBar';
import { usePlayer } from '../../../components/player/hooks/usePlayer';
import { useScoreEditor } from '../../../components/editor/core/useScoreEditor';
import { countView } from '../../../services/practice/playbackApi';
import { commentApi, fetchMusicXmlWithVersion, scoreApi } from '../../../services';
import type { ScoreComment, ScoreDetail as ScoreDetailData } from '../../../types';
import { t } from '../../../i18n/core';
import { isValidScoreId } from '../../../utils/omr';
import { getHttpStatus, useScoreBase } from '../../../utils/score';
import {
  ZOOM_DEFAULT,
  ZOOM_STEP,
  clampZoom,
  inspectMusicXml,
  loadViewerPrefs,
  performanceWarning,
  saveViewerPrefs,
} from '../../../utils/viewer';
import type { MusicXmlInfo, ViewMode } from '../../../utils/viewer';
import '../../../components/scores/scores.css';
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
];

/** Phím tắt xếp cuối hộp thoại, sau các phím tắt Góp ý. */
const SHORTCUTS_END: [string, string][] = [
  ['Esc', 'Bỏ chọn'],
  ['+  /  -  /  0', 'Phóng to / thu nhỏ / về 100%'],
  ['?', 'Mở bảng này'],
];

/** Phím tắt Góp ý (mục 4.2): dựng lúc hiển thị để đổi ngôn ngữ có hiệu lực ngay. */
const commentShortcuts = (): [string, string][] => [
  [t('scores.comments.helpSelectKeys'), t('scores.comments.helpSelectText')],
  [t('scores.comments.helpContextKeys'), t('scores.comments.helpContextText')],
  [`${MOD} + ${ALT} + M`, t('scores.comments.helpPanelText')],
];

/**
 * Trang /scores/:id/edit: tải thông tin bản nhạc và MusicXML hiện hành, hiện các màn hình trạng thái
 * (đang tải, không thấy, chưa số hóa xong, lỗi) hoặc trình chỉnh sửa {@link ScoreWorkspace}.
 */
export default function ScoreViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();

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

  const goBack = () => navigate(id ? `${base}/${id}` : base);

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
    action = { label: 'Về thư viện', run: () => navigate(base) };
  } else if (phase === 'notReady') {
    title = 'Bản nhạc chưa số hóa xong';
    text = 'Bản nhạc chưa có MusicXML. Hãy đợi nhận diện xong hoặc xem trang tiến độ.';
    action = { label: 'Về trang tiến độ', run: () => navigate(`${base}/${id}/processing`) };
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
              <DownloadMenu
                scoreId={score.id}
                files={score.files}
                title={score.title}
                staffCount={score.staffCount}
                canDownload={score.canDownload}
              />
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
  const base = useScoreBase();
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

  // ---- Góp ý gắn vào ô nhịp (mục 4.2). ?comment=ID (từ trang chi tiết): mở bảng và cuộn tới góp ý đó
  const [searchParams] = useSearchParams();
  const linkedComment = searchParams.get('comment');
  const [commentsOpen, setCommentsOpen] = useState(!!linkedComment);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(linkedComment);
  const [openThreads, setOpenThreads] = useState<ScoreComment[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  /** Khung bao vùng đang bôi đen (toạ độ màn hình) để đặt nút "Góp ý" nổi; null khi không có vùng chọn hiện trên màn hình. */
  const [selRect, setSelRect] = useState<ScreenRect | null>(null);
  /** Ô nhập góp ý nổi cạnh vùng chọn (mở từ nút nổi hoặc menu chuột phải). */
  const [composer, setComposer] = useState<{ anchor: CommentAnchor; rect: ScreenRect } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { zoom, mode, invert } = prefs;
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

  // Góp ý đang mở để tô nền trên bản nhạc; tải lại mỗi khi bảng Góp ý đổi (thêm, xử lý, xóa).
  // Lần đầu: nếu mở từ đường dẫn ?comment=ID thì cuộn bản nhạc tới vùng của góp ý đó.
  const linkedScrolled = useRef(false);
  const refreshComments = useCallback(() => {
    commentApi
      .list(score.id, 'OPEN')
      .then((res) => {
        const { comments, canComment: allowed } = res.data.result;
        setOpenThreads(comments);
        setCanComment(allowed);
        if (linkedComment && !linkedScrolled.current) {
          linkedScrolled.current = true;
          const target = comments.find((c) => c.id === linkedComment);
          if (target?.startMeasure != null) setFocusMeasure({ index: target.startMeasure - 1, key: Date.now() });
        }
      })
      .catch(() => undefined);
  }, [score.id, linkedComment]);
  useEffect(refreshComments, [refreshComments]);

  const commentRanges = useMemo<CommentRange[]>(
    () =>
      openThreads
        .filter((c) => c.startMeasure != null)
        .map((c) => ({
          id: c.id,
          start: (c.startMeasure as number) - 1,
          end: (c.endMeasure ?? c.startMeasure ?? 1) - 1,
          active: c.id === focusCommentId,
        })),
    [openThreads, focusCommentId],
  );

  // Vùng neo cho góp ý mới: các nốt đang bôi đen (người sửa và người nhận xét chọn nốt như nhau)
  const commentAnchor = useMemo<CommentAnchor | null>(
    () => anchorFromNotes(doc, editor.selection),
    [doc, editor.selection],
  );
  const commentBlocked = canEdit && editor.dirty ? t('scores.comments.saveFirst') : null;

  // Khung bao các nốt đang chọn trên màn hình: tính lại khi chọn khác, đổi zoom / chế độ, sửa, cuộn, đổi cỡ cửa sổ
  const stageRef = useRef<HTMLDivElement>(null);
  const measureSelection = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || selectionRef.current.size === 0) {
      setSelRect(null);
      return;
    }
    let rect: ScreenRect | null = null;
    stage.querySelectorAll(`.${SELECTED_CLASS}`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      rect = rect
        ? {
            left: Math.min(rect.left, r.left),
            top: Math.min(rect.top, r.top),
            right: Math.max(rect.right, r.right),
            bottom: Math.max(rect.bottom, r.bottom),
          }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    // Vùng chọn đã cuộn ra ngoài khung nhạc thì ẩn nút
    const box = stage.getBoundingClientRect();
    const visible =
      rect !== null &&
      (rect as ScreenRect).bottom > box.top &&
      (rect as ScreenRect).top < box.bottom &&
      (rect as ScreenRect).right > box.left &&
      (rect as ScreenRect).left < box.right;
    setSelRect(visible ? rect : null);
  }, []);
  useEffect(() => {
    // Bản nhạc vẽ lại sau ~200ms khi đổi zoom / chế độ: đo ngay và đo lại sau khi vẽ xong
    const frame = requestAnimationFrame(measureSelection);
    const timer = setTimeout(measureSelection, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [editor.selection, editor.revision, zoom, mode, commentsOpen, measureSelection]);
  useEffect(() => {
    window.addEventListener('scroll', measureSelection, true);
    window.addEventListener('resize', measureSelection);
    return () => {
      window.removeEventListener('scroll', measureSelection, true);
      window.removeEventListener('resize', measureSelection);
    };
  }, [measureSelection]);

  /** Mở ô nhập góp ý nổi cho vùng đang chọn, cạnh `rect` (vùng chọn, hoặc chỗ bấm chuột phải). */
  const openComposer = (rect: ScreenRect | null) => {
    if (!commentAnchor || !canComment || commentBlocked) return;
    setContextMenu(null);
    setComposer({ anchor: commentAnchor, rect: rect ?? selRect ?? { left: 200, top: 160, right: 200, bottom: 160 } });
  };

  // Chuột phải vào nốt: chọn nốt đó (nếu chưa nằm trong vùng đang chọn) rồi hiện menu Góp ý
  const onStageContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const ids = noteIdsFromEvent(e.nativeEvent);
    if (ids.length === 0) return; // ngoài nốt: để menu mặc định của trình duyệt
    e.preventDefault();
    if (canEdit || canComment) {
      if (!ids.some((id) => editor.selection.has(id))) editor.select(ids, false);
    }
    const info = doc.getInfo(ids[0]);
    setComposer(null);
    setContextMenu({ x: e.clientX, y: e.clientY, measureIndex: info ? info.measureIndex : null });
  };
  const threadsAtMenu =
    contextMenu?.measureIndex == null
      ? []
      : openThreads.filter(
          (c) =>
            c.startMeasure != null &&
            contextMenu.measureIndex! + 1 >= c.startMeasure &&
            contextMenu.measureIndex! + 1 <= (c.endMeasure ?? c.startMeasure),
        );

  // Người chỉ nhận xét không có phím tắt của Editor: Esc bỏ chọn (khi không có ô nhập / menu đang mở)
  useEffect(() => {
    if (canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || composer || contextMenu) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      editor.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, composer, contextMenu, editor]);

  // Ctrl/Cmd + Alt + M: mở bảng Góp ý và form góp ý cho vùng đang chọn (dùng e.code vì Alt+M trên Mac ra ký tự khác)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.code !== 'KeyM') return;
      e.preventDefault();
      setCommentsOpen(true);
      setComposeKey((k) => k + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Đóng bảng thì đặt lại bộ đếm phím tắt để lần mở sau (bằng nút) không tự mở form
  const closeComments = () => {
    setCommentsOpen(false);
    setComposeKey(0);
  };

  const selectThread = useCallback((c: ScoreComment) => {
    setFocusCommentId(c.id);
    if (c.startMeasure != null) setFocusMeasure({ index: c.startMeasure - 1, key: Date.now() });
  }, []);

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
    void editor.confirmLeave().then((ok) => ok && navigate(`${base}/${score.id}`));
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
            <DownloadMenu
              scoreId={score.id}
              files={score.files}
              title={score.title}
              staffCount={score.staffCount}
              canDownload={score.canDownload}
            />
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
            <span className={`sv-savestate${saveClass}`} role="status" aria-live="polite" title={saveLabel}>
              <span className="sv-sr">{saveLabel}</span>
            </span>
          ) : (
            <span className="sv-badge">Chỉ xem</span>
          )}
        </div>

        <div className="sv-toolbar__center">
          <div className="sv-segment sv-segment--icons" role="group" aria-label="Chế độ xem">
            <button
              aria-pressed={mode === 'page'}
              aria-label="Xem theo trang"
              title="Xem theo trang"
              onClick={() => setMode('page')}
            >
              <IconPages />
            </button>
            <button
              aria-pressed={mode === 'scroll'}
              aria-label="Cuộn ngang"
              title="Cuộn ngang"
              onClick={() => setMode('scroll')}
            >
              <IconScroll />
            </button>
          </div>
          <ZoomControl zoom={zoom} onChange={setZoom} />
          <div className="sv-segment sv-segment--icons" role="group" aria-label="Màu bản nhạc">
            <button
              aria-pressed={invert}
              aria-label="Đảo màu bản nhạc"
              title="Đảo màu bản nhạc (nền tối, nốt sáng)"
              onClick={() => updatePrefs({ invert: !invert })}
            >
              <IconInvert />
            </button>
          </div>
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
            className={`sc-btn${commentsOpen ? ' is-active' : ''}`}
            aria-pressed={commentsOpen}
            onClick={() => (commentsOpen ? closeComments() : setCommentsOpen(true))}
            title={`${t('scores.comments.panelToggle')} (${MOD}+${ALT}+M)`}
          >
            <IconComment /> <span className="sv-desktop-only">{t('scores.comments.panelToggle')}</span>
            {openThreads.length > 0 && <span className="sv-count">{openThreads.length}</span>}
          </button>
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
          <InstrumentMenu parts={player.parts} onChange={player.setInstrument} compact />
          <DownloadMenu
            scoreId={score.id}
            files={score.files}
            title={score.title}
            staffCount={score.staffCount}
            canDownload={score.canDownload}
            compact
          />
          <ToolbarMoreMenu
            items={[
              {
                key: 'history',
                label: 'Lịch sử phiên bản',
                icon: <IconHistory />,
                onClick: () => setHistoryOpen(true),
              },
              {
                key: 'fullscreen',
                label: fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình',
                icon: fullscreen ? <IconShrink /> : <IconExpand />,
                hint: fullscreen ? 'Esc' : undefined,
                onClick: () => void toggleFullscreen(),
              },
              ...(canEdit
                ? [
                    {
                      key: 'shortcuts',
                      label: 'Phím tắt',
                      icon: <IconKeyboard />,
                      hint: '?',
                      onClick: () => setHelpOpen(true),
                    },
                  ]
                : []),
            ]}
          />
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

      <ShowAssignmentBanner scoreId={score.id} />

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
        <div className="sv-stage" ref={stageRef} onContextMenu={onStageContextMenu}>
          <ScoreCanvas
            xml={xml}
            zoom={zoom}
            mode={mode}
            inverted={invert}
            onZoomChange={setZoom}
            onRendered={setPageCount}
            onProgress={setProgress}
            onError={() => setParseFailed(true)}
            // Luôn gắn id nốt (cần để tô vùng góp ý, chọn ô để góp ý, tô nốt đang phát); sửa vẫn chỉ khi canEdit
            doc={doc}
            revision={editor.revision}
            selected={editor.selection}
            issueMeasures={issueMeasures}
            focusMeasure={focusMeasure}
            playing={player.activeIds}
            mutedStaves={player.mutedStaves}
            loopRange={loopRange}
            followMeasure={player.status === 'playing' ? player.followMeasure : null}
            // Người nhận xét cũng bôi đen / bấm chọn nốt được (để góp ý), nhưng không sửa được
            onSelectNotes={canEdit || canComment ? editor.select : undefined}
            onDragPitch={canEdit ? editor.dragPitch : undefined}
            inputMode={editor.inputMode}
            inputDuration={editor.inputDuration}
            onInsertNote={canEdit ? editor.insertNoteAt : undefined}
            onConfirmMeasure={canEdit ? editor.confirmMeasureOk : undefined}
            onEditHeader={canEdit ? editor.editHeader : undefined}
            onEditTempo={canEdit ? editor.editTempo : undefined}
            commentRanges={commentRanges}
            onCommentBubble={(ids) => {
              setCommentsOpen(true);
              setFocusCommentId(ids[0]);
            }}
          />
          {selRect && commentAnchor && canComment && !commentBlocked && !composer && !contextMenu && (
            <SelectionCommentButton rect={selRect} onClick={() => openComposer(selRect)} />
          )}
          <div className="sv-pos" aria-live="polite">
            {progressLabel}
          </div>
        </div>
        {commentsOpen && (
          <aside className="sv-comments" aria-label={t('scores.comments.panelToggle')}>
            <div className="sv-comments__head">
              <h2>{t('scores.comments.panelToggle')}</h2>
              <button
                type="button"
                className="sv-comments__close"
                onClick={closeComments}
                aria-label={t('scores.comments.panelClose')}
                title={t('scores.comments.panelClose')}
              >
                ×
              </button>
            </div>
            <CommentsSection
              scoreId={score.id}
              compact
              focusId={focusCommentId}
              anchor={commentAnchor}
              composeKey={composeKey}
              composeBlockedReason={commentBlocked}
              onSelectThread={selectThread}
              onChanged={refreshComments}
            />
          </aside>
        )}
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
      {contextMenu && (
        <CommentContextMenu
          menu={contextMenu}
          canComment={canComment && !!commentAnchor}
          blockedReason={commentBlocked}
          threadsHere={threadsAtMenu}
          onComment={() =>
            openComposer({ left: contextMenu.x, top: contextMenu.y, right: contextMenu.x, bottom: contextMenu.y })
          }
          onShowThreads={() => {
            setCommentsOpen(true);
            if (threadsAtMenu[0]) setFocusCommentId(threadsAtMenu[0].id);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {composer && (
        <InlineCommentComposer
          scoreId={score.id}
          anchor={composer.anchor}
          rect={composer.rect}
          onClose={() => setComposer(null)}
          onCreated={(created) => {
            setComposer(null);
            setFocusCommentId(created.id);
            refreshComments();
          }}
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
            {[...SHORTCUTS, ...commentShortcuts(), ...SHORTCUTS_END].map(([keys, text]) => (
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
