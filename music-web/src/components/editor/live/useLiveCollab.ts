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
  /** Không dùng được cộng tác (không nối được, hết chỗ, gói không hỗ trợ): editor đang ở chế độ sửa riêng. */
  failed: boolean;
}

const IDLE: LiveState = {
  status: 'off' satisfies LiveStatus,
  participants: [],
  selfSessionId: null,
  locks: null,
  pending: 0,
  unsaved: false,
};

/** Quá chừng này (ms) chưa vào được phiên lần nào thì bỏ cộng tác, quay về sửa riêng. */
const CONNECT_TIMEOUT_MS = 12_000;

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
  const [failed, setFailed] = useState(false);
  const everOnline = useRef(false);
  const bindings = useRef<LiveBindings | null>(null);
  const bind = useCallback((next: LiveBindings | null) => {
    bindings.current = next;
  }, []);
  const selectionRef = useRef(getSelection);
  useEffect(() => {
    selectionRef.current = getSelection;
  });

  // Tắt chế độ (sang đề xuất) rồi bật lại thì được thử cộng tác lại từ đầu
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (!enabled) setFailed(false);
  }

  useEffect(() => {
    if (!enabled || !doc || failed) return;
    everOnline.current = false;
    const created = new LiveSession(scoreId, doc, true, {
      onState: setState,
      onDocChanged: (touched) => bindings.current?.onDocChanged(touched),
      onVersion: (version) => bindings.current?.onVersion(version),
      onNotice: (key, params) => bindings.current?.onNotice(t(key, params)),
      onServerError: (error) => toast.error(errorCodeMessage(error.code, error.message) ?? error.message),
      onUnavailable: (code) => {
        setFailed(true);
        const key = code === 3121 ? 'live.notice.full' : code === 3123 ? 'live.notice.unavailable' : 'live.notice.failed';
        bindings.current?.onNotice(t(key));
      },
      getSelection: () => selectionRef.current(),
    });
    setSession(created);
    created.start();
    return () => {
      setSession(null);
      setState(IDLE);
      void created.stop();
    };
  }, [enabled, doc, scoreId, failed]);

  // Chưa vào được phiên lần nào sau một lúc (máy chủ không với tới, bị chặn origin...): sửa riêng như trước
  const online = state.status === 'synced' || state.status === 'syncing';
  useEffect(() => {
    if (online) everOnline.current = true;
    if (!session || everOnline.current) return;
    const timer = window.setTimeout(() => {
      if (everOnline.current) return;
      setFailed(true);
      bindings.current?.onNotice(t('live.notice.connectFailed'));
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [session, online]);

  return useMemo(
    () => ({ active: session !== null, state, session, bind, failed }),
    [session, state, bind, failed],
  );
}
