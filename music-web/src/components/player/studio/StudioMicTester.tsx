import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../../ui';
import { t } from '../../../i18n/core';

const SEMITONE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function noteFromMidi(midi: number): string {
  return `${SEMITONE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Thuật toán tự tương quan (Autocorrelation) đơn giản để ước tính tần số cơ bản (F0)
 * từ đệm mẫu âm thanh PCM float 32-bit.
 */
function detectPitch(buffer: Float32Array, sampleRate: number): { freq: number; midi: number } | null {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / size);
  // Ngưỡng năng lượng tối thiểu để coi là có âm thanh
  if (rms < 0.02) return null;

  let r1 = 0;
  let r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < thres) {
      r2 = size - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const trimmedLen = trimmed.length;
  if (trimmedLen < 32) return null;

  const corr = new Float32Array(trimmedLen);
  for (let i = 0; i < trimmedLen; i++) {
    let sum = 0;
    for (let j = 0; j < trimmedLen - i; j++) {
      sum += trimmed[j] * trimmed[j + i];
    }
    corr[i] = sum;
  }

  let d = 0;
  while (d < trimmedLen - 1 && corr[d] > corr[d + 1]) {
    d++;
  }

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < trimmedLen; i++) {
    if (corr[i] > maxval) {
      maxval = corr[i];
      maxpos = i;
    }
  }

  if (maxpos < 1 || maxpos >= trimmedLen - 1) return null;

  // Nội suy parabol đỉnh cực đại
  const x0 = corr[maxpos - 1];
  const x1 = corr[maxpos];
  const x2 = corr[maxpos + 1];
  const a = (x0 + x2 - 2 * x1) / 2;
  const b = (x2 - x0) / 2;
  const delta = a !== 0 ? -b / (2 * a) : 0;
  const period = maxpos + delta;

  if (period <= 0) return null;
  const freq = sampleRate / period;

  // Dải phím đàn piano thông dụng (A0 ~ 27.5 Hz đến C8 ~ 4186 Hz)
  if (freq < 27 || freq > 4200) return null;

  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  if (midi < 21 || midi > 108) return null;

  return { freq: Math.round(freq), midi };
}

interface StudioMicTesterProps {
  onTestingChange?: (testing: boolean) => void;
}

export function StudioMicTester({ onTestingChange }: StudioMicTesterProps) {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0); // 0 đến 100
  const [detectedNote, setDetectedNote] = useState<{ note: string; freq: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastNoteTimeRef = useRef(0);

  const stopTesting = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setTesting(false);
    setLevel(0);
    setDetectedNote(null);
    onTestingChange?.(false);
  }, [onTestingChange]);

  const startTesting = async () => {
    setErrorMsg(null);
    setDetectedNote(null);
    setLevel(0);

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
        setErrorMsg(t('studioPlayer.micTest.unsupported'));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const audioCtx = new AudioContext();
      await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      // Không kết nối analyser tới audioCtx.destination để tránh rú loa

      audioContextRef.current = audioCtx;
      streamRef.current = stream;
      analyserRef.current = analyser;
      setTesting(true);
      onTestingChange?.(true);

      const buffer = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buffer);

        // Tính RMS cho mức âm lượng
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        // Chuyển sang thang điểm 0 - 100 mượt mà
        const currentLevel = Math.min(100, Math.round(rms * 280));
        setLevel((prev) => Math.round(prev * 0.7 + currentLevel * 0.3));

        // Nhận diện cao độ nốt khi âm lượng đủ lớn
        if (rms > 0.025) {
          const pitch = detectPitch(buffer, audioCtx.sampleRate);
          if (pitch) {
            setDetectedNote({
              note: noteFromMidi(pitch.midi),
              freq: pitch.freq,
            });
            lastNoteTimeRef.current = performance.now();
          }
        } else if (performance.now() - lastNoteTimeRef.current > 2000) {
          setDetectedNote(null);
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stopTesting();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg(t('studioPlayer.micTest.permissionDenied'));
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setErrorMsg(t('studioPlayer.micTest.noDevice'));
      } else {
        setErrorMsg(t('studioPlayer.micTest.startError'));
      }
    }
  };

  useEffect(() => {
    return () => {
      stopTesting();
    };
  }, [stopTesting]);

  const levelColor =
    level < 5
      ? 'var(--ui-text-3)'
      : level < 70
        ? 'var(--ui-success)'
        : 'var(--ui-warning)';

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
          onClick={testing ? stopTesting : startTesting}
        >
          <Icon name={testing ? 'x' : 'activity'} size={14} />
          {t(testing ? 'studioPlayer.micTest.stop' : 'studioPlayer.micTest.start')}
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
            <div className="studio-mic-tester__meter-bar" role="progressbar" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}>
              <span
                style={{
                  width: `${level}%`,
                  backgroundColor: levelColor,
                }}
              />
            </div>
            <div className="studio-mic-tester__meter-info">
              <span className="studio-mic-tester__status" style={{ color: levelColor }}>
                {levelStatusText}
              </span>
              <span className="studio-mic-tester__percent">{level}%</span>
            </div>
          </div>

          <div className="studio-mic-tester__note-feedback">
            {detectedNote ? (
              <div className="studio-mic-tester__detected">
                <Icon name="music" size={16} />
                <span>
                  {t('studioPlayer.micTest.detectedNote')}: <strong>{detectedNote.note}</strong> ({detectedNote.freq} Hz)
                </span>
              </div>
            ) : (
              <div className="studio-mic-tester__hint">
                <Icon name="helpCircle" size={14} />
                <span>{t('studioPlayer.micTest.playPrompt')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
