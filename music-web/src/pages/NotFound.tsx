import { useLocation } from 'react-router-dom';
import { Link } from '../routes/transition-nav';
import { useNavigate } from '../routes/useTransitionNavigate';
import { Icon } from '../components/ui';
import { t } from '../i18n/core';
import './not-found.css';

/**
 * Trang 404 cho đường dẫn không tồn tại. Dùng ở hai nơi: cả màn hình (đường dẫn lạ ở gốc, khách hay người đã đăng nhập
 * đều thấy) và bên trong khung admin (`embedded`, nút về trang chủ dẫn tới /admin).
 */
export default function NotFound({ embedded = false }: { embedded?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const home = embedded ? '/admin' : '/';

  return (
    <main className={`nf${embedded ? ' nf--embedded' : ''}`}>
      <div className="nf__card">
        <div className="nf__staff" aria-hidden="true">
          <span className="nf__code">404</span>
          <span className="nf__rest">
            <Icon name="music" size={28} />
          </span>
        </div>
        <h1 className="nf__title">{t('common.notFound.title')}</h1>
        <p className="nf__desc">{t('common.notFound.description')}</p>
        <code className="nf__path" title={pathname}>
          {pathname}
        </code>
        <div className="nf__actions">
          <Link to={home} className="nf__btn nf__btn--primary">
            <Icon name="home" size={16} />
            {embedded ? t('common.notFound.adminHome') : t('common.notFound.home')}
          </Link>
          <button type="button" className="nf__btn" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    </main>
  );
}
