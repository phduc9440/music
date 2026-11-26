import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui';
import { t } from '../../../i18n/core';
import { StudioMicInput } from '../engine/StudioMicInput';
import type { RecognizedMicNote, StudioMicError } from '../engine/StudioMicInput';
import { playClick } from '../../../utils/pianoSynth';
import { clampOffset, loadStudioSettings, saveStudioSettings } from './studioSettings';

const SEMITONE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (midi: number) => `${SEMITONE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Hiệu chỉnh (ST-05): 4 tiếng gõ cách nhau 1 giây, bắt đầu sau 1 giây kể từ lúc bấm. */
const CALIBRATION_CLICKS = 4;
const CALIBRATION_GAP_MS = 1000;
/** Nốt cách tiếng gõ quá khoảng này thì không tính là chơi theo tiếng gõ đó. */
const CALIBRATION_MATCH_MS = 450;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

interface StudioMicTesterProps {
  onTestingChange?: (testing: boolean) => void;
}

type Calibration =
  | { phase: 'idle' }
  | { phase: 'running'; clicksMs: number[]; offsets: number[] }
  | { phase: 'done'; offsetMs: number }
  | { phase: 'failed' };

/**
 * Hộp thử micro dùng đúng bộ nhận nốt của phiên tập (Basic Pitch, ST-06), nên nốt hiện ở đây là nốt phiên tập sẽ
 * nghe được, cả hợp âm. Kèm hiệu chỉnh độ trễ (ST-05): chơi theo 4 tiếng gõ, lấy độ lệch trung vị lưu lại để phiên
 * tập trừ đi.
 */
export function StudioMicTester({ onTestingChange }: StudioMicTesterProps) {
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<Calibration>({ phase: 'idle' });
  const [savedOffset, setSavedOffset] = useState(() => loadStudioSettings().micOffsetMs);

  const micRef = useRef<StudioMicInput | null>(null);
  const calibrationRef = useRef<Calibration>({ phase: 'idle' });
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const setCal = (next: Calibration) => {
    calibrationRef.current = next;
    setCalibration(next);
  };

  const stopTesting = useCallback(() => {
    clearTimers();
    const mic = micRef.current;
    micRef.current = null;
    if (mic) void mic.dispose();
    setTesting(false);
    setLevel(0);
    setHeard([]);
    if (calibrationRef.current.phase === 'running') setCal({ phase: 'idle' });
    onTestingChange?.(false);
  }, [onTestingChange]);

  const onNotes = useCallback((notes: RecognizedMicNote[]) => {
    if (notes.length === 0) return;
    setHeard(notes.slice(-6).map((n) => noteName(n.midi)));
    const cal = calibrationRef.current;
    if (cal.phase !== 'running') return;
    const offsets = [...cal.offsets];
    for (const note of notes) {
      const nearest = cal.clicksMs.reduce((best, click) =>
        Math.abs(note.playedMs - click) < Math.abs(note.playedMs - best) ? click : best,
      );
      const diff = note.playedMs - nearest;
      if (Math.abs(diff) <= CALIBRATION_MATCH_MS) offsets.push(diff);
    }
    calibrationRef.current = { ...cal, offsets };
  }, []);

  const startTesting = async () => {
    setErrorMsg(null);
    setHeard([]);
    setStarting(true);
    try {
      // Thử với độ trễ hiệu chỉnh = 0 để đo được độ trễ thật của máy
      const mic = await StudioMicInput.create(
        onNotes,
        () => undefined,
        (error: StudioMicError) => {
          setErrorMsg(t(`studioPlayer.errors.mic.${error.code}`));
          stopTesting();
        },
        { offsetMs: 0, onLevel: (rms) => setLevel((prev) => Math.round(prev * 0.7 + Math.min(100, rms * 280) * 0.3)) },
      );
      await mic.start();
      micRef.current = mic;
      setTesting(true);
      onTestingChange?.(true);
    } catch (error) {
      const code = (error as StudioMicError | null)?.code;
      setErrorMsg(code ? t(`studioPlayer.errors.mic.${code}`) : t('studioPlayer.micTest.startError'));
    } finally {
      setStarting(false);
    }
  };

  const calibrate = () => {
    const mic = micRef.current;
    if (!mic) return;
    clearTimers();
    const sinceStart = performance.now() - mic.startTime;
    const clicksMs = Array.from({ length: CALIBRATION_CLICKS }, (_, i) => sinceStart + (i + 1) * CALIBRATION_GAP_MS);
    clicksMs.forEach((_, i) => playClick(i === 0, ((i + 1) * CALIBRATION_GAP_MS) / 1000));
    setCal({ phase: 'running', clicksMs, offsets: [] });
    // Basic Pitch trả kết quả theo cửa sổ 2 giây: đợi thêm cho cửa sổ chứa tiếng gõ cuối
    timersRef.current.push(
      window.setTimeout(
        () => {
          const cal = calibrationRef.current;
          if (cal.phase !== 'running') return;
          if (cal.offsets.length < 2) {
            setCal({ phase: 'failed' });
            return;
          }
          const offsetMs = clampOffset(median(cal.offsets));
          saveStudioSettings({ micOffsetMs: offsetMs });
          setSavedOffset(offsetMs);
          setCal({ phase: 'done', offsetMs });
        },
        (CALIBRATION_CLICKS + 1) * CALIBRATION_GAP_MS + 3000,
      ),
    );
  };

  const resetOffset = () => {
    saveStudioSettings({ micOffsetMs: 0 });
    setSavedOffset(0);
    setCal({ phase: 'idle' });
  };

  useEffect(() => () => stopTesting(), [stopTesting]);

  const levelColor = level < 5 ? 'var(--ui-text-3)' : level < 70 ? 'var(--ui-success)' : 'var(--ui-warning)';
  const levelStatusText =
    level < 5
      ? t('studioPlayer.micTest.statusQuiet')
      : level < 70
        ? t('studioPlayer.micTest.statusGood')
        : t('studioPlayer.micTest.statusLoud');

  return (
    <div className="studio-mic-tester" aria-label={t('studioPlayer.micTest.title')}>
      <div className="studio-mic-tester__head">
        <div className="studio-mic-tester__title">
          <Icon name="activity" size={16} />
          <strong>{t('studioPlayer.micTest.title')}</strong>
        </div>
        <button
          type="button"
          className={`sc-btn sc-btn--sm ${testing ? 'sc-btn--danger' : 'sc-btn--secondary'}`}
          onClick={testing ? stopTesting : () => void startTesting()}
          disabled={starting}
        >
          <Icon name={testing ? 'x' : 'activity'} size={14} />
          {t(
            testing
              ? 'studioPlayer.micTest.stop'
              : starting
                ? 'studioPlayer.micTest.starting'
                : 'studioPlayer.micTest.start',
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="studio-mic-tester__error" role="alert">
          <Icon name="alert" size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {testing && (
        <div className="studio-mic-tester__body">
          <div className="studio-mic-tester__meter">
            <div
              className="studio-mic-tester__meter-bar"
              role="progressbar"
              aria-valuenow={level}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${level}%`, backgroundColor: levelColor }} />
            </div>
            <div className="studio-mic-tester__meter-info">
              <span className="studio-mic-tester__status" style={{ color: levelColor }}>
                {levelStatusText}
              </span>
              <span className="studio-mic-tester__percent">{level}%</span>
            </div>
          </div>

          <div className="studio-mic-tester__note-feedback">
            {heard.length > 0 ? (
              <div className="studio-mic-tester__detected">
                <Icon name="music" size={16} />
                <span>
                  {t('studioPlayer.micTest.detectedNote')}: <strong>{heard.join(' ')}</strong>
                </span>
              </div>
            ) : (
              <div className="studio-mic-tester__hint">
                <Icon name="music" size={14} />
                <span>{t('studioPlayer.micTest.playPrompt')}</span>
              </div>
            )}
          </div>

          <div className="studio-mic-tester__calibrate">
            <button
              type="button"
              className="sc-btn sc-btn--sm"
              onClick={calibrate}
              disabled={calibration.phase === 'running'}
            >
              {t('studioPlayer.micTest.calibrate')}
            </button>
            <span role="status">
              {calibration.phase === 'running'
                ? t('studioPlayer.micTest.calibrating', { count: CALIBRATION_CLICKS })
                : calibration.phase === 'done'
                  ? t('studioPlayer.micTest.calibrated', { ms: calibration.offsetMs })
                  : calibration.phase === 'failed'
                    ? t('studioPlayer.micTest.calibrationFailed')
                    : t('studioPlayer.micTest.calibrateHint', { ms: savedOffset })}
            </span>
            {savedOffset > 0 && calibration.phase !== 'running' && (
              <button type="button" className="sc-btn sc-btn--sm sc-btn--ghost" onClick={resetOffset}>
                {t('studioPlayer.micTest.resetOffset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
