import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile } from '../../services';
import type { ScoreFileInfo } from '../../types';
import { DOWNLOAD_FORMATS } from '../../utils/score';

/**
 * Menu "Tải xuống" của trang chi tiết: liệt kê MusicXML, MIDI, Kern, MP3, WAV, PDF, SVG.
 * Định dạng đã có file thì tải được ngay, chưa có thì hiện "Tạo file" (làm ở nhánh export, mục 1.28–1.30).
 */
export default function DownloadMenu({ files }: { files: ScoreFileInfo[] }) {
  const [open, setOpen] = useState(false);
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
    try {
      await downloadFile(file.downloadUrl, file.originalFileName || `${file.fileType}-${file.id}`);
    } catch {
      toast.error('Không tải được file');
    }
  };

  return (
    <div className="sc-menu" ref={ref}>
      <button className="sc-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        Tải xuống ▾
      </button>
      {open && (
        <ul className="sc-menu__list" role="menu">
          {DOWNLOAD_FORMATS.map(({ fileType, label }) => {
            const file = files.find((f) => f.fileType === fileType);
            return (
              <li key={fileType} role="none">
                {file ? (
                  <button role="menuitem" className="sc-menu__item" onClick={() => handleDownload(file)}>
                    <span>{label}</span>
                    <span className="sc-menu__hint">Tải về</span>
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
