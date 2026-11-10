import { Link } from 'react-router-dom';
import { Icon } from '../ui';
import { CREATE_SCORE_PATH, NAV_GROUPS } from './nav';
import './site-footer.css';

interface FooterLink {
  label: string;
  to: string;
}

/**
 * Các cột liên kết. Trang cần đăng nhập vẫn liệt kê: khách bấm vào sẽ được đưa tới đăng nhập rồi quay lại đúng trang
 * (ProtectedRoute nhớ trang định vào). Khi có Diễn đàn, Nhạc sĩ, Bảng giá... thì thêm vào đây.
 */
const SITE_COLUMNS: { title: string; links: FooterLink[] }[] = [
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
const APP_COLUMNS: { title: string; links: FooterLink[] }[] = [
  ...NAV_GROUPS.map((g) => ({ title: g.label, links: g.items.map((i) => ({ label: i.label, to: i.to })) })),
  {
    title: 'Tài khoản',
    links: [
      { label: 'Trang chủ', to: '/' },
      { label: 'Hồ sơ của tôi', to: '/profile' },
    ],
  },
];

/**
 * Chân trang nền "sân khấu" tối: logo, các cột liên kết, bản quyền. variant="site" cho trang giới thiệu của khách,
 * "app" cho các trang sau khi đăng nhập (gọn hơn, trên điện thoại chỉ giữ dòng bản quyền vì đã có thanh tab dưới).
 */
export default function SiteFooter({ variant = 'site' }: { variant?: 'site' | 'app' }) {
  const app = variant === 'app';
  const columns = app ? APP_COLUMNS : SITE_COLUMNS;
  return (
    <footer className={`site-footer ui-stage${app ? ' site-footer--app' : ''}`}>
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <span className="site-footer__mark">
              <Icon name="music" size={16} />
            </span>
            Music App
          </Link>
          <p>
            {app
              ? 'Mẹo: nhấn Ctrl + K (Cmd + K trên Mac) để tìm nhanh bản nhạc và lệnh.'
              : 'Chụp bản nhạc giấy, sửa, nghe và luyện tập, cùng nhóm, bằng tiếng Việt.'}
          </p>
        </div>

        {columns.map((col) => (
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
