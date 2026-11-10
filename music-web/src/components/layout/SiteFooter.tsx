import type React from 'react';
import { Link } from 'react-router-dom';
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
 * Các cột liên kết. Trang cần đăng nhập vẫn liệt kê: khách bấm vào sẽ được đưa tới đăng nhập rồi quay lại đúng trang
 * (ProtectedRoute nhớ trang định vào). Khi có Diễn đàn, Nhạc sĩ, Bảng giá... thì thêm vào đây.
 */
const SITE_COLUMNS: FooterColumn[] = [
  {
    title: 'Khám phá',
    links: [
      { label: 'Bản nhạc công khai', to: '/explore' },
      { label: 'Kho score mẫu', to: '/scores/official' },
    ],
  },
  {
    title: 'Công cụ',
    links: [
      { label: 'Số hóa từ ảnh / PDF', to: CREATE_SCORE_PATH },
      { label: 'Nhập MusicXML / MIDI', to: '/scores/import' },
      { label: 'Luyện tập', to: '/practice-history' },
      { label: 'Thống kê luyện tập', to: '/practice-stats' },
    ],
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Câu hỏi thường gặp', to: '/#faq' },
      { label: 'Đăng nhập / Đăng ký', to: '/auth/login' },
    ],
  },
];

/** Trang đã đăng nhập: lấy đúng các nhóm của menu chính (thêm trang vào menu là chân trang có theo) và mục tài khoản. */
const APP_COLUMNS: FooterColumn[] = [
  ...NAV_GROUPS.map((g) => ({ title: g.label, links: g.items.map((i) => ({ label: i.label, to: i.to })) })),
  {
    title: 'Tài khoản',
    links: [
      { label: 'Trang chủ', to: '/' },
      { label: 'Hồ sơ của tôi', to: '/profile' },
    ],
  },
];

const APP_TIP = 'Mẹo: nhấn Ctrl + K (Cmd + K trên Mac) để tìm nhanh bản nhạc và lệnh.';
const SITE_TIP = 'Chụp bản nhạc giấy, sửa, nghe và luyện tập, cùng nhóm, bằng tiếng Việt.';

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
  const cols = columns ?? (app ? APP_COLUMNS : SITE_COLUMNS);
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
          <p>{tip ?? (app ? APP_TIP : SITE_TIP)}</p>
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
          <span>© {new Date().getFullYear()} Music App · Đồ án tốt nghiệp PTIT</span>
          <span>Bản nhạc của bạn mặc định là riêng tư.</span>
        </div>
      </div>
    </footer>
  );
}
