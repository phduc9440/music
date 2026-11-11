import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import Pagination from '../../../components/scores/common/Pagination';
import { scoreApi } from '../../../services';
import type { PageResult, TrashedScore } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './ScoreLibrary.css';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

const PAGE_SIZE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày còn lại trước khi bị xóa hẳn (tối thiểu 0). */
const daysLeft = (purgeAt: string): number =>
  Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY_MS));

/** Trang /scores/trash: bản nhạc đã xóa, giữ 30 ngày để khôi phục hoặc xóa hẳn. */
export default function ScoreTrash() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResult<TrashedScore> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<TrashedScore | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await scoreApi.trash({ page, size: PAGE_SIZE });
      // Xóa/khôi phục hết bản cuối của trang thì lùi về trang trước
      if (res.data.result.content.length === 0 && page > 0) {
        setPage(page - 1);
        return;
      }
      setData(res.data.result);
    } catch {
      toast.error(t('scores.trash.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu khi đổi trang
    void load();
  }, [load]);

  const handleRestore = async (score: TrashedScore) => {
    setBusyId(score.id);
    try {
      await scoreApi.restore(score.id);
      toast.success(t('scores.trash.restored'));
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.trash.restoreFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const closePurge = () => {
    setPurging(null);
    setTyped('');
    setError('');
  };

  const handlePurge = async () => {
    if (!purging) return;
    setBusyId(purging.id);
    setError('');
    try {
      await scoreApi.purge(purging.id);
      toast.success(t('scores.trash.purged'));
      closePurge();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('scores.trash.purgeFailed')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('common.nav.items.trash')}</h1>
            <p>{t('scores.trash.subtitle')}</p>
          </div>
          <button className="sc-btn" onClick={() => navigate('/scores')}>
            {t('scores.trash.backToLibrary')}
          </button>
        </header>

        {loading && <div className="sc-skeleton sc-skeleton--hero" aria-busy="true" />}

        {!loading && data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>{t('scores.trash.emptyTitle')}</h3>
            <p>{t('scores.trash.emptyHint')}</p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <ul className="sc-trash">
            {data.content.map((s) => (
              <li key={s.id} className="sc-trash__item">
                <div className="sc-trash__info">
                  <h3 title={s.title}>{s.title}</h3>
                  <p>{s.composer || t('scores.card.unknownComposer')}</p>
                  <p className="sc-trash__meta">
                    {t('scores.trash.purgeIn', { count: daysLeft(s.purgeAt) })}
                    {s.deletedByAdmin ? ` · ${t('scores.trash.byAdmin')}` : ''}
                    {s.deleteReason ? ` · ${t('scores.trash.reason', { reason: s.deleteReason })}` : ''}
                  </p>
                </div>
                <div className="sc-trash__actions">
                  <button className="sc-btn" disabled={busyId !== null} onClick={() => handleRestore(s)}>
                    {t('scores.trash.restore')}
                  </button>
                  <button className="sc-btn sc-btn--danger" disabled={busyId !== null} onClick={() => setPurging(s)}>
                    {t('scores.trash.purge')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && (
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>

      {purging && (
        <Modal title={t('scores.trash.purgeTitle')} onClose={closePurge}>
          <p className="sc-delete__text">
            <Rich text={t('scores.trash.purgeWarning', { title: purging.title })} />
          </p>
          <input
            className="sc-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('scores.trash.retype')}
            autoFocus
          />
          {error && <div className="sc-error">{error}</div>}
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={closePurge} disabled={busyId !== null}>
              {t('common.cancel')}
            </button>
            <button
              className="sc-btn sc-btn--danger-solid"
              onClick={handlePurge}
              disabled={busyId !== null || typed.trim() !== purging.title.trim()}
            >
              {busyId === purging.id ? t('scores.trash.deleting') : t('scores.trash.purgeForever')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
