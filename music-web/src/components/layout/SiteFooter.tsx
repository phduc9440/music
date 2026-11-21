import type React from 'react';
import { Link } from '../../routes/transition-nav';
import { t } from '../../i18n/core';
import { CREATE_SCORE_PATH } from './nav';
import './site-footer.css';
import BrandMark from '../ui/BrandMark';

export interface FooterLink {
  label: string;
  to: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Các cột liên kết của trang giới thiệu. Trang cần đăng nhập vẫn liệt kê: khách bấm vào sẽ được đưa tới đăng nhập rồi
 * quay lại đúng trang (ProtectedRoute nhớ trang định vào). Khi có Diễn đàn, Bảng giá... thì thêm vào đây.
 */
const siteColumns = (): FooterColumn[] => [
  {
    title: t('common.nav.groups.explore'),
    links: [
      { label: t('common.nav.items.publicScores'), to: '/explore' },
      { label: t('common.nav.items.officialLibrary'), to: '/scores/official' },
      { label: t('common.nav.items.composers'), to: '/composers' },
      { label: t('common.nav.items.forum'), to: '/forum' },
    ],
  },
  {
    title: t('common.footer.tools'),
    links: [
      { label: t('common.footer.digitize'), to: CREATE_SCORE_PATH },
      { label: t('common.footer.import'), to: '/scores/import' },
      { label: t('common.nav.items.practice'), to: '/practice-history' },
      { label: t('common.footer.practiceStats'), to: '/practice-stats' },
    ],
  },
  {
    title: t('common.footer.support'),
    links: [
      { label: t('common.footer.faq'), to: '/#faq' },
      { label: t('common.footer.signIn'), to: '/auth/login' },
    ],
  },
];

/** Trang đã đăng nhập: lấy đúng các nhóm của menu chính (thêm trang vào menu là chân trang có theo) và mục tài khoản. */
interface SiteFooterProps {
  /** Cột liên kết riêng; bỏ trống thì dùng cột mặc định. */
  columns?: FooterColumn[];
  /** Dòng chữ dưới logo. */
  tip?: string;
  /** Bản gọn cho trang đã đăng nhập: một hàng logo + liên kết hay dùng, rồi dòng bản quyền. */
  variant?: 'full' | 'compact';
}

/** Liên kết hay dùng của bản gọn (trang đã đăng nhập). */
const compactLinks = (): FooterLink[] => [
  { label: t('common.nav.items.library'), to: '/scores' },
  { label: t('common.nav.items.publicScores'), to: '/explore' },
  { label: t('common.nav.items.officialLibrary'), to: '/scores/official' },
  { label: t('common.nav.items.forum'), to: '/forum' },
  { label: t('common.footer.practiceStats'), to: '/practice-stats' },
];

const Logo = () => (
  <Link to="/" className="site-footer__logo">
    <BrandMark size={30} className="site-footer__mark" />
    Scorewise
  </Link>
);

const Legal = () => (
  <div className="site-footer__legal">
    <span>{t('common.footer.copyright', { year: new Date().getFullYear() })}</span>
    <span>{t('common.footer.privacy')}</span>
  </div>
);

/** Chân trang nền "sân khấu" tối của trang giới thiệu cho khách: logo, các cột liên kết, bản quyền. */
export default function SiteFooter({ columns, tip, variant = 'full' }: SiteFooterProps) {
  if (variant === 'compact') {
    return (
      <footer className="site-footer site-footer--compact">
        <div className="site-footer__compact">
          <Logo />
          <nav aria-label={t('common.footer.quickLinks')}>
            <ul className="site-footer__links">
              {compactLinks().map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="site-footer__bottom">
          <Legal />
        </div>
      </footer>
    );
  }
  const cols = columns ?? siteColumns();
  return (
    <footer className="site-footer">
      <div className="site-footer__inner" style={{ '--sf-cols': cols.length } as React.CSSProperties}>
        <div className="site-footer__brand">
          <Logo />
          <p>{tip ?? t('common.footer.tipSite')}</p>
        </div>

        {cols.map((col) => (
          <nav key={col.title} className="site-footer__col" aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.to}>
                  {l.to.includes('#') ? <a href={l.to}>{l.label}</a> : <Link to={l.to}>{l.label}</Link>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="site-footer__bottom">
        <span className="site-footer__staff" aria-hidden="true" />
        <Legal />
      </div>
    </footer>
  );
}
