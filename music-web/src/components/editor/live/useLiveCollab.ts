import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { errorCodeMessage, t } from '../../../i18n/core';
import type { LiveSelection, LiveStatus } from '../../../types';
import type { ScoreDocument } from '../core/ScoreDocument';
import { LiveSession, type LiveState } from './LiveSession';

/** Cầu nối từ phiên đồng bộ sang editor; editor gắn vào khi mount. */
export interface LiveBindings {
  onDocChanged: (touched: ReadonlySet<string> | 'all') => void;
  onVersion: (version: number) => void;
  onNotice: (text: string) => void;
}

export interface LiveCollab {
  /** Đang bật chế độ đồng chỉnh sửa (đã tạo phiên). */
  active: boolean;
  state: LiveState;
  session: LiveSession | null;
  /** Editor gắn (hoặc gỡ bằng null) nơi nhận thay đổi từ người khác. */
  bind: (bindings: LiveBindings | null) => void;
}

const IDLE: LiveState = {
  status: 'off' satisfies LiveStatus,
  participants: [],
  selfSessionId: null,
  locks: null,
  pending: 0,
  unsaved: false,
};

interface Options {
  scoreId: string;
  doc: ScoreDocument | null;
  enabled: boolean;
  /** Vùng chọn hiện tại để gửi kèm nhịp tim. */
  getSelection: () => LiveSelection | null;
}

/** Tạo và dọn phiên đồng chỉnh sửa theo `enabled`; trạng thái phiên được đẩy vào React state. */
export function useLiveCollab({ scoreId, doc, enabled, getSelection }: Options): LiveCollab {
  const [state, setState] = useState<LiveState>(IDLE);
  const [session, setSession] = useState<LiveSession | null>(null);
  const bindings = useRef<LiveBindings | null>(null);
  const bind = useCallback((next: LiveBindings | null) => {
    bindings.current = next;
  }, []);
  const selectionRef = useRef(getSelection);
  useEffect(() => {
    selectionRef.current = getSelection;
  });

  useEffect(() => {
    if (!enabled || !doc) return;
    const created = new LiveSession(scoreId, doc, true, {
      onState: setState,
      onDocChanged: (touched) => bindings.current?.onDocChanged(touched),
      onVersion: (version) => bindings.current?.onVersion(version),
      onNotice: (key, params) => bindings.current?.onNotice(t(key, params)),
      onServerError: (error) => toast.error(errorCodeMessage(error.code, error.message) ?? error.message),
      getSelection: () => selectionRef.current(),
    });
    setSession(created);
    created.start();
    return () => {
      setSession(null);
      setState(IDLE);
      void created.stop();
    };
  }, [enabled, doc, scoreId]);

  return useMemo(() => ({ active: session !== null, state, session, bind }), [session, state, bind]);
}
