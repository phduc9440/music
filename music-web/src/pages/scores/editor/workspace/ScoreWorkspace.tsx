import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from '../../../../routes/useTransitionNavigate';
import ShowAssignmentBanner from '../../../../components/scores/viewer/ShowAssignmentBanner';
import EditorToolPanel from '../../../../components/scores/toolbar/EditorToolPanel';
import ChordSuggestDialog from '../../../../components/scores/chords/ChordSuggestDialog';
import ScoreCanvas from '../../../../components/scores/viewer/ScoreCanvas';
import { useSidebarResize } from '../../../../components/scores/common/useSidebarResize';
import {
  InlineCommentComposer,
  SelectionCommentButton,
} from '../../../../components/scores/comments/ViewerCommentTools';
import ContextMenu from '../../../../components/ui/ContextMenu';
import { buildEditorMenu, editorMenuTitle } from '../../../../components/scores/viewer/editorMenu';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import { PlayerBar } from '../../../../components/player/PlayerBar';
import { useScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';
import type { LiveSelection, ScoreDetail } from '../../../../types';
import { t } from '../../../../i18n/core';
import { useScoreBase } from '../../../../utils/score';
import { performanceWarning } from '../../../../utils/viewer';
import type { MusicXmlInfo } from '../../../../utils/viewer';
import EditorDialogs from './EditorDialogs';
import EditorHeader from './EditorHeader';
import EditorInputBars from './EditorInputBars';
import EditorParseFailed from './EditorParseFailed';
import EditorSideColumn from './EditorSideColumn';
import EditorStatusBar from './EditorStatusBar';
import { useAiChordPanel } from './useAiChordPanel';
import { useEditorContextMenu } from './useEditorContextMenu';
import { useEditorPlayer } from './useEditorPlayer';
import { useLockBoxes } from './useLockBoxes';
import { useScoreComments } from './useScoreComments';
import { useViewerChrome } from './useViewerChrome';

interface Props {
  score: ScoreDetail;
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
export default function ScoreWorkspace({ score, xml, info, doc, xmlVersion }: Props) {
  const navigate = useNavigate();
  const base = useScoreBase();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [notationOpen, setNotationOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hideWarning, setHideWarning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [suggestingChords, setSuggestingChords] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [parseFailed, setParseFailed] = useState(false);
  const [focusMeasure, setFocusMeasure] = useState<{ index: number; key: number } | null>(null);
  const canEdit = score.canEdit;

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const view = useViewerChrome(rootRef, canEdit, openHelp);
  const { zoom, mode } = view;
  const focusOn = useCallback((index: number) => setFocusMeasure({ index, key: Date.now() }), []);

  // Cùng sửa theo thời gian thực: người có quyền sửa vào bản nhạc là tự tham gia, không cần bật tay
  const selectionRef = useRef<ReadonlySet<string>>(new Set());
  const getLiveSelection = useCallback((): LiveSelection | null => {
    const infos = [...selectionRef.current].map((id) => doc.getInfo(id)).filter((i) => i !== undefined);
    if (infos.length === 0) return null;
    const measures = infos.map((i) => i.measureIndex);
    return { partIndex: infos[0].partIndex, from: Math.min(...measures), to: Math.max(...measures) };
  }, [doc]);
  const live = useLiveCollab({
    scoreId: score.id,
    doc,
    enabled: score.canEdit,
    getSelection: getLiveSelection,
  });

  const editor = useScoreEditor({
    live,
    scoreId: score.id,
    title: score.title,
    doc,
    initialVersion: xmlVersion ?? score.currentVersion ?? 1,
    canEdit,
    canForce: score.canDelete,
    blocked: helpOpen,
  });

  useEffect(() => {
    selectionRef.current = editor.selection;
  });
  const lockBoxes = useLockBoxes(live);
  const { player, playerOpen, loopRange, onPlayButton, closePlayer } = useEditorPlayer(
    doc,
    score,
    editor.revision,
    selectionRef,
  );
  const issueMeasures = useMemo(() => new Set(editor.issues.map((i) => i.measureIndex)), [editor.issues]);

  const comments = useScoreComments({
    scoreId: score.id,
    doc,
    canEdit,
    selection: editor.selection,
    selectionRef,
    revision: editor.revision,
    dirty: editor.dirty,
    zoom,
    mode,
    focusMeasure: focusOn,
    stageRef,
    onPanelOpen: () => setAiPanelOpen(false),
  });
  const { commentAnchor, commentBlocked, canComment, composer, selRect } = comments;
  const ai = useAiChordPanel({
    scoreId: score.id,
    doc,
    editor,
    canEdit,
    live,
    panelOpen: aiPanelOpen,
    setPanelOpen: setAiPanelOpen,
    closeComments: comments.closeComments,
  });
  // Cột phải (Góp ý / Hợp âm AI dùng chung một chỗ) kéo rộng / thu gọn được, nhớ trong trình duyệt
  const side = useSidebarResize({
    storageKey: 'scorewise.editor.sideLayout',
    side: 'right',
    min: 280,
    max: 640,
    defaultWidth: 360,
  });
  const menu = useEditorContextMenu(doc, canEdit, editor, comments);
  const { contextMenu } = menu;
  const openComposer = (rect: Parameters<typeof comments.openComposer>[0]) => {
    if (comments.openComposer(rect)) menu.closeContextMenu();
  };

  const warning = useMemo(() => performanceWarning(info), [info]);
  const notTwoStaves = info.valid && info.staves !== 2;
  const goBack = () => {
    void editor.confirmLeave().then((ok) => ok && navigate(`${base}/${score.id}`));
  };

  if (parseFailed) return <EditorParseFailed score={score} onBack={goBack} />;

  const progressLabel =
    mode === 'scroll'
      ? t('editor.view.progress.scroll', { progress: view.progress })
      : t('editor.view.progress.page', { page: Math.min(view.progress, view.pageCount), total: view.pageCount });

  return (
    <div className="sc-page sv-root" ref={rootRef}>
      <EditorHeader
        score={score}
        editor={editor}
        live={live}
        player={player}
        mode={mode}
        onModeChange={view.setMode}
        zoom={zoom}
        onZoomChange={view.setZoom}
        commentsOpen={comments.commentsOpen}
        openThreadCount={comments.openThreads.length}
        onToggleComments={() => (comments.commentsOpen ? comments.closeComments() : comments.openComments())}
        aiToggle={
          ai.aiDraft.draft
            ? {
                shown: ai.shown,
                count: ai.aiDraft.marks.length,
                onClick: () => {
                  if (!ai.shown) comments.closeComments();
                  setAiPanelOpen(!ai.shown);
                },
              }
            : null
        }
        fullscreen={view.fullscreen}
        onToggleFullscreen={() => void view.toggleFullscreen()}
        onBack={goBack}
        onPlay={onPlayButton}
        onOpenTools={() => setToolsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenHelp={openHelp}
        onJumpMeasure={focusOn}
      />

      {(warning || notTwoStaves) && !hideWarning && (
        <div className="sv-banner" role="status">
          <span>
            {warning}
            {warning && notTwoStaves ? ' ' : ''}
            {notTwoStaves && t('editor.view.banner.notTwoStaves', { staves: info.staves })}
          </span>
          {warning && mode === 'page' && (
            <button className="sc-btn" onClick={() => view.setMode('scroll')}>
              {t('editor.view.banner.switchScroll')}
            </button>
          )}
          <button
            className="sv-banner__close"
            onClick={() => setHideWarning(true)}
            aria-label={t('editor.view.banner.hide')}
          >
            ×
          </button>
        </div>
      )}

      <ShowAssignmentBanner scoreId={score.id} />

      <div
        className={`sv-body${canEdit ? ' has-tools' : ''}${side.dragging ? ' is-side-resizing' : ''}`}
        style={{ '--sv-side-w': `${side.width}px` } as CSSProperties}
      >
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
            onSuggestChords={score.canReview ? () => setSuggestingChords(true) : undefined}
            suggestChordsBlocked={editor.dirty ? t('chords.saveFirst') : null}
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
        <div className="sv-stage" ref={stageRef} onContextMenu={menu.onStageContextMenu}>
          <ScoreCanvas
            xml={xml}
            zoom={zoom}
            mode={mode}
            onZoomChange={view.setZoom}
            onRendered={view.setPageCount}
            onProgress={view.setProgress}
            onError={() => setParseFailed(true)}
            // Luôn gắn id nốt (cần để tô vùng góp ý, chọn ô để góp ý, tô nốt đang phát); sửa vẫn chỉ khi canEdit
            doc={doc}
            revision={editor.revision}
            selected={editor.selection}
            issueMeasures={issueMeasures}
            lockBoxes={lockBoxes}
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
            commentRanges={comments.commentRanges}
            aiChords={ai.aiDraft.marks}
            aiFocus={ai.aiFocus}
            onCommentBubble={(ids) => comments.showThread(ids[0])}
          />
          {selRect && commentAnchor && canComment && !commentBlocked && !composer && !contextMenu && (
            <SelectionCommentButton rect={selRect} onClick={() => openComposer(selRect)} />
          )}
          <div className="sv-pos" aria-live="polite">
            {progressLabel}
          </div>
        </div>
        <EditorSideColumn
          scoreId={score.id}
          editor={editor}
          live={live}
          side={side}
          ai={ai}
          onCloseAi={() => setAiPanelOpen(false)}
          comments={comments}
        />
      </div>

      {canEdit && (
        <EditorInputBars
          doc={doc}
          editor={editor}
          notationOpen={notationOpen}
          onCloseNotation={() => setNotationOpen(false)}
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
          applyTransposeHint={t('editor.view.transposeHint')}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={t('editor.ctx.label')}
          title={editorMenuTitle(doc, editor.selection, contextMenu.measureIndex)}
          items={buildEditorMenu({
            doc,
            editor,
            hitIds: contextMenu.hitIds,
            measureIndex: contextMenu.measureIndex,
            canEdit,
            playing: player.status === 'playing',
            onPlay: onPlayButton,
            comment: canComment
              ? {
                  disabledReason: !commentAnchor ? t('scores.comments.contextNoAccess') : commentBlocked,
                  threads: menu.threadsAtMenu.length,
                  onComment: () =>
                    openComposer({
                      left: contextMenu.x,
                      top: contextMenu.y,
                      right: contextMenu.x,
                      bottom: contextMenu.y,
                    }),
                  onShowThreads: () => comments.showThread(menu.threadsAtMenu[0]?.id),
                }
              : null,
          })}
          onClose={menu.closeContextMenu}
        />
      )}
      {composer && (
        <InlineCommentComposer
          scoreId={score.id}
          anchor={composer.anchor}
          rect={composer.rect}
          onClose={() => comments.setComposer(null)}
          onCreated={(created) => {
            comments.setComposer(null);
            comments.setFocusCommentId(created.id);
            comments.refreshComments();
          }}
        />
      )}
      <EditorStatusBar score={score} info={info} editor={editor} onFocusMeasure={focusOn} />

      {suggestingChords && (
        <ChordSuggestDialog
          scoreId={score.id}
          onClose={() => setSuggestingChords(false)}
          // Người sửa được: gợi ý xong thì nạp ngay vào trình chỉnh sửa làm bản nháp thay vì sang trang duyệt
          onCompleted={
            canEdit
              ? (suggestionId) => {
                  setSuggestingChords(false);
                  ai.beginAiDraft(suggestionId);
                }
              : undefined
          }
        />
      )}
      <EditorDialogs
        score={score}
        editor={editor}
        helpOpen={helpOpen}
        onCloseHelp={() => setHelpOpen(false)}
        historyOpen={historyOpen}
        onCloseHistory={() => setHistoryOpen(false)}
        liveActive={live.active}
      />
    </div>
  );
}
