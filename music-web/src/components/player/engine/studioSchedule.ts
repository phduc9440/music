import type { ExpectedPracticeNote } from './FreeRunScorer';
import type { StudioHandMode, StudioTimeline } from '../../../types';

export interface StudioScheduleOptions {
  startMeasure: number;
  endMeasure: number;
  tempoPercent: number;
  handMode: StudioHandMode;
}

export interface StudioSchedule {
  notes: ExpectedPracticeNote[];
  durationMs: number;
}

export function buildStudioSchedule(timeline: StudioTimeline, options: StudioScheduleOptions): StudioSchedule {
  const { startMeasure, endMeasure, tempoPercent, handMode } = options;
  if (
    !Number.isInteger(startMeasure) ||
    !Number.isInteger(endMeasure) ||
    startMeasure < 1 ||
    endMeasure < startMeasure ||
    endMeasure > timeline.measureCount ||
    !Number.isInteger(tempoPercent) ||
    tempoPercent < 20 ||
    tempoPercent > 200
  ) {
    throw new RangeError('Studio schedule settings are invalid');
  }

  const measures = new Map(timeline.measures.map((measure) => [measure.index, measure]));
  const firstMeasure = measures.get(startMeasure);
  const lastMeasure = measures.get(endMeasure);
  if (!firstMeasure || !lastMeasure) {
    throw new RangeError('Studio timeline does not contain the selected measures');
  }

  const tempoSegments = [
    { startBeat: 0, bpm: timeline.tempoBpm },
    ...timeline.tempoChanges.map((change) => {
      const measure = measures.get(change.measure);
      if (!measure || !Number.isFinite(change.bpm) || change.bpm <= 0) {
        throw new RangeError('Studio timeline tempo data is invalid');
      }
      return { startBeat: measure.startBeat, bpm: change.bpm };
    }),
  ].sort((left, right) => left.startBeat - right.startBeat);

  const beatToMs = (targetBeat: number): number => {
    if (!Number.isFinite(targetBeat) || targetBeat < 0) {
      throw new RangeError('Studio timeline beat is invalid');
    }
    let elapsed = 0;
    let beat = 0;
    let bpm = timeline.tempoBpm;
    for (const segment of tempoSegments) {
      if (segment.startBeat <= beat) {
        bpm = segment.bpm;
        continue;
      }
      const segmentEnd = Math.min(targetBeat, segment.startBeat);
      elapsed += (segmentEnd - beat) * (60000 / (bpm * (tempoPercent / 100)));
      beat = segmentEnd;
      if (beat >= targetBeat) return elapsed;
      bpm = segment.bpm;
    }
    return elapsed + (targetBeat - beat) * (60000 / (bpm * (tempoPercent / 100)));
  };

  const startMs = beatToMs(firstMeasure.startBeat);
  const endBeat = lastMeasure.startBeat + lastMeasure.beats;
  const durationMs = Math.round(beatToMs(endBeat) - startMs);
  if (durationMs <= 0) {
    throw new RangeError('Studio loop duration must be positive');
  }

  const notes = timeline.notes
    .filter(
      (note) =>
        note.scorable &&
        note.measure >= startMeasure &&
        note.measure <= endMeasure &&
        (handMode === 'BOTH' || note.hand === (handMode === 'RIGHT_ONLY' ? 'RIGHT' : 'LEFT')),
    )
    .map((note) => ({
      noteId: note.id,
      measure: note.measure,
      hand: note.hand,
      midi: note.midi,
      expectedMs: Math.round(beatToMs(note.startBeat) - startMs),
    }))
    .sort((left, right) => left.expectedMs - right.expectedMs || left.noteId.localeCompare(right.noteId));

  return { notes, durationMs };
}
