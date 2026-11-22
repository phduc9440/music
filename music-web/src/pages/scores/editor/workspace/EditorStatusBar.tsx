import { useState } from 'react';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import { durationLabel, dotsLabel } from '../../../../components/editor/notes/durations';
import type { ScoreDetail } from '../../../../types';
import type { MusicXmlInfo } from '../../../../utils/viewer';
import { t } from '../../../../i18n/core';

interface Props {
  score: ScoreDetail;
  info: MusicXmlInfo;
  editor: ScoreEditor;
  /** Cuộn tới ô nhịp (chỉ số từ 0). */
  onFocusMeasure: (measureIndex: number) => void;
}

/** Thanh dưới cùng: tóm tắt bản nhạc, chế độ nhập, vùng chọn, ô nhịp sai độ dài (bấm để nhảy lần lượt), thông báo. */
export default function EditorStatusBar({ score, info, editor, onFocusMeasure }: Props) {
  const [issueCursor, setIssueCursor] = useState(0);
  const canEdit = score.canEdit;
  const measures = score.measureCount ?? info.measureCount;
  const summary = [
    measures ? t('editor.view.summary.measures', { count: measures }) : '',
    score.keySignature ? t('editor.view.summary.key', { key: score.keySignature }) : '',
    score.timeSignature ? t('editor.view.summary.time', { time: score.timeSignature }) : '',
    score.tempoBpm ? `${score.tempoBpm} BPM` : '',
    canEdit
      ? t('editor.view.summary.version', { version: editor.version })
      : score.currentVersion
        ? t('editor.view.summary.version', { version: score.currentVersion })
        : '',
  ].filter(Boolean);
  const firstIssue = editor.issues[0];

  const goToIssue = () => {
    if (editor.issues.length === 0) return;
    const issue = editor.issues[issueCursor % editor.issues.length];
    onFocusMeasure(issue.measureIndex);
    setIssueCursor((n) => n + 1);
  };

  return (
    <footer className="sv-status">
      <span>{summary.join(' · ') || t('editor.view.summary.score')}</span>
      <div className="sv-status__right">
        {canEdit && editor.inputMode && (
          <span className="sv-status__sel">
            {t('editor.view.status.inputMode', {
              duration: `${durationLabel(editor.inputDuration.type)}${dotsLabel(editor.inputDuration.dots)}`,
            })}
          </span>
        )}
        {canEdit && editor.statusText && <span className="sv-status__sel">{editor.statusText}</span>}
        {canEdit && firstIssue && (
          <button
            className="sv-status__warn"
            onClick={goToIssue}
            title={t('editor.view.status.issueTitle')}
            aria-label={t('editor.view.status.issueAria', { message: firstIssue.message })}
          >
            {firstIssue.message}
            {editor.issues.length > 1 ? t('editor.view.status.issueMore', { count: editor.issues.length - 1 }) : ''}
          </button>
        )}
        {editor.notice && (
          <span key={editor.notice.key} className="sv-status__notice" role="status">
            {editor.notice.text}
          </span>
        )}
        <span className="sv-status__hint">
          {canEdit ? t('editor.view.status.hintEdit') : ''}
          {t('editor.view.status.hintZoom')}
        </span>
      </div>
    </footer>
  );
}
