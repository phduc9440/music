import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
import { playClick, playPianoNote } from '../../../utils/pianoSynth';
import { loadStudioSettings, saveStudioSettings } from '../../../components/player/studio/studioSettings';
import { DEFAULT_TOLERANCE_WINDOW_MS, FreeRunScorer } from '../../../components/player/engine/FreeRunScorer';
import type { PracticeNoteEvent } from '../../../components/player/engine/FreeRunScorer';
import { WaitModeScorer } from '../../../components/player/engine/WaitModeScorer';
import { StudioMicError, StudioMicInput } from '../../../components/player/engine/StudioMicInput';
import { STUDIO_KEYBOARD_MAP } from '../../../components/player/engine/studioKeyboardMap';
import { connectMidi } from '../../../components/player/engine/webMidiInput';
import type { MidiStatus } from '../../../components/player/engine/webMidiInput';
import { buildStudioSchedule, countInOf } from '../../../components/player/engine/studioSchedule';
import type { StudioSchedule } from '../../../components/player/engine/studioSchedule';
import {
  STUDIO_PIANO_MAX_MIDI,
  STUDIO_PIANO_MIN_MIDI,
  STUDIO_WATERFALL_WINDOW_MS,
  StudioVirtualPiano,
  StudioWaterfall,
} from '../../../components/player/studio/StudioPracticeVisuals';
import type { StudioVisualFeedback } from '../../../components/player/studio/StudioPracticeVisuals';
import { StudioMicTester } from '../../../components/player/studio/StudioMicTester';
import { Icon } from '../../../components/ui';
import Modal from '../../../components/scores/common/Modal';
import MusicXmlViewer from '../../../components/scores/viewer/MusicXmlViewer';
import '../../../components/scores/scores.css';
import './studio-player.css';
import './studio-theme.css';

const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 1500;
const LOOP_LOOKAHEAD_MS = 1200;
/**
 * Chạy tự do: mốc 0 của bài đặt sau lúc bấm bắt đầu đúng bằng chiều cao khung nốt rơi, để nốt đầu tiên rơi từ mép trên
 * xuống rồi mới chạm vạch chơi. Không có đoạn này, nốt đầu nằm sẵn trên vạch lúc 0 và bị chấm "bỏ lỡ" sau 150 ms, cả
 * loạt nốt đầu bài bắn nhãn cùng lúc.
 */
const FREE_RUN_LEAD_IN_MS = STUDIO_WATERFALL_WINDOW_MS;

const COMPUTER_KEYBOARD_DEFAULT_BASE_MIDI = 60;
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
  // Thiết lập lần trước (T41, ST-13); lần đầu: máy có chuột/bàn phím dùng phím máy tính, màn cảm ứng dùng phím trên màn hình
  const [savedSettings] = useState(loadStudioSettings);
  const [mode, setMode] = useState<'FREE_RUN' | 'WAIT'>(savedSettings.mode);
  const [inputSource, setInputSource] = useState<StudioInputSource>(savedSettings.inputSource);
  const [handMode, setHandMode] = useState<StudioHandMode>(savedSettings.handMode);
  const [tempoPercent, setTempoPercent] = useState(savedSettings.tempoPercent);
  useEffect(() => {
    saveStudioSettings({ mode, inputSource, handMode, tempoPercent });
  }, [mode, inputSource, handMode, tempoPercent]);
  const [startMeasure, setStartMeasure] = useState(1);
  const [endMeasure, setEndMeasure] = useState(1);
  const [repeatSection, setRepeatSection] = useState(false);
  const [session, setSession] = useState<StudioSessionResponse | null>(null);
  const [activeSession, setActiveSession] = useState<StudioSessionResponse | null>(null);
  const computerKeyboardBaseRef = useRef(COMPUTER_KEYBOARD_DEFAULT_BASE_MIDI);
  /** Số quãng tám người chơi dời dải phím máy tính bằng Z / X (T39). */
  const [octaveShift, setOctaveShift] = useState(0);
  const handModeRef = useRef<StudioHandMode>(handMode);
  useEffect(() => {
    handModeRef.current = handMode;
  }, [handMode]);
  const [sessionSchedule, setSessionSchedule] = useState<StudioSchedule | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waitVisualElapsedMs, setWaitVisualElapsedMs] = useState(0);
  const [scoreDuration, setScoreDuration] = useState(0);
  const [lastResult, setLastResult] = useState<StudioEventResult | null>(null);
  const [counts, setCounts] = useState(emptyCounts);
  const [busy, setBusy] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(true);
  const [showScoreSheet, setShowScoreSheet] = useState(true);
  const [showSessionScore, setShowSessionScore] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [visualFeedback, setVisualFeedback] = useState<StudioVisualFeedback[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showKeyboardGuide, setShowKeyboardGuide] = useState(false);
  const [showActiveSessionDialog, setShowActiveSessionDialog] = useState(false);
  const [micLatencyMs, setMicLatencyMs] = useState<number | null>(null);
  // ST-14: mô hình nhận âm tải ngay khi chọn Micro (không đợi bấm Bắt đầu); ST-04: biết backend để báo máy chậm
  const [micModel, setMicModel] = useState<{ status: 'ready' | 'error'; backend?: string } | null>(null);
  // ST-07: đàn MIDI nối qua Web MIDI API (BE đã nhận nguồn MIDI)
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewTimeoutRef = useRef<number[]>([]);
  useEffect(() => {
    if (inputSource !== 'MIC' || session) return;
    let alive = true;
    StudioMicInput.preload()
      .then((backend) => alive && setMicModel({ status: 'ready', backend }))
      .catch(() => alive && setMicModel({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [inputSource, session]);

  const sessionRef = useRef<StudioSessionResponse | null>(null);
  const micInputRef = useRef<StudioMicInput | null>(null);
  const micDurationRef = useRef<number | null>(null);
  /** Thời gian đếm nhịp trước nốt đầu khi tập bằng micro; thời điểm micro báo về trừ đi khoảng này (ST-02). */
  const micLeadInRef = useRef(0);
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
        if (!timeline.notes.some((note) => note.hand !== null)) setHandMode('BOTH');
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

  const queueEvents = useCallback((events: readonly PracticeNoteEvent[], feedbackAtMs?: number) => {
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
            atMs: feedbackAtMs ?? event.playedMs ?? elapsedMsRef.current,
            // nốt sai chỉ gắn với nốt chuẩn để báo cáo theo ô; trên màn hình không tô nốt rơi đó thành "sai"
            noteId: event.result === 'WRONG_PITCH' ? null : event.noteId,
            expectedMs: event.expectedMs,
          },
        ];
      });
      return [...recent, ...additions].slice(-80);
    });
  }, []);

  const handleMicUpdate = useCallback(
    (notes: { midi: number; playedMs: number }[], micCoveredUntilMs: number) => {
      const currentSession = sessionRef.current;
      const scorer = scorerRef.current;
      const schedule = scheduleRef.current;
      if (!currentSession || currentSession.inputSource !== 'MIC' || !scorer || !schedule) return;
      // thời gian micro tính từ lúc bật; trừ phần đếm nhịp để khớp mốc 0 của bài, bỏ âm thanh trong lúc đếm (kể cả tiếng gõ)
      const leadIn = micLeadInRef.current;
      const coveredUntilMs = micCoveredUntilMs - leadIn;

      if (currentSession.loopStartMeasure !== null) {
        let cyclesAdded = 0;
        while (
          scheduledCyclesRef.current * schedule.durationMs <= coveredUntilMs + LOOP_LOOKAHEAD_MS &&
          cyclesAdded < 100
        ) {
          const cycleOffset = scheduledCyclesRef.current * schedule.durationMs;
          scorer.scheduleExpectedNotes(
            schedule.notes.map((note) => ({ ...note, expectedMs: note.expectedMs + cycleOffset })),
          );
          scheduledCyclesRef.current += 1;
          cyclesAdded += 1;
        }
      }

      const feedbackAtMs = elapsedMsRef.current;
      for (const note of notes) {
        const playedMs = note.playedMs - leadIn;
        if (playedMs < 0) continue;
        queueEvents(scorer.play({ midi: note.midi, playedMs }), feedbackAtMs);
      }
      const safeCoverageMs = Math.max(0, coveredUntilMs - DEFAULT_TOLERANCE_WINDOW_MS);
      const latestNoteMs = notes.reduce((latest, note) => Math.max(latest, note.playedMs - leadIn), 0);
      const scorerCoverageMs = Math.max(lastScoredAtRef.current, safeCoverageMs, latestNoteMs);
      if (scorerCoverageMs >= lastScoredAtRef.current) {
        queueEvents(scorer.advanceTo(scorerCoverageMs), feedbackAtMs);
        lastScoredAtRef.current = scorerCoverageMs;
      }
    },
    [queueEvents],
  );

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
      let practiceDurationMs = elapsed;
      let coveredUntilMs =
        currentSession.mode === 'WAIT'
          ? 0
          : Math.max(lastScoredAtRef.current, Math.round(requestedCoverage ?? elapsed));
      let finishRequestStarted = false;

      try {
        if (currentSession.inputSource === 'MIC') {
          if (micDurationRef.current === null) {
            const micInput = micInputRef.current;
            if (!micInput) throw new Error('Microphone input is not available');
            micDurationRef.current = Math.max(0, (await micInput.stop()) - micLeadInRef.current);
          }
          practiceDurationMs = micDurationRef.current;
          coveredUntilMs = Math.max(lastScoredAtRef.current, Math.round(practiceDurationMs));
          micInputRef.current = null;
        }
        if (finalizedEventsRef.current === null) {
          const finalEvents = scorer.finish(coveredUntilMs);
          finalizedEventsRef.current = finalEvents.map(toRequestEvent);
          queueEvents(finalEvents);
        }
        await flushEvents();
        finishRequestStarted = true;
        await studioApi.finish(currentSession.sessionId, {
          durationSeconds: Math.min(86400, Math.ceil(practiceDurationMs / 1000)),
          reachedEnd:
            currentSession.inputSource === 'MIC'
              ? reachedEnd || practiceDurationMs >= schedule.durationMs - DEFAULT_TOLERANCE_WINDOW_MS
              : reachedEnd,
          coveredUntilMs,
        });
        await micInputRef.current?.dispose();
        micInputRef.current = null;
        micDurationRef.current = null;
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
        toast.error(
          error instanceof StudioMicError
            ? t(`studioPlayer.errors.mic.${error.code}`)
            : translateError(error, t('studioPlayer.errors.finish')),
        );
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
      // âm trong đoạn dẫn nhập của chạy tự do (nốt đang rơi xuống, chưa tới nốt đầu)
      const elapsed = Math.round(performance.now() - startedAtRef.current);
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

      if (session.inputSource === 'MIC') {
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
        return;
      }

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
      if (!repeatSection && elapsed >= schedule.durationMs + DEFAULT_TOLERANCE_WINDOW_MS) {
        void finishRef.current(true, elapsed);
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [session, repeatSection, queueEvents]);

  const onPlayNote = useCallback(
    // velocity: lực đánh 0–1 (phím ảo tính theo chỗ bấm trên phím, như bàn phím ở trang đăng nhập)
    (midi: number, velocity = 0.8) => {
      const currentSession = sessionRef.current;
      const scorer = currentSession?.mode === 'WAIT' ? waitScorerRef.current : scorerRef.current;
      if (inputLockedRef.current) return;
      const playedMs = sessionRef.current ? Math.round(performance.now() - startedAtRef.current) : 0;
      try {
        // chưa có phiên, hoặc đang đếm ngược trước nốt đầu: chỉ phát tiếng, không chấm
        if (!currentSession || !scorer || playedMs < -DEFAULT_TOLERANCE_WINDOW_MS) {
          // tiếng piano ngân và tắt dần tự nhiên (cùng bộ tiếng với trang đăng nhập): kéo qua nhiều phím nghe liền mạch
          playPianoNote(midi, velocity);
          return;
        }

        const waitScorer = currentSession.mode === 'WAIT' ? waitScorerRef.current : null;
        const currentStep = waitScorer?.getCurrentStep() ?? null;
        const stepTransitionCount = waitScorer?.getStepTransitionCount() ?? 0;
        elapsedMsRef.current = playedMs;
        const playedHand =
          handModeRef.current === 'LEFT_ONLY'
            ? ('LEFT' as const)
            : handModeRef.current === 'RIGHT_ONLY'
              ? ('RIGHT' as const)
              : undefined;
        const events = scorer.play({ midi, playedMs, hand: playedHand });
        playPianoNote(midi, velocity);
        // chế độ chờ: qua bước thì đánh luôn phần đệm của bước đó, nhẹ hơn để không lấn nốt người chơi
        if (waitScorer && currentStep && waitScorer.getStepTransitionCount() > stepTransitionCount) {
          const accompaniment = scheduleRef.current?.accompanimentSteps.find(
            (step) => step.stepIndex === currentStep.stepIndex,
          );
          const extra = new Set((accompaniment?.notes ?? []).map((note) => note.midi));
          extra.delete(midi);
          extra.forEach((note) => playPianoNote(note, 0.55));
        }
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

  // Đàn MIDI: nối ngay khi chọn (chưa có phiên thì chỉ phát tiếng để thử đàn), mỗi note-on đi đường như phím bấm
  useEffect(() => {
    if (inputSource !== 'MIDI') return;
    let disconnect: (() => void) | null = null;
    let alive = true;
    void connectMidi(
      (midi, velocity) => onPlayNote(midi, velocity),
      (status) => alive && setMidiStatus(status),
    ).then((stop) => {
      if (alive) disconnect = stop;
      else stop();
    });
    return () => {
      alive = false;
      disconnect?.();
    };
  }, [inputSource, onPlayNote]);

  useEffect(() => {
    if (!session || inputSource !== 'KEYBOARD' || inputLockedRef.current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [role="dialog"]')) return;
      const key = event.key.toLowerCase();
      // Z / X: dời dải phím máy tính xuống / lên một quãng tám (bài hai tay, nốt ngoài C4–C5)
      if (key === 'z' || key === 'x') {
        event.preventDefault();
        setOctaveShift((shift) => Math.max(-4, Math.min(4, shift + (key === 'z' ? -1 : 1))));
        return;
      }
      const semitone = STUDIO_KEYBOARD_MAP[key];
      if (semitone === undefined) return;
      event.preventDefault();
      onPlayNote(computerKeyboardBaseRef.current + semitone);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, inputSource, onPlayNote]);

  const stopPreview = useCallback(() => {
    previewTimeoutRef.current.forEach((id) => window.clearTimeout(id));
    previewTimeoutRef.current = [];
    setIsPlayingPreview(false);
  }, []);

  const startSession = async () => {
    if (loadState.phase !== 'ready' || !scoreId || busy || session || activeSession) return;
    setBusy(true);
    let micInput: StudioMicInput | null = null;
    let createdSession: StudioSessionResponse | null = null;
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

      if (inputSource === 'MIC') {
        micInput = await StudioMicInput.create(
          handleMicUpdate,
          setMicLatencyMs,
          (error) => {
            toast.error(t(`studioPlayer.errors.mic.${error.code}`));
          },
          // ST-05: độ trễ đo ở hộp thử micro (đọc lại lúc bắt đầu, vì có thể vừa hiệu chỉnh)
          { offsetMs: loadStudioSettings().micOffsetMs },
        );
      }
      const created = await studioApi.create({
        scoreId,
        mode,
        inputSource,
        handMode,
        tempoPercent,
        loopStartMeasure: repeatSection ? selectedStart : null,
        loopEndMeasure: repeatSection ? selectedEnd : null,
      });
      createdSession = created.data;
      scheduleRef.current = schedule;
      scorerRef.current = freeRunScorer;
      waitScorerRef.current = waitScorer;
      pendingEventsRef.current = [];
      finalizedEventsRef.current = null;
      scheduledCyclesRef.current = 1;
      inputLockedRef.current = false;
      finishingRef.current = false;
      const countIn = inputSource === 'MIC' ? countInOf(loadState.timeline, selectedStart, tempoPercent) : null;
      const leadInMs = countIn ? countIn.leadInMs : mode === 'FREE_RUN' ? FREE_RUN_LEAD_IN_MS : 0;
      micLeadInRef.current = countIn ? countIn.leadInMs : 0;
      startedAtRef.current = performance.now() + leadInMs;
      micDurationRef.current = null;
      lastScoredAtRef.current = -leadInMs;
      elapsedMsRef.current = -leadInMs;
      setScoreDuration(schedule.durationMs);
      setSessionSchedule(schedule);
      sessionRef.current = created.data;
      if (micInput) {
        micInputRef.current = micInput;
        startedAtRef.current = (await micInput.start()) + leadInMs;
        if (countIn) {
          for (let beat = 0; beat < countIn.beats; beat += 1) playClick(beat === 0, (beat * countIn.beatMs) / 1000);
        }
      }
      setMicLatencyMs(null);
      // bắt đầu phiên thì dừng nghe thử và trả dải phím máy tính về quãng tự chọn
      stopPreview();
      setOctaveShift(0);
      setSession(created.data);
      setElapsedMs(-leadInMs);
      setWaitVisualElapsedMs(0);
      setCounts({ ...emptyCounts });
      setLastResult(null);
      setVisualFeedback([]);
    } catch (error) {
      if (micInput) {
        try {
          await micInput.dispose();
        } catch (disposeError) {
          toast.error(
            disposeError instanceof StudioMicError
              ? t(`studioPlayer.errors.mic.${disposeError.code}`)
              : translateError(disposeError, t('studioPlayer.errors.mic.audio-start')),
          );
        }
      }
      micInputRef.current = null;
      if (createdSession) {
        try {
          await studioApi.abort(createdSession.sessionId);
        } catch (abortError) {
          toast.error(translateError(abortError, t('studioPlayer.errors.abort')));
        }
        sessionRef.current = null;
        scorerRef.current = null;
        waitScorerRef.current = null;
        scheduleRef.current = null;
        setSessionSchedule(null);
        micDurationRef.current = null;
      }
      if (error instanceof StudioMicError) {
        const key = `studioPlayer.errors.mic.${error.code}`;
        toast.error(t(key));
      } else {
        toast.error(translateError(error, t('studioPlayer.errors.start')));
      }
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
      await micInputRef.current?.dispose();
      micInputRef.current = null;
      micDurationRef.current = null;
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

  useEffect(
    () => () => {
      void micInputRef.current?.dispose();
    },
    [],
  );

  const previewSchedule = useMemo(() => {
    if (loadState.phase !== 'ready') return null;
    return buildStudioSchedule(loadState.timeline, {
      startMeasure: repeatSection ? startMeasure : 1,
      endMeasure: repeatSection ? endMeasure : loadState.timeline.measureCount,
      tempoPercent,
      handMode,
    });
  }, [loadState, repeatSection, startMeasure, endMeasure, tempoPercent, handMode]);

  const playPreview = useCallback(() => {
    if (isPlayingPreview) {
      stopPreview();
      return;
    }
    const schedule = previewSchedule;
    if (!schedule) return;
    setIsPlayingPreview(true);
    schedule.visualNotes.forEach((note) => {
      const id = window.setTimeout(() => {
        playPianoNote(note.midi, 0.7);
      }, note.expectedMs);
      previewTimeoutRef.current.push(id);
    });
    // Tự động stop sau khi bài kết thúc
    const doneId = window.setTimeout(() => {
      setIsPlayingPreview(false);
      previewTimeoutRef.current = [];
    }, schedule.durationMs + 500);
    previewTimeoutRef.current.push(doneId);
  }, [isPlayingPreview, previewSchedule, stopPreview]);

  // Dọn preview khi rời trang (bắt đầu phiên thì startSession tự dừng preview)
  useEffect(() => () => stopPreview(), [stopPreview]);

  // Bàn phím máy tính phủ hai quãng tám quanh nốt giữa phần đang tập; Z / X dời cả dải (T39).
  const autoKeyboardBase = useMemo(() => {
    const midis = ((sessionSchedule ?? previewSchedule)?.notes ?? []).map((note) => note.midi).sort((a, b) => a - b);
    if (midis.length === 0) return COMPUTER_KEYBOARD_DEFAULT_BASE_MIDI;
    return Math.floor(midis[Math.floor(midis.length / 2)] / 12) * 12;
  }, [sessionSchedule, previewSchedule]);
  const computerKeyboardBase = Math.max(24, Math.min(96, autoKeyboardBase + octaveShift * 12));
  useEffect(() => {
    computerKeyboardBaseRef.current = computerKeyboardBase;
  }, [computerKeyboardBase]);
  // Nốt ngoài hai quãng tám đang gán phím cần được báo để người chơi dời dải bằng Z / X.
  const keyboardMissesNotes =
    inputSource === 'KEYBOARD' &&
    (sessionSchedule?.notes ?? []).some(
      (note) => note.midi < computerKeyboardBase - 12 || note.midi > computerKeyboardBase + 12,
    );

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
  // bản không có part 2 khuông (giai điệu, từng bè) thì không có tay trái / phải để chọn (ST-13)
  const hasHands = timeline.notes.some((note) => note.hand !== null);
  // đồng hồ và tiến độ đứng ở 0 trong lúc đếm ngược (thời gian luyện âm)
  const elapsedSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const countdownSeconds = session?.mode === 'FREE_RUN' && elapsedMs < 0 ? Math.ceil(-elapsedMs / 1000) : 0;
  const activeSchedule = sessionSchedule ?? previewSchedule;
  const practiceElapsedMs = session?.mode === 'WAIT' ? waitVisualElapsedMs : elapsedMs;
  // vị trí đang chơi trên bản nhạc: nốt cuối cùng đã tới giờ (nốt rơi chạm vạch) trong lịch đang chạy
  const scorePlayhead = (() => {
    if (!session || !showSessionScore || !activeSchedule || practiceElapsedMs < 0) return null;
    const visual = activeSchedule.visualNotes;
    let low = 0;
    let high = visual.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (visual[mid].expectedMs <= practiceElapsedMs) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (found < 0) return null;
    const current = visual[found];
    const note = timeline.notes.find((item) => item.id === current.noteId);
    const measure = timeline.measures.find((item) => item.index === current.measure);
    if (!note || !measure) return null;
    // nhắc lại đã mở: lượt phát thứ hai của ô 1 vẫn tô ở ô 1 trên bản nhạc
    return { measure: measure.source ?? current.measure, beatOffset: Math.max(0, note.startBeat - measure.startBeat) };
  })();
  const progress =
    session && scoreDuration > 0 && !repeatSection
      ? Math.min(100, Math.max(0, (practiceElapsedMs / scoreDuration) * 100))
      : 0;
  const hasNotesOutsideKeyboard = activeSchedule?.visualNotes.some(
    (note) => note.midi < STUDIO_PIANO_MIN_MIDI || note.midi > STUDIO_PIANO_MAX_MIDI,
  );
  const keyboardNotes = Object.entries(STUDIO_KEYBOARD_MAP)
    .sort((left, right) => left[1] - right[1])
    .map(([key, semitone]) => ({
      key: key.toUpperCase(),
      note: noteName(computerKeyboardBase + semitone),
      hand: semitone < 0 ? 'LEFT' : 'RIGHT',
    }));

  // Bản nhạc xem trước: lúc thiết lập nằm chung cột trái với thẻ thiết lập (cột tự cuộn), lúc đang luyện ở dưới vùng luyện
  const scorePanel = (
    <section
      className={`studio-player__score${!session && !showScoreSheet ? ' is-collapsed' : ''}${session && !showSessionScore ? ' is-hidden' : ''}`}
    >
      <div className="studio-player__section-head">
        <div>
          <h2>{t('studioPlayer.score.title')}</h2>
          <p>{t('studioPlayer.score.subtitle')}</p>
        </div>
        {repeatSection && !session && showScoreSheet && (
          <span className="sc-chip sc-chip--accent">
            {t('studioPlayer.score.measureRange', { start: startMeasure, end: endMeasure })}
          </span>
        )}
        <button
          type="button"
          className="sc-btn sc-btn--sm"
          aria-pressed={session ? showSessionScore : showScoreSheet}
          onClick={() => (session ? setShowSessionScore(false) : setShowScoreSheet((value) => !value))}
        >
          <Icon name="eye" size={16} />
          {session || showScoreSheet ? t('studioPlayer.score.hide') : t('studioPlayer.score.show')}
        </button>
      </div>
      {showScoreSheet && (
        <MusicXmlViewer
          xml={xml}
          firstMeasure={repeatSection ? startMeasure : undefined}
          lastMeasure={repeatSection ? endMeasure : undefined}
          playhead={scorePlayhead}
        />
      )}
    </section>
  );

  return (
    <div
      className={`sc-page studio-player${session ? ' studio-player--fullscreen' : ''}${session && showSessionScore ? ' has-score-panel' : ''}`}
    >
      <main className="sc-container">
        <header className="studio-player__header">
          <Link className="studio-player__back" to={`/scores/${score.id}`}>
            <Icon name="arrowLeft" size={16} />
            <span>{t('studioPlayer.backToScore')}</span>
          </Link>
          {/* tên bài to, thông tin phụ là các thẻ có biểu tượng (không ghép chuỗi bằng dấu chấm giữa) */}
          <div className="studio-player__heading">
            <span className="studio-player__eyebrow">{t('studioPlayer.eyebrow')}</span>
            <h1 className="sc-title-clamp" title={score.title}>
              {score.title}
            </h1>
            <ul className="studio-player__facts">
              <li>
                <Icon name="user" size={14} />
                {score.composer || t('studioPlayer.unknownComposer')}
              </li>
              <li>
                <Icon name="layers" size={14} />
                {timeline.measureCount} {t('studioPlayer.measures')}
              </li>
            </ul>
          </div>
          <Link className="sc-btn" to="/practice-history">
            <Icon name="clock" size={16} />
            {t('studioReport.history.open')}
          </Link>
        </header>

        {/* lúc thiết lập, hai tùy chọn hiển thị nằm trong thẻ Thiết lập (hàng tùy chọn); khối riêng này chỉ hiện khi đang luyện */}
        {session && (
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
        )}

        {!session ? (
          <div className="studio-player__side">
            <section className="studio-player__setup">
              <div className="studio-player__setup-copy">
                <h2>{t('studioPlayer.setup.title')}</h2>
                <p>{t('studioPlayer.setup.description')}</p>
              </div>
              <div className="studio-player__controls">
                {/* chế độ: hai thẻ lớn có biểu tượng và mô tả ngắn thay cho ô chọn */}
                <fieldset className="studio-player__field">
                  <legend>{t('studioPlayer.setup.mode')}</legend>
                  <div className="studio-player__modes">
                    {(
                      [
                        ['FREE_RUN', 'play'],
                        ['WAIT', 'clock'],
                      ] as const
                    ).map(([value, icon]) => {
                      const disabled = value === 'WAIT' && inputSource === 'MIC';
                      return (
                        <label
                          key={value}
                          className={`studio-player__mode-card${mode === value ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                        >
                          <input
                            type="radio"
                            name="studio-mode"
                            value={value}
                            checked={mode === value}
                            disabled={disabled}
                            onChange={() => setMode(value)}
                          />
                          <span className="studio-player__mode-icon" aria-hidden="true">
                            <Icon name={icon} size={18} />
                          </span>
                          <strong>{t(`studioReport.mode.${value}`)}</strong>
                          <small className="studio-player__mode-desc">
                            {t(value === 'WAIT' ? 'studioPlayer.setup.waitHint' : 'studioPlayer.setup.freeRunHint')}
                          </small>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="studio-player__field">
                  <legend>{t('studioPlayer.setup.input')}</legend>
                  <div className="studio-player__segmented studio-player__inputs">
                    {(
                      [
                        ['MIDI', 'sliders', 'studioPlayer.setup.midiKeyboard'],
                        ['KEYBOARD', 'type', 'studioPlayer.setup.computerKeyboard'],
                        ['TOUCH', 'select', 'studioPlayer.setup.touchKeyboard'],
                        ['MIC', 'activity', 'studioPlayer.setup.microphone'],
                      ] as const
                    ).map(([value, icon, label]) => (
                      <label key={value} className={inputSource === value ? 'is-active' : undefined}>
                        <input
                          type="radio"
                          name="studio-input"
                          value={value}
                          checked={inputSource === value}
                          onChange={() => {
                            setInputSource(value);
                            if (value === 'MIC') setMode('FREE_RUN');
                          }}
                        />
                        <Icon name={icon} size={15} />
                        <span>{t(label)}</span>
                      </label>
                    ))}
                  </div>
                  {inputSource === 'MIDI' && (
                    <p className="studio-player__field-hint" role="status">
                      {midiStatus === null
                        ? t('studioPlayer.setup.midi.connecting')
                        : midiStatus.state === 'unsupported'
                          ? t('studioPlayer.setup.midi.unsupported')
                          : midiStatus.state === 'denied'
                            ? t('studioPlayer.setup.midi.denied')
                            : midiStatus.devices.length === 0
                              ? t('studioPlayer.setup.midi.none')
                              : t('studioPlayer.setup.midi.ready', { devices: midiStatus.devices.join(', ') })}
                    </p>
                  )}
                  {inputSource === 'MIC' && (
                    <p className="studio-player__field-hint" role="status">
                      {micModel === null
                        ? t('studioPlayer.setup.micModel.loading')
                        : micModel.status === 'error'
                          ? t('studioPlayer.setup.micModel.error')
                          : micModel.backend === 'cpu'
                            ? t('studioPlayer.setup.micModel.slow')
                            : t('studioPlayer.setup.micModel.ready')}
                    </p>
                  )}
                </fieldset>
                {hasHands && (
                  <fieldset className="studio-player__field">
                    <legend>{t('studioPlayer.setup.hands')}</legend>
                    <div className="studio-player__segmented studio-player__hands">
                      {(
                        [
                          ['LEFT_ONLY', 'is-left', 'studioPlayer.setup.leftHand'],
                          ['BOTH', 'is-both', 'studioPlayer.setup.bothHands'],
                          ['RIGHT_ONLY', 'is-right', 'studioPlayer.setup.rightHand'],
                        ] as const
                      ).map(([value, dot, label]) => (
                        <label key={value} className={handMode === value ? 'is-active' : undefined}>
                          <input
                            type="radio"
                            name="studio-hands"
                            value={value}
                            checked={handMode === value}
                            onChange={() => setHandMode(value)}
                          />
                          <i className={`studio-player__hand-dot ${dot}`} aria-hidden="true" />
                          <span>{t(label)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="studio-player__tempo">
                  <div className="studio-player__tempo-head">
                    <label htmlFor="studio-tempo">{t('studioPlayer.setup.tempo')}</label>
                    <output htmlFor="studio-tempo">
                      {tempoPercent}
                      <small>%</small>
                      {loadState.phase === 'ready' && (
                        <small className="studio-player__tempo-bpm">
                          {' '}
                          {t('studioPlayer.setup.tempoBpm', {
                            bpm: Math.round((loadState.timeline.tempoBpm * tempoPercent) / 100),
                          })}
                        </small>
                      )}
                    </output>
                  </div>
                  <input
                    id="studio-tempo"
                    type="range"
                    min="20"
                    max="200"
                    step="5"
                    value={tempoPercent}
                    style={{ '--fill': `${((tempoPercent - 20) / 180) * 100}%` } as CSSProperties}
                    onChange={(event) => setTempoPercent(Number(event.target.value))}
                  />
                  <div className="studio-player__tempo-presets">
                    {[50, 75, 100, 125].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={tempoPercent === value ? 'is-active' : undefined}
                        aria-pressed={tempoPercent === value}
                        onClick={() => setTempoPercent(value)}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* hàng tùy chọn bật / tắt: lặp đoạn và hai lớp hiển thị, dạng nút viên thuốc */}
              <div className="studio-player__options">
                <label className="studio-player__chip">
                  <input
                    type="checkbox"
                    checked={repeatSection}
                    onChange={(event) => setRepeatSection(event.target.checked)}
                  />
                  <span>{t('studioPlayer.setup.repeatSection')}</span>
                </label>
                <label className="studio-player__chip">
                  <input
                    type="checkbox"
                    checked={showWaterfall}
                    onChange={(event) => setShowWaterfall(event.target.checked)}
                  />
                  <span>{t('studioPlayer.display.waterfall')}</span>
                </label>
                <label className="studio-player__chip">
                  <input
                    type="checkbox"
                    checked={showKeyboard}
                    onChange={(event) => setShowKeyboard(event.target.checked)}
                  />
                  <span>{t('studioPlayer.display.keyboard')}</span>
                </label>
              </div>
              {repeatSection && (
                <div className="studio-player__range">
                  <label>
                    <span>{t('studioPlayer.setup.fromMeasure')}</span>
                    <input
                      className="sc-input"
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
                      className="sc-input"
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
              {/* các ghi chú xếp chồng cùng một ô lưới: ô luôn cao bằng ghi chú dài nhất nên đổi cách nhập không làm khung nhảy */}
              <div className="studio-player__note-slot">
                <p className="studio-player__note" hidden={inputSource !== 'MIC'}>
                  {t('studioPlayer.setup.microphoneHint')}
                </p>
                <p className="studio-player__note" hidden={!(inputSource === 'TOUCH' && !showKeyboard)}>
                  {t('studioPlayer.display.enableKeyboardForTouch')}
                </p>
              </div>
              {inputSource === 'MIC' && <StudioMicTester />}
              {loadState.phase === 'ready' && (
                <button
                  type="button"
                  className="sc-btn studio-player__preview"
                  disabled={busy || Boolean(activeSession)}
                  onClick={playPreview}
                >
                  <Icon name={isPlayingPreview ? 'volumeOff' : 'volume'} size={16} />
                  {isPlayingPreview ? t('studioPlayer.setup.stopPreview') : t('studioPlayer.setup.playPreview')}
                </button>
              )}
              <button
                type="button"
                className="sc-btn sc-btn--primary studio-player__start"
                disabled={busy || Boolean(activeSession) || (inputSource === 'TOUCH' && !showKeyboard)}
                onClick={startSession}
              >
                <Icon name="play" size={18} />
                {activeSession
                  ? t('studioPlayer.recovery.resolveFirst')
                  : busy
                    ? t('studioPlayer.setup.starting')
                    : t('studioPlayer.setup.start')}
              </button>
            </section>
          </div>
        ) : (
          <section className="studio-player__session">
            <div className="studio-player__session-head">
              {/* trạng thái + tên bài + chế độ trên một hàng: viên thuốc "đang luyện" có biểu tượng nhịp, thẻ chế độ có biểu tượng */}
              <div className="studio-player__session-title">
                <span className="studio-player__live">
                  <Icon name="activity" size={14} />
                  {t('studioPlayer.session.live')}
                </span>
                <h2>{score.title}</h2>
                <span className="studio-player__session-mode">
                  <Icon name={session.mode === 'WAIT' ? 'clock' : 'play'} size={13} />
                  {t(`studioReport.mode.${session.mode}`)}
                </span>
              </div>
              <div className="studio-player__timer" aria-live="off">
                <Icon name="clock" size={16} />
                <span>
                  {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:
                  {String(elapsedSeconds % 60).padStart(2, '0')}
                </span>
              </div>
              <div className="studio-player__session-actions">
                <button type="button" className="sc-btn sc-btn--danger" disabled={busy} onClick={abortSession}>
                  <Icon name="x" size={16} />
                  {t('studioPlayer.session.abort')}
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  disabled={busy}
                  onClick={() => void finishSession(false)}
                >
                  <Icon name="check" size={16} />
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
              {/* thanh tiến độ co giãn bằng transform (không animate width) */}
              <span style={{ transform: `scaleX(${progress / 100})` }} />
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
                <button type="button" className="sc-btn sc-btn--sm" onClick={() => setShowKeyboardGuide(true)}>
                  <Icon name="helpCircle" size={15} />
                  {t('studioPlayer.keyboardGuide.open')}
                </button>
                {session && (
                  <button
                    type="button"
                    className="sc-btn sc-btn--sm"
                    aria-pressed={showSessionScore}
                    onClick={() => setShowSessionScore((value) => !value)}
                  >
                    <Icon name="eye" size={16} />
                    {showSessionScore ? t('studioPlayer.score.hide') : t('studioPlayer.score.show')}
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
            {session && inputSource === 'KEYBOARD' && (
              <p className="studio-player__note" role="status">
                {t('studioPlayer.keyboard.computerRange', {
                  from: noteName(computerKeyboardBase - 12),
                  to: noteName(computerKeyboardBase + 12),
                })}
                {keyboardMissesNotes && ` ${t('studioPlayer.keyboard.outOfRange')}`}
              </p>
            )}

            <div
              className={[
                'studio-player__aligned-pitch',
                !showKeyboard ? 'is-waterfall-only' : '',
                !showWaterfall ? 'is-keyboard-only' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {countdownSeconds > 0 && (
                <div className="studio-player__countdown" role="status" aria-live="assertive">
                  <span>{t('studioPlayer.session.getReady')}</span>
                  <strong key={countdownSeconds}>{countdownSeconds}</strong>
                </div>
              )}
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
                  guideNotes={activeSchedule.visualNotes}
                  guideElapsedMs={practiceElapsedMs}
                  guideDurationMs={activeSchedule.durationMs}
                  guideLoop={session ? session.loopStartMeasure !== null : repeatSection}
                  computerKeyboardBase={computerKeyboardBase}
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
                          session.inputSource === 'MIC'
                            ? 'studioPlayer.session.microphonePrompt'
                            : session.mode === 'WAIT'
                              ? 'studioPlayer.session.waitPrompt'
                              : 'studioPlayer.session.playPrompt',
                        )}
                  </strong>
                </div>
                {session.inputSource === 'MIC' && (
                  <p className="studio-player__mic-status" role="status">
                    {t('studioPlayer.session.microphoneStatus', {
                      latency: micLatencyMs === null ? '—' : `${(micLatencyMs / 1000).toFixed(1)}s`,
                    })}
                  </p>
                )}
                <div className="studio-player__counts">
                  {(
                    [
                      ['PERFECT', 'perfect', 'perfect'],
                      ['EARLY', 'early', 'early'],
                      ['LATE', 'late', 'late'],
                      ['WRONG_PITCH', 'wrong-pitch', 'wrongPitch'],
                      ['MISSED', 'missed', 'missed'],
                    ] as const
                  ).map(([result, kind, label]) => (
                    <span className={`studio-player__count is-${kind}`} key={result}>
                      {/* key theo số đếm: mỗi lần tăng, thẻ nảy nhẹ một lần */}
                      <strong key={counts[result]}>{counts[result]}</strong>
                      <span>{t(`studioReport.counts.${label}`)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {scorePanel}
      </main>
      {showKeyboardGuide && (
        <Modal title={t('studioPlayer.keyboardGuide.title')} onClose={() => setShowKeyboardGuide(false)}>
          <div className="studio-player__guide-content">
            <div className="studio-player__guide-section">
              <h3
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  margin: '0 0 0.5rem',
                  fontSize: '1.05rem',
                }}
              >
                <Icon
                  name={inputSource === 'KEYBOARD' ? 'type' : inputSource === 'TOUCH' ? 'select' : 'activity'}
                  size={18}
                />
                <span>
                  {t(
                    `studioPlayer.setup.${inputSource === 'KEYBOARD' ? 'computerKeyboard' : inputSource === 'TOUCH' ? 'touchKeyboard' : 'microphone'}`,
                  )}
                </span>
                <span className="sc-chip sc-chip--accent" style={{ fontSize: '0.75rem' }}>
                  {t('studioPlayer.session.live')}
                </span>
              </h3>
              {inputSource === 'KEYBOARD' && (
                <>
                  <p>{t('studioPlayer.keyboardGuide.keyboardDesc')}</p>
                  <div className="studio-player__computer-key-map">
                    {keyboardNotes.map(({ key, note, hand }) => (
                      <span
                        className={`studio-player__computer-key is-${hand === 'LEFT' ? 'left' : 'right'}-hand`}
                        key={key}
                      >
                        <kbd>{key}</kbd>
                        <span>{note}</span>
                      </span>
                    ))}
                  </div>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--ui-text-2)' }}>
                    💡 <em>{t('studioPlayer.keyboardGuide.stepRange')}</em>
                  </p>
                </>
              )}
              {inputSource === 'TOUCH' && <p>{t('studioPlayer.keyboardGuide.touchDesc')}</p>}
              {inputSource === 'MIC' && <p>{t('studioPlayer.keyboardGuide.micDesc')}</p>}
            </div>

            <div
              className="studio-player__guide-section"
              style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--ui-border)' }}
            >
              <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>{t('studioPlayer.keyboardGuide.handsDesc')}</h4>
              <ol style={{ margin: '0', paddingLeft: '1.25rem' }}>
                <li>{t('studioPlayer.keyboardGuide.stepPlay')}</li>
                <li>{t('studioPlayer.keyboardGuide.stepFeedback')}</li>
              </ol>
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
