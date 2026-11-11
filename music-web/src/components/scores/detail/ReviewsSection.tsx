import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { reviewApi } from '../../../services';
import { MAX_REVIEW_COMMENT, formatRelative, getErrorMessage } from '../../../utils/score';
import type { ReviewList } from '../../../types';
import { useDialog } from '../../ui/dialog-context';
import { t } from '../../../i18n/core';

interface Props {
  scoreId: string;
  /** Có quyền viết nhận xét (người nhận xét trở lên). */
  canReview: boolean;
  /** Báo trang cha khi nhận xét đổi (để cập nhật điểm trung bình trên đầu trang). */
  onChanged: () => void;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Tab "Nhận xét": điểm trung bình, danh sách nhận xét và form viết nhận xét của tôi. */
export default function ReviewsSection({ scoreId, canReview, onChanged }: Props) {
  const { confirm } = useDialog();
  const [data, setData] = useState<ReviewList | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mine = data?.reviews.find((r) => r.mine);

  // Tải danh sách; form được điền sẵn nhận xét cũ của tôi (nếu có) để sửa
  useEffect(() => {
    reviewApi
      .list(scoreId)
      .then((res) => {
        setData(res.data.result);
        const m = res.data.result.reviews.find((r) => r.mine);
        setRating(m?.rating ?? null);
        setComment(m?.comment ?? '');
      })
      .catch((err) => setError(getErrorMessage(err, t('scores.reviews.loadFailed'))));
  }, [scoreId]);

  const apply = (result: ReviewList) => {
    setData(result);
    onChanged();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === null && !comment.trim()) return setError(t('scores.reviews.needContent'));
    if (comment.length > MAX_REVIEW_COMMENT)
      return setError(t('scores.reviews.commentMax', { max: MAX_REVIEW_COMMENT }));
    setBusy(true);
    setError('');
    try {
      apply((await reviewApi.saveMine(scoreId, rating, comment)).data.result);
      toast.success(mine ? t('scores.reviews.updated') : t('scores.reviews.sent'));
    } catch (err) {
      setError(getErrorMessage(err, t('scores.reviews.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, own: boolean) => {
    const ok = await confirm({
      title: own ? t('scores.reviews.deleteOwn') : t('scores.reviews.deleteOther'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = (await reviewApi.remove(scoreId, id)).data.result;
      apply(result);
      if (own) {
        setRating(null);
        setComment('');
      }
      toast.success(t('scores.reviews.deleted'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.reviews.deleteFailed')));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <div className="sc-error">{error}</div> : <p>{t('common.loading')}</p>;

  return (
    <section className="sc-reviews">
      <div className="sc-reviews__summary">
        {data.averageRating !== null ? (
          <>
            <strong className="sc-reviews__avg">{data.averageRating.toFixed(1)}</strong>
            <span className="sc-reviews__stars" aria-hidden>
              {stars(Math.round(data.averageRating))}
            </span>
            <span>({t('scores.reviews.ratings', { count: data.ratingCount })})</span>
          </>
        ) : (
          <span>{t('scores.reviews.noRatings')}</span>
        )}
      </div>

      {canReview ? (
        <form className="sc-reviews__form" onSubmit={submit}>
          <h4>{mine ? t('scores.reviews.yours') : t('scores.reviews.write')}</h4>
          <div className="sc-reviews__pick" role="radiogroup" aria-label={t('scores.reviews.stars')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={t('scores.reviews.starCount', { count: n })}
                className={`sc-star ${rating !== null && n <= rating ? 'is-on' : ''}`}
                disabled={busy}
                // Bấm lại đúng số sao đang chọn thì bỏ chấm
                onClick={() => setRating(rating === n ? null : n)}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className="sc-input"
            rows={3}
            maxLength={MAX_REVIEW_COMMENT}
            placeholder={t('scores.reviews.placeholder')}
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <div className="sc-error">{error}</div>}
          <div>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
              {busy ? t('scores.edit.saving') : mine ? t('scores.reviews.update') : t('scores.reviews.send')}
            </button>
          </div>
        </form>
      ) : (
        <p className="sc-upload__hint">{t('scores.reviews.needRole')}</p>
      )}

      {data.reviews.length === 0 && <p className="sc-upload__hint">{t('scores.reviews.none')}</p>}
      <ul className="sc-reviews__list">
        {data.reviews.map((r) => (
          <li key={r.id} className="sc-review">
            <div className="sc-review__head">
              <strong>{r.fullName || r.email}</strong>
              {r.mine && <span className="sc-chip sc-chip--accent">{t('scores.reviews.you')}</span>}
              {r.rating != null && (
                <span className="sc-reviews__stars" aria-label={t('scores.reviews.starCount', { count: r.rating })}>
                  {stars(r.rating)}
                </span>
              )}
              <span className="sc-upload__hint">{formatRelative(r.updatedAt || r.createdAt)}</span>
              {r.canDelete && (
                <button
                  type="button"
                  className="sc-icon-btn"
                  aria-label={t('scores.reviews.deleteLabel')}
                  disabled={busy}
                  onClick={() => remove(r.id, r.mine)}
                >
                  ×
                </button>
              )}
            </div>
            {r.comment && <p>{r.comment}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
