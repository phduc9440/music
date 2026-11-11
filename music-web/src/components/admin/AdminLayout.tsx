import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NavLink } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import ChangePasswordModal from '../ChangePasswordModal';
import NotificationBell from '../NotificationBell';
import ThemeToggle from '../../theme/ThemeToggle';
import { adoptServerLocale, t } from '../../i18n/core';
import LanguageToggle from '../../i18n/LanguageToggle';
import { adoptServerTheme } from '../../theme/theme';
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

/** Mục menu: nhãn là getter nên luôn lấy theo ngôn ngữ đang dùng (chuỗi ở locales, nhóm admin.menu). */
const item = (to: string, key: string, icon: IconName, extra: Partial<MenuItem> = {}): MenuItem => ({
  to,
  icon,
  ...extra,
  get label() {
    return t(`admin.menu.items.${key}`);
  },
});

const section = (key: string, items: MenuItem[]) => ({
  items,
  get section() {
    return t(`admin.menu.sections.${key}`);
  },
});

const MENU: { section: string; items: MenuItem[] }[] = [
  section('overview', [item('/admin', 'dashboard', 'dashboard', { end: true })]),
  section('users', [
    item('/admin/members', 'members', 'users'),
    item('/admin/announcements', 'announcements', 'megaphone'),
  ]),
  section('content', [
    item('/admin/scores', 'scores', 'music'),
    item('/admin/pending-scores', 'pending', 'clock', { pendingBadge: true }),
    item('/admin/official-scores', 'official', 'library'),
    item('/admin/tags', 'tags', 'tag'),
    item('/admin/composers', 'composers', 'users'),
  ]),
  section('billing', [
    item('/admin/revenue', 'revenue', 'chart'),
    item('/admin/plans', 'plans', 'star'),
    item('/admin/plan-grants', 'planGrants', 'users'),
  ]),
  section('system', [item('/admin/ai-tasks', 'aiTasks', 'cpu'), item('/admin/system', 'system', 'activity')]),
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
      .then((res) => {
        setAdmin(res.data.result);
        adoptServerTheme(res.data.result.uiTheme); // giao diện đã chọn đi theo tài khoản giữa các máy
        adoptServerLocale(res.data.result.locale); // ngôn ngữ cũng đi theo tài khoản
      })
      .catch(() => toast.error(t('admin.layout.profileFailed')));
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
      <header className="adm-header ui-stage">
        <div className="adm-header__left">
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--md adm-btn--icon"
            aria-label={t('admin.layout.toggleSidebar')}
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
          <LanguageToggle />
          <ThemeToggle />
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
                <button type="button" role="menuitem" className="adm-usermenu__item" onClick={() => navigate('/')}>
                  <Icon name="home" size={16} />
                  {t('admin.menu.userSite')}
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
                    {t('common.header.changePassword')}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="adm-usermenu__item adm-usermenu__item--danger"
                  onClick={handleLogout}
                >
                  <Icon name="logout" size={16} />
                  {t('common.header.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="adm-body">
        <aside className={`adm-sidebar ui-stage${mobileOpen ? ' adm-sidebar--open' : ''}`}>
          <nav className="adm-menu" aria-label={t('admin.layout.menuLabel')}>
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
                      <span
                        className="adm-menu__count"
                        aria-label={t('admin.layout.pendingBadge', { count: pendingCount })}
                      >
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <button type="button" className="adm-menu__item" onClick={() => navigate('/')}>
            <span className="adm-menu__icon">
              <Icon name="home" />
            </span>
            <span className="adm-menu__label">{t('admin.menu.userSite')}</span>
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
