import { useCallback, useEffect, useRef, useState } from 'react';
import { taskApi } from '../../services';
import type { AiTaskInfo } from '../../types';
import { isTaskFinished } from './exportUtils';

const POLL_MS = 2000;
/** Hỏi trạng thái lỗi liên tiếp bấy nhiêu lần (mất mạng, task không còn) thì coi như thất bại. */
const MAX_POLL_ERRORS = 5;

/**
 * Theo dõi một tác vụ xuất file: hỏi `GET /ai-tasks/{id}` mỗi 2 giây tới khi COMPLETED/FAILED/CANCELLED.
 * Vòng hỏi gắn với component gọi hook (không gắn với hộp thoại) nên đóng hộp thoại vẫn theo dõi tiếp; unmount thì dừng.
 */
export function useExportTask(onFinished: (task: AiTaskInfo) => void) {
  const [task, setTask] = useState<AiTaskInfo | null>(null);
  /** Mỗi lần theo dõi mới (hoặc dừng) tăng số này để vòng hỏi cũ tự thoát. */
  const run = useRef(0);
  const finished = useRef(onFinished);

  useEffect(() => {
    finished.current = onFinished;
  });

  useEffect(() => {
    const counter = run;
    return () => {
      counter.current += 1;
    };
  }, []);

  const track = useCallback((initial: AiTaskInfo) => {
    run.current += 1;
    const id = run.current;
    setTask(initial);
    if (isTaskFinished(initial.status)) {
      finished.current(initial);
      return;
    }
    void (async () => {
      let errors = 0;
      while (run.current === id) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (run.current !== id) return;
        try {
          const next = (await taskApi.get(initial.id)).data.result;
          if (run.current !== id) return;
          errors = 0;
          setTask(next);
          if (isTaskFinished(next.status)) {
            finished.current(next);
            return;
          }
        } catch {
          if (run.current !== id) return;
          errors += 1;
          if (errors >= MAX_POLL_ERRORS) {
            const failed: AiTaskInfo = { ...initial, status: 'FAILED', errorMessage: 'EXPORT_ERROR: mất kết nối' };
            setTask(failed);
            finished.current(failed);
            return;
          }
        }
      }
    })();
  }, []);

  /** Dừng theo dõi và quay về trạng thái chưa có tác vụ. */
  const reset = useCallback(() => {
    run.current += 1;
    setTask(null);
  }, []);

  return { task, track, reset };
}
