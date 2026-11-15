import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'react-toastify';
import { taskApi } from '../../services';
import { exportApi } from '../../services/file/exportApi';
import type { AiTaskInfo } from '../../types';
import type { ExportFileInfo, ExportTarget } from '../../types/export';
import { exportErrorMessage, isTaskFinished, translateTaskError } from './exportUtils';
import { reportPlanLimit } from '../../utils/planLimit';
import { useExportTask } from './useExportTask';
import { t } from '../../i18n/core';

interface FlowOptions {
  scoreId: string;
  /** Hộp thoại đang mở; đóng thì khi xong hiện toast thay cho màn hình kết quả. */
  isOpen: boolean;
  /** Nội dung toast khi tác vụ xong lúc hộp thoại đang đóng, ví dụ "File PDF đã sẵn sàng". */
  readyMessage: ReactNode;
  /** Mở lại hộp thoại (nút "Xem" trong toast). */
  reopen: () => void;
  /** Tác vụ đang chạy sẵn khi trang mở (để theo dõi tiếp). */
  resume?: AiTaskInfo | null;
}

/**
 * Luồng xuất file dùng chung cho PDF và SVG: gửi yêu cầu, theo dõi tác vụ, lấy các file kết quả (một PDF hoặc nhiều
 * trang SVG), hủy, làm lại. Gắn vào component luôn được gắn trong trang để đóng hộp thoại không dừng theo dõi.
 */
export function useExportFlow({ scoreId, isOpen, readyMessage, reopen, resume }: FlowOptions) {
  const [results, setResults] = useState<ExportFileInfo[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const open = useRef(false);

  useEffect(() => {
    open.current = isOpen;
  });

  const handleFinished = async (finishedTask: AiTaskInfo) => {
    if (finishedTask.status === 'COMPLETED') {
      try {
        const files = (await exportApi.list(scoreId)).data.result;
        const mine = files
          .filter((f) => f.taskId === finishedTask.id)
          .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
        setResults(mine);
        if (mine.length > 0 && !open.current) {
          toast.success(
            <span>
              {readyMessage}{' '}
              <button className="ex-toast-btn" onClick={reopen}>
                Xem
              </button>
            </span>,
            { toastId: `export-${finishedTask.id}`, autoClose: 10000 },
          );
        }
      } catch {
        if (!open.current) toast.error(t('export.fetchFailed'));
      }
    } else if (finishedTask.status === 'FAILED' && !open.current) {
      toast.error(translateTaskError(finishedTask.errorMessage));
    }
  };

  const { task, track, reset } = useExportTask((t) => void handleFinished(t), resume);

  /** Gửi yêu cầu xuất; trả về thông báo lỗi (hoặc null nếu gửi được). */
  const submit = async (target: ExportTarget, options: object): Promise<string | null> => {
    try {
      const response = (await exportApi.create(scoreId, target, options)).data.result;
      if (response.cached && response.file) setResults(response.files?.length ? response.files : [response.file]);
      else if (response.task) track(response.task);
      return null;
    } catch (err) {
      reportPlanLimit(err);
      return exportErrorMessage(err);
    }
  };

  const cancel = async () => {
    if (!task) return;
    setCancelling(true);
    try {
      await taskApi.cancel(task.id);
      reset();
      toast.info(t('export.cancelled'));
    } catch {
      toast.error(t('export.cancelFailed'));
    } finally {
      setCancelling(false);
    }
  };

  const again = () => {
    reset();
    setResults(null);
  };

  const running = task !== null && !isTaskFinished(task.status);
  const failed = task !== null && (task.status === 'FAILED' || task.status === 'CANCELLED') && results === null;
  return { task, results, running, failed, cancelling, submit, cancel, again };
}
