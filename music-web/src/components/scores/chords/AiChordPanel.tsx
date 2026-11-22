import { useMemo } from 'react';
import { t } from '../../../i18n/core';
import Icon from '../../ui/Icon';
import type { AiChordRow } from './useAiChordDraft';
import './aiChordPanel.css';

interface Props {
  rows: readonly AiChordRow[];
  /** Tiêu đề và mô tả của đề xuất (phong cách, giọng AI đoán). */
  title: string;
  description?: string | null;
  /** Id nốt đang được chọn trên bản nhạc (để đánh dấu hợp âm hiện tại trong danh sách). */
  currentId: string | null;
  saving: boolean;
  canSave: boolean;
  onPick: (row: AiChordRow) => void;
  onEdit: (row: AiChordRow) => void;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

/** Nhóm các hợp âm theo ô nhịp, giữ thứ tự trong bản nhạc. */
const byMeasure = (rows: readonly AiChordRow[]) => {
  const groups: { measureIndex: number; rows: AiChordRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.measureIndex === row.measureIndex) last.rows.push(row);
    else groups.push({ measureIndex: row.measureIndex, rows: [row] });
  }
  return groups;
};

/**
 * Bảng "Hợp âm AI gợi ý" bên phải trình chỉnh sửa: tổng hợp mọi hợp âm AI đã thêm (còn nguyên / đã sửa / đã xóa), bấm
 * để cuộn tới chỗ đó trên bản nhạc, nhấp đúp để sửa; Lưu đưa bản nháp thành phiên bản mới, Bỏ gợi ý gỡ hợp âm AI.
 */
export default function AiChordPanel({
  rows,
  title,
  description,
  currentId,
  saving,
  canSave,
  onPick,
  onEdit,
  onSave,
  onDiscard,
  onClose,
}: Props) {
  const groups = useMemo(() => byMeasure(rows), [rows]);
  const edited = rows.filter((r) => r.status === 'edited').length;
  const removed = rows.filter((r) => r.status === 'removed').length;
  const cursor = rows.findIndex((r) => r.id === currentId);
  const current = cursor >= 0 ? rows[cursor] : null;

  const step = (delta: 1 | -1) => {
    if (rows.length === 0) return;
    const next = cursor < 0 ? (delta > 0 ? 0 : rows.length - 1) : (cursor + delta + rows.length) % rows.length;
    onPick(rows[next]);
  };

  return (
    <aside className="sv-comments aic-panel" aria-label={t('chords.draft.panelTitle')}>
      <div className="sv-comments__head">
        <h2 className="aic-title">
          <span className="aic-spark" aria-hidden="true">
            <Icon name="star" size={16} />
          </span>
          {t('chords.draft.panelTitle')}
        </h2>
        <button
          type="button"
          className="sv-comments__close"
          onClick={onClose}
          aria-label={t('chords.draft.close')}
          title={t('chords.draft.close')}
        >
          ×
        </button>
      </div>

      <div className="aic-summary">
        <p className="aic-summary__key">{title}</p>
        {description && <p className="aic-summary__desc">{description}</p>}
        <p className="aic-summary__counts">
          <span>{t('chords.draft.counts', { count: rows.length })}</span>
          {edited > 0 && <span className="aic-count is-edited">{t('chords.draft.edited', { count: edited })}</span>}
          {removed > 0 && <span className="aic-count is-removed">{t('chords.draft.removed', { count: removed })}</span>}
        </p>
        <p className="aic-legend">
          <span className="aic-legend__swatch" aria-hidden="true">
            C
          </span>
          {t('chords.draft.legend')}
        </p>
      </div>

      <ol className="aic-list">
        {groups.map((group) => (
          <li key={group.measureIndex} className="aic-measure">
            <span className="aic-measure__label">{t('chords.draft.measure', { number: group.measureIndex + 1 })}</span>
            <div className="aic-chips">
              {group.rows.map((row) => {
                const label = t('chords.draft.chipLabel', { number: row.measureIndex + 1, chord: row.ai });
                const status =
                  row.status === 'edited'
                    ? t('chords.draft.statusEdited', { chord: row.now })
                    : row.status === 'removed'
                      ? t('chords.draft.statusRemoved')
                      : null;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`aic-chip is-${row.status}${row.id === currentId ? ' is-current' : ''}`}
                    aria-label={status ? `${label}. ${status}` : label}
                    aria-current={row.id === currentId ? 'true' : undefined}
                    title={status ?? undefined}
                    onClick={() => onPick(row)}
                    onDoubleClick={() => onEdit(row)}
                  >
                    <span className="aic-chip__ai">{row.ai}</span>
                    {row.status === 'edited' && (
                      <span className="aic-chip__now" aria-hidden="true">
                        → {row.now}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="aic-footer">
        <div className="aic-nav">
          <button
            type="button"
            className="sc-btn sc-btn--sm"
            onClick={() => step(-1)}
            aria-label={t('chords.draft.prev')}
            title={t('chords.draft.prev')}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="aic-nav__pos" aria-live="polite">
            {t('chords.draft.position', { current: cursor >= 0 ? cursor + 1 : '–', total: rows.length })}
          </span>
          <button
            type="button"
            className="sc-btn sc-btn--sm"
            onClick={() => step(1)}
            aria-label={t('chords.draft.next')}
            title={t('chords.draft.next')}
          >
            <Icon name="chevronRight" size={16} />
          </button>
          <button
            type="button"
            className="sc-btn sc-btn--sm aic-nav__edit"
            disabled={!current}
            onClick={() => current && onEdit(current)}
          >
            <Icon name="pencil" size={14} /> {t('chords.draft.edit')}
          </button>
        </div>
        <div className="aic-actions">
          <button type="button" className="sc-btn sc-btn--primary" disabled={!canSave || saving} onClick={onSave}>
            {saving ? t('chords.draft.saving') : t('chords.draft.save')}
          </button>
          <button type="button" className="sc-btn sc-btn--danger" disabled={saving} onClick={onDiscard}>
            {t('chords.draft.discard')}
          </button>
        </div>
      </div>
    </aside>
  );
}
