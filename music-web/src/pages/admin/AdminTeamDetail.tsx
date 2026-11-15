import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CellTitle,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  TableState,
  VisibilityBadge,
} from '../../components/ui';
import type { Tone } from '../../components/ui/helpers';
import { formatDate, formatDateTime } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import { adminTeamApi } from '../../services';
import type { AdminTeamDetail as TeamDetail, ShowStatus, TeamRole } from '../../types';
import { formatNumber, formatRelativeTime, t } from '../../i18n/core';
import { activityText, memberName } from '../teams/teamUtils';
import { deleteTeamAsAdmin, restoreTeamAsAdmin } from './adminTeamActions';

const ROLE_TONE: Record<TeamRole, Tone> = {
  OWNER: 'violet',
  MANAGER: 'primary',
  ARRANGER: 'success',
  VIEWER: 'neutral',
};
const SHOW_TONE: Record<ShowStatus, Tone> = { PREPARING: 'warning', DONE: 'success' };

/**
 * Admin: chi tiết một team (người tạo, gói, thành viên, show và tiến độ, bản nhạc, hoạt động gần đây) và xóa team vi phạm.
 * Bản nhạc chỉ hiện tên và trạng thái; chỉ bản công khai mới có liên kết mở (admin không được xem bản riêng tư của team).
 */
export default function AdminTeamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { prompt, confirm } = useDialog();
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminTeamApi
      .detail(id)
      .then((res) => !cancelled && setDetail(res.data.result))
      .catch((error) => {
        if (cancelled) return;
        if ((error as { response?: { status?: number } }).response?.status === 404) setNotFound(true);
        else toast.error(t('admin.teams.detail.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const back = { label: t('admin.teams.detail.backToList'), to: '/admin/teams' };

  if (notFound) {
    return (
      <>
        <PageHeader title={t('admin.teams.detail.notFound')} back={back} />
        <Card>
          <EmptyState
            icon="share"
            title={t('admin.teams.detail.notFound')}
            description={t('admin.teams.detail.notFoundHint')}
          />
        </Card>
      </>
    );
  }

  const team = detail?.team;

  const remove = async () => {
    if (!team) return;
    setDeleting(true);
    const ok = await deleteTeamAsAdmin(team, prompt);
    setDeleting(false);
    if (ok) navigate('/admin/teams');
  };

  const restore = async () => {
    if (!team) return;
    setDeleting(true);
    const ok = await restoreTeamAsAdmin(team, confirm);
    setDeleting(false);
    if (ok) setReload((n) => n + 1);
  };

  return (
    <>
      <PageHeader
        back={back}
        title={team?.name ?? t('admin.menu.items.teams')}
        description={
          team && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              {t('admin.teams.detail.createdBy')}{' '}
              <Link to={`/admin/members/${team.creatorId}`}>{team.creatorName}</Link>
              {' · '}
              {t('admin.teams.createdOn', { date: formatDate(team.createdAt) })}
              <Badge tone={team.planActive ? 'success' : 'warning'}>
                {team.planActive ? t('admin.teams.planActive') : t('admin.teams.planInactive')}
              </Badge>
            </span>
          )
        }
        actions={
          team?.deletedAt ? (
            <Button icon="refresh" disabled={!team.restorable} loading={deleting} onClick={restore}>
              {t('admin.teams.restore')}
            </Button>
          ) : (
            <Button variant="danger" icon="trash" disabled={!team} loading={deleting} onClick={remove}>
              {t('admin.teams.delete')}
            </Button>
          )
        }
      />

      {team?.deletedAt && (
        <Card>
          <p style={{ margin: 0 }}>
            {team.restorable
              ? t('admin.teams.deletedBanner', { date: formatDate(team.restorableUntil) })
              : t('admin.teams.deletedBannerExpired')}{' '}
            {team.deletedByAdmin ? t('admin.teams.deletedByAdmin') : t('admin.teams.deletedByOwner')}
            {team.deletedReason ? ` · ${t('admin.teams.deletedReasonLabel', { reason: team.deletedReason })}` : ''}
          </p>
        </Card>
      )}

      {team?.description && (
        <Card>
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{team.description}</p>
        </Card>
      )}

      <StatGrid>
        <StatCard
          label={t('admin.teams.members')}
          icon="users"
          tone="primary"
          value={team ? formatNumber(team.memberCount) : '—'}
          hint={
            team
              ? team.memberLimit != null
                ? t('admin.teams.detail.memberLimit', { limit: team.memberLimit })
                : t('admin.teams.detail.noMemberLimit')
              : undefined
          }
        />
        <StatCard
          label={t('admin.teams.scores')}
          icon="music"
          tone="violet"
          value={team ? formatNumber(team.scoreCount) : '—'}
        />
        <StatCard
          label={t('admin.teams.shows')}
          icon="list"
          tone="success"
          value={team ? formatNumber(team.showCount) : '—'}
          hint={team ? t('admin.teams.detail.preparing', { count: team.preparingShows }) : undefined}
        />
        <StatCard
          label={t('admin.teams.lastActivity')}
          icon="activity"
          tone="neutral"
          value={
            team ? (team.lastActivityAt ? formatRelativeTime(team.lastActivityAt) : t('admin.teams.noActivity')) : '—'
          }
          hint={team?.lastActivityAt ? formatDateTime(team.lastActivityAt) : undefined}
        />
      </StatGrid>

      <div className="adm-grid-2">
        <Card title={t('admin.teams.detail.membersTitle')} flush>
          <Table>
            <thead>
              <tr>
                <th>{t('admin.teams.detail.member')}</th>
                <th>{t('admin.teams.detail.role')}</th>
                <th>{t('admin.teams.detail.joined')}</th>
              </tr>
            </thead>
            <tbody>
              {!detail && <TableState colSpan={3} loading />}
              {detail?.members.map((m) => (
                <tr key={m.memberId}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Avatar name={memberName(m)} src={m.avatarUrl} size={28} />
                      <CellTitle sub={m.fullName?.trim() ? m.email : undefined}>
                        <Link to={`/admin/members/${m.memberId}`}>{memberName(m)}</Link>
                      </CellTitle>
                    </span>
                  </td>
                  <td>
                    <Badge tone={ROLE_TONE[m.role]}>{t(`teams.roles.${m.role}`)}</Badge>
                  </td>
                  <td className="adm-nowrap adm-muted">{formatDate(m.joinedAt)}</td>
                </tr>
              ))}
              {detail && detail.members.length === 0 && (
                <TableState colSpan={3} icon="users" title={t('admin.teams.detail.noMembers')} />
              )}
            </tbody>
          </Table>
        </Card>

        <Card title={t('admin.teams.detail.showsTitle')} flush>
          <Table>
            <thead>
              <tr>
                <th>{t('admin.teams.detail.show')}</th>
                <th>{t('admin.teams.detail.status')}</th>
                <th className="adm-table__num">{t('admin.teams.detail.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {!detail && <TableState colSpan={3} loading />}
              {detail?.shows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <CellTitle
                      sub={
                        [s.showDate ? formatDate(`${s.showDate}T00:00:00`) : null, s.venue]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                    >
                      {s.name}
                    </CellTitle>
                  </td>
                  <td>
                    <Badge tone={SHOW_TONE[s.status]}>{t(`teams.showStatus.${s.status}`)}</Badge>
                  </td>
                  <td className="adm-table__num adm-nowrap">
                    {t('admin.teams.detail.progressCell', { approved: s.approvedCount, total: s.itemCount })}
                  </td>
                </tr>
              ))}
              {detail && detail.shows.length === 0 && (
                <TableState colSpan={3} icon="list" title={t('admin.teams.detail.noShows')} />
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="adm-grid-2">
        <Card title={t('admin.teams.detail.scoresTitle')} description={t('admin.teams.detail.scoresHint')} flush>
          <Table>
            <thead>
              <tr>
                <th>{t('admin.members.scoreTitle')}</th>
                <th>{t('admin.members.privacy')}</th>
                <th>{t('admin.members.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {!detail && <TableState colSpan={3} loading />}
              {detail?.scores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <CellTitle sub={s.ownerName ?? undefined}>
                      {s.visibility === 'PUBLIC' ? <Link to={`/admin/scores/${s.id}`}>{s.title}</Link> : s.title}
                    </CellTitle>
                  </td>
                  <td>{s.visibility && <VisibilityBadge value={s.visibility} />}</td>
                  <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                </tr>
              ))}
              {detail && detail.scores.length === 0 && (
                <TableState colSpan={3} icon="music" title={t('admin.members.noScores')} />
              )}
            </tbody>
          </Table>
        </Card>

        <Card title={t('admin.teams.detail.activityTitle')} description={t('admin.teams.detail.activityHint')} flush>
          <Table>
            <tbody>
              {!detail && <TableState colSpan={2} loading />}
              {detail?.recentActivities.map((a) => (
                <tr key={a.id}>
                  <td>{activityText(a)}</td>
                  <td className="adm-nowrap adm-muted" title={formatDateTime(a.createdAt)}>
                    {formatRelativeTime(a.createdAt)}
                  </td>
                </tr>
              ))}
              {detail && detail.recentActivities.length === 0 && (
                <TableState colSpan={2} icon="activity" title={t('admin.teams.noActivity')} />
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
