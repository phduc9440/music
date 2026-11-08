/**
 * Hook của Player: nối `PlayerEngine` với React. Dựng dòng thời gian từ `doc`, tải mẫu âm piano, theo dõi trạng thái,
 * ô nhịp đang phát và các nốt đang vang (chỉ cập nhật state khi giá trị đổi, không cập nhật mỗi khung hình), kèm phím
 * tắt cho trang /play. Vị trí chi tiết theo từng khung hình do {@link useEnginePosition} đọc riêng để cả trang không
 * phải vẽ lại liên tục.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { detectInstrument, partLabel } from '../editor/instruments';
import { readStartingKey } from '../editor/transpose';
import type { KeySignature } from '../editor/transpose';
import type { InstrumentId } from '../editor/instruments';
import { stopAllTones, getSharedAudioContext } from '../editor/previewTone';
import type { ScoreDocument } from '../editor/ScoreDocument';
import { PlayerEngine } from './PlayerEngine';
import type { EngineStatus } from './PlayerEngine';
import { getPianoSampler } from './sampler';
import type { SamplerSnapshot } from './sampler';
import { isLoopComplete, loopSegments, NO_LOOP } from './loop';
import type { LoopSegment, LoopSettings } from './loop';
import { EMPTY_MIXER, silentTracks } from './mixer';
import type { MixerState, TrackMix } from './mixer';
import { loadPlayerSettings, loadScoreSettings, saveScoreSettings } from './settings';
import { trackOfNoteId } from './highlight';
import { activeNoteIds, buildTimeline, firstOrderOfMeasure, measureOrderAt } from './timeline';
import { countOutOfRange } from './transposeRange';
import type { Timeline } from './timeline';

/** Nhạc cụ của một part để hiện trong menu "Nhạc cụ". */
export interface PartInstrument {
  index: number;
  label: string;
  instrument: InstrumentId;
  /** true nếu người dùng đã chọn tay (false = tự nhận diện từ file). */
  custom: boolean;
}

export interface UsePlayerOptions {
  /** Id bản nhạc, dùng làm khóa lưu cài đặt (tempo...) trong localStorage; bỏ trống thì không lưu. */
  scoreId?: string | number | null;
  /** false thì chưa dựng dòng thời gian / chưa tải mẫu âm (Editor khi thanh Player đang ẩn). */
  enabled?: boolean;
  /** Tempo của bản nhạc khi file không khai báo. */
  fallbackBpm: number | null | undefined;
  /** Tăng sau mỗi lần sửa `doc` để dựng lại dòng thời gian. */
  revision?: number;
  /** Bật phím tắt Space, ←/→, Home (chỉ trang /play; trong Editor Space đã dùng cho nhập lời/hợp âm). */
  shortcuts?: boolean;
  /** Có thì gọi một lần khi lần phát đầu tiên bắt đầu (ghi lượt xem). */
  onFirstPlay?: () => void;
}

export interface PlayerApi {
  /** false nếu trình duyệt không có Web Audio. */
  supported: boolean;
  engine: PlayerEngine | null;
  timeline: Timeline | null;
  status: EngineStatus;
  sampler: SamplerSnapshot;
  /** Id các nốt đang vang. */
  activeIds: ReadonlySet<string>;
  /** Ô nhịp (từ 0) cần giữ trong khung nhìn khi phát; null khi đang dừng ở đầu bài. */
  followMeasure: number | null;
  /** Bản nhạc không có nốt nào để phát. */
  empty: boolean;
  /** Bấm Play được: có nốt và mẫu âm không còn đang tải. */
  canPlay: boolean;
  /** Tempo hiện tại (% so với tempo gốc, 20–200). */
  tempoPercent: number;
  /** Đổi tempo; có hiệu lực ngay cả khi đang phát và được nhớ theo từng bản nhạc. */
  setTempoPercent: (percent: number) => void;
  /** Mute / Solo / âm lượng theo track (chỉ gồm track khác mặc định). */
  mixer: MixerState;
  /** Id các track không phát ra tiếng, để làm mờ khuông tương ứng trên bản nhạc. */
  mutedStaves: ReadonlySet<string>;
  /** Đổi Mute / Solo / âm lượng của một track; có hiệu lực ngay và được nhớ theo từng bản nhạc. */
  setTrackMix: (trackId: string, patch: Partial<TrackMix>) => void;
  /** Đưa mọi track về mặc định. */
  resetMixer: () => void;
  /** Đoạn lặp A-B (chỉ số ô từ 0; A ≤ B khi đã đặt đủ). */
  loop: LoopSettings;
  /** Các đoạn A-B trong lượt phát (hiển thị trên thanh thời gian); rỗng nếu chưa đặt đủ A và B. */
  loopSegments: readonly LoopSegment[];
  /** Đổi A, B hoặc bật/tắt lặp; hoàn tất đoạn (đủ A và B) thì tự bật lặp. */
  setLoop: (patch: Partial<LoopSettings>) => void;
  /** Đặt A hoặc B tại ô đang phát. */
  markLoop: (which: 'a' | 'b') => void;
  /** Chọn đoạn bằng các lần bấm liên tiếp: lần 1 đặt A, lần 2 đặt B, lần 3 bắt đầu đoạn mới. */
  pickLoopMeasure: (measureIndex: number) => void;
  /** Xóa A và B, tắt lặp. */
  clearLoop: () => void;
  /** Số nửa cung đang chuyển giọng khi nghe (−12…+12). */
  transpose: number;
  /** Chuyển giọng khi nghe; có hiệu lực ngay khi đang phát và được nhớ theo từng bản nhạc. */
  setTranspose: (semitones: number) => void;
  /** Số nốt vượt âm vực piano sau khi chuyển giọng (bị bỏ khi phát). */
  outOfRange: number;
  /** Khóa nhạc đầu bài (để hiện tên giọng gốc và giọng mới). */
  startKey: KeySignature;
  /** Ô không ghi hợp âm có đánh lại hợp âm đang hiệu lực không (mặc định có). */
  chordCarry: boolean;
  /** Bật/tắt việc đánh lại hợp âm ở ô không ghi ký hiệu hợp âm; có hiệu lực ngay và được nhớ theo từng bản nhạc. */
  setChordCarry: (on: boolean) => void;
  /** Phát hoặc tạm dừng. */
  toggle: () => void;
  /** Phát; đang dừng ở đầu bài và có `ids` thì phát từ nốt đầu của vùng chọn. */
  playFrom: (ids: ReadonlySet<string>) => void;
  stop: () => void;
  /** Sang ô sau (+1) hoặc ô trước (-1); lùi khi đã qua đầu ô hơn 1 giây thì về đầu ô hiện tại. */
  step: (delta: number) => void;
  /** Nhảy tới lần phát đầu tiên của ô nhịp `index` (từ 0). */
  seekToMeasure: (index: number) => void;
  retrySamples: () => void;
  parts: PartInstrument[];
  setInstrument: (partIndex: number, instrument: InstrumentId | null) => void;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};

/** Vị trí (giây) của engine, cập nhật theo từng khung hình khi đang phát. Dùng trong thanh Player. */
export function useEnginePosition(engine: PlayerEngine): number {
  const [position, setPosition] = useState(() => engine.position());
  useEffect(() => {
    let frame = 0;
    let last = -1;
    const sync = () => {
      const now = engine.position();
      if (now !== last) {
        last = now;
        setPosition(now);
      }
    };
    const loop = () => {
      sync();
      if (engine.getStatus() === 'playing') frame = requestAnimationFrame(loop);
    };
    const unsubscribe = engine.subscribe(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    });
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [engine]);
  return position;
}

export function usePlayer(doc: ScoreDocument, options: UsePlayerOptions): PlayerApi {
  const { scoreId, enabled = true, fallbackBpm, revision = 0, shortcuts = false, onFirstPlay } = options;
  const firstPlayRef = useRef(onFirstPlay);
  useEffect(() => {
    firstPlayRef.current = onFirstPlay;
  });
  const sampler = getPianoSampler();
  const [engine] = useState(() => {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;
    const saved = loadScoreSettings(scoreId);
    return new PlayerEngine({
      ctx,
      sampler,
      tempoPercent: saved.tempoPercent,
      mixer: saved.mixer,
      loop: saved.loop,
      transpose: saved.transpose,
      chordCarry: saved.chordCarry,
    });
  });
  const samplerSnapshot = useSyncExternalStore(sampler.subscribe, sampler.getSnapshot);
  const subscribe = useCallback(
    (listener: () => void) => (engine ? engine.subscribe(listener) : () => undefined),
    [engine],
  );
  const status = useSyncExternalStore(subscribe, () => engine?.getStatus() ?? 'stopped');
  const tempoPercent = useSyncExternalStore(subscribe, () => engine?.getTempoPercent() ?? 100);
  const mixer = useSyncExternalStore(subscribe, () => engine?.getMixer() ?? EMPTY_MIXER);
  const loop = useSyncExternalStore(subscribe, () => engine?.getLoop() ?? NO_LOOP);
  const transpose = useSyncExternalStore(subscribe, () => engine?.getTranspose() ?? 0);
  const chordCarry = useSyncExternalStore(subscribe, () => engine?.getChordCarry() ?? true);

  const [overrides, setOverrides] = useState<Record<number, InstrumentId>>({});
  const instrumentRef = useRef<(part: number) => InstrumentId>(() => 'piano');
  useEffect(() => {
    instrumentRef.current = (part) => overrides[part] ?? detectInstrument(doc, part);
  }, [overrides, doc]);

  // Dựng dòng thời gian khi bật và mỗi lần sửa; không dựng khi thanh Player đang ẩn để Editor không tốn công
  const timeline = useMemo(
    () => (enabled ? buildTimeline(doc, fallbackBpm) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` báo `doc` (đối tượng giữ nguyên) đã đổi nội dung
    [enabled, doc, revision, fallbackBpm],
  );

  const [view, setView] = useState<{ order: number; active: ReadonlySet<string> }>({ order: 0, active: EMPTY_IDS });
  const refresh = useCallback(() => {
    if (!engine) return;
    const current = engine.getTimeline();
    const position = engine.position();
    const order = measureOrderAt(current, position);
    const active = engine.getStatus() === 'stopped' ? EMPTY_IDS : activeNoteIds(current, position);
    setView((prev) => (prev.order === order && sameSet(prev.active, active) ? prev : { order, active }));
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const unsubscribe = engine.subscribe(refresh);
    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [engine, refresh]);

  useEffect(() => {
    if (!engine) return;
    if (timeline) engine.setTimeline(timeline, (part) => instrumentRef.current(part));
    else engine.stop();
  }, [engine, timeline]);

  // Đang phát: theo dõi ô nhịp và nốt đang vang theo khung hình (chỉ setState khi giá trị đổi)
  useEffect(() => {
    if (!engine || status !== 'playing') return;
    let frame = 0;
    const loop = () => {
      refresh();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine, status, refresh]);

  // Tải mẫu âm piano khi cần (một lần cho cả trang)
  useEffect(() => {
    if (!enabled) return;
    const ctx = getSharedAudioContext();
    if (ctx) void sampler.load(ctx, loadPlayerSettings().quality);
  }, [enabled, sampler]);

  const mutedStaves = useMemo(
    () =>
      timeline
        ? silentTracks(
            mixer,
            timeline.tracks.map((t) => t.id),
          )
        : EMPTY_IDS,
    [mixer, timeline],
  );

  // Khuông bị tắt tiếng không phát ra tiếng nên không tô là đang vang
  const activeIds = useMemo(() => {
    if (mutedStaves.size === 0) return view.active;
    const audible = new Set<string>();
    for (const id of view.active) {
      const track = trackOfNoteId(id);
      if (track === null || !mutedStaves.has(track)) audible.add(id);
    }
    return audible;
  }, [view.active, mutedStaves]);

  const segments = useMemo(
    () => (timeline ? loopSegments(timeline, loop.a, loop.b) : []),
    // `loop.a`/`loop.b` thay vì `loop`: bật/tắt lặp không đổi các đoạn
    [timeline, loop.a, loop.b],
  );

  const empty = timeline !== null && timeline.events.length === 0;
  const canPlay = engine !== null && timeline !== null && !empty && samplerSnapshot.state !== 'loading';

  const play = useCallback(
    (from?: number) => {
      stopAllTones(); // âm xem trước khi sửa không chồng lên bản đang phát
      if (engine?.play(from)) {
        firstPlayRef.current?.();
        firstPlayRef.current = undefined;
      }
    },
    [engine],
  );

  const toggle = useCallback(() => {
    if (!engine || !canPlay) return;
    if (engine.getStatus() === 'playing') engine.pause();
    else play();
  }, [engine, canPlay, play]);

  const playFrom = useCallback(
    (ids: ReadonlySet<string>) => {
      if (!engine || !canPlay) return;
      if (engine.getStatus() === 'playing') {
        engine.pause();
        return;
      }
      const times = engine
        .getTimeline()
        .events.filter((e) => ids.has(e.id))
        .map((e) => e.time);
      const fromSelection = engine.getStatus() === 'stopped' && engine.position() === 0 && times.length > 0;
      play(fromSelection ? Math.min(...times) : undefined);
    },
    [engine, canPlay, play],
  );

  const stop = useCallback(() => engine?.stop(), [engine]);

  const setTempoPercent = useCallback(
    (percent: number) => {
      if (!engine) return;
      engine.setTempo(percent);
      saveScoreSettings(scoreId, { tempoPercent: engine.getTempoPercent() });
    },
    [engine, scoreId],
  );

  const step = useCallback(
    (delta: number) => {
      if (!engine) return;
      const current = engine.getTimeline();
      const order = engine.currentOrder();
      const intoMeasure = engine.position() - (current.measures[order]?.start ?? 0);
      const target = delta < 0 && intoMeasure > 1 ? order : order + delta;
      engine.seekToOrder(target);
    },
    [engine],
  );

  const seekToMeasure = useCallback(
    (index: number) => {
      if (!engine) return;
      const order = firstOrderOfMeasure(engine.getTimeline(), index);
      if (order >= 0) engine.seekToOrder(order);
    },
    [engine],
  );

  const retrySamples = useCallback(() => {
    const ctx = getSharedAudioContext();
    if (ctx) void sampler.load(ctx, loadPlayerSettings().quality);
  }, [sampler]);

  const setTrackMix = useCallback(
    (trackId: string, patch: Partial<TrackMix>) => {
      if (!engine) return;
      engine.setTrackMix(trackId, patch);
      saveScoreSettings(scoreId, { mixer: engine.getMixer() });
    },
    [engine, scoreId],
  );

  const resetMixer = useCallback(() => {
    if (!engine) return;
    engine.resetMixer();
    saveScoreSettings(scoreId, { mixer: engine.getMixer() });
  }, [engine, scoreId]);

  const setLoop = useCallback(
    (patch: Partial<LoopSettings>) => {
      if (!engine) return;
      const before = engine.getLoop();
      const next = { ...before, ...patch };
      // Vừa đặt đủ A và B mà chưa nói bật/tắt: bật luôn, vì người dùng đặt đoạn là để lặp
      if (patch.enabled === undefined && !isLoopComplete(before) && isLoopComplete(next)) next.enabled = true;
      engine.setLoop(next);
      saveScoreSettings(scoreId, { loop: engine.getLoop() });
    },
    [engine, scoreId],
  );

  const markLoop = useCallback(
    (which: 'a' | 'b') => {
      if (!engine) return;
      const current = engine.getTimeline().measures[engine.currentOrder()];
      if (current) setLoop({ [which]: current.index });
    },
    [engine, setLoop],
  );

  const pickLoopMeasure = useCallback(
    (measureIndex: number) => {
      if (!engine) return;
      const { a, b } = engine.getLoop();
      if (a === null || b !== null) setLoop({ a: measureIndex, b: null, enabled: false });
      else setLoop({ b: measureIndex });
    },
    [engine, setLoop],
  );

  const clearLoop = useCallback(() => setLoop({ a: null, b: null, enabled: false }), [setLoop]);

  const setTranspose = useCallback(
    (semitones: number) => {
      if (!engine) return;
      engine.setTranspose(semitones);
      saveScoreSettings(scoreId, { transpose: engine.getTranspose() });
    },
    [engine, scoreId],
  );

  const setChordCarry = useCallback(
    (on: boolean) => {
      if (!engine) return;
      engine.setChordCarry(on);
      saveScoreSettings(scoreId, { chordCarry: engine.getChordCarry() });
    },
    [engine, scoreId],
  );

  const outOfRange = useMemo(() => (timeline ? countOutOfRange(timeline, transpose) : 0), [timeline, transpose]);
  const startKey = useMemo(
    () => readStartingKey(doc),
    // `revision` báo `doc` (đối tượng giữ nguyên) đã đổi nội dung
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, revision],
  );

  // Phím tắt trang /play
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="slider"], [role="dialog"]')) return;
      if (e.key === ' ') {
        if (target?.closest('button, a')) return; // Space trên nút là bấm nút
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        engine?.seek(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts, toggle, step, engine]);

  const parts: PartInstrument[] = Array.from({ length: doc.partCount }, (_, index) => ({
    index,
    label: partLabel(doc, index),
    instrument: overrides[index] ?? detectInstrument(doc, index),
    custom: overrides[index] !== undefined,
  }));

  const setInstrument = useCallback((partIndex: number, instrument: InstrumentId | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (instrument === null) delete next[partIndex];
      else next[partIndex] = instrument;
      return next;
    });
  }, []);

  const measure = timeline?.measures[view.order];
  const followMeasure = measure && !(status === 'stopped' && view.order === 0) ? measure.index : null;

  return {
    supported: engine !== null,
    engine,
    timeline,
    status,
    sampler: samplerSnapshot,
    activeIds,
    followMeasure,
    empty,
    canPlay,
    tempoPercent,
    setTempoPercent,
    mixer,
    loop,
    loopSegments: segments,
    setLoop,
    markLoop,
    pickLoopMeasure,
    clearLoop,
    transpose,
    setTranspose,
    outOfRange,
    startKey,
    chordCarry,
    setChordCarry,
    mutedStaves,
    setTrackMix,
    resetMixer,
    toggle,
    playFrom,
    stop,
    step,
    seekToMeasure,
    retrySamples,
    parts,
    setInstrument,
  };
}
