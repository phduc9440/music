import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { toast } from 'react-toastify';
import {
  Avatar,
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  TableState,
  VisibilityBadge,
} from '../../components/ui';
import { formatDateTime } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import { AuthProvider, MemberStatus } from '../../types';
import type { AdminMemberDetail as MemberDetail } from '../../types';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import { t } from '../../i18n/core';
import { formatNumber } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import MemberPlanCard from '../../components/admin/MemberPlanCard';

const nf = { format: (n: number) => formatNumber(n) };

/** Admin: xem chi tiết một thành viên (hồ sơ, số liệu hoạt động, bản nhạc gần đây). Thao tác khóa/vai trò ở danh sách. */
export default function AdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getMemberDetail(id)
      .then((res) => !cancelled && setDetail(res.data.result))
      .catch((error) => {
        if (cancelled) return;
        if ((error as { response?: { status?: number } }).response?.status === 404) setNotFound(true);
        else toast.error(t('admin.members.detailFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = { label: t('admin.members.backToList'), to: '/admin/members' };

  if (notFound) {
    return (
      <>
        <PageHeader title={t('admin.members.notFound')} back={back} />
        <Card>
          <EmptyState
            icon="users"
            title={t('admin.members.noAccount')}
            description={t('admin.members.noAccountHint')}
          />
        </Card>
      </>
    );
  }

  const m = detail?.member;
  const locked = m?.status === MemberStatus.INACTIVE;

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
            <Avatar name={m?.fullName || m?.email} src={m?.avatarUrl} size={44} />
            {m?.fullName || m?.email || t('admin.menu.items.members')}
          </span>
        }
        description={
          m && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              {m.email}
              <Badge tone={isSuperAdminMember(m) ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral'}>
                {roleLabel(m)}
              </Badge>
              <Badge tone={locked ? 'danger' : 'success'}>
                {locked ? t('admin.announcements.locked') : t('admin.members.active')}
              </Badge>
            </span>
          )
        }
      />

      <StatGrid>
        <StatCard
          label={t('upload.review.tabs.score')}
          icon="music"
          tone="primary"
          value={detail ? nf.format(detail.scoreCount) : '—'}
          hint={
            detail
              ? t('admin.members.scoreHint', { public: detail.publicScores, pending: detail.pendingScores })
              : undefined
          }
        />
        <StatCard
          label={t('common.nav.items.playlists')}
          icon="library"
          tone="violet"
          value={detail ? nf.format(detail.playlistCount) : '—'}
        />
        <StatCard
          label={t('admin.members.reviewsWritten')}
          icon="star"
          tone="warning"
          value={detail ? nf.format(detail.reviewCount) : '—'}
        />
        <StatCard
          label={t('common.nav.items.practice')}
          icon="activity"
          tone="success"
          value={detail ? nf.format(detail.practiceSessions) : '—'}
          hint={detail ? t('admin.members.totalMinutes', { value: nf.format(detail.practiceMinutes) }) : undefined}
        />
      </StatGrid>

      {id && <MemberPlanCard memberId={id} />}

      <div className="adm-grid-2">
        <Card title={t('admin.members.accountInfo')}>
          {m ? (
            <DescriptionList
              items={[
                [t('auth.fullName'), m.fullName || '—'],
                [t('profile.phone'), m.phone || '—'],
                [t('profile.address'), m.address || '—'],
                [
                  t('profile.signInWith'),
                  m.authProvider === AuthProvider.GOOGLE ? 'Google' : t('profile.emailPassword'),
                ],
                [t('admin.members.emailVerified'), m.emailVerified ? t('common.yes') : t('common.no')],
                [
                  t('admin.members.registered'),
                  m.createdAt ? formatDateTime(m.createdAt) : t('admin.members.notRecordedOld'),
                ],
                [
                  t('admin.members.lastLoginRecent'),
                  m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t('admin.members.notRecorded'),
                ],
                [t('admin.members.accountId'), <span className="adm-code">{m.id}</span>],
              ]}
            />
          ) : (
            <Skeleton lines={6} />
          )}
        </Card>

        <Card title={t('admin.members.recentScores')} description={t('admin.members.recentHint')} flush>
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
              {detail?.recentScores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                    {s.isOfficial && (
                      <>
                        {' '}
                        <Badge tone="violet">{t('admin.members.curated')}</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    <VisibilityBadge value={s.visibility} />
                  </td>
                  <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                </tr>
              ))}
              {detail && detail.recentScores.length === 0 && (
                <TableState colSpan={3} icon="music" title={t('admin.members.noScores')} />
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
