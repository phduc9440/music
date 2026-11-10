import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui';
import type { IconName } from '../ui';
import { scoreApi } from '../../services';
import type { ScoreSummary } from '../../types';
import type { ThemePreference } from '../../theme/theme';
import { useTheme } from '../../theme/useTheme';
import { getScorePath } from '../../utils/score';
import { CREATE_SCORE_PATH, NAV_GROUPS } from './nav';
import './command-palette.css';

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;
const RESULTS_PER_GROUP = 5;

/** So khớp không phân biệt hoa thường và dấu tiếng Việt ("kho score" khớp "Kho score mẫu", "thu vien" khớp "Thư viện"). */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * Hộp tìm toàn cục (Ctrl/Cmd+K): lệnh nhanh, bản nhạc của tôi và bản nhạc công khai. Mở bằng phím tắt hoặc nút tìm
 * trên thanh trên; mũi tên để chọn, Enter để chạy, Esc để đóng.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { setPreference } = useTheme();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState<ScoreSummary[]>([]);
  const [shared, setShared] = useState<ScoreSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => inputRef.current?.focus(), []);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const commands = useMemo<Entry[]>(() => {
    const links: Entry[] = [
      {
        id: 'cmd-create',
        group: 'Lệnh nhanh',
        label: 'Tạo bản nhạc',
        hint: 'Tải ảnh, PDF, MusicXML hoặc MIDI',
        icon: 'plus',
        run: () => go(CREATE_SCORE_PATH),
      },
      ...NAV_GROUPS.flatMap((g) =>
        g.items.map<Entry>((item) => ({
          id: `cmd-${item.to}`,
          group: 'Lệnh nhanh',
          label: item.label,
          hint: g.label,
          icon: item.icon,
          run: () => go(item.to),
        })),
      ),
      { id: 'cmd-profile', group: 'Lệnh nhanh', label: 'Hồ sơ của tôi', icon: 'user', run: () => go('/profile') },
    ];
    const themeChoices: { id: string; label: string; icon: IconName; pref: ThemePreference }[] = [
      { id: 'cmd-theme-light', label: 'Đổi giao diện: Sáng', icon: 'sun', pref: 'light' },
      { id: 'cmd-theme-dark', label: 'Đổi giao diện: Tối', icon: 'moon', pref: 'dark' },
      { id: 'cmd-theme-system', label: 'Đổi giao diện: Theo hệ thống', icon: 'monitor', pref: 'system' },
    ];
    const themes = themeChoices.map<Entry>(({ pref, ...rest }) => ({
      ...rest,
      group: 'Lệnh nhanh',
      run: () => {
        setPreference(pref);
        onClose();
      },
    }));
    return [...links, ...themes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPreference]);

  const trimmed = query.trim();
  const folded = fold(trimmed);

  // Tìm bản nhạc (của tôi và công khai) sau khi ngừng gõ một lúc
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.allSettled([
        scoreApi.list({ keyword: trimmed, size: RESULTS_PER_GROUP }),
        scoreApi.explore({ keyword: trimmed, size: RESULTS_PER_GROUP }),
      ]).then(([own, pub]) => {
        if (cancelled) return;
        setMine(own.status === 'fulfilled' ? own.value.data.result.content : []);
        setShared(pub.status === 'fulfilled' ? pub.value.data.result.content : []);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const entries = useMemo<Entry[]>(() => {
    const matching = folded ? commands.filter((c) => fold(`${c.label} ${c.hint ?? ''}`).includes(folded)) : commands;
    const open = (s: ScoreSummary, from: string) => {
      onClose();
      navigate(getScorePath(s.id, s.processingStatus), { state: { from } });
    };
    // Chỉ dùng kết quả tìm khi đủ ký tự; ngắn hơn thì bỏ kết quả cũ
    const ownResults = trimmed.length >= MIN_QUERY ? mine : [];
    const ownIds = new Set(ownResults.map((s) => s.id));
    const publicResults = trimmed.length >= MIN_QUERY ? shared.filter((s) => !ownIds.has(s.id)) : [];
    return [
      ...ownResults.map<Entry>((s) => ({
        id: `mine-${s.id}`,
        group: 'Bản nhạc của tôi',
        label: s.title,
        hint: s.composer ?? undefined,
        icon: 'music',
        run: () => open(s, '/scores'),
      })),
      ...publicResults.map<Entry>((s) => ({
        id: `public-${s.id}`,
        group: 'Bản nhạc công khai',
        label: s.title,
        hint: s.composer ?? undefined,
        icon: 'globe',
        run: () => open(s, '/explore'),
      })),
      ...matching,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, folded, mine, shared, trimmed]);

  const selected = Math.min(active, Math.max(entries.length - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((selected + 1) % Math.max(entries.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((selected - 1 + entries.length) % Math.max(entries.length, 1));
    } else if (e.key === 'Enter' && entries[selected]) {
      e.preventDefault();
      entries[selected].run();
    }
  };

  // Giữ mục đang chọn trong vùng nhìn thấy khi di chuyển bằng bàn phím
  useEffect(() => {
    document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, listId]);

  let lastGroup = '';
  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Tìm kiếm và lệnh nhanh"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk__search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmdk__input"
            placeholder="Tìm bản nhạc hoặc gõ một lệnh…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={entries[selected] ? `${listId}-${selected}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk__kbd">Esc</kbd>
        </div>
        <div className="cmdk__list" id={listId} role="listbox">
          {entries.map((entry, index) => {
            const heading = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {heading && <div className="cmdk__group">{heading}</div>}
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === selected}
                  className={`cmdk__item${index === selected ? ' cmdk__item--active' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={entry.run}
                >
                  <Icon name={entry.icon} size={16} />
                  <span className="cmdk__label">{entry.label}</span>
                  {entry.hint && <span className="cmdk__hint">{entry.hint}</span>}
                </button>
              </div>
            );
          })}
          {entries.length === 0 && !loading && <div className="cmdk__empty">Không có kết quả cho “{trimmed}”</div>}
          {loading && <div className="cmdk__empty">Đang tìm…</div>}
        </div>
      </div>
    </div>
  );
}
