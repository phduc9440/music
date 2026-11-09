import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, downloadScoreExport } from '../../services';
import { exportApi } from '../../services/exportApi';
import type { ScoreFileInfo } from '../../types';
import type { ExportFileInfo, ExportFormat } from '../../types/export';
import ExportAudioDialog from '../export/ExportAudioDialog';
import { DOWNLOAD_FORMATS, getErrorMessage } from '../../utils/score';

interface DownloadMenuProps {
  scoreId: string;
  files: ScoreFileInfo[];
  /** Tiêu đề và số khuông của bản nhạc, dùng cho hộp thoại xuất âm thanh (đặt tên file, ô chọn tay). */
  title?: string;
  staffCount?: number | null;
  /** Hiện thêm nút "Xuất âm thanh" cạnh nút Tải xuống (dùng ở trang Player). */
  audioShortcut?: boolean;
}

/** MP3/WAV được tạo theo yêu cầu bằng hộp thoại xuất âm thanh (mục 1.28), không tải thẳng một file có sẵn. */
const AUDIO_FORMATS: string[] = ['MP3', 'WAV'];

/**
 * Menu "Tải xuống" của trang chi tiết: liệt kê MusicXML, MIDI, Kern, MP3, WAV, PDF, SVG.
 * Định dạng đã có file thì tải được ngay, chưa có thì hiện "Tạo file". MP3/WAV luôn mở hộp thoại xuất âm thanh
 * (cùng tùy chọn với lần xuất trước thì nhận file ngay). PDF/SVG làm ở nhánh export-formats (mục 1.29–1.30).
 * MusicXML và MIDI tải qua API riêng của bản nhạc để luôn nhận bản mới nhất (MIDI cũ sẽ được BE tạo lại).
 */
export default function DownloadMenu({ scoreId, files, title, staffCount, audioShortcut }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportFileInfo[]>([]);
  const [audioFormat, setAudioFormat] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Mở menu thì hỏi lại danh sách file đã xuất để gắn nhãn "Cũ" (bản nhạc đã sửa sau lúc xuất); lỗi thì bỏ qua
  const toggle = () => {
    if (!open) {
      exportApi
        .list(scoreId)
        .then((res) => setExports(res.data.result))
        .catch(() => undefined);
    }
    setOpen(!open);
  };

  // Bấm ra ngoài hoặc nhấn Esc thì đóng menu
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleDownload = async (file: ScoreFileInfo) => {
    setOpen(false);
    const fileName = file.originalFileName || `${file.fileType}-${file.id}`;
    try {
      if (file.fileType === 'MUSICXML' || file.fileType === 'MIDI') {
        setBusyType(file.fileType);
        await downloadScoreExport(scoreId, file.fileType === 'MIDI' ? 'midi' : 'musicxml', fileName);
      } else {
        await downloadFile(file.downloadUrl, fileName);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không tải được file'));
    } finally {
      setBusyType(null);
    }
  };

  return (
    <>
      {audioShortcut && (
        <button className="sc-btn" onClick={() => setAudioFormat('MP3')}>
          Xuất âm thanh
        </button>
      )}
      <div className="sc-menu" ref={ref}>
        <button className="sc-btn" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          Tải xuống
        </button>
        {open && (
          <ul className="sc-menu__list" role="menu">
            {DOWNLOAD_FORMATS.map(({ fileType, label }) => {
              if (AUDIO_FORMATS.includes(fileType)) {
                const made = exports.filter((f) => f.fileType === fileType);
                const hint =
                  made.length === 0 ? 'Tạo file' : made.every((f) => f.outdated) ? 'Cũ · Xuất lại' : 'Xuất / tải';
                return (
                  <li key={fileType} role="none">
                    <button
                      role="menuitem"
                      className={`sc-menu__item${made.length === 0 ? ' is-missing' : ''}`}
                      onClick={() => {
                        setOpen(false);
                        setAudioFormat(fileType as ExportFormat);
                      }}
                    >
                      <span>{label}</span>
                      <span className="sc-menu__hint">{hint}</span>
                    </button>
                  </li>
                );
              }
              const file = files.find((f) => f.fileType === fileType);
              return (
                <li key={fileType} role="none">
                  {file ? (
                    <button
                      role="menuitem"
                      className="sc-menu__item"
                      disabled={busyType !== null}
                      onClick={() => handleDownload(file)}
                    >
                      <span>{label}</span>
                      <span className="sc-menu__hint">
                        {busyType === fileType ? (fileType === 'MIDI' ? 'Đang tạo MIDI...' : 'Đang tải...') : 'Tải về'}
                      </span>
                    </button>
                  ) : (
                    // PDF, SVG: tạo file ở nhánh export-formats (mục 1.29–1.30)
                    <button
                      role="menuitem"
                      className="sc-menu__item is-missing"
                      disabled
                      title="Chức năng tạo file sẽ có ở nhánh xuất file"
                    >
                      <span>{label}</span>
                      <span className="sc-menu__hint">Tạo file</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ExportAudioDialog
        scoreId={scoreId}
        title={title ?? 'ban-nhac'}
        staffCount={staffCount}
        format={audioFormat}
        onClose={() => setAudioFormat(null)}
      />
    </>
  );
}
