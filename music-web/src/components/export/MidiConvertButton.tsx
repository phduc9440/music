import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { exportApi } from '../../services/file/exportApi';
import type { AiTaskInfo } from '../../types';
import { exportErrorMessage, isTaskFinished, translateTaskError } from './exportUtils';
import { useExportTask } from './useExportTask';
import { t } from '../../i18n/core';

interface Props {
  scoreId: string;
  /** Tác vụ chuyển đổi đang chạy sẵn khi trang mở (để theo dõi tiếp thay vì cho bấm lại). */
  resume?: AiTaskInfo | null;
  /** Tự bắt đầu chuyển một lần khi nút xuất hiện (bản nhạc vừa nhập MIDI mà chưa có tác vụ nào). */
  autoStart?: boolean;
  /** Gọi khi chuyển xong để trang tải lại thông tin bản nhạc (lúc đó đã có MusicXML). */
  onDone: () => void;
}

/**
 * Nút "Chuyển MIDI thành bản nhạc" (mục 1.29): bản nhạc nhập từ MIDI chưa có MusicXML nên chưa mở được trình chỉnh sửa
 * và trình phát. Bấm thì MuseScore đổi MIDI gốc thành MusicXML ở nền; nút hiện tiến độ ngay tại chỗ, xong thì trang tải lại.
 */
export default function MidiConvertButton({ scoreId, resume, autoStart = false, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const handleFinished = (finished: AiTaskInfo) => {
    if (finished.status === 'COMPLETED') {
      const warnings = (finished.resultData as { warnings?: string[] } | null | undefined)?.warnings ?? [];
      toast.success(t('export.midi.done'));
      if (warnings.length > 0)
        toast.info(t('export.midi.warnings', { warnings: warnings.join('; ') }), { autoClose: 10000 });
      onDone();
    } else if (finished.status === 'FAILED') {
      toast.error(translateTaskError(finished.errorMessage));
    }
  };
  const { task, track } = useExportTask(handleFinished, resume);

  const running = task !== null && !isTaskFinished(task.status);
  const progress = Math.min(100, Math.max(0, task?.progress ?? 0));

  const start = useCallback(async () => {
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
  }, [scoreId, track, onDone]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void start();
  }, [autoStart, start]);

  return (
    <button className="sc-btn" disabled={busy || running} onClick={() => void start()} title={t('export.midi.title')}>
      {running ? t('export.midi.running', { progress }) : t('export.midi.button')}
    </button>
  );
}
