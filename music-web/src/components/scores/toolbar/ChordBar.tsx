import { useMemo, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { canHoldChord, readChord } from '../../editor/notation/harmony';
import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import Modal from '../common/Modal';
import { t } from '../../../i18n/core';

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
    <div className="sv-lyricbar" role="group" aria-label={t('editor.toolbar.chord.group')}>
      <span className="sv-lyricbar__verse">{t('editor.toolbar.chord.label')}</span>
      <button
        type="button"
        className="sc-btn"
        onClick={() => onMove(-1)}
        disabled={!usable}
        aria-label={t('editor.toolbar.prevNote')}
      >
        ‹
      </button>
      <input
        key={`${selectedId}|${revision}`}
        className="sv-lyricbar__input"
        defaultValue={current}
        disabled={!usable}
        autoFocus
        placeholder={usable ? t('editor.toolbar.chord.hint') : t('editor.toolbar.chord.hintNone')}
        onKeyDown={onKeyDown}
        onPaste={onPasteInput}
        aria-label={t('editor.toolbar.chord.input')}
      />
      <button
        type="button"
        className="sc-btn"
        onClick={() => onMove(1)}
        disabled={!usable}
        aria-label={t('editor.toolbar.nextNote')}
      >
        ›
      </button>
      <button type="button" className="sc-btn" onClick={() => setPasteOpen(true)}>
        {t('editor.toolbar.chord.paste')}
      </button>
      <button type="button" className="sc-btn sc-btn--primary" onClick={onExit}>
        {t('editor.toolbar.done')}
      </button>

      {pasteOpen && (
        <Modal title={t('editor.toolbar.chord.pasteTitle')} onClose={() => setPasteOpen(false)}>
          <p className="sv-modal-text">{t('editor.toolbar.chord.pasteHelp')}</p>
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
              {t('common.cancel')}
            </button>
            <button className="sc-btn sc-btn--primary" onClick={submitPaste} disabled={!pasteText.trim()}>
              {t('editor.toolbar.chord.assign')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
