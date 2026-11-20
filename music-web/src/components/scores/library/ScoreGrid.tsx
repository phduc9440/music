import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import ContextMenu from '../../ui/ContextMenu';
import type { MenuItem } from '../../ui/ContextMenu';
import Icon from '../../ui/Icon';
import PlaylistPicker from './PlaylistPicker';
import ScoreCard from './ScoreCard';
import { t } from '../../../i18n/core';
import { getScorePath } from '../../../utils/score';
import { isGuest } from '../../../utils/session';
import type { ScoreSummary } from '../../../types';

/** Thao tác chỉ chủ bản nhạc mới có; truyền vào thì menu có thêm các dòng tương ứng. */
export interface OwnerActions {
  rename?: (score: ScoreSummary) => void;
  /** Chuyển vào thùng rác (phím Delete trên thẻ đang chọn). */
  trash?: (score: ScoreSummary) => void;
  /** Xóa vĩnh viễn (Shift+Delete). */
  purge?: (score: ScoreSummary) => void;
}

interface Props {
  scores: ScoreSummary[];
  /** Bản của chính người xem: thẻ hiện nhãn quyền riêng tư / trạng thái xử lý, menu có "Mở trình chỉnh sửa". */
  owned?: boolean;
  /** Đang tải lại theo bộ lọc mới: làm mờ lưới cũ. */
  refetching?: boolean;
  owner?: OwnerActions;
  /** Hiện dòng mẹo "bấm chuột phải..." dưới lưới. */
  showTip?: boolean;
}

/** Bản nhạc đã có nội dung để mở trình chỉnh sửa / phát (không còn đang nhận dạng hay lỗi). */
const isReady = (s: ScoreSummary): boolean => s.processingStatus === 'COMPLETED';

/**
 * Lưới thẻ bản nhạc dùng chung cho mọi danh sách: mở bản nhạc khi bấm, menu thao tác nhanh (chuột phải / nút ⋯ / phím
 * Menu) gồm mở, phát, tab mới, thêm vào playlist, sao chép liên kết; trang "Bản nhạc của tôi" thêm đổi tên và xóa.
 * Khách chưa đăng nhập vào trang công khai /s/:id và không có các thao tác cần tài khoản.
 */
export default function ScoreGrid({ scores, owned = false, refetching = false, owner, showTip = false }: Props) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation(); // để trang chi tiết biết người dùng đi từ đâu tới
  const guest = isGuest();
  const [menu, setMenu] = useState<{ score: ScoreSummary; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState<ScoreSummary | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const pathOf = (s: ScoreSummary) => (guest ? `/s/${s.id}` : getScorePath(s.id, s.processingStatus));
  const open = (s: ScoreSummary) => navigate(pathOf(s), guest ? undefined : { state: { from: pathname + search } });

  const copyLink = async (s: ScoreSummary) => {
    // Bản công khai: đưa liên kết /s/:id để cả người chưa đăng nhập mở được
    const path = s.visibility === 'PUBLIC' ? `/s/${s.id}` : `/scores/${s.id}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success(t('scores.libMenu.linkCopied'));
    } catch {
      toast.error(t('scores.libMenu.linkFailed'));
    }
  };

  const menuItems = (s: ScoreSummary): MenuItem[] => {
    const ready = isReady(s);
    const running = s.processingStatus === 'PENDING' || s.processingStatus === 'PROCESSING';
    const items: MenuItem[] = [
      {
        id: 'open',
        label: t('scores.libMenu.openDetail'),
        icon: <Icon name="music" size={16} />,
        shortcut: 'Enter',
        onSelect: () => open(s),
      },
    ];
    if (owned) {
      items.push({
        id: 'edit',
        label: t('scores.hero.openEditor'),
        icon: <Icon name="edit" size={16} />,
        disabled: !ready,
        disabledReason: t('scores.hero.noXmlOpen'),
        onSelect: () => navigate(`/scores/${s.id}/edit`),
      });
    }
    if (!guest) {
      items.push({
        id: 'play',
        label: t('scores.hero.play'),
        icon: <Icon name="play" size={16} />,
        disabled: !ready,
        disabledReason: t('scores.hero.noXmlPlay'),
        onSelect: () => navigate(`/scores/${s.id}/play`),
      });
    }
    items.push(
      {
        id: 'newTab',
        label: t('scores.libMenu.newTab'),
        icon: <Icon name="external" size={16} />,
        onSelect: () => window.open(pathOf(s), '_blank', 'noopener'),
      },
      { type: 'separator', id: 's1' },
    );
    if (owner?.rename) {
      const rename = owner.rename;
      items.push({
        id: 'rename',
        label: t('scores.libMenu.rename'),
        icon: <Icon name="type" size={16} />,
        disabled: running,
        onSelect: () => rename(s),
      });
    }
    if (!guest) {
      items.push({
        id: 'playlist',
        label: t('scores.libMenu.addToPlaylist'),
        icon: <Icon name="listPlus" size={16} />,
        onSelect: () => setSaving(s),
      });
    }
    items.push({
      id: 'link',
      label: t('scores.libMenu.copyLink'),
      icon: <Icon name="link" size={16} />,
      onSelect: () => void copyLink(s),
    });
    if (owner?.trash || owner?.purge) {
      items.push({ type: 'separator', id: 's2' });
      if (owner.trash) {
        const trash = owner.trash;
        items.push({
          id: 'trash',
          label: t('scores.libMenu.trash'),
          hint: t('scores.libMenu.trashHint'),
          icon: <Icon name="trash" size={16} />,
          shortcut: 'Del',
          danger: true,
          onSelect: () => trash(s),
        });
      }
      if (owner.purge) {
        const purge = owner.purge;
        items.push({
          id: 'purge',
          label: t('scores.libMenu.purge'),
          hint: t('scores.libMenu.purgeHint'),
          icon: <Icon name="trashX" size={16} />,
          shortcut: 'Shift+Del',
          danger: true,
          onSelect: () => purge(s),
        });
      }
    }
    return items;
  };

  // Phím Delete / Shift+Delete trên thẻ đang được chọn bằng bàn phím: chuyển vào thùng rác / xóa vĩnh viễn
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Delete' || !owner) return;
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-score-id]')?.dataset.scoreId;
    const score = scores.find((s) => s.id === id);
    const action = e.shiftKey ? owner.purge : owner.trash;
    if (!score || !action) return;
    e.preventDefault();
    action(score);
  };

  return (
    <>
      <div className={`sc-grid${refetching ? ' is-refetching' : ''}`} onKeyDown={onKeyDown}>
        {scores.map((s) => (
          <div
            key={s.id}
            className={`sc-grid__cell${menu?.score.id === s.id ? ' is-menu-open' : ''}`}
            data-score-id={s.id}
          >
            <ScoreCard
              score={s}
              owned={owned}
              onOpen={open}
              onMenu={(item, point) => setMenu({ score: item, ...point })}
            />
          </div>
        ))}
      </div>

      {showTip && scores.length > 0 && (
        <p className="sc-grid-tip">{owner ? t('scores.libMenu.tip') : t('scores.libMenu.tipPublic')}</p>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t('scores.libMenu.label')}
          title={menu.score.title}
          items={menuItems(menu.score)}
          onClose={closeMenu}
        />
      )}
      {saving && <PlaylistPicker score={saving} onClose={() => setSaving(null)} />}
    </>
  );
}
