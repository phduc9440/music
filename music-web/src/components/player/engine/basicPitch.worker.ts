import type { MicPitchRequest, MicPitchResponse } from './micPitchTypes';

interface WorkerScope {
  onmessage: ((event: MessageEvent<MicPitchRequest>) => void) | null;
  postMessage(message: MicPitchResponse): void;
}

const workerScope = self as unknown as WorkerScope;

// TF.js 3.x gọi `!window` khi chờ GPU đọc kết quả (backend WebGL). Trong worker không có `window` nên lệnh đó ném lỗi
// trong một promise không ai bắt, việc đọc kết quả treo mãi và mô hình không bao giờ nạp xong. Gán `window` trỏ về
// chính worker để phép kiểm tra đó chạy được; TF.js vẫn nhận ra đây là worker vì không có `window.document`.
const globalScope = self as unknown as { window?: unknown };
globalScope.window ??= self;

/**
 * Ngưỡng tách nốt, đo bằng bài thử dựng từ tiếng piano của app (giai điệu, hai tay có hợp âm ngân, chạy nốt nhanh):
 * ngưỡng mặc định của Basic Pitch (0,5 / 0,3) thay cho 0,25 / 0,25 trước đây (quá nhạy, bắt cả bồi âm và tiếng ngân);
 * nốt phải dài ít nhất 8 khung (~93 ms); không suy ra nốt từ tiếng đang kêu (piano luôn có tiếng búa rõ), nếu không thì
 * nốt đang ngân bị đọc lại thành nốt mới.
 */
const ONSET_THRESHOLD = 0.5;
const FRAME_THRESHOLD = 0.3;
const MIN_NOTE_FRAMES = 8;

let modelPromise: Promise<import('@spotify/basic-pitch').BasicPitch> | null = null;

workerScope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const { BasicPitch } = await import('@spotify/basic-pitch');
      const tf = await import('@tensorflow/tfjs');
      // ST-04: backend cpu mất ~3,3 s cho mỗi cửa sổ 2 s nên hàng chờ đầy và phiên bị hủy; thử WebGL (OffscreenCanvas
      // trong worker) trước, không được mới dùng cpu
      let backend = 'cpu';
      for (const name of ['webgl', 'cpu']) {
        try {
          if (await tf.setBackend(name)) {
            await tf.ready();
            backend = name;
            break;
          }
        } catch {
          // backend không có trong trình duyệt này: thử cái tiếp theo
        }
      }
      const basicPitch = new BasicPitch(data.modelUrl);
      await basicPitch.model;
      // Chạy thử một đoạn im lặng để biên dịch shader WebGL trước, cửa sổ đầu của phiên không bị chậm
      tf.engine().startScope();
      try {
        await basicPitch.evaluateModel(
          new Float32Array(22050),
          () => undefined,
          () => undefined,
        );
      } finally {
        tf.engine().endScope();
      }
      modelPromise = Promise.resolve(basicPitch);
      workerScope.postMessage({ requestId: data.requestId, backend });
      return;
    }

    if (!modelPromise) throw new Error('Basic Pitch model has not been loaded');
    const { noteFramesToTime, outputToNotesPoly } = await import('@spotify/basic-pitch');
    const tf = await import('@tensorflow/tfjs');
    const frames: number[][] = [];
    const onsets: number[][] = [];

    tf.engine().startScope();
    try {
      await (
        await modelPromise
      ).evaluateModel(
        data.samples,
        (frameBatch, onsetBatch) => {
          frames.push(...frameBatch);
          onsets.push(...onsetBatch);
        },
        () => undefined,
      );
    } finally {
      tf.engine().endScope();
    }

    const notes = noteFramesToTime(
      outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES, false),
    ).map((note) => ({
      pitchMidi: note.pitchMidi,
      startTimeSeconds: note.startTimeSeconds,
      amplitude: note.amplitude,
    }));
    workerScope.postMessage({ requestId: data.requestId, notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Basic Pitch inference failed';
    workerScope.postMessage({ requestId: data.requestId, error: message });
  }
};
