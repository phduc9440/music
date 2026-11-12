import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import Modal from '../../components/scores/common/Modal';
import Skeleton from '../../components/ui/Skeleton';
import { billingApi, teamApi } from '../../services';
import type { Team, TeamInvitation, TeamTask } from '../../types';
import { formatDate, formatNumber, t } from '../../i18n/core';
import { getErrorMessage } from '../../utils/score';
import { DueDate, RoleBadge, StatusBadge } from './shared';
import '../../components/scores/scores.css';
import './teams.css';

/** Trang /teams: lời mời đang chờ, việc của tôi trong các show, danh sách team và nút tạo team (mục 4.1). */
export default function Teams() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Mốc thời gian để tô hạn sắp tới / quá hạn, lấy một lần lúc tải
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    teamApi
      .list()
      .then((res) => setTeams(res.data.result))
      .catch(() => toast.error(t('teams.loadFailed')));
    teamApi
      .myInvitations()
      .then((res) => setInvitations(res.data.result))
      .catch(() => setInvitations([]));
    teamApi
      .myTasks()
      .then((res) => {
        setTasks(res.data.result);
        setNow(Date.now());
      })
      .catch(() => setTasks([]));
  }, []);

  useEffect(() => {
    load();
    billingApi
      .mine()
      // Hạn mức gộp: người có gói cá nhân và gói team vẫn tạo được team
      .then((res) => setCanCreate(!!(res.data.result.limits ?? res.data.result.plan.limits).team))
      .catch(() => setCanCreate(false));
  }, [load]);

  const respond = async (invitation: TeamInvitation, accept: boolean) => {
    setBusyId(invitation.id);
    try {
      if (accept) {
        const res = await teamApi.acceptMine(invitation.id);
        toast.success(t('teams.invite.joined', { team: res.data.result.name }));
        navigate(`/teams/${res.data.result.id}`);
        return;
      }
      await teamApi.declineMine(invitation.id);
      toast.success(t('teams.invite.declined'));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.invite.respondFailed')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('teams.title')}</h1>
            <p>{t('teams.subtitle')}</p>
          </div>
          <button
            type="button"
            className="sc-btn sc-btn--primary"
            disabled={!canCreate}
            title={canCreate === false ? t('teams.planRequired') : undefined}
            onClick={() => setCreating(true)}
          >
            {t('teams.create')}
          </button>
        </header>

        {canCreate === false && (
          <p className="tm-note">
            {t('teams.planRequiredNote')} <Link to="/pricing">{t('teams.viewPlans')}</Link>
          </p>
        )}

        {invitations.length > 0 && (
          <section className="tm-section" aria-labelledby="tm-inv-title">
            <div className="tm-section__head">
              <h2 id="tm-inv-title">{t('teams.invite.pendingTitle')}</h2>
            </div>
            <ul className="tm-list">
              {invitations.map((i) => (
                <li key={i.id} className="tm-row">
                  <div className="tm-row__main">
                    <span className="tm-row__title">{i.teamName}</span>
                    <span className="tm-row__sub">
                      {t('teams.invite.from', {
                        name: i.invitedByName ?? '',
                        role: t(`teams.roles.${i.role}`),
                        date: formatDate(i.expiresAt),
                      })}
                    </span>
                  </div>
                  <div className="tm-row__actions">
                    <button
                      type="button"
                      className="sc-btn sc-btn--sm sc-btn--primary"
                      disabled={busyId === i.id}
                      onClick={() => respond(i, true)}
                    >
                      {t('teams.invite.accept')}
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn--sm"
                      disabled={busyId === i.id}
                      onClick={() => respond(i, false)}
                    >
                      {t('teams.invite.decline')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="tm-section" aria-labelledby="tm-task-title">
          <div className="tm-section__head">
            <h2 id="tm-task-title">{t('teams.tasks.title')}</h2>
            {tasks && tasks.length > 0 && (
              <span className="tm-muted">{t('teams.tasks.count', { count: tasks.length })}</span>
            )}
          </div>
          {!tasks && <Skeleton lines={2} />}
          {tasks && tasks.length === 0 && <p className="tm-muted">{t('teams.tasks.empty')}</p>}
          {tasks && tasks.length > 0 && (
            <ul className="tm-list">
              {tasks.map((task) => (
                <li key={task.itemId} className="tm-row">
                  <div className="tm-row__main">
                    <Link className="tm-row__title" to={`/teams/${task.teamId}/shows/${task.showId}`}>
                      {task.scoreTitle}
                    </Link>
                    <span className="tm-row__sub">
                      {task.showName} · {task.teamName} ·{' '}
                      {[task.asArranger && t('teams.tasks.asArranger'), task.asReviewer && t('teams.tasks.asReviewer')]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                  <div className="tm-row__actions">
                    <DueDate date={task.dueDate} now={now} />
                    <StatusBadge status={task.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tm-section" aria-labelledby="tm-team-title">
          <div className="tm-section__head">
            <h2 id="tm-team-title">{t('teams.myTeams')}</h2>
          </div>
          {!teams && <Skeleton lines={3} />}
          {teams && teams.length === 0 && (
            <div className="sc-empty">
              <h3>{t('teams.emptyTitle')}</h3>
              <p>{t('teams.emptyHint')}</p>
            </div>
          )}
          {teams && teams.length > 0 && (
            <div className="tm-grid">
              {teams.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="tm-card">
                  <div className="tm-card__head">
                    <h3>{team.name}</h3>
                    <RoleBadge role={team.myRole} />
                  </div>
                  {team.description && <p className="tm-card__desc">{team.description}</p>}
                  <ul className="tm-stats">
                    <li>
                      <strong>{formatNumber(team.memberCount)}</strong> {t('teams.stats.members')}
                    </li>
                    <li>
                      <strong>{formatNumber(team.scoreCount)}</strong> {t('teams.stats.scores')}
                    </li>
                    <li>
                      <strong>{formatNumber(team.preparingShows)}</strong> {t('teams.stats.shows')}
                    </li>
                  </ul>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {creating && (
        <TeamFormModal
          onClose={() => setCreating(false)}
          onSaved={(team) => {
            setCreating(false);
            navigate(`/teams/${team.id}`);
          }}
        />
      )}
    </div>
  );
}

const MAX_NAME = 100; // khớp BE (lỗi 3804)
const MAX_DESCRIPTION = 1000;

/** Tạo hoặc sửa team (tên, mô tả). */
export function TeamFormModal({
  team,
  onClose,
  onSaved,
}: {
  team?: Team;
  onClose: () => void;
  onSaved: (team: Team) => void;
}) {
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('teams.form.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = { name: name.trim(), description: description.trim() || null };
      const res = team ? await teamApi.update(team.id, data) : await teamApi.create(data);
      toast.success(team ? t('teams.form.saved') : t('teams.form.created'));
      onSaved(res.data.result);
    } catch (err) {
      setError(getErrorMessage(err, t('teams.form.saveFailed')));
      setSaving(false);
    }
  };

  return (
    <Modal title={team ? t('teams.form.editTitle') : t('teams.form.createTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="sc-label" htmlFor="tm-name">
          {t('teams.form.name')}
        </label>
        <input
          id="tm-name"
          className="sc-input"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('teams.form.namePlaceholder')}
          autoFocus
        />
        <label className="sc-label" htmlFor="tm-desc">
          {t('teams.form.description')}
        </label>
        <textarea
          id="tm-desc"
          className="sc-input"
          rows={3}
          value={description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('teams.form.descriptionPlaceholder')}
        />
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving}>
            {saving ? t('teams.form.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
