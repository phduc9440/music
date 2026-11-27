import type { MicAudioWindow } from './micAudioWindowBuffer';
import { MIC_SAMPLE_RATE, MicAudioWindowBuffer, MicNoteTracker } from './micAudioWindowBuffer';
import type { MicPitchRequest, MicPitchResponse } from './micPitchTypes';
import { MicResampler } from './micResampler';

export interface RecognizedMicNote {
  midi: number;
  playedMs: number;
}

export type StudioMicErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission'
  | 'no-device'
  | 'audio-start'
  | 'model-load'
  | 'inference';

export class StudioMicError extends Error {
  readonly code: StudioMicErrorCode;

  constructor(code: StudioMicErrorCode, message: string) {
    super(message);
    this.name = 'StudioMicError';
    this.code = code;
  }
}

type MicUpdateHandler = (notes: RecognizedMicNote[], coveredUntilMs: number, latencyMs: number) => void;
type MicStatusHandler = (latencyMs: number) => void;
type MicErrorHandler = (error: StudioMicError) => void;

export interface StudioMicOptions {
  /** Độ trễ còn lại đo bằng hiệu chỉnh (ms, ST-05): trừ thêm vào thời điểm nốt sau khi đã bù độ trễ thu của máy. */
  offsetMs?: number;
  /** Mức âm lượng 0–1 của từng khối âm thanh (thanh đo ở hộp thử micro). */
  onLevel?: (level: number) => void;
}

interface PendingRequest {
  resolve: (response: MicPitchResponse) => void;
  reject: (error: Error) => void;
}

/** Worker đã nạp sẵn mô hình (ST-14): tải khi người dùng chọn Micro, không đợi tới lúc bấm Bắt đầu. */
interface PreloadedModel {
  worker: Worker;
  ready: Promise<string>;
}

let preloaded: PreloadedModel | null = null;

const modelUrl = () =>
  new URL(`${import.meta.env.BASE_URL}models/basic-pitch/model.json`, window.location.origin).toString();

export class StudioMicInput {
  private static readonly MAX_QUEUED_WINDOWS = 8;
  private readonly buffer = new MicAudioWindowBuffer();
  private readonly tracker = new MicNoteTracker();
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly worker: Worker;
  private readonly audioContext: AudioContext;
  private readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly captureNode: AudioWorkletNode;
  private readonly onUpdate: MicUpdateHandler;
  private readonly onStatus: MicStatusHandler;
  private readonly onError: MicErrorHandler;
  private processing = Promise.resolve();
  private nextRequestId = 0;
  private queuedWindows = 0;
  private startedAt = 0;
  private stopped = false;
  private disposed = false;
  private failure: Error | null = null;
  private stopPromise: Promise<number> | null = null;
  /** Độ trễ thu của thiết bị + trình duyệt và độ trễ hiệu chỉnh (ms), trừ vào thời điểm mỗi nốt (ST-05). */
  private readonly compensationMs: number;
  private readonly onLevel?: (level: number) => void;
  /** Hạ tần số khi AudioContext không mở được ở 22 050 Hz (ST-15). */
  private readonly resampler: MicResampler;
  /** Nút câm nối worklet tới loa: vài trình duyệt (Safari) không chạy worklet không nối tới đích, nhưng không phát lại tiếng. */
  private readonly sink: GainNode;

  private constructor(
    stream: MediaStream,
    audioContext: AudioContext,
    worker: Worker,
    source: MediaStreamAudioSourceNode,
    captureNode: AudioWorkletNode,
    onUpdate: MicUpdateHandler,
    onStatus: MicStatusHandler,
    onError: MicErrorHandler,
    options: StudioMicOptions,
  ) {
    this.stream = stream;
    this.onLevel = options.onLevel;
    this.compensationMs = Math.round(inputLatencyMs(stream, audioContext) + (options.offsetMs ?? 0));
    this.resampler = new MicResampler(audioContext.sampleRate, MIC_SAMPLE_RATE);
    this.sink = audioContext.createGain();
    this.sink.gain.value = 0;
    this.audioContext = audioContext;
    this.worker = worker;
    this.source = source;
    this.captureNode = captureNode;
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.onError = onError;
    this.worker.onmessage = ({ data }: MessageEvent<MicPitchResponse>) => {
      const pending = this.pendingRequests.get(data.requestId);
      if (!pending) return;
      this.pendingRequests.delete(data.requestId);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data);
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new StudioMicError('inference', event.message));
    };
    this.captureNode.port.onmessage = ({ data }: MessageEvent<Float32Array | { type: 'stopped' }>) => {
      if (data instanceof Float32Array) this.acceptAudio(data);
      else if (data.type === 'stopped') this.resolveStopped?.();
    };
  }

  private resolveStopped: (() => void) | null = null;

  /**
   * Tải mô hình Basic Pitch vào một worker trước (ST-14); gọi lại nhiều lần chỉ tải một lần. Trả về backend TF.js
   * (webgl / cpu). Phiên Micro tạo sau đó dùng lại worker này.
   */
  static preload(): Promise<string> {
    if (!preloaded) {
      const worker = new Worker(new URL('./basicPitch.worker.ts', import.meta.url), { type: 'module' });
      const ready = StudioMicInput.request(worker, { type: 'load', requestId: 0, modelUrl: modelUrl() }).then(
        (response) => response.backend ?? 'cpu',
      );
      const entry: PreloadedModel = { worker, ready };
      preloaded = entry;
      ready.catch(() => {
        worker.terminate();
        if (preloaded === entry) preloaded = null;
      });
    }
    return preloaded.ready;
  }

  /** Lấy worker đã nạp sẵn (nếu có) cho một phiên; phiên sau tải lại vì worker bị đóng khi phiên kết thúc. */
  private static async takeWorker(): Promise<Worker> {
    await StudioMicInput.preload();
    const entry = preloaded;
    preloaded = null;
    if (!entry) throw new StudioMicError('model-load', 'Basic Pitch model is not loaded');
    return entry.worker;
  }

  static async create(
    onUpdate: MicUpdateHandler,
    onStatus: MicStatusHandler,
    onError: MicErrorHandler,
    options: StudioMicOptions = {},
  ): Promise<StudioMicInput> {
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      throw new StudioMicError('insecure-context', 'Microphone access requires HTTPS or localhost');
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === 'undefined' ||
      typeof AudioWorkletNode === 'undefined'
    ) {
      throw new StudioMicError('unsupported', 'This browser does not support microphone input');
    }

    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let worker: Worker | null = null;
    try {
      // ST-15: mở ở 22 050 Hz cho mô hình; trình duyệt không cho thì mở ở tần số mặc định rồi hạ mẫu (MicResampler)
      try {
        audioContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
      } catch {
        audioContext = new AudioContext();
      }
      const resumePromise = audioContext.resume().then(
        () => null,
        (error: unknown) => asMicError(error, 'audio-start'),
      );
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        const code = name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'no-device' : 'permission';
        throw new StudioMicError(code, error instanceof Error ? error.message : 'Microphone access failed');
      }

      if (audioContext.sampleRate < MIC_SAMPLE_RATE) {
        throw new StudioMicError('unsupported', `Audio sample rate ${audioContext.sampleRate} is not supported`);
      }
      const workletUrl = new URL(`${import.meta.env.BASE_URL}studio-mic-capture-processor.js`, window.location.origin);
      await audioContext.audioWorklet.addModule(workletUrl);
      worker = await StudioMicInput.takeWorker();

      const source = audioContext.createMediaStreamSource(stream);
      const captureNode = new AudioWorkletNode(audioContext, 'studio-mic-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      const resumeError = await resumePromise;
      if (resumeError) throw resumeError;
      return new StudioMicInput(
        stream,
        audioContext,
        worker,
        source,
        captureNode,
        onUpdate,
        onStatus,
        onError,
        options,
      );
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      worker?.terminate();
      if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      if (error instanceof StudioMicError) throw error;
      throw new StudioMicError('model-load', error instanceof Error ? error.message : 'Could not load Basic Pitch');
    }
  }

  /** Mốc performance.now() lúc bắt đầu thu; thời điểm nốt báo về tính từ mốc này. */
  get startTime(): number {
    return this.startedAt;
  }

  async start(): Promise<number> {
    if (this.stopped || this.startedAt !== 0) throw new Error('Microphone input cannot be started');
    try {
      await this.audioContext.resume();
    } catch (error) {
      throw asMicError(error, 'audio-start');
    }
    this.startedAt = performance.now();
    this.source.connect(this.captureNode);
    // Nối tới loa qua nút câm (gain 0): worklet chắc chắn được chạy mà không phát lại tiếng micro (vòng hú)
    this.captureNode.connect(this.sink).connect(this.audioContext.destination);
    return this.startedAt;
  }

  async stop(): Promise<number> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopAndDrain();
    return this.stopPromise;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopped = true;
    this.stream.getTracks().forEach((track) => track.stop());
    this.source.disconnect();
    this.captureNode.disconnect();
    this.sink.disconnect();
    this.worker.terminate();
    this.pendingRequests.forEach((request) => request.reject(new Error('Microphone input was disposed')));
    this.pendingRequests.clear();
    if (this.audioContext.state !== 'closed') await this.audioContext.close();
  }

  private async stopAndDrain(): Promise<number> {
    if (this.stopped) {
      if (this.failure) throw this.failure;
      return this.buffer.durationMs;
    }
    this.stream.getTracks().forEach((track) => track.stop());
    this.source.disconnect();

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.resolveStopped = null;
        reject(new StudioMicError('audio-start', 'Audio capture did not stop cleanly'));
      }, 2000);
      this.resolveStopped = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      this.captureNode.port.postMessage({ type: 'stop' });
    });
    this.resolveStopped = null;
    this.stopped = true;
    this.captureNode.disconnect();

    const finalWindow = this.buffer.finish();
    if (finalWindow) this.queueWindow(finalWindow);
    await this.processing;
    const failure = this.failure;
    await this.dispose();
    if (failure) throw failure;
    return this.buffer.durationMs;
  }

  private acceptAudio(raw: Float32Array): void {
    if (this.stopped) return;
    const samples = this.resampler.process(raw);
    if (this.onLevel && samples.length > 0) {
      let sum = 0;
      for (const value of samples) sum += value * value;
      this.onLevel(Math.sqrt(sum / samples.length));
    }
    for (const window of this.buffer.append(samples)) this.queueWindow(window);
  }

  private queueWindow(window: MicAudioWindow): void {
    if (this.failure) return;
    this.queuedWindows += 1;
    if (this.queuedWindows > StudioMicInput.MAX_QUEUED_WINDOWS) {
      this.queuedWindows -= 1;
      this.fail(new StudioMicError('inference', 'Audio analysis is falling too far behind'));
      return;
    }

    this.processing = this.processing
      .then(async () => {
        if (this.failure) return;
        this.onStatus(this.currentLatencyMs(window.coveredUntilSample));
        const response = await this.request(this.worker, {
          type: 'analyze',
          requestId: this.nextRequestId++ + 1,
          samples: window.samples,
        });
        const coveredUntilMs = (window.coveredUntilSample / MIC_SAMPLE_RATE) * 1000;
        const notes = this.tracker.take(window, response.notes ?? [], this.compensationMs);
        const latencyMs = this.currentLatencyMs(window.coveredUntilSample);
        this.onUpdate(notes, coveredUntilMs, latencyMs);
        this.onStatus(latencyMs);
      })
      .catch((error: unknown) => this.fail(asMicError(error, 'inference')))
      .finally(() => {
        this.queuedWindows -= 1;
      });
  }

  private currentLatencyMs(coveredUntilSample: number): number {
    const coveredUntilMs = (coveredUntilSample / MIC_SAMPLE_RATE) * 1000;
    return Math.max(0, Math.round(performance.now() - this.startedAt - coveredUntilMs));
  }

  private fail(error: Error): void {
    if (this.failure) return;
    const failure = error instanceof StudioMicError ? error : asMicError(error, 'inference');
    this.failure = failure;
    this.onError(failure);
    this.pendingRequests.forEach((request) => request.reject(failure));
    this.pendingRequests.clear();
    void this.dispose().catch((disposeError: unknown) => this.onError(asMicError(disposeError, 'audio-start')));
  }

  private request(worker: Worker, request: MicPitchRequest): Promise<MicPitchResponse> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.requestId, { resolve, reject });
      if (request.type === 'analyze') {
        worker.postMessage(request, [request.samples.buffer]);
      } else {
        worker.postMessage(request);
      }
    });
  }

  private static request(worker: Worker, request: MicPitchRequest): Promise<MicPitchResponse> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<MicPitchResponse>) => {
        if (event.data.requestId !== request.requestId) return;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      const onError = (event: ErrorEvent) => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new Error(event.message));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage(request);
    });
  }
}

/**
 * Độ trễ từ lúc âm thanh tới micro đến lúc tới bộ thu (ms): độ trễ của track (Chrome báo trong getSettings) cộng
 * baseLatency của AudioContext. Trình duyệt không báo thì 0, phần còn lại do hiệu chỉnh bù.
 */
function inputLatencyMs(stream: MediaStream, audioContext: AudioContext): number {
  const settings = stream.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
  const track = typeof settings?.latency === 'number' ? settings.latency : 0;
  const base = typeof audioContext.baseLatency === 'number' ? audioContext.baseLatency : 0;
  return Math.max(0, Math.min(0.5, track + base)) * 1000;
}

function asMicError(error: unknown, fallbackCode: StudioMicErrorCode): StudioMicError {
  if (error instanceof StudioMicError) return error;
  return new StudioMicError(fallbackCode, error instanceof Error ? error.message : 'Microphone processing failed');
}
