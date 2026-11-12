import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { versionApi } from '../../../services/score/versionApi';
import type { ScoreDiff } from '../../../types/version';
import { translateError, t } from '../../../i18n/core';
import { measureLabel } from './commentUtils';

interface Props {
  scoreId: string;
  /** Phiên bản lúc viết góp ý. */
  fromVersion: number;
  currentVersion: number;
  start: number;
  end: number;
  onClose: () => void;
}

/**
 * So phiên bản lúc viết góp ý với bản hiện tại bằng API diff có sẵn: số ô thêm / xóa / sửa và vị trí mới của vùng góp ý
 * (không tự dời góp ý, chỉ cho người xem biết đoạn đó giờ ở đâu).
 */
export default function CommentCompareModal({ scoreId, fromVersion, currentVersion, start, end, onClose }: Props) {
  const [diff, setDiff] = useState<ScoreDiff | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    versionApi
      .diff(scoreId, currentVersion, fromVersion)
      .then((d) => !cancelled && setDiff(d))
      .catch((err) => !cancelled && setError(translateError(err, t('scores.comments.compareFailed'))));
    return () => {
      cancelled = true;
    };
  }, [scoreId, currentVersion, fromVersion]);

  // Vị trí mới của các ô trong vùng góp ý: các ô bản cũ trong [start, end] còn ở bản hiện tại thì lấy số ô mới
  const targets =
    diff?.measures
      .filter((m) => m.base != null && m.base >= start && m.base <= end && m.target != null)
      .map((m) => m.target as number) ?? [];
  const from = measureLabel(start, end);
  const to = targets.length ? measureLabel(Math.min(...targets), Math.max(...targets)) : '';

  return (
    <Modal title={t('scores.comments.compareTitle', { from: fromVersion, to: currentVersion })} onClose={onClose}>
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
      {!error && !diff && <p aria-busy="true">{t('scores.comments.compareLoading')}</p>}
      {diff && (
        <div className="cm-compare">
          <p className="cm-compare__main">
            {!to
              ? t('scores.comments.compareGone')
              : to === from
                ? t('scores.comments.compareSame', { from, old: fromVersion })
                : t('scores.comments.compareMoved', { from, old: fromVersion, to })}
          </p>
          <p className="cm-muted">
            {t('scores.comments.compareSummary', {
              old: fromVersion,
              added: diff.summary.added,
              deleted: diff.summary.deleted,
              edited: diff.summary.edited,
            })}
          </p>
        </div>
      )}
      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}
