import { useState } from 'react';
import { Icon } from '../../ui';
import type { IconName } from '../../ui';
import AccessMembersPanel from './AccessMembersPanel';
import AccessRequestsPanel from './AccessRequestsPanel';
import { t } from '../../../i18n/core';

type Section = 'general' | 'people' | 'requests' | 'danger';

interface Props {
  scoreId: string;
  /** Chủ bản nhạc: có thêm mục người có quyền và yêu cầu xin quyền. */
  isOwner: boolean;
  canShare: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Số yêu cầu xin quyền đang chờ (nhãn trên thanh bên). */
  pendingRequests: number;
  /** Tải lại danh sách người có quyền khi đổi giá trị (ví dụ sau khi đóng hộp Chia sẻ). */
  refreshKey: number;
  /** Có thay đổi đồng ý / từ chối / đổi quyền: để số chờ trên tab cập nhật theo. */
  onChanged: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Tab "Cài đặt" của trang chi tiết, bố cục như trang Settings của GitHub: thanh bên trái chọn chức năng (Chung, Người có
 * quyền, Yêu cầu xin quyền, Vùng nguy hiểm), bên phải là nội dung của mục đang chọn. Mỗi mục chỉ hiện khi có quyền làm.
 */
export default function ScoreSettingsSection({
  scoreId,
  isOwner,
  canShare,
  canEdit,
  canDelete,
  pendingRequests,
  refreshKey,
  onChanged,
  onShare,
  onEdit,
  onDelete,
}: Props) {
  const items: { key: Section; label: string; icon: IconName; badge?: number }[] = [];
  if (canShare || canEdit) items.push({ key: 'general', label: t('scores.settings.nav.general'), icon: 'sliders' });
  if (isOwner) {
    items.push({ key: 'people', label: t('scores.settings.nav.people'), icon: 'users' });
    items.push({
      key: 'requests',
      label: t('scores.settings.nav.requests'),
      icon: 'inbox',
      badge: pendingRequests,
    });
  }
  if (canDelete) items.push({ key: 'danger', label: t('scores.settings.nav.danger'), icon: 'alert' });

  // Có yêu cầu đang chờ thì mở thẳng mục đó để chủ thấy ngay
  const [chosen, setChosen] = useState<Section | null>(null);
  const first = isOwner && pendingRequests > 0 ? 'requests' : items[0]?.key;
  const active: Section | undefined = items.some((i) => i.key === chosen) ? (chosen as Section) : first;

  return (
    <div className="sc-settings">
      <nav className="sc-settings__nav" aria-label={t('scores.detail.settings')}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`sc-settings__link${it.key === 'danger' ? ' is-danger' : ''}`}
            aria-current={active === it.key ? 'page' : undefined}
            onClick={() => setChosen(it.key)}
          >
            <Icon name={it.icon} size={16} />
            <span>{it.label}</span>
            {it.badge ? <span className="sc-settings__badge">{it.badge}</span> : null}
          </button>
        ))}
      </nav>

      <div className="sc-settings__body">
        {active === 'general' && (
          <>
            {canEdit && (
              <section className="sc-settings__card">
                <div>
                  <h2>{t('scores.settings.editTitle')}</h2>
                  <p>{t('scores.settings.editHint')}</p>
                </div>
                <button type="button" className="sc-btn" onClick={onEdit}>
                  <Icon name="edit" size={16} /> {t('scores.hero.editInfo')}
                </button>
              </section>
            )}
            {canShare && (
              <section className="sc-settings__card">
                <div>
                  <h2>{t('scores.settings.shareTitle')}</h2>
                  <p>{t('scores.settings.shareHint')}</p>
                </div>
                <button type="button" className="sc-btn" onClick={onShare}>
                  <Icon name="share" size={16} /> {t('scores.hero.share')}
                </button>
              </section>
            )}
          </>
        )}
        {active === 'people' && isOwner && (
          <AccessMembersPanel scoreId={scoreId} onInvite={onShare} refreshKey={refreshKey} onChanged={onChanged} />
        )}
        {active === 'requests' && isOwner && <AccessRequestsPanel scoreId={scoreId} showEmpty onChanged={onChanged} />}
        {active === 'danger' && canDelete && (
          <section className="sc-settings__card sc-settings__card--danger">
            <div>
              <h2>{t('scores.settings.dangerTitle')}</h2>
              <p>{t('scores.settings.dangerHint')}</p>
            </div>
            <button type="button" className="sc-btn sc-btn--danger" onClick={onDelete}>
              <Icon name="trash" size={16} /> {t('scores.hero.delete')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
