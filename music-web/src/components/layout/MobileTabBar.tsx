import { NavLink } from 'react-router-dom';
import { Icon } from '../ui';
import type { IconName } from '../ui';
import { CREATE_SCORE_PATH } from './nav';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Nút nổi bật ở giữa (tạo bản nhạc). */
  primary?: boolean;
  end?: boolean;
}

/** Năm mục dưới cùng trên điện thoại: Khám phá, Thư viện, Tạo, Luyện tập, Tôi. */
const TABS: Tab[] = [
  { to: '/explore', label: 'Khám phá', icon: 'globe' },
  { to: '/scores', label: 'Thư viện', icon: 'music', end: true },
  { to: CREATE_SCORE_PATH, label: 'Tạo', icon: 'plus', primary: true },
  { to: '/practice-history', label: 'Luyện tập', icon: 'clock' },
  { to: '/profile', label: 'Tôi', icon: 'user' },
];

/** Thanh tab dưới cùng, chỉ hiện trên màn hình nhỏ (CSS). */
export default function MobileTabBar() {
  return (
    <nav className="app-tabbar" aria-label="Điều hướng nhanh">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `app-tabbar__item${tab.primary ? ' app-tabbar__item--primary' : ''}${isActive ? ' app-tabbar__item--active' : ''}`
          }
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
