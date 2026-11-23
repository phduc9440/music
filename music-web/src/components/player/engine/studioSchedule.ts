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
  waitSteps: StudioWaitStep[];
  accompanimentSteps: StudioWaitStep[];
  visualNotes: StudioVisualNote[];
  durationMs: number;
}

export interface StudioWaitStep {
  stepIndex: number;
  expectedMs: number;
  notes: ExpectedPracticeNote[];
}

export interface StudioVisualNote {
  noteId: string;
  measure: number;
  hand: 'LEFT' | 'RIGHT' | null;
  midi: number;
  expectedMs: number;
  durationMs: number;
  scorable: boolean;
}

function buildWaitSteps(
  notes: readonly ExpectedPracticeNote[],
  timelineSteps: StudioTimeline['steps'],
): StudioWaitStep[] {
  const expectedNotesById = new Map(notes.map((note) => [note.noteId, note]));
  const assignedNoteIds = new Set<string>();
  const waitSteps = timelineSteps
    .map((step) => {
      const stepNotes = step.noteIds.flatMap((noteId) => {
        const note = expectedNotesById.get(noteId);
        if (!note || assignedNoteIds.has(noteId)) return [];
        assignedNoteIds.add(noteId);
        return [note];
      });
      if (stepNotes.length === 0) return null;
      return {
        stepIndex: step.stepIndex,
        expectedMs: Math.min(...stepNotes.map((note) => note.expectedMs)),
        notes: stepNotes,
      };
    })
    .filter((step): step is StudioWaitStep => step !== null)
    .sort((left, right) => left.expectedMs - right.expectedMs || left.stepIndex - right.stepIndex);

  const unassignedNotes = notes.filter((note) => !assignedNoteIds.has(note.noteId));
  const fallbackSteps = new Map<number, ExpectedPracticeNote[]>();
  for (const note of unassignedNotes) {
    const stepNotes = fallbackSteps.get(note.expectedMs) ?? [];
    stepNotes.push(note);
    fallbackSteps.set(note.expectedMs, stepNotes);
  }
  waitSteps.push(
    ...[...fallbackSteps.entries()].map(([expectedMs, stepNotes], index) => ({
      stepIndex: timelineSteps.length + index,
      expectedMs,
      notes: stepNotes,
    })),
  );
  return waitSteps.sort((left, right) => left.expectedMs - right.expectedMs || left.stepIndex - right.stepIndex);
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

  const notesInRange = timeline.notes.filter((note) => note.measure >= startMeasure && note.measure <= endMeasure);
  const selectedNotes = notesInRange
    .filter((note) => handMode === 'BOTH' || note.hand === (handMode === 'RIGHT_ONLY' ? 'RIGHT' : 'LEFT'))
    .map((note) => ({
      noteId: note.id,
      measure: note.measure,
      hand: note.hand,
      midi: note.midi,
      expectedMs: Math.round(beatToMs(note.startBeat) - startMs),
      durationMs: Math.max(0, Math.round(beatToMs(note.startBeat + note.durationBeat) - beatToMs(note.startBeat))),
      scorable: note.scorable,
    }))
    .sort((left, right) => left.expectedMs - right.expectedMs || left.noteId.localeCompare(right.noteId));

  const visualNotes = selectedNotes;
  const notes = visualNotes
    .filter((note) => note.scorable)
    .map(({ noteId, measure, hand, midi, expectedMs, durationMs }) => ({
      noteId,
      measure,
      hand,
      midi,
      expectedMs,
      durationMs,
    }));

  const accompanimentNotes =
    handMode === 'BOTH'
      ? []
      : notesInRange
          .filter((note) => note.scorable && note.hand === (handMode === 'RIGHT_ONLY' ? 'LEFT' : 'RIGHT'))
          .map(({ id: noteId, measure, hand, midi, startBeat }) => ({
            noteId,
            measure,
            hand,
            midi,
            expectedMs: Math.round(beatToMs(startBeat) - startMs),
          }));

  return {
    notes,
    waitSteps: buildWaitSteps(notes, timeline.steps),
    accompanimentSteps: buildWaitSteps(accompanimentNotes, timeline.steps),
    visualNotes,
    durationMs,
  };
}
