import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { ScoreDetail } from '../../../types';
import type {
  StudioEventResult,
  StudioHandMode,
  StudioInputSource,
  StudioNoteEvent,
  StudioSessionResponse,
  StudioTimeline,
} from '../../../types';
import { fetchMusicXml, scoreApi, studioApi } from '../../../services';
import { t, translateError } from '../../../i18n/core';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { playTones } from '../../../components/editor/audio/previewTone';
import { FreeRunScorer } from '../../../components/player/engine/FreeRunScorer';
import type { PracticeNoteEvent } from '../../../components/player/engine/FreeRunScorer';
import { buildStudioSchedule } from '../../../components/player/engine/studioSchedule';
import type { StudioSchedule } from '../../../components/player/engine/studioSchedule';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import '../../../components/scores/scores.css';
import './studio-player.css';

const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 1500;
const LOOP_LOOKAHEAD_MS = 1200;
const TOLERANCE_WINDOW_MS = 100;
const MIDI_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const KEYBOARD_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; score: ScoreDetail; xml: string; timeline: StudioTimeline }
  | { phase: 'error' };

const emptyCounts: Record<StudioEventResult, number> = {
  PERFECT: 0,
  EARLY: 0,
  LATE: 0,
  WRONG_PITCH: 0,
  MISSED: 0,
};

const noteName = (midi: number): string => `${MIDI_NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;

const toRequestEvent = (event: PracticeNoteEvent): StudioNoteEvent => ({
  ...event,
  measure: event.measure,
  hand: event.hand,
});

export default function StudioPlayer() {
  const { scoreId } = useParams<{ scoreId: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'loading' });
  const [mode, setMode] = useState<'FREE_RUN' | 'WAIT'>('FREE_RUN');
  const [inputSource, setInputSource] = useState<StudioInputSource>('KEYBOARD');
  const [handMode, setHandMode] = useState<StudioHandMode>('BOTH');
  const [tempoPercent, setTempoPercent] = useState(100);
  const [startMeasure, setStartMeasure] = useState(1);
  const [endMeasure, setEndMeasure] = useState(1);
  const [repeatSection, setRepeatSection] = useState(false);
  const [session, setSession] = useState<StudioSessionResponse | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scoreDuration, setScoreDuration] = useState(0);
  const [lastResult, setLastResult] = useState<StudioEventResult | null>(null);
  const [counts, setCounts] = useState(emptyCounts);
  const [recentEvents, setRecentEvents] = useState<StudioEventResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [octave, setOctave] = useState(4);
  const [loadError, setLoadError] = useState(false);

  const sessionRef = useRef<StudioSessionResponse | null>(null);
  const scorerRef = useRef<FreeRunScorer | null>(null);
  const scheduleRef = useRef<StudioSchedule | null>(null);
  const pendingEventsRef = useRef<StudioNoteEvent[]>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const startedAtRef = useRef(0);
  const lastScoredAtRef = useRef(0);
  const scheduledCyclesRef = useRef(0);
  const finalizedEventsRef = useRef<StudioNoteEvent[] | null>(null);
  const inputLockedRef = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (!scoreId) {
      return;
    }
    let cancelled = false;
    Promise.all([scoreApi.detail(scoreId), fetchMusicXml(scoreId), studioApi.timeline(scoreId)])
      .then(([scoreResponse, xmlResponse, timelineResponse]) => {
        if (cancelled) return;
        const score = scoreResponse.data.result;
        const timeline = timelineResponse.data;
        setLoadState({ phase: 'ready', score, xml: xmlResponse, timeline });
        setEndMeasure(timeline.measureCount);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoadState({ phase: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  const queueEvents = useCallback((events: readonly PracticeNoteEvent[]) => {
    if (events.length === 0) return;
    const mapped = events.map(toRequestEvent);
    pendingEventsRef.current.push(...mapped);
    setCounts((current) => {
      const next = { ...current };
      for (const event of mapped) next[event.result] += 1;
      return next;
    });
    setRecentEvents((current) => [...mapped.map((event) => event.result).reverse(), ...current].slice(0, 8));
    setLastResult(mapped[mapped.length - 1].result);
  }, []);

  const flushEvents = useCallback(async () => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    const flush = async () => {
      while (pendingEventsRef.current.length > 0) {
        const batch = pendingEventsRef.current.slice(0, BATCH_SIZE);
        await studioApi.events(currentSession.sessionId, batch);
        pendingEventsRef.current.splice(0, batch.length);
      }
    };
    const pending = flush();
    flushPromiseRef.current = pending;
    try {
      await pending;
    } finally {
      flushPromiseRef.current = null;
    }
  }, []);

  const finishSession = useCallback(
    async (reachedEnd: boolean, requestedCoverage?: number) => {
      const currentSession = sessionRef.current;
      const scorer = scorerRef.current;
      const schedule = scheduleRef.current;
      if (!currentSession || !scorer || !schedule || finishingRef.current) return;
      finishingRef.current = true;
      inputLockedRef.current = true;
      setBusy(true);

      const elapsed = Math.max(0, Math.round(performance.now() - startedAtRef.current));
      const coveredUntilMs = Math.max(lastScoredAtRef.current, Math.round(requestedCoverage ?? elapsed));
      let finishRequestStarted = false;

      try {
        if (finalizedEventsRef.current === null) {
          finalizedEventsRef.current = scorer.finish(coveredUntilMs).map(toRequestEvent);
          pendingEventsRef.current.push(...finalizedEventsRef.current);
          setCounts((current) => {
            const next = { ...current };
            for (const event of finalizedEventsRef.current ?? []) next[event.result] += 1;
            return next;
          });
          setRecentEvents((current) =>
            [...(finalizedEventsRef.current ?? []).map((event) => event.result).reverse(), ...current].slice(0, 8),
          );
          if (finalizedEventsRef.current.length > 0) {
            setLastResult(finalizedEventsRef.current[finalizedEventsRef.current.length - 1].result);
          }
        }
        await flushEvents();
        finishRequestStarted = true;
        await studioApi.finish(currentSession.sessionId, {
          durationSeconds: Math.min(86400, Math.ceil(elapsed / 1000)),
          reachedEnd,
          coveredUntilMs,
        });
        sessionRef.current = null;
        scorerRef.current = null;
        scheduleRef.current = null;
        setSession(null);
        navigate(`/studio/sessions/${currentSession.sessionId}/report`);
      } catch (error) {
        if (finishRequestStarted) {
          try {
            await studioApi.report(currentSession.sessionId);
            sessionRef.current = null;
            scorerRef.current = null;
            scheduleRef.current = null;
            setSession(null);
            navigate(`/studio/sessions/${currentSession.sessionId}/report`);
            return;
          } catch {
            // The finish may still be active; keep the original error visible and allow another attempt.
          }
        }
        toast.error(translateError(error, t('studioPlayer.errors.finish')));
        finishingRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [flushEvents, navigate],
  );

  const finishRef = useRef(finishSession);
  useEffect(() => {
    finishRef.current = finishSession;
  }, [finishSession]);

  useEffect(() => {
    if (!session) return;
    const flushTimer = window.setInterval(() => {
      void flushEvents().catch((error: unknown) =>
        toast.error(translateError(error, t('studioPlayer.errors.saveEvents'))),
      );
    }, FLUSH_INTERVAL_MS);
    return () => window.clearInterval(flushTimer);
  }, [session, flushEvents]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, Math.round(performance.now() - startedAtRef.current));
      setElapsedMs(elapsed);

      const scorer = scorerRef.current;
      const schedule = scheduleRef.current;
      if (!scorer || !schedule || inputLockedRef.current) return;

      if (repeatSection) {
        let cyclesAdded = 0;
        while (scheduledCyclesRef.current * schedule.durationMs <= elapsed + LOOP_LOOKAHEAD_MS && cyclesAdded < 100) {
          const cycleOffset = scheduledCyclesRef.current * schedule.durationMs;
          scorer.scheduleExpectedNotes(
            schedule.notes.map((note) => ({ ...note, expectedMs: note.expectedMs + cycleOffset })),
          );
          scheduledCyclesRef.current += 1;
          cyclesAdded += 1;
        }
      }

      queueEvents(scorer.advanceTo(elapsed));
      lastScoredAtRef.current = elapsed;
      if (!repeatSection && elapsed >= schedule.durationMs + TOLERANCE_WINDOW_MS) {
        void finishRef.current(true, elapsed);
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [session, repeatSection, queueEvents]);

  const onPlayNote = useCallback(
    (midi: number) => {
      const scorer = scorerRef.current;
      if (!sessionRef.current || !scorer || inputLockedRef.current) return;
      const playedMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
      try {
        playTones([{ at: 0, duration: 0.22, midis: [midi] }]);
        queueEvents(scorer.play({ midi, playedMs }));
        lastScoredAtRef.current = playedMs;
      } catch (error) {
        toast.error(translateError(error, t('studioPlayer.errors.input')));
      }
    },
    [queueEvents],
  );

  useEffect(() => {
    if (!session || inputSource !== 'KEYBOARD' || inputLockedRef.current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [role="dialog"]')) return;
      const semitone = KEYBOARD_MAP[event.key.toLowerCase()];
      if (semitone === undefined) return;
      event.preventDefault();
      onPlayNote((octave + 1) * 12 + semitone);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, inputSource, octave, onPlayNote]);

  const startSession = async () => {
    if (loadState.phase !== 'ready' || !scoreId || busy || session) return;
    setBusy(true);
    try {
      const selectedStart = repeatSection ? startMeasure : 1;
      const selectedEnd = repeatSection ? endMeasure : loadState.timeline.measureCount;
      const schedule = buildStudioSchedule(loadState.timeline, {
        startMeasure: selectedStart,
        endMeasure: selectedEnd,
        tempoPercent,
        handMode,
      });
      if (schedule.notes.length === 0) {
        toast.error(t('studioPlayer.errors.noNotes'));
        return;
      }

      const created = await studioApi.create({
        scoreId,
        mode: 'FREE_RUN',
        inputSource,
        handMode,
        tempoPercent,
        loopStartMeasure: repeatSection ? selectedStart : null,
        loopEndMeasure: repeatSection ? selectedEnd : null,
      });
      const scorer = new FreeRunScorer();
      scorer.scheduleExpectedNotes(schedule.notes);
      scheduleRef.current = schedule;
      scorerRef.current = scorer;
      pendingEventsRef.current = [];
      finalizedEventsRef.current = null;
      scheduledCyclesRef.current = 1;
      inputLockedRef.current = false;
      finishingRef.current = false;
      startedAtRef.current = performance.now();
      lastScoredAtRef.current = 0;
      setScoreDuration(schedule.durationMs);
      sessionRef.current = created.data;
      setSession(created.data);
      setElapsedMs(0);
      setCounts({ ...emptyCounts });
      setRecentEvents([]);
      setLastResult(null);
    } catch (error) {
      toast.error(translateError(error, t('studioPlayer.errors.start')));
    } finally {
      setBusy(false);
    }
  };

  const abortSession = async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || busy) return;
    inputLockedRef.current = true;
    setBusy(true);
    try {
      await flushEvents();
      await studioApi.abort(currentSession.sessionId);
      sessionRef.current = null;
      scorerRef.current = null;
      scheduleRef.current = null;
      pendingEventsRef.current = [];
      setSession(null);
      setElapsedMs(0);
      setScoreDuration(0);
    } catch (error) {
      toast.error(translateError(error, t('studioPlayer.errors.abort')));
    } finally {
      if (sessionRef.current) inputLockedRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [session]);

  if (loadState.phase === 'loading') {
    return (
      <div className="sc-page">
        <main className="sc-container sc-container--form" aria-busy="true">
          <div className="sc-skeleton sc-skeleton--hero" />
        </main>
      </div>
    );
  }

  if (!scoreId || loadState.phase === 'error') {
    return (
      <div className="sc-page">
        <main className="sc-container sc-container--form">
          <section className="sc-empty" role="alert">
            <h1>{t(loadError ? 'studioPlayer.errors.load' : 'studioPlayer.errors.invalidScore')}</h1>
            <Link className="sc-btn sc-btn--primary" to={scoreId ? `/scores/${scoreId}` : '/scores'}>
              {t('studioPlayer.backToScore')}
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const { score, xml, timeline } = loadState;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const progress =
    session && scoreDuration > 0 && !repeatSection ? Math.min(100, (elapsedMs / scoreDuration) * 100) : 0;
  const baseMidi = (octave + 1) * 12;

  return (
    <div className="sc-page studio-player">
      <main className="sc-container">
        <header className="studio-player__header">
          <div>
            <Link className="studio-player__back" to={`/scores/${score.id}`}>
              ← {t('studioPlayer.backToScore')}
            </Link>
            <p className="studio-player__eyebrow">{t('studioPlayer.eyebrow')}</p>
            <h1>{score.title}</h1>
            <p className="studio-player__meta">
              {score.composer || t('studioPlayer.unknownComposer')} · {timeline.measureCount}{' '}
              {t('studioPlayer.measures')}
            </p>
          </div>
          <Link className="sc-btn" to="/studio/history">
            {t('studioReport.history.open')}
          </Link>
        </header>

        {!session ? (
          <section className="studio-player__setup">
            <div className="studio-player__setup-copy">
              <h2>{t('studioPlayer.setup.title')}</h2>
              <p>{t('studioPlayer.setup.description')}</p>
            </div>
            <div className="studio-player__controls">
              <label>
                <span>{t('studioPlayer.setup.mode')}</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as 'FREE_RUN' | 'WAIT')}>
                  <option value="FREE_RUN">{t('studioReport.mode.FREE_RUN')}</option>
                  <option value="WAIT" disabled>
                    {t('studioReport.mode.WAIT')} — {t('studioPlayer.setup.waitUnavailable')}
                  </option>
                </select>
              </label>
              <label>
                <span>{t('studioPlayer.setup.input')}</span>
                <select
                  value={inputSource}
                  onChange={(event) => setInputSource(event.target.value as StudioInputSource)}
                >
                  <option value="KEYBOARD">{t('studioPlayer.setup.computerKeyboard')}</option>
                  <option value="TOUCH">{t('studioPlayer.setup.touchKeyboard')}</option>
                </select>
              </label>
              <label>
                <span>{t('studioPlayer.setup.hands')}</span>
                <select value={handMode} onChange={(event) => setHandMode(event.target.value as StudioHandMode)}>
                  <option value="BOTH">{t('studioPlayer.setup.bothHands')}</option>
                  <option value="RIGHT_ONLY">{t('studioPlayer.setup.rightHand')}</option>
                  <option value="LEFT_ONLY">{t('studioPlayer.setup.leftHand')}</option>
                </select>
              </label>
              <label className="studio-player__tempo">
                <span>
                  {t('studioPlayer.setup.tempo')}: <strong>{tempoPercent}%</strong>
                </span>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="5"
                  value={tempoPercent}
                  onChange={(event) => setTempoPercent(Number(event.target.value))}
                />
              </label>
              <label className="studio-player__repeat">
                <input
                  type="checkbox"
                  checked={repeatSection}
                  onChange={(event) => setRepeatSection(event.target.checked)}
                />
                <span>{t('studioPlayer.setup.repeatSection')}</span>
              </label>
              {repeatSection && (
                <div className="studio-player__range">
                  <label>
                    <span>{t('studioPlayer.setup.fromMeasure')}</span>
                    <input
                      type="number"
                      min="1"
                      max={timeline.measureCount}
                      value={startMeasure}
                      onChange={(event) => {
                        const nextStart = Math.min(timeline.measureCount, Math.max(1, Number(event.target.value)));
                        setStartMeasure(nextStart);
                        setEndMeasure((current) => Math.max(current, nextStart));
                      }}
                    />
                  </label>
                  <label>
                    <span>{t('studioPlayer.setup.toMeasure')}</span>
                    <input
                      type="number"
                      min={startMeasure}
                      max={timeline.measureCount}
                      value={endMeasure}
                      onChange={(event) =>
                        setEndMeasure(
                          Math.min(timeline.measureCount, Math.max(startMeasure, Number(event.target.value))),
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </div>
            {mode === 'WAIT' && <p className="studio-player__note">{t('studioPlayer.setup.waitUnavailable')}</p>}
            <button type="button" className="sc-btn sc-btn--primary" disabled={busy} onClick={startSession}>
              {busy ? t('studioPlayer.setup.starting') : t('studioPlayer.setup.start')}
            </button>
          </section>
        ) : (
          <section className="studio-player__session">
            <div className="studio-player__session-head">
              <div>
                <span className="studio-player__live">{t('studioPlayer.session.live')}</span>
                <h2>{t('studioPlayer.session.freeRun')}</h2>
              </div>
              <div className="studio-player__timer" aria-live="off">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:
                {String(elapsedSeconds % 60).padStart(2, '0')}
              </div>
              <div className="studio-player__session-actions">
                <button type="button" className="sc-btn sc-btn--danger" disabled={busy} onClick={abortSession}>
                  {t('studioPlayer.session.abort')}
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  disabled={busy}
                  onClick={() => void finishSession(false)}
                >
                  {busy ? t('studioPlayer.session.saving') : t('studioPlayer.session.finish')}
                </button>
              </div>
            </div>
            <div
              className="studio-player__progress"
              role="progressbar"
              aria-label={t('studioPlayer.session.progress')}
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="studio-player__feedback">
              <div>
                <span>{t('studioPlayer.session.lastResult')}</span>
                <strong className={lastResult ? `is-${lastResult.toLowerCase().replace('_', '-')}` : ''}>
                  {lastResult ? t(`studioPlayer.results.${lastResult}`) : t('studioPlayer.session.playPrompt')}
                </strong>
              </div>
              <div className="studio-player__counts">
                <span>
                  {t('studioReport.counts.perfect')}: {counts.PERFECT}
                </span>
                <span>
                  {t('studioReport.counts.early')}: {counts.EARLY}
                </span>
                <span>
                  {t('studioReport.counts.late')}: {counts.LATE}
                </span>
                <span>
                  {t('studioReport.counts.wrongPitch')}: {counts.WRONG_PITCH}
                </span>
                <span>
                  {t('studioReport.counts.missed')}: {counts.MISSED}
                </span>
              </div>
            </div>
            <div className="studio-player__recent" aria-live="polite">
              {recentEvents.map((result, index) => (
                <span
                  className={`studio-player__result is-${result.toLowerCase().replace('_', '-')}`}
                  key={`${result}-${index}`}
                >
                  {t(`studioPlayer.results.${result}`)}
                </span>
              ))}
            </div>
            {inputSource === 'KEYBOARD' && (
              <p className="studio-player__hint">{t('studioPlayer.session.keyboardHint')}</p>
            )}
          </section>
        )}

        <section className="studio-player__score">
          <div className="studio-player__section-head">
            <div>
              <h2>{t('studioPlayer.score.title')}</h2>
              <p>{t('studioPlayer.score.subtitle')}</p>
            </div>
            {repeatSection && !session && (
              <span className="sc-chip sc-chip--accent">
                {t('studioPlayer.score.measureRange', { start: startMeasure, end: endMeasure })}
              </span>
            )}
          </div>
          <MusicXmlViewer
            xml={xml}
            firstMeasure={repeatSection ? startMeasure : undefined}
            lastMeasure={repeatSection ? endMeasure : undefined}
          />
        </section>

        <section className="studio-player__keyboard" aria-label={t('studioPlayer.keyboard.label')}>
          <div className="studio-player__keyboard-head">
            <div>
              <h2>{t('studioPlayer.keyboard.title')}</h2>
              <p>{t('studioPlayer.keyboard.hint')}</p>
            </div>
            <label>
              <span>{t('studioPlayer.keyboard.octave')}</span>
              <select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>
                {[2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    C{value}–B{value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="studio-player__keys">
            {MIDI_NOTES.map((name, semitone) => {
              const isBlack = name.includes('♯');
              return (
                <button
                  type="button"
                  key={name}
                  className={`studio-player__key${isBlack ? ' is-black' : ''}`}
                  disabled={!session || busy}
                  aria-label={noteName(baseMidi + semitone)}
                  onClick={() => onPlayNote(baseMidi + semitone)}
                >
                  <span>{name}</span>
                  {!isBlack && inputSource === 'KEYBOARD' && (
                    <kbd>{Object.keys(KEYBOARD_MAP).find((key) => KEYBOARD_MAP[key] === semitone) ?? ''}</kbd>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
