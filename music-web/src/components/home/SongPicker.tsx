import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../ui';
import { t } from '../../i18n/core';
import { SONGS, SONG_GROUPS, songBy, songTitle } from './songs';

const duration = (seconds: number) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Bảng chọn bài cho hộp nhạc trang chủ khách: nút tên bài mở một bảng trượt lên phía trên cụm nút, bài chia theo nhóm,
 * mỗi dòng có tên, tác giả và thời lượng; bài đang chọn tô màu nhấn, đang tự chạy thì có cột sóng nhạc nhún nhảy.
 * Theo mẫu listbox: mũi tên lên/xuống, Home/End để di chuyển, Enter hoặc Space để chọn, Esc để đóng và trả tiêu điểm
 * về nút; bấm ra ngoài cũng đóng.
 */
export default function SongPicker({
  value,
  playing,
  onSelect,
}: {
  value: number;
  playing: boolean;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // mở ra: tiêu điểm vào danh sách, cuộn tới bài đang chọn
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    list?.focus({ preventScroll: true });
    list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, [open]);
  const openList = () => {
    setActive(value);
    setOpen(true);
  };

  // bấm ra ngoài bảng thì đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // giữ dòng đang di chuyển tới luôn nằm trong vùng thấy được khi dùng bàn phím
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);

  const choose = (i: number) => {
    onSelect(i);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = SONGS.length - 1;
    if (e.key === 'ArrowDown') setActive((a) => (a >= last ? 0 : a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => (a <= 0 ? last : a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') setOpen(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  const current = SONGS[value];
  return (
    <div ref={rootRef} className="gh-song-picker">
      <button
        ref={triggerRef}
        type="button"
        className="gh-melody__song"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${t('home.guest.melody.choose')}: ${songTitle(current)}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="gh-melody__song-title">{songTitle(current)}</span>
        <Icon name="chevronUp" size={14} />
      </button>

      {open && (
        <div className="gh-songs">
          <div className="gh-songs__head">
            <span>{t('home.guest.melody.choose')}</span>
            <small>{t('home.guest.melody.count', { count: SONGS.length })}</small>
          </div>
          <div
            ref={listRef}
            id={`${id}-list`}
            className="gh-songs__list"
            role="listbox"
            tabIndex={-1}
            aria-label={t('home.guest.melody.choose')}
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
          >
            {SONG_GROUPS.map((g) => (
              <div key={g} role="group" aria-labelledby={`${id}-g-${g}`}>
                <div id={`${id}-g-${g}`} className="gh-songs__group">
                  {t(`home.guest.melody.groups.${g}`)}
                </div>
                {SONGS.map((s, i) =>
                  s.group !== g ? null : (
                    <div
                      key={s.id}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={i === value}
                      className={`gh-songs__item${i === value ? ' is-current' : ''}${i === active ? ' is-active' : ''}`}
                      onClick={() => choose(i)}
                      onPointerMove={() => setActive(i)}
                    >
                      <span className="gh-songs__badge" aria-hidden="true">
                        {i === value && playing ? (
                          <span className="gh-eq">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <Icon name={i === value ? 'check' : 'music'} size={14} />
                        )}
                      </span>
                      <span className="gh-songs__meta">
                        <strong>{songTitle(s)}</strong>
                        <small>{songBy(s)}</small>
                      </span>
                      <span className="gh-songs__time">{duration(s.seconds)}</span>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
