import { useEffect } from 'react';
import AiChordPanel from '../../../../components/scores/chords/AiChordPanel';
import CommentsSection from '../../../../components/scores/comments/CommentsSection';
import { SidebarRail, SidebarResizer } from '../../../../components/scores/common/SidebarResizer';
import type { useSidebarResize } from '../../../../components/scores/common/useSidebarResize';
import { useMediaQuery } from '../../../../components/player/hooks/useMediaQuery';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import type { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';
import { t } from '../../../../i18n/core';
import type { AiChordPanelState } from './useAiChordPanel';
import type { ScoreComments } from './useScoreComments';

interface Props {
  scoreId: string;
  editor: ScoreEditor;
  live: ReturnType<typeof useLiveCollab>;
  side: ReturnType<typeof useSidebarResize>;
  ai: AiChordPanelState;
  onCloseAi: () => void;
  comments: ScoreComments;
}

/**
 * Cột phải của Editor: bảng Góp ý hoặc bảng Hợp âm AI (dùng chung một chỗ). Máy tính & iPad ngang kéo ra / kéo vào
 * được, thu gọn thành dải mỏng; màn nhỏ là ngăn kéo dưới đáy.
 */
export default function EditorSideColumn({ scoreId, editor, live, side, ai, onCloseAi, comments }: Props) {
  const sideWide = useMediaQuery('(min-width: 1024px)');
  const { commentsOpen } = comments;
  const sideShown = ai.shown || commentsOpen;
  const sideRail = sideWide && side.collapsed;
  const sideName = ai.shown ? t('chords.draft.panelTitle') : t('scores.comments.panelToggle');
  const expandSide = side.expand;
  // Bấm mở bảng (nút Góp ý, Hợp âm AI) khi cột đang thu gọn thì mở rộng luôn, không chỉ hiện dải mỏng
  useEffect(() => {
    if (sideShown) expandSide();
  }, [sideShown, ai.shown, commentsOpen, expandSide]);
  const draft = ai.aiDraft.draft;

  return (
    <>
      {sideShown && sideWide && <SidebarResizer name={sideName} resize={side} />}
      {sideShown && sideRail && (
        <aside className="sv-side-rail" aria-label={sideName}>
          <SidebarRail name={sideName} side="right" onExpand={side.expand} />
        </aside>
      )}
      {!sideRail && ai.shown && draft && (
        <AiChordPanel
          rows={ai.aiDraft.rows}
          title={draft.suggestion.title}
          description={draft.suggestion.description}
          currentId={[...editor.selection][0] ?? null}
          saving={editor.saving}
          canSave={live.active ? live.state.unsaved || live.state.pending > 0 : editor.dirty}
          onPick={ai.pickAiChord}
          onEdit={ai.editAiChord}
          onRemove={ai.removeAiChord}
          onSave={() => void editor.save()}
          onDiscard={() => void ai.discardAiDraft()}
          onClose={onCloseAi}
          option={draft.option}
          optionCount={draft.optionCount}
          switching={ai.aiDraft.switching}
          onOption={(n) => void ai.aiDraft.switchOption(n)}
        />
      )}
      {!sideRail && ai.shown && !draft && (
        <aside className="sv-comments aic-panel" aria-busy="true" aria-label={t('chords.draft.panelTitle')}>
          <p className="sv-ai-loading">{t('chords.draft.loading')}</p>
        </aside>
      )}
      {!sideRail && commentsOpen && !ai.shown && (
        <aside className="sv-comments" aria-label={t('scores.comments.panelToggle')}>
          <div className="sv-comments__head">
            <h2>{t('scores.comments.panelToggle')}</h2>
            <button
              type="button"
              className="sv-comments__close"
              onClick={comments.closeComments}
              aria-label={t('scores.comments.panelClose')}
              title={t('scores.comments.panelClose')}
            >
              ×
            </button>
          </div>
          <CommentsSection
            scoreId={scoreId}
            compact
            focusId={comments.focusCommentId}
            anchor={comments.commentAnchor}
            composeKey={comments.composeKey}
            composeBlockedReason={comments.commentBlocked}
            onSelectThread={comments.selectThread}
            onChanged={comments.refreshComments}
          />
        </aside>
      )}
    </>
  );
}
