import { Outlet, useLocation } from 'react-router-dom';
import { Link, NavLink } from '../../routes/transition-nav';
import LanguageToggle from '../../i18n/LanguageToggle';
import ThemeToggle from '../../theme/ThemeToggle';
import { t } from '../../i18n/core';
import SiteFooter from './SiteFooter';
import BrandMark from '../ui/BrandMark';

/** Các trang khách xem được không cần đăng nhập (cùng dữ liệu công khai với người đã đăng nhập, chỉ đọc). */
const GUEST_NAV: { to: string; labelKey: string }[] = [
  { to: '/explore', labelKey: 'common.nav.items.publicScores' },
  { to: '/composers', labelKey: 'common.nav.items.composers' },
  { to: '/forum', labelKey: 'common.nav.items.forum' },
  { to: '/pricing', labelKey: 'common.nav.items.pricing' },
];

/**
 * Khung cho khách chưa đăng nhập (mục 5.2): thanh trên cùng kiểu với khu người dùng nhưng chỉ có các trang công khai
 * (Khám phá, Nhạc sĩ, Diễn đàn, Bảng giá), nút ngôn ngữ, giao diện và Đăng nhập. Đăng nhập xong quay về đúng trang đang xem.
 */
export default function GuestLayout() {
  const { pathname, search } = useLocation();
  const active = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner app-header__inner--guest">
          <div className="app-header__left">
            <Link to="/" className="app-brand">
              <BrandMark size={30} className="app-brand__logo" />
              Scorewise
            </Link>
          </div>

          <nav className="app-nav app-nav--guest" aria-label={t('common.header.mainNav')}>
            {GUEST_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={() => `app-nav__item${active(item.to) ? ' app-nav__item--active' : ''}`}
                aria-current={active(item.to) ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="app-header__right">
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/auth/login" state={{ from: pathname + search }} className="app-signin">
              {t('home.guest.signIn')}
            </Link>
            <Link to="/auth/login" state={{ from: pathname + search, mode: 'register' }} className="app-create">
              {t('home.guest.signUp')}
            </Link>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
