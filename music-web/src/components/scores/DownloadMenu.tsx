import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, downloadScoreExport } from '../../services';
import type { ScoreFileInfo } from '../../types';
import { DOWNLOAD_FORMATS, getErrorMessage } from '../../utils/score';

/**
 * Menu "Tải xuống" của trang chi tiết: liệt kê MusicXML, MIDI, Kern, MP3, WAV, PDF, SVG.
 * Định dạng đã có file thì tải được ngay, chưa có thì hiện "Tạo file" (làm ở nhánh export, mục 1.28–1.30).
 * MusicXML và MIDI tải qua API riêng của bản nhạc để luôn nhận bản mới nhất (MIDI cũ sẽ được BE tạo lại).
 */
export default function DownloadMenu({ scoreId, files }: { scoreId: string; files: ScoreFileInfo[] }) {
  const [open, setOpen] = useState(false);
  const [busyType, setBusyType] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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
    <div className="sc-menu" ref={ref}>
      <button className="sc-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        Tải xuống
      </button>
      {open && (
        <ul className="sc-menu__list" role="menu">
          {DOWNLOAD_FORMATS.map(({ fileType, label }) => {
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
                  // TODO(feature/export-*): gọi API tạo file (MuseScore CLI) rồi tải về
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
  );
}
