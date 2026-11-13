import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import ComposerDatalist from '../../composers/ComposerDatalist';
import { scoreCreateApi } from '../../../services';
import type { BlankPreset, KeyMode } from '../../../types';
import { getErrorMessage, MAX_COMPOSER, MAX_TITLE } from '../../../utils/score';
import { reportPlanLimit } from '../../../utils/planLimit';
import { accidentalsLabel, KEY_FIFTHS, keyName } from './keySignatures';
import { t } from '../../../i18n/core';

/** Giới hạn khớp BE (ScoreCreateServiceImpl, lỗi 3302). */
const MIN_BEATS = 1;
const MAX_BEATS = 12;
const BEAT_TYPES = [2, 4, 8, 16];
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;
const MIN_MEASURES = 1;
const MAX_MEASURES = 200;

const PRESETS: BlankPreset[] = ['PIANO', 'VOICE_PIANO', 'GUITAR', 'SATB'];
const QUICK_TIMES: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [6, 8],
];
const BEATS = Array.from({ length: MAX_BEATS - MIN_BEATS + 1 }, (_, i) => MIN_BEATS + i);

interface Props {
  /** Gọi khi tạo xong, nhận mã bản nhạc để trang mở trình chỉnh sửa. */
  onCreated: (scoreId: string) => void;
  onCancel: () => void;
}

const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

/** Form "Bản trống": chọn mẫu nhạc cụ, hóa biểu, nhịp, tempo, số ô rồi gửi POST /scores/blank. */
export default function BlankScoreForm({ onCreated, onCancel }: Props) {
  const [preset, setPreset] = useState<BlankPreset>('PIANO');
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [keyFifths, setKeyFifths] = useState(0);
  const [mode, setMode] = useState<KeyMode>('MAJOR');
  const [beats, setBeats] = useState(4);
  const [beatType, setBeatType] = useState(4);
  const [tempo, setTempo] = useState('100');
  const [measures, setMeasures] = useState('16');
  const [busy, setBusy] = useState(false);

  const tempoValue = Number(tempo);
  const measuresValue = Number(measures);
  const titleOk = title.trim().length > 0 && title.length <= MAX_TITLE;
  const tempoOk = inRange(tempoValue, MIN_TEMPO, MAX_TEMPO);
  const measuresOk = inRange(measuresValue, MIN_MEASURES, MAX_MEASURES);
  const canSubmit = titleOk && tempoOk && measuresOk && composer.length <= MAX_COMPOSER && !busy;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await scoreCreateApi.blank({
        title: title.trim(),
        composer: composer.trim() || undefined,
        preset,
        keyFifths,
        mode,
        beats,
        beatType,
        tempoBpm: tempoValue,
        measures: measuresValue,
      });
      onCreated(res.data.result.scoreId);
    } catch (err) {
      if (!reportPlanLimit(err)) toast.error(getErrorMessage(err, t('upload.create.blank.failed')));
      setBusy(false);
    }
  };

  return (
    <form className="sc-create-blank" onSubmit={handleSubmit}>
      <h2>{t('upload.create.blank.title')}</h2>

      <fieldset className="sc-create-blank__presets" disabled={busy}>
        <legend className="sc-label">{t('upload.create.blank.preset')}</legend>
        {PRESETS.map((p) => (
          <label key={p} className={`sc-create-preset ${preset === p ? 'is-active' : ''}`}>
            <input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} />
            <strong>{t(`upload.create.preset.${p}.name`)}</strong>
            <span>{t(`upload.create.preset.${p}.hint`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="sc-create-blank__grid">
        <div>
          <label className="sc-label" htmlFor="bs-title">
            {t('upload.fieldTitle')}
          </label>
          <input
            id="bs-title"
            className="sc-input"
            value={title}
            maxLength={MAX_TITLE}
            disabled={busy}
            placeholder={t('upload.create.blank.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="sc-label" htmlFor="bs-composer">
            {t('upload.fieldComposer')} <span className="sc-upload__optional">({t('scores.request.optional')})</span>
          </label>
          <input
            id="bs-composer"
            className="sc-input"
            list="bs-composer-list"
            value={composer}
            maxLength={MAX_COMPOSER}
            disabled={busy}
            onChange={(e) => setComposer(e.target.value)}
          />
          <ComposerDatalist id="bs-composer-list" />
        </div>

        <div>
          <label className="sc-label" htmlFor="bs-key">
            {t('upload.create.blank.key')}
          </label>
          <select
            id="bs-key"
            className="sc-input"
            value={keyFifths}
            disabled={busy}
            onChange={(e) => setKeyFifths(Number(e.target.value))}
          >
            {KEY_FIFTHS.map((f) => (
              <option key={f} value={f}>
                {keyName(f, mode)} ({accidentalsLabel(f)})
              </option>
            ))}
          </select>
          <div className="sc-create-blank__segment" role="group" aria-label={t('upload.create.blank.mode')}>
            {(['MAJOR', 'MINOR'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`sc-btn sc-btn--sm ${mode === m ? 'sc-btn--primary' : ''}`}
                aria-pressed={mode === m}
                disabled={busy}
                onClick={() => setMode(m)}
              >
                {t(m === 'MAJOR' ? 'upload.create.major' : 'upload.create.minor')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="sc-label" htmlFor="bs-beats">
            {t('upload.create.blank.time')}
          </label>
          <div className="sc-create-blank__time">
            <select
              id="bs-beats"
              className="sc-input"
              value={beats}
              disabled={busy}
              aria-label={t('upload.create.blank.beats')}
              onChange={(e) => setBeats(Number(e.target.value))}
            >
              {BEATS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <span aria-hidden>/</span>
            <select
              className="sc-input"
              value={beatType}
              disabled={busy}
              aria-label={t('upload.create.blank.beatType')}
              onChange={(e) => setBeatType(Number(e.target.value))}
            >
              {BEAT_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="sc-create-blank__segment">
            {QUICK_TIMES.map(([n, d]) => (
              <button
                key={`${n}/${d}`}
                type="button"
                className={`sc-btn sc-btn--sm ${beats === n && beatType === d ? 'sc-btn--primary' : ''}`}
                disabled={busy}
                onClick={() => {
                  setBeats(n);
                  setBeatType(d);
                }}
              >
                {n}/{d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="sc-label" htmlFor="bs-tempo">
            {t('upload.create.blank.tempo')}
          </label>
          <input
            id="bs-tempo"
            className="sc-input"
            type="number"
            inputMode="numeric"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            value={tempo}
            disabled={busy}
            aria-invalid={!tempoOk}
            onChange={(e) => setTempo(e.target.value)}
          />
          {!tempoOk && (
            <p className="sc-create-blank__error">
              {t('upload.create.blank.range', { min: MIN_TEMPO, max: MAX_TEMPO })}
            </p>
          )}
        </div>

        <div>
          <label className="sc-label" htmlFor="bs-measures">
            {t('upload.create.blank.measures')}
          </label>
          <input
            id="bs-measures"
            className="sc-input"
            type="number"
            inputMode="numeric"
            min={MIN_MEASURES}
            max={MAX_MEASURES}
            value={measures}
            disabled={busy}
            aria-invalid={!measuresOk}
            onChange={(e) => setMeasures(e.target.value)}
          />
          {!measuresOk && (
            <p className="sc-create-blank__error">
              {t('upload.create.blank.range', { min: MIN_MEASURES, max: MAX_MEASURES })}
            </p>
          )}
        </div>
      </div>

      <div className="sc-create-blank__actions">
        <button type="button" className="sc-btn" disabled={busy} onClick={onCancel}>
          {t('upload.create.blank.back')}
        </button>
        <button type="submit" className="sc-btn sc-btn--primary" disabled={!canSubmit}>
          {busy ? t('upload.create.blank.creating') : t('upload.create.blank.submit')}
        </button>
      </div>
    </form>
  );
}
