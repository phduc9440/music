import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi } from '../../services';
import { AuthProvider, MemberStatus } from '../../types';
import type { AdminMemberDetail as MemberDetail } from '../../types';
import { roleLabel } from '../../utils/auth';
import './AdminDashboard.css';

const VISIBILITY_LABEL: Record<string, string> = { PRIVATE: 'Riêng tư', PENDING: 'Chờ duyệt', PUBLIC: 'Công khai' };
const PROVIDER_LABEL = (p?: AuthProvider) => (p === AuthProvider.GOOGLE ? 'Google' : 'Email / mật khẩu');

const nf = new Intl.NumberFormat('vi-VN');
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Admin: xem chi tiết một thành viên (hồ sơ, số liệu hoạt động, bản nhạc gần đây). Thao tác khóa/vai trò ở danh sách. */
export default function AdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const back = (
    <button className="btn" onClick={() => navigate('/admin/members')}>
      ‹ Danh sách thành viên
    </button>
  );

  if (notFound) {
    return (
      <>
        <div className="adm-page-head">
          <h1>Không tìm thấy thành viên</h1>
          {back}
        </div>
      </>
    );
  }

  const m = detail?.member;
  const locked = m?.status === MemberStatus.INACTIVE;
  const initial = (m?.fullName || m?.email || '?').trim().charAt(0).toUpperCase();

  const profile: [string, React.ReactNode][] = m
    ? [
        ['Email', m.email],
        ['Họ tên', m.fullName || '—'],
        ['Số điện thoại', m.phone || '—'],
        ['Địa chỉ', m.address || '—'],
        ['Đăng nhập bằng', PROVIDER_LABEL(m.authProvider)],
        ['Email đã xác thực', m.emailVerified ? 'Rồi' : 'Chưa'],
        ['Vai trò', <span className={`badge ${m.roles?.includes('ADMIN') ? 'badge-admin' : 'badge-user'}`}>{roleLabel(m)}</span>],
        ['Trạng thái', locked ? 'Đã khóa' : 'Hoạt động'],
        ['Ngày đăng ký', m.createdAt ? formatDate(m.createdAt) : 'Chưa ghi nhận (tài khoản cũ)'],
        ['Đăng nhập gần nhất', m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Chưa ghi nhận'],
        ['Mã tài khoản', <code>{m.id}</code>],
      ]
    : [];

  return (
    <div className="dash">
      <div className="adm-page-head">
        <div className="d-flex gap-3 align-items-center">
          {m?.avatarUrl ? (
            <img src={m.avatarUrl} alt="" width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span className="adm-avatar" style={{ width: 48, height: 48, fontSize: '1.2rem' }}>
              {initial}
            </span>
          )}
          <div>
            <h1>{m?.fullName || m?.email || 'Thành viên'}</h1>
            <p>{m ? m.email : ''}</p>
          </div>
        </div>
        {back}
      </div>

      <div className="dash-kpis">
        <div className="dash-kpi">
          <div className="dash-kpi__label">Bản nhạc</div>
          <div className="dash-kpi__value">{detail ? nf.format(detail.scoreCount) : '—'}</div>
          <div className="dash-kpi__detail">
            {detail ? `${detail.publicScores} công khai · ${detail.pendingScores} chờ duyệt` : ''}
          </div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi__label">Playlist</div>
          <div className="dash-kpi__value">{detail ? nf.format(detail.playlistCount) : '—'}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi__label">Nhận xét đã viết</div>
          <div className="dash-kpi__value">{detail ? nf.format(detail.reviewCount) : '—'}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi__label">Luyện tập</div>
          <div className="dash-kpi__value">{detail ? nf.format(detail.practiceSessions) : '—'}</div>
          <div className="dash-kpi__detail">{detail ? `${nf.format(detail.practiceMinutes)} phút tổng cộng` : 'phiên'}</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="adm-card">
          <div className="dash-card__head">
            <div className="dash-card__title">Thông tin tài khoản</div>
          </div>
          <table className="dash-table">
            <tbody>
              {profile.map(([label, value]) => (
                <tr key={label}>
                  <td style={{ width: '40%', color: 'var(--text-secondary)' }}>{label}</td>
                  <td style={{ textAlign: 'left', wordBreak: 'break-all' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="adm-card">
          <div className="dash-card__head">
            <div>
              <div className="dash-card__title">Bản nhạc gần đây</div>
              <div className="dash-card__sub">10 bản cập nhật gần nhất</div>
            </div>
          </div>
          {detail && detail.recentScores.length === 0 ? (
            <div className="dash-empty">Chưa có bản nhạc nào</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Tên bản nhạc</th>
                    <th>Quyền riêng tư</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {detail?.recentScores.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                        {s.isOfficial && <span className="dash-card__sub"> · Kho mẫu</span>}
                      </td>
                      <td style={{ textAlign: 'left' }}>{VISIBILITY_LABEL[s.visibility] ?? s.visibility}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
