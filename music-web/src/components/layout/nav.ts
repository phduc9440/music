import { t } from '../../i18n/core';
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
export const isLibrary = (p: string) =>
  p === '/scores' || (p.startsWith('/scores/') && !/^\/scores\/(official|shared|trash)(\/|$)/.test(p));

/**
 * Điều hướng chính của người dùng, gom theo nhóm (menu thả xuống ở máy tính, danh sách có tiêu đề ở điện thoại).
 * Chỉ liệt kê trang đã có; khi làm thêm Diễn đàn, Team và Show, Bảng giá... thì thêm vào đây.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    get label() {
      return t('common.nav.groups.explore');
    },
    items: [
      {
        to: '/explore',
        get label() {
          return t('common.nav.items.publicScores');
        },
        icon: 'globe',
      },
      {
        to: '/scores/official',
        get label() {
          return t('common.nav.items.officialLibrary');
        },
        icon: 'library',
      },
      {
        to: '/composers',
        get label() {
          return t('common.nav.items.composers');
        },
        icon: 'users',
      },
    ],
  },
  {
    id: 'learn',
    get label() {
      return t('common.nav.groups.learn');
    },
    items: [
      {
        to: '/practice-history',
        get label() {
          return t('common.nav.items.practice');
        },
        icon: 'clock',
      },
      {
        to: '/practice-stats',
        get label() {
          return t('common.nav.items.stats');
        },
        icon: 'chart',
      },
    ],
  },
  {
    id: 'mine',
    get label() {
      return t('common.nav.groups.mine');
    },
    items: [
      {
        to: '/scores',
        get label() {
          return t('common.nav.items.library');
        },
        icon: 'music',
        match: isLibrary,
      },
      {
        to: '/scores/shared',
        get label() {
          return t('common.nav.items.shared');
        },
        icon: 'share',
      },
      {
        to: '/playlists',
        get label() {
          return t('common.nav.items.playlists');
        },
        icon: 'list',
      },
      {
        to: '/scores/trash',
        get label() {
          return t('common.nav.items.trash');
        },
        icon: 'trash',
      },
    ],
  },
];

/** Nút "+ Tạo bản nhạc" trên thanh trên. Tạm trỏ tới trang tải lên; sẽ trỏ về trang gộp khi có (mục I1). */
export const CREATE_SCORE_PATH = '/scores/upload';

export const isItemActive = (item: NavLinkItem, path: string): boolean => {
  const pathname = path.split(/[?#]/)[0]; // đường dẫn "từ đâu tới" có thể kèm bộ lọc (?composer=...)
  return item.match ? item.match(pathname) : pathname === item.to || pathname.startsWith(`${item.to}/`);
};

export const isGroupActive = (group: NavGroup, pathname: string): boolean =>
  group.items.some((item) => isItemActive(item, pathname));

/** Trang chi tiết bản nhạc và các trang con của nó, không tính các trang cố định như /scores/official. */
const SCORE_PAGE = /^\/scores\/(?!(official|shared|trash|upload|import)(\/|$))[^/]+/;

/**
 * Trang người dùng đã đi từ đó tới bản nhạc (lưu trong state của lần chuyển trang). Chỉ nhận đường dẫn nội bộ để
 * không bao giờ chuyển người dùng ra ngoài.
 */
export function getNavFrom(state: unknown): string | undefined {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : undefined;
}

/**
 * Đường dẫn dùng để chọn mục menu đang mở. Bản nhạc mở từ Khám phá, Kho bản nhạc mẫu hay Được chia sẻ vẫn thuộc mục đó
 * (không nhảy về "Không gian của tôi"); mở thẳng bằng đường dẫn thì theo chính nó.
 */
export function navContextPath(pathname: string, state: unknown): string {
  const from = getNavFrom(state);
  return from && SCORE_PAGE.test(pathname) ? from : pathname;
}

/** Nơi quay lại từ trang chi tiết: trang đã đi từ đó tới (kèm tên mục menu), nếu không có thì dùng mặc định. */
export function getBackTarget(state: unknown, fallback: { to: string; label: string }): { to: string; label: string } {
  const from = getNavFrom(state);
  if (!from) return fallback;
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => isItemActive(i, from));
  return { to: from, label: item?.label ?? t('common.nav.back') };
}
