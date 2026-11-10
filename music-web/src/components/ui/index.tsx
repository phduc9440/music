import type { ButtonHTMLAttributes, CSSProperties, FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import type { IconName } from './Icon';

import { VISIBILITY } from './helpers';
import type { Tone } from './helpers';

export { default as Icon } from './Icon';
export type { IconName } from './Icon';

/*
 * Khuôn mẫu giao diện quản trị. Mọi trang /admin dựng từ các khối dưới đây để cùng một kiểu:
 * PageHeader -> (Toolbar) -> Card chứa Table / nội dung -> Pager. Màu, chữ, khoảng cách lấy từ token trong admin.css.
 */

// ------------------------------------------------------------------ bố cục trang

/** Nút "quay lại" dùng chung: PageHeader và các trang chi tiết admin đều dựng từ đây để cùng một kiểu. */
export function BackLink({ label, to, onClick }: { label: string; to?: string; onClick?: () => void }) {
  const content = (
    <>
      <Icon name="arrowLeft" size={16} />
      {label}
    </>
  );
  return to ? (
    <Link to={to} className="adm-page-header__back">
      {content}
    </Link>
  ) : (
    <button type="button" className="adm-page-header__back" onClick={onClick}>
      {content}
    </button>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <header className="adm-page-header">
      {back && <BackLink {...back} />}
      <div className="adm-page-header__row">
        <div className="adm-page-header__text">
          <h1 className="adm-page-header__title">{title}</h1>
          {description && <p className="adm-page-header__desc">{description}</p>}
        </div>
        {actions && <div className="adm-page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  flush = false,
  className = '',
  style,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Bỏ đệm trong để bảng tràn sát mép thẻ. */
  flush?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`adm-card${flush ? ' adm-card--flush' : ''} ${className}`.trim()} style={style}>
      {(title || actions) && (
        <div className="adm-card__header">
          <div>
            {title && <h2 className="adm-card__title">{title}</h2>}
            {description && <p className="adm-card__desc">{description}</p>}
          </div>
          {actions && <div className="adm-card__actions">{actions}</div>}
        </div>
      )}
      <div className="adm-card__body">{children}</div>
    </section>
  );
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`adm-toolbar ${className}`.trim()}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  to,
  alert = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  to?: string;
  /** Viền cảnh báo khi số liệu cần admin xử lý. */
  alert?: boolean;
}) {
  const body = (
    <>
      <div className="adm-stat__top">
        <span className="adm-stat__label">{label}</span>
        {icon && (
          <span className={`adm-stat__icon adm-tone--${tone}`}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="adm-stat__value">{value}</div>
      {hint && <div className="adm-stat__hint">{hint}</div>}
    </>
  );
  const cls = `adm-stat${alert ? ' adm-stat--alert' : ''}${to ? ' adm-stat--link' : ''}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Lưới thẻ số liệu; minWidth là độ rộng tối thiểu mỗi thẻ (mặc định 155px, đủ 6 thẻ một hàng ở màn hình rộng). */
export function StatGrid({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return (
    <div
      className="adm-stat-grid"
      style={minWidth ? { gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ nút, nhãn

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const btnClass = (variant: Variant, size: Size, iconOnly: boolean, extra = '') =>
  `adm-btn adm-btn--${variant} adm-btn--${size}${iconOnly ? ' adm-btn--icon' : ''} ${extra}`.trim();

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className,
  type = 'button',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: IconName; loading?: boolean }) {
  return (
    <button
      type={type}
      className={btnClass(variant, size, !children, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="adm-spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  title,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <Link to={to} className={btnClass(variant, size, !children)} title={title}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </Link>
  );
}

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`adm-badge adm-tone--${tone}`} title={title}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ form

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="adm-field">
      <label className="adm-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className="adm-field__hint">{hint}</div>}
    </div>
  );
}

/** Ô tìm kiếm có icon, gửi khi bấm Enter hoặc nút Tìm. */
export function SearchForm({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <form
      className="adm-search"
      role="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <span className="adm-search__icon">
        <Icon name="search" size={16} />
      </span>
      <input
        className="adm-input adm-search__input"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button type="submit" variant="primary">
        Tìm
      </Button>
    </form>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className="adm-tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          className={`adm-tab${value === it.value ? ' adm-tab--active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ bảng

export function Table({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

/** Dòng thay thế khi bảng rỗng hoặc đang tải. */
export function TableState({
  colSpan,
  loading = false,
  icon = 'inbox',
  title,
  description,
}: {
  colSpan: number;
  loading?: boolean;
  icon?: IconName;
  title?: string;
  description?: string;
}) {
  return (
    <tr className="adm-table__state">
      <td colSpan={colSpan}>
        {loading ? (
          <div className="adm-empty">
            <span className="adm-spinner adm-spinner--lg" aria-hidden="true" />
            <span className="adm-empty__desc">Đang tải…</span>
          </div>
        ) : (
          <EmptyState icon={icon} title={title ?? 'Không có dữ liệu'} description={description} />
        )}
      </td>
    </tr>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="adm-empty">
      <span className="adm-empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="adm-empty__title">{title}</div>
      {description && <div className="adm-empty__desc">{description}</div>}
      {action}
    </div>
  );
}

/** Phân trang của admin: ghi đúng đơn vị (thành viên, bản nhạc...). */
export function Pager({
  page,
  totalPages,
  totalElements,
  unit,
  onChange,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  unit: string;
  onChange: (page: number) => void;
}) {
  if (totalElements === 0) return null;
  return (
    <nav className="adm-pager" aria-label="Phân trang">
      <span className="adm-pager__info">
        {totalElements.toLocaleString('vi-VN')} {unit}
        {totalPages > 1 && ` · trang ${page + 1}/${totalPages}`}
      </span>
      {totalPages > 1 && (
        <div className="adm-pager__buttons">
          <Button
            size="sm"
            icon="chevronLeft"
            disabled={page === 0}
            onClick={() => onChange(page - 1)}
            aria-label="Trang trước"
          />
          <Button
            size="sm"
            icon="chevronRight"
            disabled={page + 1 >= totalPages}
            onClick={() => onChange(page + 1)}
            aria-label="Trang sau"
          />
        </div>
      )}
    </nav>
  );
}

// ------------------------------------------------------------------ hiển thị

export function Avatar({ name, src, size = 32 }: { name?: string | null; src?: string | null; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return src ? (
    <img className="adm-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="adm-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initial}
    </span>
  );
}

export function DescriptionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="adm-dl">
      {items.map(([label, value]) => (
        <div key={label} className="adm-dl__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tên chính kèm dòng phụ nhỏ bên dưới (ví dụ tên bản nhạc + email chủ sở hữu). */
export function CellTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="adm-cell-title">
      <div className="adm-cell-title__main">{children}</div>
      {sub && <div className="adm-cell-title__sub">{sub}</div>}
    </div>
  );
}

export function VisibilityBadge({ value }: { value: string }) {
  const v = VISIBILITY[value] ?? { label: value, tone: 'neutral' as Tone };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
