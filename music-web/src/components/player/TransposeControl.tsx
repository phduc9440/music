import { describeTranspose, signedSemitones } from '../editor/transpose';
import type { KeySignature } from '../editor/transpose';
import { IconTranspose } from './PlayerIcons';
import { PlayerPopover } from './PlayerPopover';
import { MAX_TRANSPOSE, MIN_TRANSPOSE } from './transposeRange';

interface Props {
  /** Số nửa cung đang chuyển (−12…+12). */
  semitones: number;
  /** Khóa nhạc đầu bài, để hiện tên giọng gốc và giọng mới. */
  startKey: KeySignature;
  /** Số nốt vượt âm vực piano sau khi chuyển (bị bỏ khi phát). */
  outOfRange: number;
  /** true: bản nhạc được vẽ lại theo giọng mới (trang phát); false: chỉ đổi âm thanh (Editor). */
  redraws: boolean;
  onChange: (semitones: number) => void;
  disabled?: boolean;
}

const OPTIONS = Array.from({ length: MAX_TRANSPOSE - MIN_TRANSPOSE + 1 }, (_, i) => MAX_TRANSPOSE - i);

/** Chuyển giọng khi nghe: nút −/+ theo nửa cung, danh sách −12…+12, tên giọng gốc → giọng mới và cảnh báo nốt vượt âm vực. */
export function TransposeControl({ semitones, startKey, outOfRange, redraws, onChange, disabled }: Props) {
  const changed = semitones !== 0;
  const summary = describeTranspose(startKey, semitones);
  return (
    <PlayerPopover
      label={changed ? `Chuyển giọng: đang nghe ${signedSemitones(semitones)} nửa cung` : 'Chuyển giọng'}
      title="Chuyển giọng khi nghe"
      disabled={disabled}
      buttonClassName={changed ? 'pl-chip--on' : undefined}
      trigger={
        <span className="pl-chip__inner">
          <IconTranspose />
          <strong className="pl-tr__value">{signedSemitones(semitones)}</strong>
        </span>
      }
    >
      <div className="pl-tr">
        <div className="pl-tr__head">Chuyển giọng</div>
        <div className="pl-tr__stepper">
          <button
            type="button"
            className="pl-tr__step"
            onClick={() => onChange(semitones - 1)}
            disabled={semitones <= MIN_TRANSPOSE}
            aria-label="Hạ nửa cung"
            title="Hạ nửa cung"
          >
            −
          </button>
          <select
            className="pl-tr__select"
            value={semitones}
            aria-label="Số nửa cung chuyển giọng"
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? '0 (giọng gốc)' : `${signedSemitones(n)} nửa cung`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pl-tr__step"
            onClick={() => onChange(semitones + 1)}
            disabled={semitones >= MAX_TRANSPOSE}
            aria-label="Nâng nửa cung"
            title="Nâng nửa cung"
          >
            +
          </button>
        </div>
        <p className="pl-tr__key" aria-live="polite">
          {changed ? `${signedSemitones(semitones)} · ${summary}` : summary}
        </p>
        {outOfRange > 0 && (
          <p className="pl-tr__note pl-tr__note--warn" role="status">
            {outOfRange} nốt vượt âm vực đàn piano sẽ bị bỏ khi phát.
          </p>
        )}
        {changed && !redraws && (
          <p className="pl-tr__note">
            Đang nghe {signedSemitones(semitones)} nửa cung. Bản nhạc ở đây giữ nguyên để bạn sửa.
          </p>
        )}
        <button type="button" className="pl-link pl-tr__reset" onClick={() => onChange(0)} disabled={!changed}>
          Về giọng gốc
        </button>
      </div>
    </PlayerPopover>
  );
}
