import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ChangePasswordModal from '../ChangePasswordModal';
import NotificationBell from '../NotificationBell';
import { authApi, scoreApi, userApi } from '../../services';
import { AuthProvider } from '../../types';
import type { Member } from '../../types';
import { roleLabel } from '../../utils/auth';
import { Avatar, Icon } from '../ui';
import type { IconName } from '../ui';
import './admin.css';

export interface AdminOutletContext {
  admin: Member | null;
}

interface MenuItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Hiện số bản chờ duyệt cạnh mục này. */
  pendingBadge?: boolean;
}

const MENU: { section: string; items: MenuItem[] }[] = [
  { section: 'Tổng quan', items: [{ to: '/admin', label: 'Bảng điều khiển', icon: 'dashboard', end: true }] },
  {
    section: 'Người dùng',
    items: [
      { to: '/admin/members', label: 'Thành viên', icon: 'users' },
      { to: '/admin/announcements', label: 'Gửi thông báo', icon: 'megaphone' },
    ],
  },
  {
    section: 'Nội dung',
    items: [
      { to: '/admin/scores', label: 'Quản lý bản nhạc', icon: 'music' },
      { to: '/admin/pending-scores', label: 'Chờ duyệt công khai', icon: 'clock', pendingBadge: true },
      { to: '/admin/official-scores', label: 'Kho score mẫu', icon: 'library' },
      { to: '/admin/tags', label: 'Thể loại', icon: 'tag' },
    ],
  },
  { section: 'Hệ thống', items: [{ to: '/admin/system', label: 'Giám sát hệ thống', icon: 'activity' }] },
];

const ALL_ITEMS = MENU.flatMap((g) => g.items);

/** Tên trang đang mở (mục menu khớp dài nhất) để hiện trên header. */
const currentTitle = (pathname: string) =>
  [...ALL_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((it) => (it.end ? pathname === it.to : pathname === it.to || pathname.startsWith(`${it.to}/`)))?.label ?? '';

/** Khung trang quản trị: header trên cùng, sidebar bên trái (chia nhóm), vùng nội dung ở giữa. */
export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [admin, setAdmin] = useState<Member | null>(null);
  const [collapsed, setCollapsed] = useState(false); // thu gọn sidebar trên màn hình lớn
  const [mobileOpen, setMobileOpen] = useState(false); // mở sidebar dạng ngăn kéo trên màn hình nhỏ
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setAdmin(res.data.result))
      .catch(() => toast.error('Không tải được hồ sơ quản trị viên'));
  }, []);

  // Số bản chờ duyệt: tải lại mỗi khi chuyển trang (duyệt xong quay lại là thấy số mới)
  useEffect(() => {
    let cancelled = false;
    scoreApi
      .pendingPublic({ page: 0, size: 1 })
      .then((res) => !cancelled && setPendingCount(res.data.result.totalElements))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Đóng menu tài khoản khi bấm ra ngoài
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleLogout = () => {
    authApi.logout().catch(() => undefined);
    localStorage.removeItem('role');
    navigate('/');
  };

  const displayName = admin?.fullName || admin?.email || 'Admin';
  const title = currentTitle(pathname);

  return (
    <div className={`adm-shell${collapsed ? ' adm-shell--collapsed' : ''}`}>
      <header className="adm-header">
        <div className="adm-header__left">
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--md adm-btn--icon"
            aria-label="Đóng/mở thanh bên"
            onClick={() => (window.innerWidth <= 900 ? setMobileOpen((v) => !v) : setCollapsed((v) => !v))}
          >
            <Icon name="menu" />
          </button>
          <span className="adm-brand">
            <span className="adm-brand__logo">
              <Icon name="music" size={16} />
            </span>
            <span className="adm-brand__text">Music App</span>
            <span className="adm-brand__tag">Admin</span>
          </span>
          {title && (
            <span className="adm-header__crumb">
              / <strong>{title}</strong>
            </span>
          )}
        </div>

        <div className="adm-header__right">
          <NotificationBell />
          <div className="adm-usermenu" ref={menuRef}>
            <button
              type="button"
              className="adm-usermenu__trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Avatar name={displayName} src={admin?.avatarUrl} size={30} />
              <span className="adm-usermenu__name">
                <strong>{displayName}</strong>
                <span>{admin ? roleLabel(admin) : ''}</span>
              </span>
              <Icon name="chevronDown" size={16} />
            </button>
            {menuOpen && (
              <div className="adm-usermenu__panel" role="menu">
                {admin?.email && <div className="adm-usermenu__email">{admin.email}</div>}
                <button type="button" role="menuitem" className="adm-usermenu__item" onClick={() => navigate('/scores')}>
                  <Icon name="home" size={16} />
                  Giao diện người dùng
                </button>
                {admin?.authProvider !== AuthProvider.GOOGLE && (
                  <button
                    type="button"
                    role="menuitem"
                    className="adm-usermenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      setPasswordOpen(true);
                    }}
                  >
                    <Icon name="key" size={16} />
                    Đổi mật khẩu
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="adm-usermenu__item adm-usermenu__item--danger"
                  onClick={handleLogout}
                >
                  <Icon name="logout" size={16} />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="adm-body">
        <aside className={`adm-sidebar${mobileOpen ? ' adm-sidebar--open' : ''}`}>
          <nav className="adm-menu" aria-label="Menu quản trị">
            {MENU.map((group) => (
              <div key={group.section} className="adm-menu">
                <div className="adm-menu__section">{group.section}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => `adm-menu__item${isActive ? ' adm-menu__item--active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="adm-menu__icon">
                      <Icon name={item.icon} />
                    </span>
                    <span className="adm-menu__label">{item.label}</span>
                    {item.pendingBadge && pendingCount > 0 && (
                      <span className="adm-menu__count" aria-label={`${pendingCount} bản đang chờ`}>
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <button type="button" className="adm-menu__item" onClick={() => navigate('/scores')}>
            <span className="adm-menu__icon">
              <Icon name="home" />
            </span>
            <span className="adm-menu__label">Giao diện người dùng</span>
          </button>
        </aside>
        {mobileOpen && <div className="adm-backdrop" onClick={() => setMobileOpen(false)} />}

        <main className="adm-main">
          <div className="adm-main__inner">
            <Outlet context={{ admin } satisfies AdminOutletContext} />
          </div>
        </main>
      </div>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
