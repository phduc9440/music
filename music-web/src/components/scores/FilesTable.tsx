import { useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile } from '../../services';
import { FILE_TYPE_LABELS, formatSize } from '../../utils/score';
import type { ScoreFileInfo } from '../../types';

/** Danh sách file hiện hành của bản nhạc, mỗi dòng có nút tải về. */
export default function FilesTable({ files }: { files: ScoreFileInfo[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (f: ScoreFileInfo) => {
    setDownloadingId(f.id);
    try {
      await downloadFile(f.downloadUrl, f.originalFileName || `${f.fileType}-${f.id}`);
    } catch {
      toast.error('Không tải được file');
    } finally {
      setDownloadingId(null);
    }
  };

  if (files.length === 0) {
    return <div className="sc-panel sc-panel--empty">Chưa có file nào.</div>;
  }

  return (
    <div className="sc-panel sc-table-wrap">
      <table className="sc-table">
        <thead>
          <tr>
            <th>Loại</th>
            <th>Tên file</th>
            <th>Trang</th>
            <th>Dung lượng</th>
            <th aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td>
                <span className="sc-chip sc-chip--accent">{FILE_TYPE_LABELS[f.fileType] ?? f.fileType}</span>
              </td>
              <td className="sc-table__name">{f.originalFileName || f.id}</td>
              <td>{f.pageNumber ?? '—'}</td>
              <td>{formatSize(f.sizeBytes)}</td>
              <td className="sc-table__action">
                <button
                  className="sc-btn sc-btn--sm"
                  disabled={downloadingId === f.id}
                  onClick={() => handleDownload(f)}
                >
                  {downloadingId === f.id ? 'Đang tải...' : 'Tải về'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
