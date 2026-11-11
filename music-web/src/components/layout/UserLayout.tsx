import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import ChangePasswordModal from '../ChangePasswordModal';
import CommandPalette from './CommandPalette';
import MobileTabBar from './MobileTabBar';
import NavDropdown from './NavDropdown';
import SiteFooter from './SiteFooter';
import NotificationBell from '../NotificationBell';
import ThemeToggle from '../../theme/ThemeToggle';
import { adoptServerTheme } from '../../theme/theme';
import { adoptServerLocale } from '../../i18n/core';
import LanguageToggle from '../../i18n/LanguageToggle';
import { useI18n } from '../../i18n/useI18n';
import { Avatar, Icon } from '../ui';
import { authApi, userApi } from '../../services';
import { AuthProvider } from '../../types';
import type { Member } from '../../types';
import { isAdminMember, roleLabel } from '../../utils/auth';
import { CREATE_SCORE_PATH, NAV_GROUPS, navContextPath } from './nav';
import './user-layout.css';

/**
 * Khung chung của các trang người dùng: thanh trên (logo, nhóm điều hướng, tạo bản nhạc, tìm kiếm Ctrl/Cmd+K, giao diện,
 * chuông, tài khoản), thanh tab dưới cùng trên điện thoại và vùng nội dung.
 */
export default function UserLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  // Bản nhạc mở từ Khám phá, Kho bản nhạc mẫu... vẫn tô sáng mục đó thay vì nhảy về Thư viện
  const navPath = navContextPath(pathname, state);
  const [me, setMe] = useState<Member | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // menu điều hướng trên màn hình nhỏ
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    userApi
      .getMe()
      .then((res) => {
        setMe(res.data.result);
        adoptServerTheme(res.data.result.uiTheme); // giao diện đã chọn đi theo tài khoản giữa các máy
        adoptServerLocale(res.data.result.locale); // ngôn ngữ cũng đi theo tài khoản
      })
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

  // Ctrl/Cmd+K mở hoặc đóng hộp tìm toàn cục
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const displayName = me?.fullName || me?.email || t('common.header.account');
  // localStorage chỉ dùng cho giao diện; quyền thật do backend kiểm tra
  const isAdmin = me ? isAdminMember(me) : localStorage.getItem('role') === 'ADMIN';

  return (
    <div className="app-shell">
      <header className="app-header ui-stage">
        <div className="app-header__inner">
          <div className="app-header__left">
            <button
              type="button"
              className="app-iconbtn app-header__burger"
              aria-label={t('common.header.openMenu')}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <Icon name={navOpen ? 'x' : 'menu'} />
            </button>

            <Link to="/" className="app-brand">
              <span className="app-brand__logo">
                <Icon name="music" size={16} />
              </span>
              Music App
            </Link>

            <button
              type="button"
              className="app-search"
              aria-label={t('common.header.searchHint')}
              title={t('common.header.searchHint')}
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={16} />
              <span className="app-search__text">{t('common.header.search')}</span>
              <kbd className="app-search__kbd">Ctrl K</kbd>
            </button>
          </div>

          <nav className={`app-nav${navOpen ? ' app-nav--open' : ''}`} aria-label={t('common.header.mainNav')}>
            {NAV_GROUPS.map((group) => (
              <NavDropdown key={group.id} group={group} pathname={navPath} onNavigate={() => setNavOpen(false)} />
            ))}
          </nav>

          <div className="app-header__right">
            <Link to={CREATE_SCORE_PATH} className="app-create">
              <Icon name="plus" size={16} />
              <span>{t('common.header.create')}</span>
            </Link>
            <LanguageToggle />
            <ThemeToggle />
            <NotificationBell />
            <div className="app-usermenu" ref={menuRef}>
              <button
                type="button"
                className="app-usermenu__trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('common.header.accountOf', { name: displayName })}
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
                    {t('common.header.profile')}
                  </button>
                  {isAdmin && (
                    <button type="button" role="menuitem" className="app-usermenu__item" onClick={() => go('/admin')}>
                      <Icon name="shield" size={16} />
                      {t('common.header.admin')}
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
                      {t('common.header.changePassword')}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="app-usermenu__item app-usermenu__item--danger"
                    onClick={logout}
                  >
                    <Icon name="logout" size={16} />
                    {t('common.header.logout')}
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
      <SiteFooter variant="app" />

      <MobileTabBar activePath={navPath} />
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
