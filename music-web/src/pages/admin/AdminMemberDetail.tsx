import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

const nf = new Intl.NumberFormat('vi-VN');

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
        else toast.error('Không tải được thông tin thành viên');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = { label: 'Danh sách thành viên', to: '/admin/members' };

  if (notFound) {
    return (
      <>
        <PageHeader title="Không tìm thấy thành viên" back={back} />
        <Card>
          <EmptyState
            icon="users"
            title="Tài khoản không tồn tại"
            description="Có thể tài khoản đã bị xóa hoặc đường dẫn sai."
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
            {m?.fullName || m?.email || 'Thành viên'}
          </span>
        }
        description={
          m && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              {m.email}
              <Badge tone={isSuperAdminMember(m) ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral'}>
                {roleLabel(m)}
              </Badge>
              <Badge tone={locked ? 'danger' : 'success'}>{locked ? 'Đã khóa' : 'Hoạt động'}</Badge>
            </span>
          )
        }
      />

      <StatGrid>
        <StatCard
          label="Bản nhạc"
          icon="music"
          tone="primary"
          value={detail ? nf.format(detail.scoreCount) : '—'}
          hint={detail ? `${detail.publicScores} công khai · ${detail.pendingScores} chờ duyệt` : undefined}
        />
        <StatCard
          label="Playlist"
          icon="library"
          tone="violet"
          value={detail ? nf.format(detail.playlistCount) : '—'}
        />
        <StatCard
          label="Nhận xét đã viết"
          icon="star"
          tone="warning"
          value={detail ? nf.format(detail.reviewCount) : '—'}
        />
        <StatCard
          label="Luyện tập"
          icon="activity"
          tone="success"
          value={detail ? nf.format(detail.practiceSessions) : '—'}
          hint={detail ? `${nf.format(detail.practiceMinutes)} phút tổng cộng` : undefined}
        />
      </StatGrid>

      <div className="adm-grid-2">
        <Card title="Thông tin tài khoản">
          {m ? (
            <DescriptionList
              items={[
                ['Họ tên', m.fullName || '—'],
                ['Số điện thoại', m.phone || '—'],
                ['Địa chỉ', m.address || '—'],
                ['Đăng nhập bằng', m.authProvider === AuthProvider.GOOGLE ? 'Google' : 'Email / mật khẩu'],
                ['Email đã xác thực', m.emailVerified ? 'Rồi' : 'Chưa'],
                ['Ngày đăng ký', m.createdAt ? formatDateTime(m.createdAt) : 'Chưa ghi nhận (tài khoản cũ)'],
                ['Đăng nhập gần nhất', m.lastLoginAt ? formatDateTime(m.lastLoginAt) : 'Chưa ghi nhận'],
                ['Mã tài khoản', <span className="adm-code">{m.id}</span>],
              ]}
            />
          ) : (
            <EmptyState icon="users" title="Đang tải…" />
          )}
        </Card>

        <Card title="Bản nhạc gần đây" description="10 bản cập nhật gần nhất" flush>
          <Table>
            <thead>
              <tr>
                <th>Tên bản nhạc</th>
                <th>Quyền riêng tư</th>
                <th>Cập nhật</th>
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
                        <Badge tone="violet">Kho mẫu</Badge>
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
                <TableState colSpan={3} icon="music" title="Chưa có bản nhạc nào" />
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
