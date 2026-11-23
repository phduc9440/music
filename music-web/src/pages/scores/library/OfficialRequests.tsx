import { useCallback, useEffect, useState } from 'react';
import { Link } from '../../../routes/transition-nav';
import { toast } from 'react-toastify';
import { officialRequestApi } from '../../../services';
import type { OfficialRequest } from '../../../types';
import { formatRelative } from '../../../utils/score';
import '../../../components/scores/scores.css';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

/** Trang /scores/official-requests: quản trị viên xin đưa bản nhạc công khai của bạn vào kho bản nhạc mẫu. */
export default function OfficialRequests() {
  const [items, setItems] = useState<OfficialRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    officialRequestApi
      .mine()
      .then((res) => setItems(res.data.result))
      .catch(() => toast.error(t('scores.officialRequests.loadFailed')));
  }, []);

  useEffect(load, [load]);

  const answer = async (request: OfficialRequest, accept: boolean) => {
    setBusyId(request.id);
    try {
      if (accept) await officialRequestApi.accept(request.id);
      else await officialRequestApi.decline(request.id);
      toast.success(accept ? t('scores.officialRequests.accepted') : t('scores.officialRequests.declined'));
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message ?? t('scores.officialRequests.failed'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('scores.officialRequests.title')}</h1>
            <p>{t('scores.officialRequests.subtitle')}</p>
          </div>
        </header>

        <p className="mb-4">
          <Rich text={t('scores.officialRequests.note')} />
        </p>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>{t('scores.officialRequests.emptyTitle')}</h3>
            <p>{t('scores.officialRequests.emptyHint')}</p>
          </div>
        )}

        {items?.map((r) => (
          <article key={r.id} className="sc-card mb-3" style={{ cursor: 'default' }}>
            <div className="sc-card__body">
              <h3 className="sc-card__title">
                <Link to={`/scores/${r.scoreId}`} state={{ from: '/scores/official-requests' }}>
                  {r.scoreTitle}
                </Link>
              </h3>
              <p className="sc-card__composer">{r.composer || t('scores.card.unknownComposer')}</p>
              <p className="sc-card__composer">
                {t('scores.officialRequests.sentBy', { name: r.requestedBy, when: formatRelative(r.createdAt) })}
              </p>
              <div className="d-flex gap-2 mt-2">
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  disabled={busyId === r.id}
                  onClick={() => answer(r, true)}
                >
                  {t('scores.officialRequests.accept')}
                </button>
                <button type="button" className="sc-btn" disabled={busyId === r.id} onClick={() => answer(r, false)}>
                  {t('scores.officialRequests.decline')}
                </button>
              </div>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
