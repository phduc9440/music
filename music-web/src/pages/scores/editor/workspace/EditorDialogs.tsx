import Modal from '../../../../components/scores/common/Modal';
import VersionHistoryPanel from '../../../../components/editor/version/VersionHistoryPanel';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import type { ScoreDetail } from '../../../../types';
import { formatDateTime, t } from '../../../../i18n/core';
import { commentShortcuts, editShortcuts, endShortcuts } from './editorShortcuts';

interface Props {
  score: ScoreDetail;
  editor: ScoreEditor;
  helpOpen: boolean;
  onCloseHelp: () => void;
  historyOpen: boolean;
  onCloseHistory: () => void;
  /** Đang có phiên cùng sửa: khôi phục phiên bản cũ sẽ ghi đè thay đổi của người khác nên bị khóa. */
  liveActive: boolean;
}

/** Các hộp thoại của Editor: phím tắt, khôi phục bản nháp, lịch sử phiên bản, xung đột phiên bản khi lưu. */
export default function EditorDialogs({
  score,
  editor,
  helpOpen,
  onCloseHelp,
  historyOpen,
  onCloseHistory,
  liveActive,
}: Props) {
  return (
    <>
      {helpOpen && (
        <Modal title={t('editor.view.menu.shortcuts')} onClose={onCloseHelp}>
          <dl className="sv-help-list">
            {[...editShortcuts(), ...commentShortcuts(), ...endShortcuts()].map(([keys, text]) => (
              <div key={keys} style={{ display: 'contents' }}>
                <dt>{keys}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="sc-modal__actions">
            <button className="sc-btn sc-btn--primary" onClick={onCloseHelp}>
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}

      {editor.draft && (
        <Modal title={t('editor.view.draft.title')} onClose={() => undefined}>
          <p className="sv-modal-text">{t('editor.view.draft.text', { time: formatDateTime(editor.draft.savedAt) })}</p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={editor.discardDraft}>
              {t('editor.view.draft.discard')}
            </button>
            <button className="sc-btn sc-btn--primary" onClick={editor.restoreDraft}>
              {t('editor.view.draft.restore')}
            </button>
          </div>
        </Modal>
      )}

      {historyOpen && (
        <VersionHistoryPanel
          scoreId={score.id}
          canEdit={score.canEdit}
          dirty={editor.dirty}
          busy={editor.saving}
          restoreBlockedReason={liveActive ? t('editor.version.panel.liveBlocked') : null}
          onRestore={editor.restoreVersion}
          onClose={onCloseHistory}
        />
      )}

      {editor.conflict && (
        <Modal title={t('editor.view.conflict.title')} onClose={editor.dismissConflict}>
          <p className="sv-modal-text">
            {editor.conflict.latestVersion > 0
              ? t('editor.view.conflict.newer', { latest: editor.conflict.latestVersion, mine: editor.version })
              : t('editor.view.conflict.newerUnknown')}
            {t('editor.view.conflict.choose')}
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={editor.downloadMine}>
              {t('editor.view.conflict.downloadMine')}
            </button>
            <button className="sc-btn" onClick={editor.reloadLatest}>
              {t('editor.view.conflict.reloadLatest')}
            </button>
            {score.canDelete && (
              <button
                className="sc-btn sc-btn--danger-solid"
                disabled={editor.saving}
                onClick={() => void editor.overwrite()}
              >
                {t('editor.view.conflict.overwrite')}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
