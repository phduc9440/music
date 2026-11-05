import { useMemo, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { canHoldChord, readChord } from '../../editor/harmony';
import type { ScoreDocument } from '../../editor/ScoreDocument';
import Modal from './Modal';

interface Props {
  doc: ScoreDocument;
  /** Tăng sau mỗi thay đổi của `doc`. */
  revision: number;
  /** Nốt đang chọn (nốt đầu tiên của vùng chọn) hoặc null. */
  selectedId: string | null;
  onEnter: (text: string, advance: boolean) => void;
  onMove: (delta: 1 | -1) => void;
  onPaste: (text: string) => void;
  onExit: () => void;
}

/**
 * Thanh nhập hợp âm (chế độ "Hợp âm"): nốt đang chọn được tô sáng, gõ hợp âm như "Am7", "C/G", "F#m" rồi bấm Space
 * (hoặc Tab) để sang nốt kế, Enter để ghi và ở lại; ô trống thì xóa hợp âm của nốt. Dán cả dãy "C Am F G7" để gán lần lượt.
 */
export default function ChordBar({ doc, revision, selectedId, onEnter, onMove, onPaste, onExit }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const usable = selectedId !== null && canHoldChord(doc, selectedId);
  const current = useMemo(() => {
    void revision; // đọc lại khi nội dung bản nhạc đổi
    return selectedId ? readChord(doc, selectedId) : '';
  }, [doc, selectedId, revision]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Process') return;
    const el = e.currentTarget;
    if (e.key === ' ' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      onEnter(el.value, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEnter(el.value, false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    } else if ((e.key === 'Backspace' && el.value === '') || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      onMove(-1);
    }
  };

  const onPasteInput = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\s|]/.test(text.trim())) {
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
    <div className="sv-lyricbar" role="group" aria-label="Nhập hợp âm">
      <span className="sv-lyricbar__verse">Hợp âm</span>
      <button type="button" className="sc-btn" onClick={() => onMove(-1)} disabled={!usable} aria-label="Nốt trước">
        ‹
      </button>
      <input
        key={`${selectedId}|${revision}`}
        className="sv-lyricbar__input"
        defaultValue={current}
        disabled={!usable}
        autoFocus
        placeholder={
          usable
            ? 'Gõ hợp âm, ví dụ C, Am7, G/B, C6/9, N.C. · Space: sang nốt kế · Enter: ghi · Esc: thoát'
            : 'Hãy chọn một nốt để nhập hợp âm'
        }
        onKeyDown={onKeyDown}
        onPaste={onPasteInput}
        aria-label="Hợp âm cho nốt đang chọn"
      />
      <button type="button" className="sc-btn" onClick={() => onMove(1)} disabled={!usable} aria-label="Nốt sau">
        ›
      </button>
      <button type="button" className="sc-btn" onClick={() => setPasteOpen(true)}>
        Dán dãy hợp âm…
      </button>
      <button type="button" className="sc-btn sc-btn--primary" onClick={onExit}>
        Xong
      </button>

      {pasteOpen && (
        <Modal title="Dán dãy hợp âm" onClose={() => setPasteOpen(false)}>
          <p className="sv-modal-text">
            Dán các hợp âm cách nhau bằng dấu cách hoặc "|": chúng được gán lần lượt lên các nốt, bắt đầu từ nốt đang
            chọn. Dùng "_" để bỏ qua một nốt.
          </p>
          <textarea
            className="sv-lyricbar__paste"
            rows={4}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="C _ Am | F _ G7 _"
            autoFocus
          />
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setPasteOpen(false)}>
              Hủy
            </button>
            <button className="sc-btn sc-btn--primary" onClick={submitPaste} disabled={!pasteText.trim()}>
              Gán hợp âm
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
