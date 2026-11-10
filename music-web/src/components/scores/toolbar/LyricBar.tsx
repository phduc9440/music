import { useMemo, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { canHoldLyric, MAX_VERSE, readLyric } from '../../editor/notation/lyrics';
import type { LyricEnd } from '../../editor/notation/lyrics';
import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import Modal from '../common/Modal';

interface Props {
  doc: ScoreDocument;
  /** Tăng sau mỗi thay đổi của `doc` (để đọc lại lời của nốt đang chọn). */
  revision: number;
  /** Nốt đang chọn (nốt đầu tiên của vùng chọn) hoặc null. */
  selectedId: string | null;
  verse: number;
  onVerseChange: (verse: number) => void;
  onEnter: (text: string, end: LyricEnd | 'stay') => void;
  onMove: (delta: 1 | -1) => void;
  onPaste: (text: string) => void;
  onExit: () => void;
}

/**
 * Thanh nhập lời bài hát (chế độ "Lời"): nốt đang chọn được tô sáng trên bản nhạc, gõ âm tiết vào ô rồi bấm Space để
 * sang nốt kế. Gõ "-" khi một chữ trải qua nhiều nốt. Dán cả câu vào ô (hoặc nút "Dán lời…") để gán lần lượt lên các nốt.
 */
export default function LyricBar({
  doc,
  revision,
  selectedId,
  verse,
  onVerseChange,
  onEnter,
  onMove,
  onPaste,
  onExit,
}: Props) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const usable = selectedId !== null && canHoldLyric(doc, selectedId);
  const current = useMemo(() => {
    void revision; // đọc lại khi nội dung bản nhạc đổi
    const info = selectedId ? doc.getInfo(selectedId) : undefined;
    // khoảng trắng trong một âm tiết hiện bằng "_" để gõ lại được (Space dùng để sang nốt kế)
    return info ? (readLyric(info.element, verse)?.text ?? '').replace(/ /g, '_') : '';
  }, [doc, selectedId, verse, revision]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Đang gõ dấu tiếng Việt (Telex/VNI): để bộ gõ xử lý, không bắt Space / "-"
    if (e.nativeEvent.isComposing || e.key === 'Process') return;
    const el = e.currentTarget;
    const atEnd = el.selectionStart === el.value.length;
    if (e.key === ' ') {
      e.preventDefault();
      onEnter(el.value, 'word');
    } else if (e.key === '-' && el.value.length > 0 && atEnd) {
      e.preventDefault();
      onEnter(el.value, 'hyphen');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEnter(el.value, 'stay');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    } else if ((e.key === 'Backspace' && el.value === '') || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      onMove(-1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onMove(1);
    }
  };

  const onPasteInput = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/\s/.test(text.trim())) {
      e.preventDefault();
      onPaste(text);
    }
  };

  const submitPaste = () => {
    if (pasteText.trim()) onPaste(pasteText);
    setPasteOpen(false);
    setPasteText('');
  };

  return (
    <div className="sv-lyricbar" role="group" aria-label="Nhập lời bài hát">
      <label className="sv-lyricbar__verse">
        Lời
        <select value={verse} onChange={(e) => onVerseChange(Number(e.target.value))}>
          {Array.from({ length: MAX_VERSE }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="sc-btn" onClick={() => onMove(-1)} disabled={!usable} aria-label="Nốt trước">
        ‹
      </button>
      <input
        key={`${selectedId}|${verse}|${revision}`}
        className="sv-lyricbar__input"
        defaultValue={current}
        disabled={!usable}
        autoFocus
        placeholder={
          usable
            ? 'Gõ lời cho nốt đang chọn · Space: sang nốt kế · "-": chữ còn tiếp · Esc: thoát'
            : 'Hãy chọn một nốt (không phải dấu lặng) để nhập lời'
        }
        onKeyDown={onKeyDown}
        onPaste={onPasteInput}
        aria-label="Lời cho nốt đang chọn"
      />
      <button type="button" className="sc-btn" onClick={() => onMove(1)} disabled={!usable} aria-label="Nốt sau">
        ›
      </button>
      <button type="button" className="sc-btn" onClick={() => setPasteOpen(true)}>
        Dán lời…
      </button>
      <button type="button" className="sc-btn sc-btn--primary" onClick={onExit}>
        Xong
      </button>

      {pasteOpen && (
        <Modal title="Dán lời bài hát" onClose={() => setPasteOpen(false)}>
          <p className="sv-modal-text">
            Dán cả đoạn lời: mỗi chữ cách nhau bằng dấu cách sẽ được gán lần lượt lên các nốt, bắt đầu từ nốt đang chọn
            (bỏ qua dấu lặng và nốt nối tiếp). Dùng "-" khi một chữ trải qua nhiều nốt (ví dụ "xin-chào"), dùng "_" đứng
            riêng để bỏ qua một nốt. Dùng "_" giữa hai chữ (ví dụ "xin_chào") để đặt hai chữ trên cùng một nốt.
          </p>
          <textarea
            className="sv-lyricbar__paste"
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Một con vịt xòe ra hai cái cánh..."
            autoFocus
          />
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setPasteOpen(false)}>
              Hủy
            </button>
            <button className="sc-btn sc-btn--primary" onClick={submitPaste} disabled={!pasteText.trim()}>
              Gán lời
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
