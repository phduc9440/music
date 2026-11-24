import type { PracticeNoteEvent, PlayedPracticeNote } from './FreeRunScorer';
import type { StudioWaitStep } from './studioSchedule';

export class WaitModeScorer {
  private readonly steps: readonly StudioWaitStep[];
  private readonly durationMs: number;
  private readonly loop: boolean;
  private stepIndex = 0;
  private cycleIndex = 0;
  private stepTransitionCount = 0;
  private nextSeq = 0;
  private matchedNoteIds = new Set<string>();
  private finished = false;
  private complete = false;

  constructor(steps: readonly StudioWaitStep[], durationMs: number, loop = false) {
    if (
      steps.length === 0 ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      steps.some(
        (step) =>
          !Number.isInteger(step.stepIndex) ||
          !Number.isFinite(step.expectedMs) ||
          step.expectedMs < 0 ||
          step.notes.length === 0,
      )
    ) {
      throw new RangeError('Wait mode schedule is invalid');
    }
    this.steps = steps;
    this.durationMs = durationMs;
    this.loop = loop;
  }

  get isComplete(): boolean {
    return this.complete;
  }

  getCurrentStep(): StudioWaitStep | null {
    return this.complete ? null : this.steps[this.stepIndex];
  }

  getStepTransitionCount(): number {
    return this.stepTransitionCount;
  }

  getCurrentExpectedMs(): number {
    if (this.complete) return (this.cycleIndex + 1) * this.durationMs;
    return this.cycleIndex * this.durationMs + this.steps[this.stepIndex].expectedMs;
  }

  play(note: PlayedPracticeNote): PracticeNoteEvent[] {
    this.assertOpen();
    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) {
      throw new RangeError('MIDI pitch must be an integer from 0 to 127');
    }

    const currentStep = this.steps[this.stepIndex];
    const expected = currentStep.notes.find(
      (candidate) => candidate.midi === note.midi && !this.matchedNoteIds.has(candidate.noteId),
    );
    if (!expected) {
      return [
        this.createEvent({
          noteId: null,
          measure: null,
          hand: null,
          expectedMidi: null,
          playedMidi: note.midi,
          expectedMs: null,
          playedMs: null,
          deltaMs: null,
          result: 'WRONG_PITCH',
        }),
      ];
    }

    this.matchedNoteIds.add(expected.noteId);
    const event = this.createEvent({
      noteId: expected.noteId,
      measure: expected.measure,
      hand: expected.hand,
      expectedMidi: expected.midi,
      playedMidi: note.midi,
      expectedMs: null,
      playedMs: null,
      deltaMs: null,
      result: 'PERFECT',
    });

    if (this.matchedNoteIds.size === currentStep.notes.length) {
      this.matchedNoteIds.clear();
      this.stepIndex += 1;
      this.stepTransitionCount += 1;
      if (this.stepIndex === this.steps.length) {
        if (this.loop) {
          this.cycleIndex += 1;
          this.stepIndex = 0;
        } else {
          this.complete = true;
        }
      }
    }
    return [event];
  }

  finish(coveredUntilMs: number): PracticeNoteEvent[] {
    void coveredUntilMs;
    if (this.finished) {
      throw new Error('Scoring session is already finished');
    }
    this.finished = true;
    return [];
  }

  private createEvent(event: Omit<PracticeNoteEvent, 'seq'>): PracticeNoteEvent {
    return { seq: this.nextSeq++, ...event };
  }

  private assertOpen(): void {
    if (this.finished || this.complete) {
      throw new Error('Scoring session is already finished');
    }
  }
}
