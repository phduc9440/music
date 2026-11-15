import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useNavigate } from '../../routes/useTransitionNavigate';
import MarkdownEditor from '../../components/forum/MarkdownEditor';
import ScorePicker from '../../components/forum/ScorePicker';
import { BackLink } from '../../components/ui';
import { forumApi } from '../../services';
import type { ForumCategory } from '../../types';
import { FORUM_TITLE_MAX, FORUM_TITLE_MIN } from '../../types';
import { getErrorMessage } from '../../utils/score';
import { t } from '../../i18n/core';
import '../../components/scores/scores.css';
import './forum.css';

/** /forum/new (đặt chủ đề) và /forum/threads/:id/edit (sửa chủ đề của mình). */
export default function ForumCompose() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [score, setScore] = useState<{ id: string; title: string } | null>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    forumApi
      .categories()
      .then((res) => {
        setCategories(res.data.result);
        setCategoryId((current) => current || (editing ? '' : (res.data.result[0]?.id ?? '')));
      })
      .catch(() => toast.error(t('forum.loadFailed')));
  }, [editing]);

  useEffect(() => {
    if (!id) return;
    forumApi
      .thread(id)
      .then((res) => {
        const th = res.data.result.thread;
        if (!th.mine) {
          navigate(`/forum/threads/${id}`, { replace: true });
          return;
        }
        setCategoryId(th.categoryId);
        setTitle(th.title);
        setBody(th.body ?? '');
        setScore(th.score);
        setLoaded(true);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, t('forum.loadFailed')));
        navigate('/forum', { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const titleOk = title.trim().length >= FORUM_TITLE_MIN && title.trim().length <= FORUM_TITLE_MAX;
  const valid = titleOk && body.trim().length > 0 && (editing || categoryId !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = { categoryId, title, body, scoreId: score?.id ?? null };
      const res = editing && id ? await forumApi.updateThread(id, payload) : await forumApi.createThread(payload);
      navigate(`/forum/threads/${res.data.result.id}`);
    } catch (err) {
      setError(getErrorMessage(err, t('forum.compose.failed')));
      setBusy(false);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <BackLink label={t('forum.title')} to={editing && id ? `/forum/threads/${id}` : '/forum'} />
        <h1 className="fm-compose__title">{t(editing ? 'forum.compose.editTitle' : 'forum.compose.newTitle')}</h1>

        {!loaded ? (
          <div className="fm-row fm-row--skeleton" aria-hidden="true" />
        ) : (
          <form className="fm-compose" onSubmit={submit}>
            {!editing && (
              <div>
                <label className="sc-label" htmlFor="fm-category">
                  {t('forum.compose.category')}
                </label>
                <select
                  id="fm-category"
                  className="sc-input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="sc-label" htmlFor="fm-title">
                {t('forum.compose.titleLabel')}
                <span className="sc-counter">
                  {title.length}/{FORUM_TITLE_MAX}
                </span>
              </label>
              <input
                id="fm-title"
                className="sc-input"
                value={title}
                maxLength={FORUM_TITLE_MAX}
                placeholder={t('forum.compose.titlePlaceholder')}
                onChange={(e) => setTitle(e.target.value)}
              />
              {title.length > 0 && !titleOk && (
                <div className="sc-error">{t('forum.compose.titleShort', { min: FORUM_TITLE_MIN })}</div>
              )}
            </div>

            <MarkdownEditor
              label={t('forum.compose.bodyLabel')}
              value={body}
              rows={10}
              placeholder={t('forum.compose.bodyPlaceholder')}
              onChange={setBody}
            />

            <ScorePicker value={score} onChange={setScore} />

            {error && <div className="sc-error">{error}</div>}
            <div className="fm-actions fm-actions--end">
              <button
                type="button"
                className="sc-btn"
                disabled={busy}
                onClick={() => navigate(editing && id ? `/forum/threads/${id}` : '/forum')}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="sc-btn sc-btn--primary" disabled={!valid || busy}>
                {busy ? t('forum.sending') : t(editing ? 'forum.compose.save' : 'forum.compose.publish')}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
