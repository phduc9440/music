import { useState } from 'react';
import { toast } from 'react-toastify';
import { exportApi } from '../../services/file/exportApi';
import type { AiTaskInfo } from '../../types';
import { exportErrorMessage, isTaskFinished, translateTaskError } from './exportUtils';
import { useExportTask } from './useExportTask';

interface Props {
  scoreId: string;
  /** Tác vụ chuyển đổi đang chạy sẵn khi trang mở (để theo dõi tiếp thay vì cho bấm lại). */
  resume?: AiTaskInfo | null;
  /** Gọi khi chuyển xong để trang tải lại thông tin bản nhạc (lúc đó đã có MusicXML). */
  onDone: () => void;
}

/**
 * Nút "Chuyển MIDI thành bản nhạc" (mục 1.29): bản nhạc nhập từ MIDI chưa có MusicXML nên chưa mở được trình chỉnh sửa
 * và trình phát. Bấm thì MuseScore đổi MIDI gốc thành MusicXML ở nền; nút hiện tiến độ ngay tại chỗ, xong thì trang tải lại.
 */
export default function MidiConvertButton({ scoreId, resume, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const handleFinished = (finished: AiTaskInfo) => {
    if (finished.status === 'COMPLETED') {
      const warnings = (finished.resultData as { warnings?: string[] } | null | undefined)?.warnings ?? [];
      toast.success('Đã chuyển MIDI thành bản nhạc');
      if (warnings.length > 0) toast.info(`Lưu ý: ${warnings.join('; ')}`, { autoClose: 10000 });
      onDone();
    } else if (finished.status === 'FAILED') {
      toast.error(translateTaskError(finished.errorMessage));
    }
  };
  const { task, track } = useExportTask(handleFinished, resume);

  const running = task !== null && !isTaskFinished(task.status);
  const progress = Math.min(100, Math.max(0, task?.progress ?? 0));

  const start = async () => {
    setBusy(true);
    try {
      const response = (await exportApi.create(scoreId, 'MUSICXML')).data.result;
      if (response.task) track(response.task);
      else onDone(); // bản nhạc đã có MusicXML (vừa được tạo ở nơi khác): chỉ cần tải lại
    } catch (err) {
      toast.error(exportErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="sc-btn"
      disabled={busy || running}
      onClick={() => void start()}
      title="Đổi file MIDI đã nhập thành bản nhạc để mở trong trình chỉnh sửa và trình phát"
    >
      {running ? `Đang chuyển... ${progress}%` : 'Chuyển MIDI thành bản nhạc'}
    </button>
  );
}
