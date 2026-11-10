import { NavLink } from 'react-router-dom';
import { Icon } from '../ui';
import type { IconName } from '../ui';
import { CREATE_SCORE_PATH, isLibrary } from './nav';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Nút nổi bật ở giữa (tạo bản nhạc). */
  primary?: boolean;
  /** Quy tắc riêng để biết tab đang mở (mặc định: đường dẫn bằng hoặc bắt đầu bằng `to/`). */
  match?: (path: string) => boolean;
}

/** Năm mục dưới cùng trên điện thoại: Khám phá, Thư viện, Tạo, Luyện tập, Tôi. */
const TABS: Tab[] = [
  { to: '/explore', label: 'Khám phá', icon: 'globe' },
  {
    to: '/scores',
    label: 'Thư viện',
    icon: 'music', // trang tải lên đã có tab "Tạo" riêng nên không tính vào Thư viện
    match: (p) => isLibrary(p) && !p.startsWith(CREATE_SCORE_PATH),
  },
  { to: CREATE_SCORE_PATH, label: 'Tạo', icon: 'plus', primary: true },
  { to: '/practice-history', label: 'Luyện tập', icon: 'clock' },
  { to: '/profile', label: 'Tôi', icon: 'user' },
];

const isTabActive = (tab: Tab, path: string) =>
  tab.match ? tab.match(path) : path === tab.to || path.startsWith(`${tab.to}/`);

/** Thanh tab dưới cùng, chỉ hiện trên màn hình nhỏ (CSS). activePath là đường dẫn dùng để tô sáng tab đang mở. */
export default function MobileTabBar({ activePath }: { activePath: string }) {
  return (
    <nav className="app-tabbar" aria-label="Điều hướng nhanh">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={`app-tabbar__item${tab.primary ? ' app-tabbar__item--primary' : ''}${
            isTabActive(tab, activePath) ? ' app-tabbar__item--active' : ''
          }`}
          aria-current={isTabActive(tab, activePath) ? 'page' : undefined}
        >
          <span className="app-tabbar__icon">
            <Icon name={tab.icon} size={20} />
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
