import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ChangePasswordModal from '../ChangePasswordModal';
import NotificationBell from '../NotificationBell';
import { authApi, userApi } from '../../services';
import { AuthProvider } from '../../types';
import type { Member } from '../../types';
import './admin.css';

export interface AdminOutletContext {
  admin: Member | null;
}

const MENU = [
  { to: '/admin', label: 'Thành viên', icon: '👥', end: true },
  { to: '/admin/pending-scores', label: 'Bản nhạc chờ duyệt', icon: '🎼', end: false },
  { to: '/admin/official-scores', label: 'Kho score mẫu', icon: '📚', end: false },
];

/** Khung trang quản trị: header trên cùng, sidebar bên trái, vùng nội dung (main) ở giữa. */
export default function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<Member | null>(null);
  const [collapsed, setCollapsed] = useState(false); // thu gọn sidebar trên màn hình lớn
  const [mobileOpen, setMobileOpen] = useState(false); // mở sidebar dạng ngăn kéo trên màn hình nhỏ
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setAdmin(res.data.result))
      .catch(() => toast.error('Không tải được hồ sơ quản trị viên'));
  }, []);

  const handleLogout = () => {
    authApi.logout().catch(() => undefined);
    localStorage.removeItem('role');
    navigate('/');
  };

  const initial = (admin?.fullName || admin?.email || 'A').trim().charAt(0).toUpperCase();

  return (
    <div className={`adm-shell${collapsed ? ' adm-shell--collapsed' : ''}`}>
      <header className="adm-header">
        <div className="adm-header__left">
          <button
            className="adm-icon-btn"
            aria-label="Đóng/mở thanh bên"
            onClick={() => (window.innerWidth <= 900 ? setMobileOpen((v) => !v) : setCollapsed((v) => !v))}
          >
            ☰
          </button>
          <span className="adm-brand">Admin Panel</span>
        </div>
        <div className="adm-header__right">
          <NotificationBell />
          <div className="adm-user">
            <span className="adm-avatar">{initial}</span>
            <span className="adm-user__name">{admin?.fullName || 'Admin'}</span>
          </div>
          {admin?.authProvider !== AuthProvider.GOOGLE && (
            <button className="adm-btn" onClick={() => setPasswordOpen(true)}>
              Đổi mật khẩu
            </button>
          )}
          <button className="adm-btn adm-btn--danger" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="adm-body">
        <aside className={`adm-sidebar${mobileOpen ? ' adm-sidebar--open' : ''}`}>
          <nav className="adm-menu">
            {MENU.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `adm-menu__item${isActive ? ' adm-menu__item--active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="adm-menu__icon">{item.icon}</span>
                <span className="adm-menu__label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="adm-sidebar__footer">
            <button className="adm-menu__item" onClick={() => navigate('/scores')}>
              <span className="adm-menu__icon">↩</span>
              <span className="adm-menu__label">Giao diện người dùng</span>
            </button>
          </div>
        </aside>
        {mobileOpen && <div className="adm-backdrop" onClick={() => setMobileOpen(false)} />}

        <main className="adm-main">
          <Outlet context={{ admin } satisfies AdminOutletContext} />
        </main>
      </div>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
