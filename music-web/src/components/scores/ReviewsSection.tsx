import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { reviewApi } from '../../services';
import { MAX_REVIEW_COMMENT, formatRelative, getErrorMessage } from '../../utils/score';
import type { ReviewList } from '../../types';

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
      .catch((err) => setError(getErrorMessage(err, 'Không tải được nhận xét')));
  }, [scoreId]);

  const apply = (result: ReviewList) => {
    setData(result);
    onChanged();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === null && !comment.trim()) return setError('Hãy chấm sao hoặc viết bình luận');
    if (comment.length > MAX_REVIEW_COMMENT) return setError(`Bình luận tối đa ${MAX_REVIEW_COMMENT} ký tự`);
    setBusy(true);
    setError('');
    try {
      apply((await reviewApi.saveMine(scoreId, rating, comment)).data.result);
      toast.success(mine ? 'Đã cập nhật nhận xét' : 'Đã gửi nhận xét');
    } catch (err) {
      setError(getErrorMessage(err, 'Không lưu được nhận xét'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, own: boolean) => {
    if (!window.confirm(own ? 'Xóa nhận xét của bạn?' : 'Xóa nhận xét này?')) return;
    setBusy(true);
    try {
      const result = (await reviewApi.remove(scoreId, id)).data.result;
      apply(result);
      if (own) {
        setRating(null);
        setComment('');
      }
      toast.success('Đã xóa nhận xét');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không xóa được nhận xét'));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <div className="sc-error">{error}</div> : <p>Đang tải...</p>;

  return (
    <section className="sc-reviews">
      <div className="sc-reviews__summary">
        {data.averageRating !== null ? (
          <>
            <strong className="sc-reviews__avg">{data.averageRating.toFixed(1)}</strong>
            <span className="sc-reviews__stars" aria-hidden>
              {stars(Math.round(data.averageRating))}
            </span>
            <span>({data.ratingCount} lượt chấm)</span>
          </>
        ) : (
          <span>Chưa có ai chấm sao.</span>
        )}
      </div>

      {canReview ? (
        <form className="sc-reviews__form" onSubmit={submit}>
          <h4>{mine ? 'Nhận xét của bạn' : 'Viết nhận xét'}</h4>
          <div className="sc-reviews__pick" role="radiogroup" aria-label="Số sao">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} sao`}
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
            placeholder="Bình luận (tùy chọn nếu đã chấm sao)"
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <div className="sc-error">{error}</div>}
          <div>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
              {busy ? 'Đang lưu...' : mine ? 'Cập nhật' : 'Gửi nhận xét'}
            </button>
          </div>
        </form>
      ) : (
        <p className="sc-upload__hint">Bạn cần quyền "Người nhận xét" trở lên để viết nhận xét.</p>
      )}

      {data.reviews.length === 0 && <p className="sc-upload__hint">Chưa có nhận xét nào.</p>}
      <ul className="sc-reviews__list">
        {data.reviews.map((r) => (
          <li key={r.id} className="sc-review">
            <div className="sc-review__head">
              <strong>{r.fullName || r.email}</strong>
              {r.mine && <span className="sc-chip sc-chip--accent">Bạn</span>}
              {r.rating != null && (
                <span className="sc-reviews__stars" aria-label={`${r.rating} sao`}>
                  {stars(r.rating)}
                </span>
              )}
              <span className="sc-upload__hint">{formatRelative(r.updatedAt || r.createdAt)}</span>
              {r.canDelete && (
                <button
                  type="button"
                  className="sc-icon-btn"
                  aria-label="Xóa nhận xét"
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
