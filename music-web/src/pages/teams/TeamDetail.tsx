import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import Modal from '../../components/scores/common/Modal';
import Skeleton from '../../components/ui/Skeleton';
import { useDialog } from '../../components/ui/dialog-context';
import { teamApi, userApi } from '../../services';
import { canManageTeam, TEAM_ROLES } from '../../types';
import type { Show, Team, TeamActivity, TeamInvitation, TeamMember, TeamRole, TeamScore } from '../../types';
import { formatDate, formatDateTime, formatNumber, formatRelativeTime, t } from '../../i18n/core';
import { getErrorCode, getErrorMessage } from '../../utils/score';
import { MemberAvatar, RoleBadge, StatusBadge } from './shared';
import { activityText, memberName } from './teamUtils';
import { TeamFormModal } from './Teams';
import { ShowFormModal } from './ShowBoard';
import '../../components/scores/scores.css';
import './teams.css';

type Tab = 'scores' | 'shows' | 'members' | 'activity';
const TABS: Tab[] = ['scores', 'shows', 'members', 'activity'];

/** Trang /teams/:id: thông tin team và bốn tab Bản nhạc, Show, Thành viên, Hoạt động (mục 4.1). */
export default function TeamDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'scores';
  const [team, setTeam] = useState<Team | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);

  const loadTeam = useCallback(() => {
    teamApi
      .get(id)
      .then((res) => setTeam(res.data.result))
      .catch((err) => {
        if (getErrorCode(err) === 3801) setMissing(true);
        else toast.error(getErrorMessage(err, t('teams.loadFailed')));
      });
  }, [id]);

  useEffect(loadTeam, [loadTeam]);
  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setMeId(res.data.result.id))
      .catch(() => undefined);
  }, []);

  const manager = canManageTeam(team?.myRole);

  const deleteTeam = async () => {
    if (!team) return;
    const ok = await confirm({
      title: t('teams.detail.deleteTitle'),
      message: t('teams.detail.deleteMessage', { name: team.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await teamApi.remove(team.id);
      toast.success(t('teams.detail.deleted'));
      navigate('/teams');
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.detail.deleteFailed')));
    }
  };

  const leave = async () => {
    if (!team || !meId) return;
    const ok = await confirm({
      title: t('teams.detail.leaveTitle'),
      message: t('teams.detail.leaveMessage', { name: team.name }),
      confirmLabel: t('teams.detail.leave'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await teamApi.removeMember(team.id, meId);
      toast.success(t('teams.detail.left'));
      navigate('/teams');
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.detail.leaveFailed')));
    }
  };

  if (missing) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{t('teams.detail.notFound')}</h3>
            <p>{t('teams.detail.notFoundHint')}</p>
            <Link className="sc-btn" to="/teams">
              {t('teams.backToTeams')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sc-page">
      <div className="sc-backbar">
        <Link className="sc-backlink" to="/teams">
          ‹ {t('teams.title')}
        </Link>
      </div>
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>
              {team?.name ?? t('teams.title')} {team && <RoleBadge role={team.myRole} />}
            </h1>
            <p>{team?.description || (team ? t('teams.detail.noDescription') : '')}</p>
          </div>
          {team && (
            <div className="tm-row__actions">
              {manager && (
                <button type="button" className="sc-btn" onClick={() => setEditing(true)}>
                  {t('teams.detail.edit')}
                </button>
              )}
              {team.myRole === 'OWNER' && (
                <button type="button" className="sc-btn sc-btn--danger" onClick={deleteTeam}>
                  {t('teams.detail.delete')}
                </button>
              )}
              <button type="button" className="sc-btn" onClick={leave} disabled={!meId}>
                {t('teams.detail.leave')}
              </button>
            </div>
          )}
        </header>

        {team && !team.planActive && <p className="tm-note tm-note--warning">{t('teams.detail.planInactive')}</p>}

        <div className="tm-tabs" role="tablist" aria-label={t('teams.detail.tabsLabel')}>
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tm-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`tm-panel-${key}`}
              className="tm-tab"
              onClick={() => setParams(key === 'scores' ? {} : { tab: key }, { replace: true })}
            >
              {t(`teams.tabs.${key}`)}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`tm-panel-${tab}`} aria-labelledby={`tm-tab-${tab}`}>
          {!team && <Skeleton lines={4} />}
          {team && tab === 'scores' && <ScoresTab team={team} />}
          {team && tab === 'shows' && <ShowsTab team={team} />}
          {team && tab === 'members' && <MembersTab team={team} meId={meId} onChanged={loadTeam} />}
          {team && tab === 'activity' && <ActivityTab team={team} />}
        </div>
      </main>

      {editing && team && (
        <TeamFormModal
          team={team}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setTeam(saved);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Bản nhạc

function ScoresTab({ team }: { team: Team }) {
  const { pathname } = useLocation();
  const { confirm } = useDialog();
  const [scores, setScores] = useState<TeamScore[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    teamApi
      .scores(team.id)
      .then((res) => setScores(res.data.result))
      .catch(() => toast.error(t('teams.scores.loadFailed')));
  }, [team.id]);
  useEffect(load, [load]);

  const remove = async (score: TeamScore) => {
    const ok = await confirm({
      title: t('teams.scores.removeTitle'),
      message: t('teams.scores.removeMessage', { title: score.title }),
      confirmLabel: t('teams.scores.remove'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await teamApi.removeScore(team.id, score.id);
      toast.success(t('teams.scores.removed'));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.scores.removeFailed')));
    }
  };

  return (
    <>
      <div className="tm-section__head">
        <p className="tm-muted">{t('teams.scores.hint')}</p>
        {team.myRole !== 'VIEWER' && (
          <button type="button" className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
            {t('teams.scores.add')}
          </button>
        )}
      </div>
      {!scores && <Skeleton lines={3} />}
      {scores && scores.length === 0 && (
        <div className="sc-empty">
          <h3>{t('teams.scores.emptyTitle')}</h3>
          <p>{t('teams.scores.emptyHint')}</p>
        </div>
      )}
      {scores && scores.length > 0 && (
        <ul className="tm-list">
          {scores.map((s) => (
            <li key={s.id} className="tm-row">
              <div className="tm-row__main">
                <Link className="tm-row__title" to={`/scores/${s.id}`} state={{ from: pathname }}>
                  {s.title}
                </Link>
                <span className="tm-row__sub">
                  {[
                    s.composer,
                    t('teams.scores.owner', { name: s.ownerName ?? '' }),
                    s.updatedAt && formatDateTime(s.updatedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {s.canRemove && (
                <div className="tm-row__actions">
                  <button type="button" className="sc-btn sc-btn--sm" onClick={() => remove(s)}>
                    {t('teams.scores.remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <AddScoresModal teamId={team.id} onClose={() => setAdding(false)} onAdded={load} />}
    </>
  );
}

/** Chọn bản cá nhân của tôi để chuyển vào team (chỉ chủ bản nhạc làm được). */
function AddScoresModal({ teamId, onClose, onAdded }: { teamId: string; onClose: () => void; onAdded: () => void }) {
  const [candidates, setCandidates] = useState<TeamScore[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    teamApi
      .scoreCandidates(teamId)
      .then((res) => setCandidates(res.data.result))
      .catch(() => toast.error(t('teams.scores.loadFailed')));
  }, [teamId]);

  const move = async (score: TeamScore) => {
    setBusyId(score.id);
    try {
      await teamApi.addScore(teamId, score.id);
      setMoved((prev) => new Set(prev).add(score.id));
      onAdded();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.scores.addFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const shown = (candidates ?? []).filter((s) => s.title.toLowerCase().includes(keyword.trim().toLowerCase()));

  return (
    <Modal title={t('teams.scores.addTitle')} onClose={onClose}>
      <p className="tm-muted">{t('teams.scores.addHint')}</p>
      <input
        className="sc-input"
        placeholder={t('teams.scores.search')}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        autoFocus
      />
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 12 }}>
        {!candidates && <Skeleton lines={3} />}
        {candidates && shown.length === 0 && <p className="tm-muted">{t('teams.scores.noCandidates')}</p>}
        {shown.length > 0 && (
          <ul className="tm-list">
            {shown.map((s) => (
              <li key={s.id} className="tm-row">
                <div className="tm-row__main">
                  <span className="tm-row__title">{s.title}</span>
                  {s.composer && <span className="tm-row__sub">{s.composer}</span>}
                </div>
                <button
                  type="button"
                  className="sc-btn sc-btn--sm"
                  disabled={moved.has(s.id) || busyId === s.id}
                  onClick={() => move(s)}
                >
                  {moved.has(s.id) ? t('teams.scores.moved') : t('teams.scores.move')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          {t('teams.done')}
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ Show

function ShowsTab({ team }: { team: Team }) {
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    teamApi
      .shows(team.id)
      .then((res) => setShows(res.data.result))
      .catch(() => toast.error(t('teams.shows.loadFailed')));
  }, [team.id]);

  return (
    <>
      <div className="tm-section__head">
        <p className="tm-muted">{t('teams.shows.hint')}</p>
        {canManageTeam(team.myRole) && (
          <button type="button" className="sc-btn sc-btn--primary" onClick={() => setCreating(true)}>
            {t('teams.shows.create')}
          </button>
        )}
      </div>
      {!shows && <Skeleton lines={3} />}
      {shows && shows.length === 0 && (
        <div className="sc-empty">
          <h3>{t('teams.shows.emptyTitle')}</h3>
          <p>{t('teams.shows.emptyHint')}</p>
        </div>
      )}
      {shows && shows.length > 0 && (
        <div className="tm-grid">
          {shows.map((s) => (
            <Link key={s.id} to={`/teams/${team.id}/shows/${s.id}`} className="tm-card">
              <div className="tm-card__head">
                <h3>{s.name}</h3>
                <StatusBadge status={s.status} />
              </div>
              <p className="tm-card__desc">
                {[s.showDate ? formatDate(`${s.showDate}T00:00:00`) : t('teams.shows.noDate'), s.venue]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div
                className="tm-progress"
                aria-label={t('teams.shows.progress', { done: s.approvedCount, total: s.itemCount })}
              >
                <div className="tm-progress__track">
                  <div
                    className="tm-progress__fill"
                    style={{ width: `${s.itemCount ? (s.approvedCount / s.itemCount) * 100 : 0}%` }}
                  />
                </div>
                <span>
                  {formatNumber(s.approvedCount)}/{formatNumber(s.itemCount)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <ShowFormModal
          teamId={team.id}
          onClose={() => setCreating(false)}
          onSaved={(show) => navigate(`/teams/${team.id}/shows/${show.id}`)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Thành viên

const INVITE_ROLES: TeamRole[] = ['ARRANGER', 'VIEWER', 'MANAGER'];

function MembersTab({ team, meId, onChanged }: { team: Team; meId: string | null; onChanged: () => void }) {
  const { confirm } = useDialog();
  const manager = canManageTeam(team.myRole);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('ARRANGER');
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(() => {
    teamApi
      .members(team.id)
      .then((res) => setMembers(res.data.result))
      .catch(() => toast.error(t('teams.members.loadFailed')));
    if (manager) {
      teamApi
        .invitations(team.id)
        .then((res) => setInvitations(res.data.result))
        .catch(() => setInvitations([]));
    }
  }, [team.id, manager]);
  useEffect(load, [load]);

  const invite = async (e: FormEvent | null, byLink: boolean) => {
    e?.preventDefault();
    if (!byLink && !email.trim()) return;
    setInviting(true);
    try {
      const res = await teamApi.invite(team.id, { email: byLink ? null : email.trim(), role });
      if (byLink && res.data.result.token) {
        setLink(`${window.location.origin}/teams/invite/${res.data.result.token}`);
      } else {
        toast.success(t('teams.members.invited', { email: email.trim() }));
        setEmail('');
      }
      load();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.members.inviteFailed')));
    } finally {
      setInviting(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('teams.members.linkCopied'));
    } catch {
      toast.info(t('teams.members.copyManually'));
    }
  };

  const changeRole = async (m: TeamMember, next: TeamRole) => {
    try {
      await teamApi.changeRole(team.id, m.memberId, next);
      toast.success(t('teams.members.roleChanged', { name: memberName(m), role: t(`teams.roles.${next}`) }));
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.members.roleFailed')));
      load();
    }
  };

  const remove = async (m: TeamMember) => {
    const ok = await confirm({
      title: t('teams.members.removeTitle'),
      message: t('teams.members.removeMessage', { name: memberName(m) }),
      confirmLabel: t('teams.members.remove'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await teamApi.removeMember(team.id, m.memberId);
      toast.success(t('teams.members.removed'));
      load();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.members.removeFailed')));
    }
  };

  const revoke = async (i: TeamInvitation) => {
    try {
      await teamApi.revokeInvitation(team.id, i.id);
      load();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.members.revokeFailed')));
    }
  };

  // OWNER đổi được mọi vai trò; MANAGER không cấp OWNER và không đụng người là OWNER
  const editable = (m: TeamMember) => manager && m.memberId !== meId && (team.myRole === 'OWNER' || m.role !== 'OWNER');
  const roleOptions = team.myRole === 'OWNER' ? TEAM_ROLES : TEAM_ROLES.filter((r) => r !== 'OWNER');

  return (
    <>
      <div className="tm-section__head">
        <p className="tm-muted">
          {team.memberLimit == null
            ? t('teams.members.countUnlimited', { count: team.memberCount })
            : t('teams.members.countLimit', { count: team.memberCount, limit: team.memberLimit })}
        </p>
      </div>

      {manager && (
        <section className="tm-section" style={{ marginTop: 0 }} aria-labelledby="tm-invite-title">
          <h2 id="tm-invite-title" className="sc-label">
            {t('teams.members.inviteTitle')}
          </h2>
          <form className="tm-invite" onSubmit={(e) => invite(e, false)}>
            <input
              type="email"
              className="sc-input"
              placeholder={t('teams.members.emailPlaceholder')}
              aria-label={t('teams.members.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!team.planActive}
            />
            <select
              className="tm-select"
              aria-label={t('teams.members.role')}
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`teams.roles.${r}`)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="sc-btn sc-btn--primary"
              disabled={inviting || !email.trim() || !team.planActive}
            >
              {t('teams.members.sendInvite')}
            </button>
            <button
              type="button"
              className="sc-btn"
              disabled={inviting || !team.planActive}
              onClick={() => invite(null, true)}
            >
              {t('teams.members.createLink')}
            </button>
          </form>
          <p className="tm-muted">{t('teams.members.roleHint')}</p>
          {link && (
            <div className="tm-note">
              <strong>{t('teams.members.linkTitle')}</strong>
              <p className="tm-muted" style={{ margin: '0.25rem 0 0' }}>
                {t('teams.members.linkHint')}
              </p>
              <div className="tm-link">
                <input className="sc-input" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button type="button" className="sc-btn" onClick={copyLink}>
                  {t('teams.members.copy')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!members && <Skeleton lines={3} />}
      {members && (
        <ul className="tm-list">
          {members.map((m) => (
            <li key={m.memberId} className="tm-row">
              <MemberAvatar member={m} />
              <div className="tm-row__main">
                <span className="tm-row__title">
                  {memberName(m)}
                  {m.memberId === meId && ` (${t('teams.members.you')})`}
                </span>
                <span className="tm-row__sub">{m.email}</span>
              </div>
              <div className="tm-row__actions">
                {editable(m) ? (
                  <select
                    className="tm-select"
                    aria-label={t('teams.members.roleOf', { name: memberName(m) })}
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {t(`teams.roles.${r}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {editable(m) && (
                  <button type="button" className="sc-btn sc-btn--sm sc-btn--danger" onClick={() => remove(m)}>
                    {t('teams.members.remove')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {manager && invitations.length > 0 && (
        <section className="tm-section" aria-labelledby="tm-pending-title">
          <div className="tm-section__head">
            <h2 id="tm-pending-title">{t('teams.members.pendingTitle')}</h2>
          </div>
          <ul className="tm-list">
            {invitations.map((i) => (
              <li key={i.id} className="tm-row">
                <div className="tm-row__main">
                  <span className="tm-row__title">{i.email ?? t('teams.members.linkInvite')}</span>
                  <span className="tm-row__sub">
                    {t('teams.members.pendingSub', {
                      role: t(`teams.roles.${i.role}`),
                      name: i.invitedByName ?? '',
                      date: formatDate(i.expiresAt),
                    })}
                  </span>
                </div>
                <div className="tm-row__actions">
                  <button type="button" className="sc-btn sc-btn--sm" onClick={() => revoke(i)}>
                    {t('teams.members.revoke')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Hoạt động

const PAGE_SIZE = 20;

function ActivityTab({ team }: { team: Team }) {
  const [items, setItems] = useState<TeamActivity[] | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .activities(team.id, { page, size: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems((prev) => (page === 0 ? res.data.result.content : [...(prev ?? []), ...res.data.result.content]));
        setTotalPages(res.data.result.totalPages);
      })
      .catch(() => !cancelled && toast.error(t('teams.activity.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [team.id, page]);

  if (!items) return <Skeleton lines={4} />;
  if (items.length === 0) return <p className="tm-muted">{t('teams.activity.empty')}</p>;
  return (
    <>
      <ul className="tm-activity">
        {items.map((a) => (
          <li key={a.id}>
            <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
              {formatRelativeTime(a.createdAt)}
            </time>
            <span>{activityText(a)}</span>
          </li>
        ))}
      </ul>
      {page + 1 < totalPages && (
        <div className="sc-modal__actions" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="sc-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
          >
            {t('teams.activity.more')}
          </button>
        </div>
      )}
    </>
  );
}
