import { Link } from 'react-router-dom';
import { Icon } from '../ui';
import { CREATE_SCORE_PATH } from './nav';
import './site-footer.css';

interface FooterLink {
  label: string;
  to: string;
}

/**
 * Các cột liên kết. Trang cần đăng nhập vẫn liệt kê: khách bấm vào sẽ được đưa tới đăng nhập rồi quay lại đúng trang
 * (ProtectedRoute nhớ trang định vào). Khi có Diễn đàn, Nhạc sĩ, Bảng giá... thì thêm vào đây.
 */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
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

/** Chân trang của trang giới thiệu: nền "sân khấu" tối như phần đầu trang, logo, các cột liên kết, bản quyền. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <span className="site-footer__mark">
              <Icon name="music" size={16} />
            </span>
            Music App
          </Link>
          <p>Chụp bản nhạc giấy, sửa, nghe và luyện tập, cùng nhóm, bằng tiếng Việt.</p>
        </div>

        {COLUMNS.map((col) => (
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
