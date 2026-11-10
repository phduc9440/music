import type { IconName } from '../ui';

export interface NavLinkItem {
  to: string;
  label: string;
  icon: IconName;
  /** Mục đang mở khi đường dẫn khớp (mặc định: bằng hoặc bắt đầu bằng `to/`). */
  match?: (pathname: string) => boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavLinkItem[];
}

/** Thư viện gồm cả chi tiết, tải lên, nhập file... nhưng không gồm kho mẫu, mục được chia sẻ và thùng rác. */
const isLibrary = (p: string) =>
  p === '/scores' || (p.startsWith('/scores/') && !/^\/scores\/(official|shared|trash)(\/|$)/.test(p));

/**
 * Điều hướng chính của người dùng, gom theo nhóm (menu thả xuống ở máy tính, danh sách có tiêu đề ở điện thoại).
 * Chỉ liệt kê trang đã có; khi làm thêm Diễn đàn, Nhạc sĩ, Team và Show, Bảng giá... thì thêm vào đây.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    label: 'Khám phá',
    items: [
      { to: '/explore', label: 'Bản nhạc công khai', icon: 'globe' },
      { to: '/scores/official', label: 'Kho score mẫu', icon: 'library' },
    ],
  },
  {
    id: 'learn',
    label: 'Học tập',
    items: [
      { to: '/practice-history', label: 'Luyện tập', icon: 'clock' },
      { to: '/practice-stats', label: 'Thống kê', icon: 'chart' },
    ],
  },
  {
    id: 'mine',
    label: 'Không gian của tôi',
    items: [
      { to: '/scores', label: 'Thư viện', icon: 'music', match: isLibrary },
      { to: '/scores/shared', label: 'Được chia sẻ', icon: 'share' },
      { to: '/playlists', label: 'Playlist', icon: 'list' },
      { to: '/scores/trash', label: 'Thùng rác', icon: 'trash' },
    ],
  },
];

/** Nút "+ Tạo bản nhạc" trên thanh trên. Tạm trỏ tới trang tải lên; sẽ trỏ về trang gộp khi có (mục I1). */
export const CREATE_SCORE_PATH = '/scores/upload';

export const isItemActive = (item: NavLinkItem, pathname: string): boolean =>
  item.match ? item.match(pathname) : pathname === item.to || pathname.startsWith(`${item.to}/`);

export const isGroupActive = (group: NavGroup, pathname: string): boolean =>
  group.items.some((item) => isItemActive(item, pathname));
