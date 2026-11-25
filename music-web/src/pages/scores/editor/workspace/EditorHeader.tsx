import Icon from '../../../../components/ui/Icon';
import DownloadMenu from '../../../../components/scores/viewer/DownloadMenu';
import InstrumentMenu from '../../../../components/scores/viewer/InstrumentMenu';
import ToolbarMoreMenu from '../../../../components/scores/toolbar/ToolbarMoreMenu';
import ZoomControl from '../../../../components/scores/viewer/ZoomControl';
import LiveBar from '../../../../components/editor/live/LiveBar';
import type { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import type { usePlayer } from '../../../../components/player/hooks/usePlayer';
import {
  IconBack,
  IconComment,
  IconEdit,
  IconExpand,
  IconHistory,
  IconKeyboard,
  IconPages,
  IconPlay,
  IconRedo,
  IconSave,
  IconStop,
  IconScroll,
  IconShrink,
  IconUndo,
} from '../../../../components/scores/viewer/ViewerIcons';
import type { ScoreDetail } from '../../../../types';
import type { ViewMode } from '../../../../utils/viewer';
import { t } from '../../../../i18n/core';
import { ALT, MOD } from './editorShortcuts';

interface Props {
  score: ScoreDetail;
  editor: ScoreEditor;
  live: ReturnType<typeof useLiveCollab>;
  player: ReturnType<typeof usePlayer>;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  commentsOpen: boolean;
  /** Nút bảng Hợp âm AI, chỉ có khi đang có bản nháp hợp âm AI. */
  aiToggle: { shown: boolean; count: number; onClick: () => void } | null;
  /** Nút bảng "Cần kiểm tra" (ô OMR nghi ngờ chưa kiểm), chỉ có với bản số hóa còn ô nghi ngờ (OMR-03). */
  checkToggle?: { shown: boolean; count: number; onClick: () => void } | null;
  openThreadCount: number;
  onToggleComments: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onBack: () => void;
  onPlay: () => void;
  onOpenTools: () => void;
  onOpenHistory: () => void;
  onOpenHelp: () => void;
  /** Cuộn tới ô nhịp (chỉ số từ 0) của người cùng sửa. */
  onJumpMeasure: (measureIndex: number) => void;
}

/** Thanh trên cùng của Editor: quay lại, tên bài, trạng thái lưu, chế độ xem, thu phóng, Lưu, Góp ý, Phát, tải về. */
export default function EditorHeader(p: Props) {
  const { score, editor, live, player, mode, zoom, fullscreen } = p;
  const canEdit = score.canEdit;
  const saveLabel = editor.saving
    ? t('editor.view.save.saving')
    : editor.dirty
      ? t('editor.view.save.dirty')
      : t('editor.view.save.saved', { version: editor.version });
  const saveClass = editor.saving ? ' is-saving' : editor.dirty ? ' is-dirty' : '';

  return (
    <header className="sv-toolbar">
      <div className="sv-toolbar__left">
        <button
          className="sc-btn sv-icon"
          onClick={p.onBack}
          aria-label={t('editor.view.header.back')}
          title={t('editor.view.header.back')}
        >
          <IconBack />
        </button>
        <div className="sv-title">
          <h1 title={score.title}>{score.title}</h1>
          <p>{score.composer || t('editor.view.header.unknownComposer')}</p>
        </div>
        {canEdit ? (
          <span className={`sv-savestate${saveClass}`} role="status" aria-live="polite" title={saveLabel}>
            <span className="sv-sr">{saveLabel}</span>
          </span>
        ) : (
          <span className="sv-badge">{t('editor.view.header.readOnly')}</span>
        )}
        {live.active && <LiveBar state={live.state} onJump={p.onJumpMeasure} />}
      </div>

      <div className="sv-toolbar__center">
        <div className="sv-segment sv-segment--icons" role="group" aria-label={t('editor.view.header.modeGroup')}>
          <button
            aria-pressed={mode === 'page'}
            aria-label={t('editor.view.header.page')}
            title={t('editor.view.header.page')}
            onClick={() => p.onModeChange('page')}
          >
            <IconPages />
          </button>
          <button
            aria-pressed={mode === 'scroll'}
            aria-label={t('editor.view.header.scroll')}
            title={t('editor.view.header.scroll')}
            onClick={() => p.onModeChange('scroll')}
          >
            <IconScroll />
          </button>
        </div>
        <ZoomControl zoom={zoom} onChange={p.onZoomChange} />
      </div>

      <div className="sv-toolbar__right">
        {canEdit && (
          <div className="sv-group sv-desktop-only">
            <button
              className="sc-btn sv-icon"
              disabled={!editor.canUndo || editor.saving}
              onClick={editor.undo}
              title={`${t('editor.tool.undo')} (${MOD}+Z)`}
              aria-label={t('editor.tool.undo')}
            >
              <IconUndo />
            </button>
            <button
              className="sc-btn sv-icon"
              disabled={!editor.canRedo || editor.saving}
              onClick={editor.redo}
              title={`${t('editor.tool.redo')} (${MOD}+Shift+Z)`}
              aria-label={t('editor.tool.redo')}
            >
              <IconRedo />
            </button>
            <button
              className="sc-btn sc-btn--primary"
              disabled={
                (live.active ? !live.state.unsaved && live.state.pending === 0 : !editor.dirty) || editor.saving
              }
              onClick={() => void editor.save()}
              title={t('editor.view.saveTitle', { shortcut: `${MOD}+S` })}
            >
              <IconSave /> {t('editor.view.saveButton')}
            </button>
          </div>
        )}
        {canEdit && (
          <button className="sc-btn sv-mobile-only" onClick={p.onOpenTools}>
            <IconEdit /> {t('editor.view.header.edit')}
          </button>
        )}
        {p.checkToggle && (
          <button
            className={`sc-btn sv-ai-toggle${p.checkToggle.shown ? ' is-active' : ''}`}
            aria-pressed={p.checkToggle.shown}
            onClick={p.checkToggle.onClick}
            title={t('upload.check.toggleHint')}
          >
            <Icon name="alert" size={16} /> <span className="sv-desktop-only">{t('upload.check.title')}</span>
            <span className="sv-count">{p.checkToggle.count}</span>
          </button>
        )}
        {p.aiToggle && (
          <button
            className={`sc-btn sv-ai-toggle${p.aiToggle.shown ? ' is-active' : ''}`}
            aria-pressed={p.aiToggle.shown}
            onClick={p.aiToggle.onClick}
            title={t('chords.draft.panelTitle')}
          >
            <Icon name="star" size={16} /> <span className="sv-desktop-only">{t('chords.draft.panelToggle')}</span>
            <span className="sv-count">{p.aiToggle.count}</span>
          </button>
        )}
        <button
          className={`sc-btn${p.commentsOpen ? ' is-active' : ''}`}
          aria-pressed={p.commentsOpen}
          onClick={p.onToggleComments}
          title={`${t('scores.comments.panelToggle')} (${MOD}+${ALT}+M)`}
        >
          <IconComment /> <span className="sv-desktop-only">{t('scores.comments.panelToggle')}</span>
          {p.openThreadCount > 0 && <span className="sv-count">{p.openThreadCount}</span>}
        </button>
        <button
          className="sc-btn"
          onClick={p.onPlay}
          aria-pressed={player.status === 'playing'}
          title={
            player.status === 'playing'
              ? t('editor.view.play.pause')
              : editor.selection.size > 0
                ? t('editor.view.play.fromSelection')
                : t('editor.view.play.all')
          }
        >
          {player.status === 'playing' ? <IconStop /> : <IconPlay />}{' '}
          {player.status === 'playing' ? t('editor.view.play.pause') : t('editor.view.play.play')}
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
              label: t('editor.version.panel.title'),
              icon: <IconHistory />,
              onClick: p.onOpenHistory,
            },
            {
              key: 'fullscreen',
              label: fullscreen ? t('editor.view.menu.fullscreenExit') : t('editor.view.menu.fullscreen'),
              icon: fullscreen ? <IconShrink /> : <IconExpand />,
              hint: fullscreen ? 'Esc' : undefined,
              onClick: p.onToggleFullscreen,
            },
            ...(canEdit
              ? [
                  {
                    key: 'shortcuts',
                    label: t('editor.view.menu.shortcuts'),
                    icon: <IconKeyboard />,
                    hint: '?',
                    onClick: p.onOpenHelp,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </header>
  );
}
