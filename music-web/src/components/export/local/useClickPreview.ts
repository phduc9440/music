import { useCallback, useEffect, useRef, useState } from 'react';

export type PreviewState = 'idle' | 'loading' | 'shown' | 'failed';

/** Chờ người dùng ngừng đổi tùy chọn bấy nhiêu ms rồi mới dựng lại bản xem trước đang mở. */
const REFRESH_DELAY_MS = 400;

/**
 * Bản xem trước chỉ dựng khi bấm (không tự tải sẵn). `load` trả về blob (ảnh / âm thanh) hoặc object URL đã tạo sẵn
 * (hook giữ và thu hồi nó); đang mở mà `key` (tùy chọn)
 * đổi thì tự dựng lại cho khớp. Object URL cũ được thu hồi khi thay hoặc gỡ.
 */
export function useClickPreview(load: () => Promise<Blob | string>, key = '') {
  const [state, setState] = useState<PreviewState>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const run = useRef(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const fetchPreview = useCallback(async () => {
    const id = ++run.current;
    setState('loading');
    try {
      const made = await loadRef.current();
      const next = typeof made === 'string' ? made : URL.createObjectURL(made);
      if (id !== run.current) return URL.revokeObjectURL(next);
      setUrl(next);
      setState('shown');
    } catch {
      if (id === run.current) setState('failed');
    }
  }, []);

  const hide = useCallback(() => {
    run.current += 1;
    setUrl(null);
    setState('idle');
  }, []);

  // Thu hồi URL cũ khi thay bằng URL mới hoặc khi gỡ
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  // Đang mở (hoặc vừa lỗi) mà đổi tùy chọn: dựng lại
  const lastKey = useRef(key);
  const active = state !== 'idle';
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (!active) return;
    const timer = setTimeout(() => void fetchPreview(), REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, active, fetchPreview]);

  const toggle = useCallback(() => (active ? hide() : void fetchPreview()), [active, hide, fetchPreview]);
  return { state, url, toggle, hide };
}
