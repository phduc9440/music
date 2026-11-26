import type { ShowItem } from '../../../types';
import { t } from '../../../i18n/core';

export type ItemLoadState = 'loading' | 'ok' | 'error';

interface SetListProps {
  items: ShowItem[];
  states: Record<string, ItemLoadState>;
  currentIndex: number;
  onPick: (index: number) => void;
  onClose: () => void;
}

/** Danh sách bài của buổi diễn để nhảy nhanh; bài không mở được thì mờ đi và không bấm được. */
export default function SetList({ items, states, currentIndex, onPick, onClose }: SetListProps) {
  return (
    <div className="pf-list" role="dialog" aria-modal="true" aria-label={t('player.perform.setList')}>
      <div className="pf-list__header">
        <h2>{t('player.perform.setList')}</h2>
        <button type="button" className="pf-btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <ol className="pf-list__items">
        {items.map((item, index) => {
          const state = states[item.id];
          const playable = state === 'ok';
          const className = `pf-list__item${index === currentIndex ? ' pf-list__item--current' : ''}`;
          return (
            <li key={item.id}>
              <button type="button" className={className} disabled={!playable} onClick={() => onPick(index)}>
                <span className="pf-list__no">{index + 1}</span>
                <span className="pf-list__title">{item.scoreTitle}</span>
                {state === 'error' && <span className="pf-list__tag">{t('player.perform.unavailableShort')}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
