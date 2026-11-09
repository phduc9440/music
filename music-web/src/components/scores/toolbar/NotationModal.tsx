import { useState } from 'react';
import { CLEFS } from '../../editor/structure/staves';
import type { ClefSign, NotationChange, NotationInfo, Scope } from '../../editor/structure/staves';
import Modal from '../common/Modal';

interface Props {
  info: NotationInfo;
  onApply: (change: NotationChange) => void;
  onClose: () => void;
}

const MAJOR = ['Đô', 'Son', 'Rê', 'La', 'Mi', 'Si', 'Fa♯', 'Đô♯'];
const MAJOR_FLAT = ['Đô', 'Fa', 'Si♭', 'Mi♭', 'La♭', 'Rê♭', 'Sol♭', 'Đô♭'];
const MINOR = ['La', 'Mi', 'Si', 'Fa♯', 'Đô♯', 'Sol♯', 'Rê♯', 'La♯'];
const MINOR_FLAT = ['La', 'Rê', 'Son', 'Đô', 'Fa', 'Si♭', 'Mi♭', 'La♭'];

const keyLabel = (fifths: number): string => {
  const n = Math.abs(fifths);
  const major = fifths >= 0 ? MAJOR[n] : MAJOR_FLAT[n];
  const minor = fifths >= 0 ? MINOR[n] : MINOR_FLAT[n];
  const signs = n === 0 ? 'không dấu' : `${n}${fifths > 0 ? '♯' : '♭'}`;
  return `${signs} – ${major} trưởng / ${minor} thứ`;
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

  const range = info.from === info.to ? `ô ${info.from + 1}` : `ô ${info.from + 1}–${info.to + 1}`;

  return (
    <Modal title="Khóa nhạc, dấu hóa & nhịp" onClose={onClose}>
      <div className="sv-notation">
        <fieldset className="sv-notation__scope">
          <legend>Áp dụng cho</legend>
          <label>
            <input type="radio" checked={scope === 'toEnd'} onChange={() => setScope('toEnd')} /> Từ{' '}
            {`ô ${info.from + 1}`} đến hết bài
          </label>
          <label>
            <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} /> Chỉ {range} (sau
            đó trở lại như cũ)
          </label>
        </fieldset>

        <section>
          <h4>Khóa nhạc (khuông {info.staff})</h4>
          <div className="sv-notation__row">
            {(Object.keys(CLEFS) as ClefSign[]).map((c) => (
              <label key={c} className="sv-notation__choice">
                <input type="radio" checked={clef === c} onChange={() => setClef(c)} /> {CLEFS[c].label}
              </label>
            ))}
            <button className="sc-btn sc-btn--primary" onClick={() => onApply({ kind: 'clef', sign: clef, scope })}>
              Áp dụng
            </button>
          </div>
        </section>

        <section>
          <h4>Dấu hóa đầu khuông (mọi khuông)</h4>
          <div className="sv-notation__row">
            <select value={fifths} onChange={(e) => setFifths(Number(e.target.value))} aria-label="Dấu hóa đầu khuông">
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {keyLabel(k)}
                </option>
              ))}
            </select>
            <button className="sc-btn sc-btn--primary" onClick={() => onApply({ kind: 'key', fifths, scope })}>
              Áp dụng
            </button>
          </div>
        </section>

        <section>
          <h4>Chỉ số nhịp (mọi khuông)</h4>
          <div className="sv-notation__row">
            <label className="sv-notation__choice">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Nhịp tự do
            </label>
            <input
              type="number"
              min={1}
              max={32}
              value={beats}
              disabled={free}
              onChange={(e) => setBeats(Number(e.target.value))}
              aria-label="Số phách"
            />
            <span>/</span>
            <select
              value={beatType}
              disabled={free}
              onChange={(e) => setBeatType(Number(e.target.value))}
              aria-label="Loại phách"
            >
              {BEAT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className="sc-btn sc-btn--primary"
              onClick={() => onApply({ kind: 'time', beats, beatType, free, scope })}
            >
              Áp dụng
            </button>
          </div>
          <p className="sv-modal-text">
            Đổi nhịp không tự sắp lại nốt: ô nào không còn đủ phách sẽ viền đỏ để bạn sửa (hoặc bấm ✓ nếu muốn giữ).
            Nhịp tự do thì ô nhịp dài tùy ý, không báo thiếu/thừa phách.
          </p>
        </section>
      </div>
    </Modal>
  );
}
