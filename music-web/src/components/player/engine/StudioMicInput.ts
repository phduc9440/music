import type { MicAudioWindow } from './micAudioWindowBuffer';
import { MIC_SAMPLE_RATE, MicAudioWindowBuffer } from './micAudioWindowBuffer';
import type { MicPitchRequest, MicPitchResponse } from './micPitchTypes';

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

interface PendingRequest {
  resolve: (response: MicPitchResponse) => void;
  reject: (error: Error) => void;
}

export class StudioMicInput {
  private static readonly MAX_QUEUED_WINDOWS = 8;
  private readonly buffer = new MicAudioWindowBuffer();
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
  private lastCommittedMs = -1;
  private startedAt = 0;
  private stopped = false;
  private disposed = false;
  private failure: Error | null = null;
  private stopPromise: Promise<number> | null = null;

  private constructor(
    stream: MediaStream,
    audioContext: AudioContext,
    worker: Worker,
    source: MediaStreamAudioSourceNode,
    captureNode: AudioWorkletNode,
    onUpdate: MicUpdateHandler,
    onStatus: MicStatusHandler,
    onError: MicErrorHandler,
  ) {
    this.stream = stream;
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

  static async create(
    onUpdate: MicUpdateHandler,
    onStatus: MicStatusHandler,
    onError: MicErrorHandler,
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
      audioContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
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

      if (audioContext.sampleRate !== MIC_SAMPLE_RATE) {
        throw new StudioMicError('unsupported', `Audio sample rate ${audioContext.sampleRate} is not supported`);
      }
      const workletUrl = new URL(`${import.meta.env.BASE_URL}studio-mic-capture-processor.js`, window.location.origin);
      await audioContext.audioWorklet.addModule(workletUrl);
      worker = new Worker(new URL('./basicPitch.worker.ts', import.meta.url), { type: 'module' });
      const modelUrl = new URL(
        `${import.meta.env.BASE_URL}models/basic-pitch/model.json`,
        window.location.origin,
      ).toString();
      await StudioMicInput.request(worker, { type: 'load', requestId: 0, modelUrl });

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
      return new StudioMicInput(stream, audioContext, worker, source, captureNode, onUpdate, onStatus, onError);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      worker?.terminate();
      if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      if (error instanceof StudioMicError) throw error;
      throw new StudioMicError('model-load', error instanceof Error ? error.message : 'Could not load Basic Pitch');
    }
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
    this.captureNode.connect(this.audioContext.destination);
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

  private acceptAudio(samples: Float32Array): void {
    if (this.stopped) return;
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
        const windowStartMs = (window.startSample / MIC_SAMPLE_RATE) * 1000;
        const notes = (response.notes ?? [])
          .map((note) => ({
            midi: note.pitchMidi,
            playedMs: Math.max(0, Math.round(windowStartMs + note.startTimeSeconds * 1000)),
          }))
          .filter((note) => {
            if (note.playedMs <= this.lastCommittedMs || note.playedMs > coveredUntilMs) return false;
            return true;
          })
          .sort((left, right) => left.playedMs - right.playedMs || left.midi - right.midi);
        this.lastCommittedMs = coveredUntilMs;
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

function asMicError(error: unknown, fallbackCode: StudioMicErrorCode): StudioMicError {
  if (error instanceof StudioMicError) return error;
  return new StudioMicError(fallbackCode, error instanceof Error ? error.message : 'Microphone processing failed');
}
