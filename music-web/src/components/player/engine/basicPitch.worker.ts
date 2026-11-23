import type { MicPitchRequest, MicPitchResponse } from './micPitchTypes';

interface WorkerScope {
  onmessage: ((event: MessageEvent<MicPitchRequest>) => void) | null;
  postMessage(message: MicPitchResponse): void;
}

const workerScope = self as unknown as WorkerScope;
let modelPromise: Promise<import('@spotify/basic-pitch').BasicPitch> | null = null;

workerScope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const { BasicPitch } = await import('@spotify/basic-pitch');
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      const basicPitch = new BasicPitch(data.modelUrl);
      await basicPitch.model;
      modelPromise = Promise.resolve(basicPitch);
      workerScope.postMessage({ requestId: data.requestId });
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

    const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)).map((note) => ({
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
