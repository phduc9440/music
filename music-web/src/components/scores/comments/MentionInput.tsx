import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { commentApi } from '../../../services';
import type { CommentMember } from '../../../types';
import { t } from '../../../i18n/core';

interface Props {
  scoreId: string;
  value: string;
  onChange: (value: string) => void;
  /** Chọn một người ở gợi ý @; nơi gọi giữ danh sách đã chọn để tính mentionIds lúc gửi (mentionIdsIn). */
  onPick: (member: CommentMember) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Ctrl/Cmd+Enter để gửi. */
  onSubmit?: () => void;
  maxLength?: number;
}

/** Đoạn "@chữ" ngay trước con trỏ (chưa có dấu cách): đang gõ tên để nhắc. */
const MENTION_AT_CARET = /(^|\s)@([^\s@]{0,30})$/;

/**
 * Ô nhập góp ý có gợi ý @nhắc tên: gõ @ hiện danh sách người xem được bản nhạc (lọc theo chữ đang gõ), chọn bằng chuột
 * hoặc phím mũi tên + Enter/Tab, Esc để đóng.
 */
export default function MentionInput({
  scoreId,
  value,
  onChange,
  onPick,
  placeholder,
  rows = 3,
  autoFocus,
  disabled,
  onSubmit,
  maxLength = 2000,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<CommentMember[]>([]);
  const [active, setActive] = useState(0);

  // Gọi API theo chữ đang gõ (chờ 200ms để không gọi mỗi phím)
  useEffect(() => {
    if (query === null) return;
    const timer = setTimeout(() => {
      commentApi
        .mentionable(scoreId, query)
        .then((res) => {
          setOptions(res.data.result);
          setActive(0);
        })
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [scoreId, query]);

  const detect = (text: string, caret: number) => {
    const m = MENTION_AT_CARET.exec(text.slice(0, caret));
    setQuery(m ? m[2] : null);
  };

  const choose = (member: CommentMember) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(MENTION_AT_CARET, (_all, space: string) => `${space}@${member.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    onPick(member);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && options.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(options[active]);
        return;
      }
    }
    if (e.key === 'Escape' && query !== null) {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const open = query !== null;
  return (
    <div className="cm-input">
      <textarea
        ref={ref}
        className="sc-input"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={open}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => detect(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {open && (
        <ul className="cm-suggest" role="listbox">
          {options.length === 0 ? (
            <li className="cm-suggest__empty">{t('scores.comments.noMention')}</li>
          ) : (
            options.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === active}
                className={`cm-suggest__item${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // giữ con trỏ trong ô nhập
                  choose(m);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <MemberAvatar member={m} size={22} />
                <span>{m.name}</span>
              </li>
            ))
          )}
          <li className="cm-suggest__hint">{t('scores.comments.mentionHint')}</li>
        </ul>
      )}
    </div>
  );
}

export function MemberAvatar({ member, size = 28 }: { member: CommentMember; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return member.avatarUrl ? (
    <img className="cm-avatar" src={member.avatarUrl} alt="" style={style} />
  ) : (
    <span className="cm-avatar" style={style} aria-hidden="true">
      {(member.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
