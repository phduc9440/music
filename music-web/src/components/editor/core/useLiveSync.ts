import { useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { EditCommand } from './commands';
import { History } from './history';
import { measureKey } from '../live/LiveSession';
import type { LiveCollab } from '../live/useLiveCollab';
import type { ScoreDocument } from './ScoreDocument';
import { t } from '../../../i18n/core';

interface LiveSyncOptions {
  live: LiveCollab | null;
  liveRef: MutableRefObject<LiveCollab | null>;
  doc: ScoreDocument;
  selection: ReadonlySet<string>;
  revision: number;
  historyRef: MutableRefObject<History>;
  sync: () => void;
  setSelection: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setVersion: (version: number) => void;
  flash: (text: string) => void;
}

/**
 * Nối Editor với phiên cùng sửa: nhận thay đổi của người khác, báo các ô đang chọn để giữ khóa, và chặn lệnh chạm ô
 * người khác đang khóa.
 */
export function useLiveSync(o: LiveSyncOptions) {
  const { live, liveRef, doc, selection, revision, historyRef, sync, setSelection, setVersion, flash } = o;
  const bind = live?.bind;

  // Nhận thay đổi từ người khác: bỏ các bước hoàn tác đã bị họ đè lên, vẽ lại, cập nhật số phiên bản
  useEffect(() => {
    if (!bind) return;
    bind({
      onDocChanged: (touched) => {
        const history = historyRef.current;
        if (touched === 'all') history.clear();
        else {
          history.discard(
            (c) =>
              c.head !== undefined ||
              c.parts !== undefined ||
              c.snapshots.some((s) => touched.has(measureKey(s.partIndex, s.measureIndex))),
          );
        }
        sync();
        setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
      },
      onVersion: (version, mine) => {
        setVersion(version);
        if (mine) toast.success(t('editor.toast.saved'));
      },
      onNotice: flash,
    });
    return () => bind(null);
  }, [bind, doc, sync, flash, historyRef, setSelection, setVersion]);

  // Các ô của vùng chọn là các ô cần giữ khóa
  const liveSession = live?.session ?? null;
  useEffect(() => {
    if (!liveSession) return;
    const seen = new Set<string>();
    const refs: Array<{ partIndex: number; measureIndex: number }> = [];
    for (const id of selection) {
      const info = doc.getInfo(id);
      if (!info) continue;
      const key = measureKey(info.partIndex, info.measureIndex);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ partIndex: info.partIndex, measureIndex: info.measureIndex });
    }
    liveSession.setFocus(refs);
  }, [liveSession, selection, doc, revision]);

  /** Lệnh chạm ô đang bị người khác khóa thì báo và không cho thực hiện. */
  const heldByOther = useCallback(
    (command: EditCommand | null): boolean => {
      const session = liveRef.current?.session;
      if (!command || !session) return false;
      const holder = session.heldByOther(command);
      if (holder === null) return false;
      flash(t('live.notice.heldBy', { name: holder }));
      return true;
    },
    [flash, liveRef],
  );

  return { heldByOther };
}
