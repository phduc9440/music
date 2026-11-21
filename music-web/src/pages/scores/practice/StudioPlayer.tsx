import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { WaitModeScorer } from '../../../components/player/engine/WaitModeScorer';
import { buildStudioSchedule } from '../../../components/player/engine/studioSchedule';
import type { StudioSchedule } from '../../../components/player/engine/studioSchedule';
import {
  STUDIO_PIANO_MAX_MIDI,
  STUDIO_PIANO_MIN_MIDI,
  StudioVirtualPiano,
  StudioWaterfall,
} from '../../../components/player/studio/StudioPracticeVisuals';
import type { StudioVisualFeedback } from '../../../components/player/studio/StudioPracticeVisuals';
import Modal from '../../../components/scores/common/Modal';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import '../../../components/scores/scores.css';
import './studio-player.css';

const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 1500;
const LOOP_LOOKAHEAD_MS = 1200;
const TOLERANCE_WINDOW_MS = 100;
const COMPUTER_KEYBOARD_BASE_MIDI = 60;
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
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const noteName = (midi: number): string => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

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
  const [inputSource, setInputSource] = useState<StudioInputSource>('TOUCH');
  const [handMode, setHandMode] = useState<StudioHandMode>('BOTH');
  const [tempoPercent, setTempoPercent] = useState(100);
  const [startMeasure, setStartMeasure] = useState(1);
  const [endMeasure, setEndMeasure] = useState(1);
  const [repeatSection, setRepeatSection] = useState(false);
  const [session, setSession] = useState<StudioSessionResponse | null>(null);
  const [activeSession, setActiveSession] = useState<StudioSessionResponse | null>(null);
  const [sessionSchedule, setSessionSchedule] = useState<StudioSchedule | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waitVisualElapsedMs, setWaitVisualElapsedMs] = useState(0);
  const [scoreDuration, setScoreDuration] = useState(0);
  const [lastResult, setLastResult] = useState<StudioEventResult | null>(null);
  const [counts, setCounts] = useState(emptyCounts);
  const [busy, setBusy] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [visualFeedback, setVisualFeedback] = useState<StudioVisualFeedback[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showKeyboardGuide, setShowKeyboardGuide] = useState(false);
  const [showActiveSessionDialog, setShowActiveSessionDialog] = useState(false);

  const sessionRef = useRef<StudioSessionResponse | null>(null);
  const scorerRef = useRef<FreeRunScorer | null>(null);
  const waitScorerRef = useRef<WaitModeScorer | null>(null);
  const scheduleRef = useRef<StudioSchedule | null>(null);
  const pendingEventsRef = useRef<StudioNoteEvent[]>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const startedAtRef = useRef(0);
  const lastScoredAtRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const scheduledCyclesRef = useRef(0);
  const finalizedEventsRef = useRef<StudioNoteEvent[] | null>(null);
  const inputLockedRef = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (!scoreId) {
      return;
    }
    let cancelled = false;
    Promise.all([scoreApi.detail(scoreId), fetchMusicXml(scoreId), studioApi.timeline(scoreId), studioApi.active()])
      .then(([scoreResponse, xmlResponse, timelineResponse, activeSessionResponse]) => {
        if (cancelled) return;
        const score = scoreResponse.data.result;
        const timeline = timelineResponse.data;
        const activeSession = activeSessionResponse.status === 204 ? null : activeSessionResponse.data;
        setLoadState({ phase: 'ready', score, xml: xmlResponse, timeline });
        setActiveSession(activeSession);
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

  useEffect(() => {
    if (!session) return;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
    };
  }, [session]);

  const queueEvents = useCallback((events: readonly PracticeNoteEvent[]) => {
    if (events.length === 0) return;
    const mapped = events.map(toRequestEvent);
    pendingEventsRef.current.push(...mapped);
    setCounts((current) => {
      const next = { ...current };
      for (const event of mapped) next[event.result] += 1;
      return next;
    });
    setLastResult(mapped[mapped.length - 1].result);
    setVisualFeedback((current) => {
      const recent = current.filter((event) => event.atMs >= Math.max(0, elapsedMsRef.current - 1200));
      const additions = mapped.flatMap((event) => {
        const midi = event.playedMidi ?? event.expectedMidi;
        if (midi === null) return [];
        return [
          {
            midi,
            result: event.result,
            atMs: event.playedMs ?? elapsedMsRef.current,
            noteId: event.noteId,
            expectedMs: event.expectedMs,
          },
        ];
      });
      return [...recent, ...additions].slice(-80);
    });
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
      const scorer = currentSession?.mode === 'WAIT' ? waitScorerRef.current : scorerRef.current;
      const schedule = scheduleRef.current;
      if (!currentSession || !scorer || !schedule || finishingRef.current) return;
      finishingRef.current = true;
      inputLockedRef.current = true;
      setBusy(true);

      const elapsed = Math.max(0, Math.round(performance.now() - startedAtRef.current));
      const coveredUntilMs =
        currentSession.mode === 'WAIT'
          ? 0
          : Math.max(lastScoredAtRef.current, Math.round(requestedCoverage ?? elapsed));
      let finishRequestStarted = false;

      try {
        if (finalizedEventsRef.current === null) {
          const finalEvents = scorer.finish(coveredUntilMs);
          finalizedEventsRef.current = finalEvents.map(toRequestEvent);
          queueEvents(finalEvents);
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
        waitScorerRef.current = null;
        scheduleRef.current = null;
        setSessionSchedule(null);
        setSession(null);
        navigate(`/studio/sessions/${currentSession.sessionId}/report`);
      } catch (error) {
        if (finishRequestStarted) {
          try {
            await studioApi.report(currentSession.sessionId);
            sessionRef.current = null;
            scorerRef.current = null;
            waitScorerRef.current = null;
            scheduleRef.current = null;
            setSessionSchedule(null);
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
    [flushEvents, navigate, queueEvents],
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
      elapsedMsRef.current = elapsed;
      setElapsedMs(elapsed);

      const schedule = scheduleRef.current;
      if (!schedule || inputLockedRef.current) return;

      if (session.mode === 'WAIT') {
        const waitScorer = waitScorerRef.current;
        if (!waitScorer) return;
        setWaitVisualElapsedMs(waitScorer.getCurrentExpectedMs());
        if (waitScorer.isComplete && !repeatSection) {
          void finishRef.current(true, elapsed);
        }
        return;
      }

      const scorer = scorerRef.current;
      if (!scorer) return;

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
      const currentSession = sessionRef.current;
      const scorer = currentSession?.mode === 'WAIT' ? waitScorerRef.current : scorerRef.current;
      if (inputLockedRef.current) return;
      const playedMs = sessionRef.current ? Math.max(0, Math.round(performance.now() - startedAtRef.current)) : 0;
      try {
        if (!currentSession || !scorer) {
          playTones([{ at: 0, duration: 0.22, midis: [midi] }]);
          return;
        }

        const waitScorer = currentSession.mode === 'WAIT' ? waitScorerRef.current : null;
        const currentStep = waitScorer?.getCurrentStep() ?? null;
        const stepTransitionCount = waitScorer?.getStepTransitionCount() ?? 0;
        elapsedMsRef.current = playedMs;
        const events = scorer.play({ midi, playedMs });
        const playedMidis = [midi];
        if (waitScorer && currentStep && waitScorer.getStepTransitionCount() > stepTransitionCount) {
          const accompaniment = scheduleRef.current?.accompanimentSteps.find(
            (step) => step.stepIndex === currentStep.stepIndex,
          );
          if (accompaniment) playedMidis.push(...accompaniment.notes.map((note) => note.midi));
        }
        playTones([{ at: 0, duration: 0.22, midis: [...new Set(playedMidis)] }]);
        queueEvents(events);
        if (currentSession.mode === 'WAIT') {
          if (!waitScorer) return;
          setWaitVisualElapsedMs(waitScorer.getCurrentExpectedMs());
          if (waitScorer.isComplete && currentSession.loopStartMeasure === null) {
            void finishRef.current(true, playedMs);
          }
        } else {
          lastScoredAtRef.current = playedMs;
        }
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
      onPlayNote(COMPUTER_KEYBOARD_BASE_MIDI + semitone);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, inputSource, onPlayNote]);

  const startSession = async () => {
    if (loadState.phase !== 'ready' || !scoreId || busy || session || activeSession) return;
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

      const freeRunScorer = mode === 'FREE_RUN' ? new FreeRunScorer() : null;
      freeRunScorer?.scheduleExpectedNotes(schedule.notes);
      const waitScorer =
        mode === 'WAIT' ? new WaitModeScorer(schedule.waitSteps, schedule.durationMs, repeatSection) : null;

      const created = await studioApi.create({
        scoreId,
        mode,
        inputSource,
        handMode,
        tempoPercent,
        loopStartMeasure: repeatSection ? selectedStart : null,
        loopEndMeasure: repeatSection ? selectedEnd : null,
      });
      scheduleRef.current = schedule;
      scorerRef.current = freeRunScorer;
      waitScorerRef.current = waitScorer;
      pendingEventsRef.current = [];
      finalizedEventsRef.current = null;
      scheduledCyclesRef.current = 1;
      inputLockedRef.current = false;
      finishingRef.current = false;
      startedAtRef.current = performance.now();
      lastScoredAtRef.current = 0;
      elapsedMsRef.current = 0;
      setScoreDuration(schedule.durationMs);
      setSessionSchedule(schedule);
      sessionRef.current = created.data;
      setSession(created.data);
      setElapsedMs(0);
      setWaitVisualElapsedMs(0);
      setCounts({ ...emptyCounts });
      setLastResult(null);
      setVisualFeedback([]);
    } catch (error) {
      toast.error(translateError(error, t('studioPlayer.errors.start')));
      try {
        const activeResponse = await studioApi.active();
        setActiveSession(activeResponse.status === 204 ? null : activeResponse.data);
      } catch (activeError) {
        toast.error(translateError(activeError, t('studioPlayer.errors.checkActive')));
      }
    } finally {
      setBusy(false);
    }
  };

  const clearActiveSession = async () => {
    if (!activeSession || busy) return;
    setBusy(true);
    try {
      await studioApi.abort(activeSession.sessionId);
      setActiveSession(null);
      setShowActiveSessionDialog(false);
      toast.success(t('studioPlayer.recovery.aborted'));
    } catch (error) {
      toast.error(translateError(error, t('studioPlayer.errors.abort')));
      try {
        const activeResponse = await studioApi.active();
        const currentActiveSession = activeResponse.status === 204 ? null : activeResponse.data;
        setActiveSession(currentActiveSession);
        if (!currentActiveSession) setShowActiveSessionDialog(false);
      } catch (activeError) {
        toast.error(translateError(activeError, t('studioPlayer.errors.checkActive')));
      }
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
      waitScorerRef.current = null;
      scheduleRef.current = null;
      setSessionSchedule(null);
      pendingEventsRef.current = [];
      setSession(null);
      setElapsedMs(0);
      setWaitVisualElapsedMs(0);
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

  const previewSchedule = useMemo(() => {
    if (loadState.phase !== 'ready') return null;
    return buildStudioSchedule(loadState.timeline, {
      startMeasure: repeatSection ? startMeasure : 1,
      endMeasure: repeatSection ? endMeasure : loadState.timeline.measureCount,
      tempoPercent,
      handMode,
    });
  }, [loadState, repeatSection, startMeasure, endMeasure, tempoPercent, handMode]);

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
  const activeSchedule = sessionSchedule ?? previewSchedule;
  const practiceElapsedMs = session?.mode === 'WAIT' ? waitVisualElapsedMs : elapsedMs;
  const progress =
    session && scoreDuration > 0 && !repeatSection ? Math.min(100, (practiceElapsedMs / scoreDuration) * 100) : 0;
  const hasNotesOutsideKeyboard = activeSchedule?.visualNotes.some(
    (note) => note.midi < STUDIO_PIANO_MIN_MIDI || note.midi > STUDIO_PIANO_MAX_MIDI,
  );
  const keyboardNotes = Object.entries(KEYBOARD_MAP)
    .sort((left, right) => left[1] - right[1])
    .map(([key, semitone]) => ({
      key: key.toUpperCase(),
      note: noteName(COMPUTER_KEYBOARD_BASE_MIDI + semitone),
    }));

  return (
    <div className={`sc-page studio-player${session ? ' studio-player--fullscreen' : ''}`}>
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

        <section className="studio-player__display-options" aria-label={t('studioPlayer.display.title')}>
          <strong>{t('studioPlayer.display.title')}</strong>
          <label>
            <input
              type="checkbox"
              checked={showWaterfall}
              onChange={(event) => setShowWaterfall(event.target.checked)}
            />
            <span>{t('studioPlayer.display.waterfall')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showKeyboard}
              disabled={Boolean(session && inputSource === 'TOUCH')}
              onChange={(event) => setShowKeyboard(event.target.checked)}
            />
            <span>{t('studioPlayer.display.keyboard')}</span>
          </label>
        </section>

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
                  <option value="WAIT">{t('studioReport.mode.WAIT')}</option>
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
            {activeSession && (
              <div className="studio-player__active-session-warning" role="alert">
                <p>
                  {t(
                    activeSession.scoreId === scoreId
                      ? 'studioPlayer.recovery.sameScore'
                      : 'studioPlayer.recovery.otherScore',
                  )}
                </p>
                <button
                  type="button"
                  className="sc-btn"
                  disabled={busy}
                  onClick={() => setShowActiveSessionDialog(true)}
                >
                  {t('studioPlayer.recovery.resolve')}
                </button>
              </div>
            )}
            {mode === 'WAIT' && <p className="studio-player__note">{t('studioPlayer.setup.waitHint')}</p>}
            {inputSource === 'TOUCH' && !showKeyboard && (
              <p className="studio-player__note">{t('studioPlayer.display.enableKeyboardForTouch')}</p>
            )}
            <button
              type="button"
              className="sc-btn sc-btn--primary"
              disabled={busy || Boolean(activeSession) || (inputSource === 'TOUCH' && !showKeyboard)}
              onClick={startSession}
            >
              {activeSession
                ? t('studioPlayer.recovery.resolveFirst')
                : busy
                  ? t('studioPlayer.setup.starting')
                  : t('studioPlayer.setup.start')}
            </button>
          </section>
        ) : (
          <section className="studio-player__session">
            <div className="studio-player__session-head">
              <div>
                <span className="studio-player__live">{t('studioPlayer.session.live')}</span>
                <h2>{score.title}</h2>
                <span className="studio-player__session-mode">{t(`studioReport.mode.${session.mode}`)}</span>
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
          </section>
        )}

        {activeSchedule && (session || showWaterfall || showKeyboard) && (
          <section className={`studio-player__practice-board${session ? ' is-fullscreen' : ''}`}>
            <div className="studio-player__practice-heading">
              <div>
                <h2>{t(showWaterfall ? 'studioPlayer.waterfall.title' : 'studioPlayer.keyboard.title')}</h2>
                {showWaterfall && (
                  <p>
                    {t(session?.mode === 'WAIT' ? 'studioPlayer.waterfall.waitHint' : 'studioPlayer.waterfall.hint')}
                  </p>
                )}
              </div>
              <div className="studio-player__practice-controls">
                <span className="studio-player__piano-range">{t('studioPlayer.keyboard.range')}</span>
                {!session && (
                  <button type="button" className="studio-player__help-link" onClick={() => setShowKeyboardGuide(true)}>
                    {t('studioPlayer.keyboardGuide.open')}
                  </button>
                )}
                {showWaterfall && (
                  <div className="studio-player__hand-legend" aria-label={t('studioPlayer.waterfall.legend')}>
                    <span className="is-right-hand">{t('studioPlayer.setup.rightHand')}</span>
                    <span className="is-left-hand">{t('studioPlayer.setup.leftHand')}</span>
                  </div>
                )}
              </div>
            </div>

            {hasNotesOutsideKeyboard && <p className="studio-player__note">{t('studioPlayer.keyboard.rangeHint')}</p>}

            <div
              className={[
                'studio-player__aligned-pitch',
                !showKeyboard ? 'is-waterfall-only' : '',
                !showWaterfall ? 'is-keyboard-only' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {showWaterfall && (
                <StudioWaterfall
                  notes={activeSchedule.visualNotes}
                  elapsedMs={practiceElapsedMs}
                  feedbackElapsedMs={elapsedMs}
                  durationMs={activeSchedule.durationMs}
                  loop={session ? session.loopStartMeasure !== null : repeatSection}
                  feedback={visualFeedback}
                  waitForInput={session?.mode === 'WAIT'}
                />
              )}
              {showKeyboard && (
                <StudioVirtualPiano
                  inputSource={inputSource}
                  active={!busy}
                  busy={busy}
                  elapsedMs={elapsedMs}
                  feedback={visualFeedback}
                  onPlayNote={onPlayNote}
                />
              )}
            </div>

            {session && (
              <div className="studio-player__live-report" role="status" aria-live="polite">
                <div className="studio-player__latest-result">
                  <span>{t('studioPlayer.session.lastResult')}</span>
                  <strong className={lastResult ? `is-${lastResult.toLowerCase().replace('_', '-')}` : ''}>
                    {lastResult
                      ? t(`studioPlayer.results.${lastResult}`)
                      : t(
                          session.mode === 'WAIT'
                            ? 'studioPlayer.session.waitPrompt'
                            : 'studioPlayer.session.playPrompt',
                        )}
                  </strong>
                </div>
                <div className="studio-player__counts">
                  <span className="is-perfect">
                    {t('studioReport.counts.perfect')}: {counts.PERFECT}
                  </span>
                  <span className="is-early">
                    {t('studioReport.counts.early')}: {counts.EARLY}
                  </span>
                  <span className="is-late">
                    {t('studioReport.counts.late')}: {counts.LATE}
                  </span>
                  <span className="is-wrong-pitch">
                    {t('studioReport.counts.wrongPitch')}: {counts.WRONG_PITCH}
                  </span>
                  <span className="is-missed">
                    {t('studioReport.counts.missed')}: {counts.MISSED}
                  </span>
                </div>
              </div>
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
      </main>
      {showKeyboardGuide && (
        <Modal title={t('studioPlayer.keyboardGuide.title')} onClose={() => setShowKeyboardGuide(false)}>
          <div className="studio-player__guide-content">
            <ol>
              <li>{t('studioPlayer.keyboardGuide.stepInput')}</li>
              <li>{t('studioPlayer.keyboardGuide.stepRange')}</li>
              <li>{t('studioPlayer.keyboardGuide.stepPlay')}</li>
              <li>{t('studioPlayer.keyboardGuide.stepFeedback')}</li>
            </ol>
            <p>{t('studioPlayer.keyboardGuide.keyMap')}</p>
            <div className="studio-player__computer-key-map">
              {keyboardNotes.map(({ key, note }) => (
                <span className="studio-player__computer-key" key={key}>
                  <kbd>{key}</kbd>
                  <span>{note}</span>
                </span>
              ))}
            </div>
            <div className="sc-modal__actions">
              <button type="button" className="sc-btn sc-btn--primary" onClick={() => setShowKeyboardGuide(false)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showActiveSessionDialog && activeSession && (
        <Modal
          title={t('studioPlayer.recovery.title')}
          onClose={() => {
            if (!busy) setShowActiveSessionDialog(false);
          }}
        >
          <div className="studio-player__guide-content">
            <p>
              {t(
                activeSession.scoreId === scoreId
                  ? 'studioPlayer.recovery.sameScoreConfirm'
                  : 'studioPlayer.recovery.otherScoreConfirm',
              )}
            </p>
            <p>{t('studioPlayer.recovery.warning')}</p>
            <div className="sc-modal__actions">
              <button
                type="button"
                className="sc-btn"
                disabled={busy}
                onClick={() => setShowActiveSessionDialog(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="sc-btn sc-btn--danger-solid"
                disabled={busy}
                onClick={() => void clearActiveSession()}
              >
                {busy ? t('studioPlayer.recovery.aborting') : t('studioPlayer.recovery.abort')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
