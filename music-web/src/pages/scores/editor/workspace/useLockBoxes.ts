import { useMemo } from 'react';
import type { LockBox } from '../../../../components/scores/viewer/ScoreCanvas';
import { MAX_PRESENCE_MEASURES, colorOf, displayName } from '../../../../components/editor/live/presence';
import type { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';

type LiveCollab = ReturnType<typeof useLiveCollab>;

/**
 * Người cùng sửa khác: viền ô họ đang chọn (đứt) / đang sửa (liền) và cờ tên ở ô đầu vùng của họ, như Google Docs.
 */
export function useLockBoxes(live: LiveCollab): LockBox[] {
  return useMemo<LockBox[]>(() => {
    if (!live.active) return [];
    const { locks, participants, selfSessionId } = live.state;
    const boxes: LockBox[] = [];
    const perMeasure = new Map<number, number>();
    for (const p of participants) {
      if (p.sessionId === selfSessionId) continue;
      const held = new Set((locks?.locks ?? []).filter((l) => l.sessionId === p.sessionId).map((l) => l.measureIndex));
      const wholeHeld = locks?.wholeHolder === p.sessionId;
      const measures = new Set<number>(held);
      if (p.selection) {
        const last = Math.min(p.selection.to, p.selection.from + MAX_PRESENCE_MEASURES - 1);
        for (let m = p.selection.from; m <= last; m++) measures.add(m);
      }
      [...measures]
        .sort((a, b) => a - b)
        .slice(0, MAX_PRESENCE_MEASURES)
        .forEach((measureIndex, i) => {
          const stack = perMeasure.get(measureIndex) ?? 0;
          perMeasure.set(measureIndex, stack + 1);
          boxes.push({
            measureIndex,
            label: displayName(p),
            colorIndex: colorOf(p),
            editing: wholeHeld || held.has(measureIndex),
            flag: i === 0,
            avatarUrl: p.avatarUrl,
            stack,
          });
        });
    }
    return boxes;
  }, [live.active, live.state]);
}
