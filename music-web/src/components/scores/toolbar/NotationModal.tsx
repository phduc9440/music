import { useState } from 'react';
import { CLEFS, clefLabel } from '../../editor/structure/staves';
import type { ClefSign, NotationChange, NotationInfo, Scope } from '../../editor/structure/staves';
import Modal from '../common/Modal';
import { t } from '../../../i18n/core';

interface Props {
  info: NotationInfo;
  onApply: (change: NotationChange) => void;
  onClose: () => void;
}

// Tên âm chủ viết bằng chữ cái; hiển thị qua `editor.solfege.<chữ cái>` (Đô Rê Mi... hoặc C D E...)
const MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MAJOR_FLAT = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'];
const MINOR = ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
const MINOR_FLAT = ['A', 'D', 'G', 'C', 'F', 'B♭', 'E♭', 'A♭'];

const tonicName = (tonic: string): string => `${t(`editor.solfege.${tonic[0]}`)}${tonic.slice(1)}`;

const keyLabel = (fifths: number): string => {
  const n = Math.abs(fifths);
  const major = tonicName(fifths >= 0 ? MAJOR[n] : MAJOR_FLAT[n]);
  const minor = tonicName(fifths >= 0 ? MINOR[n] : MINOR_FLAT[n]);
  const signs = n === 0 ? t('editor.toolbar.notation.noAccidentals') : `${n}${fifths > 0 ? '♯' : '♭'}`;
  return `${signs} – ${t('editor.key.major', { tonic: major })} / ${t('editor.key.minor', { tonic: minor })}`;
};

const KEYS = Array.from({ length: 15 }, (_, i) => i - 7);
const BEAT_TYPES = [2, 4, 8, 16];

/**
 * Hộp thoại đổi khóa nhạc, dấu hóa đầu khuông và chỉ số nhịp tại vùng chọn. Mỗi phần có nút áp dụng riêng; phạm vi
 * là các ô đã chọn (sau đó trở lại như cũ) hoặc từ ô đầu đã chọn đến hết bài.
 */
export default function NotationModal({ info, onApply, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('toEnd');
  const [clef, setClef] = useState<ClefSign>(info.clef ?? 'G');
  const [fifths, setFifths] = useState(info.fifths);
  const [beats, setBeats] = useState(info.beats);
  const [beatType, setBeatType] = useState(info.beatType);
  const [free, setFree] = useState(info.free);

  const range =
    info.from === info.to
      ? t('editor.range.one', { n: info.from + 1 })
      : t('editor.range.span', { from: info.from + 1, to: info.to + 1 });

  return (
    <Modal title={t('editor.toolbar.notation.title')} onClose={onClose}>
      <div className="sv-notation">
        <fieldset className="sv-notation__scope">
          <legend>{t('editor.toolbar.notation.scope')}</legend>
          <label>
            <input type="radio" checked={scope === 'toEnd'} onChange={() => setScope('toEnd')} />{' '}
            {t('editor.toolbar.notation.toEnd', { n: info.from + 1 })}
          </label>
          <label>
            <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} />{' '}
            {t('editor.toolbar.notation.selected', { range })}
          </label>
        </fieldset>

        <section>
          <h4>{t('editor.toolbar.notation.clefTitle', { staff: info.staff })}</h4>
          <div className="sv-notation__row">
            {(Object.keys(CLEFS) as ClefSign[]).map((c) => (
              <label key={c} className="sv-notation__choice">
                <input type="radio" checked={clef === c} onChange={() => setClef(c)} /> {clefLabel(c)}
              </label>
            ))}
            <button className="sc-btn sc-btn--primary" onClick={() => onApply({ kind: 'clef', sign: clef, scope })}>
              {t('editor.toolbar.notation.apply')}
            </button>
          </div>
        </section>

        <section>
          <h4>{t('editor.toolbar.notation.keyTitle')}</h4>
          <div className="sv-notation__row">
            <select
              value={fifths}
              onChange={(e) => setFifths(Number(e.target.value))}
              aria-label={t('editor.toolbar.notation.keyAria')}
            >
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {keyLabel(k)}
                </option>
              ))}
            </select>
            <button className="sc-btn sc-btn--primary" onClick={() => onApply({ kind: 'key', fifths, scope })}>
              {t('editor.toolbar.notation.apply')}
            </button>
          </div>
        </section>

        <section>
          <h4>{t('editor.toolbar.notation.timeTitle')}</h4>
          <div className="sv-notation__row">
            <label className="sv-notation__choice">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />{' '}
              {t('editor.toolbar.notation.free')}
            </label>
            <input
              type="number"
              min={1}
              max={32}
              value={beats}
              disabled={free}
              onChange={(e) => setBeats(Number(e.target.value))}
              aria-label={t('editor.toolbar.notation.beats')}
            />
            <span>/</span>
            <select
              value={beatType}
              disabled={free}
              onChange={(e) => setBeatType(Number(e.target.value))}
              aria-label={t('editor.toolbar.notation.beatType')}
            >
              {BEAT_TYPES.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <button
              className="sc-btn sc-btn--primary"
              onClick={() => onApply({ kind: 'time', beats, beatType, free, scope })}
            >
              {t('editor.toolbar.notation.apply')}
            </button>
          </div>
          <p className="sv-modal-text">{t('editor.toolbar.notation.help')}</p>
        </section>
      </div>
    </Modal>
  );
}
