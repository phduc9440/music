import DownloadMenu from '../../../../components/scores/viewer/DownloadMenu';
import type { ScoreDetail } from '../../../../types';
import { t } from '../../../../i18n/core';

/** OSMD không vẽ được bản nhạc: báo lỗi, cho quay lại hoặc tải file gốc về. */
export default function EditorParseFailed({ score, onBack }: { score: ScoreDetail; onBack: () => void }) {
  return (
    <div className="sc-page sv-root sv-root--center">
      <div className="sv-state" role="alert">
        <h2>{t('editor.view.state.parseError.title')}</h2>
        <p>{t('editor.view.state.parseError.text')}</p>
        <div className="sv-state__actions">
          <button className="sc-btn sc-btn--primary" onClick={onBack}>
            {t('editor.view.state.parseError.action')}
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
