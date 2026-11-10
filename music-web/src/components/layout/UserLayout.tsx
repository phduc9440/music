import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ChangePasswordModal from '../ChangePasswordModal';
import NotificationBell from '../NotificationBell';
import { Avatar, Icon } from '../ui';
import type { IconName } from '../ui';
import { authApi, userApi } from '../../services';
import { AuthProvider } from '../../types';
import type { Member } from '../../types';
import { isAdminMember, roleLabel } from '../../utils/auth';
import './user-layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Mục đang mở khi đường dẫn khớp (mặc định: bằng hoặc bắt đầu bằng `to/`). */
  match?: (pathname: string) => boolean;
}

/** Thư viện bao gồm cả chi tiết, tải lên, nhập file... nhưng không gồm kho mẫu và mục được chia sẻ. */
const isLibrary = (p: string) => p === '/scores' || (p.startsWith('/scores/') && !/^\/scores\/(official|shared)(\/|$)/.test(p));

const NAV: NavItem[] = [
  { to: '/scores', label: 'Thư viện', icon: 'music', match: isLibrary },
  { to: '/scores/official', label: 'Kho score mẫu', icon: 'library' },
  { to: '/scores/shared', label: 'Được chia sẻ', icon: 'share' },
  { to: '/playlists', label: 'Playlist', icon: 'list' },
  { to: '/practice-history', label: 'Luyện tập', icon: 'clock' },
  { to: '/practice-stats', label: 'Thống kê', icon: 'chart' },
];

const isActive = (item: NavItem, pathname: string) =>
  item.match ? item.match(pathname) : pathname === item.to || pathname.startsWith(`${item.to}/`);

/** Khung chung của các trang người dùng: thanh trên (logo, điều hướng chính, chuông, tài khoản) và vùng nội dung. */
export default function UserLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [me, setMe] = useState<Member | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // menu điều hướng trên màn hình nhỏ
  const [passwordOpen, setPasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setMe(res.data.result))
      .catch(() => undefined);
  }, []);

  // Đóng menu tài khoản khi bấm ra ngoài
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const logout = () => {
    authApi.logout().catch(() => undefined);
    localStorage.removeItem('role');
    navigate('/');
  };

  const go = (to: string) => {
    setMenuOpen(false);
    setNavOpen(false);
    navigate(to);
  };

  const displayName = me?.fullName || me?.email || 'Tài khoản';
  // localStorage chỉ dùng cho giao diện; quyền thật do backend kiểm tra
  const isAdmin = me ? isAdminMember(me) : localStorage.getItem('role') === 'ADMIN';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <button
            type="button"
            className="app-iconbtn app-header__burger"
            aria-label="Mở menu điều hướng"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name={navOpen ? 'x' : 'menu'} />
          </button>

          <Link to="/scores" className="app-brand">
            <span className="app-brand__logo">
              <Icon name="music" size={16} />
            </span>
            Music App
          </Link>

          <nav className={`app-nav${navOpen ? ' app-nav--open' : ''}`} aria-label="Điều hướng chính">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={() => `app-nav__item${isActive(item, pathname) ? ' app-nav__item--active' : ''}`}
                aria-current={isActive(item, pathname) ? 'page' : undefined}
                onClick={() => setNavOpen(false)}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-header__right">
            <NotificationBell />
            <div className="app-usermenu" ref={menuRef}>
              <button
                type="button"
                className="app-usermenu__trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Tài khoản: ${displayName}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Avatar name={displayName} src={me?.avatarUrl} size={30} />
                <Icon name="chevronDown" size={14} />
              </button>
              {menuOpen && (
                <div className="app-usermenu__panel" role="menu">
                  <div className="app-usermenu__who">
                    <strong>{displayName}</strong>
                    {me && (
                      <span>
                        {me.email} · {roleLabel(me)}
                      </span>
                    )}
                  </div>
                  <button type="button" role="menuitem" className="app-usermenu__item" onClick={() => go('/profile')}>
                    <Icon name="user" size={16} />
                    Hồ sơ của tôi
                  </button>
                  {isAdmin && (
                    <button type="button" role="menuitem" className="app-usermenu__item" onClick={() => go('/admin')}>
                      <Icon name="shield" size={16} />
                      Trang quản trị
                    </button>
                  )}
                  {me?.authProvider !== AuthProvider.GOOGLE && (
                    <button
                      type="button"
                      role="menuitem"
                      className="app-usermenu__item"
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
                    className="app-usermenu__item app-usermenu__item--danger"
                    onClick={logout}
                  >
                    <Icon name="logout" size={16} />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {navOpen && <div className="app-backdrop" onClick={() => setNavOpen(false)} />}

      <main className="app-main">
        <Outlet />
      </main>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
