import type React from 'react';
import { Link } from '../../routes/transition-nav';
import { t } from '../../i18n/core';
import { Icon } from '../ui';
import { CREATE_SCORE_PATH, NAV_GROUPS } from './nav';
import './site-footer.css';

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
const appColumns = (): FooterColumn[] => [
  ...NAV_GROUPS.map((g) => ({ title: g.label, links: g.items.map((i) => ({ label: i.label, to: i.to })) })),
  {
    title: t('common.footer.account'),
    links: [
      { label: t('common.footer.home'), to: '/' },
      { label: t('common.header.profile'), to: '/profile' },
    ],
  },
];

interface SiteFooterProps {
  /**
   * "site": trang giới thiệu của khách. "app": trang sau khi đăng nhập và khu quản trị (gọn hơn; trên điện thoại chỉ
   * giữ dòng bản quyền vì đã có thanh tab dưới hoặc ngăn menu).
   */
  variant?: 'site' | 'app';
  /** Cột liên kết riêng (khu quản trị truyền menu của nó); bỏ trống thì dùng cột mặc định của variant. */
  columns?: FooterColumn[];
  /** Dòng chữ dưới logo. */
  tip?: string;
}

/** Chân trang nền "sân khấu" tối: logo, các cột liên kết, bản quyền. */
export default function SiteFooter({ variant = 'site', columns, tip }: SiteFooterProps) {
  const app = variant === 'app';
  const cols = columns ?? (app ? appColumns() : siteColumns());
  return (
    <footer className={`site-footer ui-stage${app ? ' site-footer--app' : ''}`}>
      <div className="site-footer__inner" style={{ '--sf-cols': cols.length } as React.CSSProperties}>
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <span className="site-footer__mark">
              <Icon name="music" size={16} />
            </span>
            Music App
          </Link>
          <p>{tip ?? (app ? t('common.footer.tipApp') : t('common.footer.tipSite'))}</p>
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
        <div className="site-footer__legal">
          <span>{t('common.footer.copyright', { year: new Date().getFullYear() })}</span>
          <span>{t('common.footer.privacy')}</span>
        </div>
      </div>
    </footer>
  );
}
