import { useEffect, useState } from 'react';
import { Link } from '../../../routes/transition-nav';
import { omrApi } from '../../../services';
import type { ScoreDetail } from '../../../types';
import { flaggedMeasures, loadCheckedMeasures } from '../../../utils/omr';
import { t } from '../../../i18n/core';
import './omr.css';

const hiddenKey = (scoreId: string) => `scorewise.omrNextHidden.${scoreId}`;

interface Props {
  score: ScoreDetail;
  base: string;
  /** Mở hộp gợi ý hợp âm (bước 2). */
  onSuggestChords: () => void;
}

/**
 * Thẻ "Bước tiếp theo" sau khi số hóa (X-01): dẫn người dùng đi tiếp số hóa → kiểm các ô nghi ngờ → thêm hợp âm → luyện
 * tập, thay cho dải "Đã số hóa xong" hiện mãi. Bước 1 được đánh dấu xong khi mọi ô nghi ngờ đã "Đã kiểm" trong Editor.
 * Ẩn được (nhớ trong trình duyệt theo bản nhạc).
 */
export default function NextStepsCard({ score, base, onSuggestChords }: Props) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(hiddenKey(score.id)) === '1';
    } catch {
      return false;
    }
  });
  const [flagged, setFlagged] = useState<number | null>(null);
  const [unchecked, setUnchecked] = useState<number | null>(null);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    omrApi
      .result(score.id)
      .then((res) => {
        if (cancelled) return;
        const result = res.data.result;
        const list = flaggedMeasures(result.measureMap);
        const checked = loadCheckedMeasures(score.id, result.taskId);
        setFlagged(list.length);
        setUnchecked(list.filter((m) => !checked.has(m.measure)).length);
      })
      .catch(() => !cancelled && setFlagged(0));
    return () => {
      cancelled = true;
    };
  }, [hidden, score.id]);

  if (hidden) return null;
  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(score.id), '1');
    } catch {
      // không lưu được: chỉ ẩn trong lần xem này
    }
    setHidden(true);
  };
  const checkDone = flagged === 0 || unchecked === 0;

  return (
    <section className="om-next" aria-labelledby="om-next-title">
      <div className="om-next__head">
        <h2 id="om-next-title">{t('scores.next.title')}</h2>
        <button type="button" className="sc-btn sc-btn--sm" onClick={hide}>
          {t('scores.next.hide')}
        </button>
      </div>
      <ol className="om-next__steps">
        <li className={`om-next__step${checkDone ? ' is-done' : ''}`}>
          <strong>{t('scores.next.check.title')}</strong>
          <span>
            {flagged == null
              ? t('common.loading')
              : flagged === 0
                ? t('scores.next.check.none')
                : t('scores.next.check.text', { count: unchecked ?? flagged, total: flagged })}
          </span>
          <Link
            className="sc-btn sc-btn--sm sc-btn--primary"
            to={`${base}/${score.id}/edit${flagged ? '?check=1' : ''}`}
          >
            {flagged ? t('scores.next.check.action') : t('scores.hero.openEditor')}
          </Link>
          <Link className="om-field__hint" to={`${base}/${score.id}/review`}>
            {t('scores.hero.viewResult')}
          </Link>
        </li>
        <li className="om-next__step">
          <strong>{t('scores.next.chords.title')}</strong>
          <span>{t('scores.next.chords.text')}</span>
          <button type="button" className="sc-btn sc-btn--sm" onClick={onSuggestChords}>
            {t('chords.button')}
          </button>
        </li>
        <li className="om-next__step">
          <strong>{t('scores.next.practice.title')}</strong>
          <span>{t('scores.next.practice.text')}</span>
          <Link className="sc-btn sc-btn--sm" to={`/studio/scores/${score.id}/play`}>
            {t('scores.hero.studioPractice')}
          </Link>
        </li>
      </ol>
    </section>
  );
}
