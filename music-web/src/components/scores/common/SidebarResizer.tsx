import Icon from '../../ui/Icon';
import { t } from '../../../i18n/core';
import type { SidebarResize } from './useSidebarResize';

interface ResizerProps {
  /** Tên cột, đọc cho trình đọc màn hình ("Đổi độ rộng cột …"). */
  name: string;
  resize: SidebarResize;
}

/**
 * Tay kéo đặt ngay mép trong của cột bên (là phần tử anh em cạnh cột trong hàng flex): kéo để đổi độ rộng, kéo hẳn vào
 * để thu gọn, nhấp đúp / Enter để thu hoặc mở.
 */
export function SidebarResizer({ name, resize }: ResizerProps) {
  return (
    <div
      className={`sv-resizer${resize.dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('editor.sidebar.resize', { name })}
      aria-valuemin={0}
      aria-valuemax={resize.max}
      aria-valuenow={resize.collapsed ? 0 : resize.width}
      aria-valuetext={resize.collapsed ? t('editor.sidebar.collapsed') : `${resize.width}px`}
      title={t('editor.sidebar.resizeHint')}
      tabIndex={0}
      {...resize.handleProps}
    />
  );
}

interface RailProps {
  name: string;
  side: 'left' | 'right';
  onExpand: () => void;
}

/** Dải mỏng thay cho cột khi thu gọn: bấm để mở lại. */
export function SidebarRail({ name, side, onExpand }: RailProps) {
  const label = t('editor.sidebar.expand', { name });
  return (
    <button type="button" className="sv-rail" onClick={onExpand} aria-label={label} title={label}>
      <Icon name={side === 'left' ? 'chevronRight' : 'chevronLeft'} size={18} />
      <span className="sv-rail__label">{name}</span>
    </button>
  );
}
