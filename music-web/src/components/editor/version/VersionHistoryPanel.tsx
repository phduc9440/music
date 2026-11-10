import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { versionApi } from '../../../services/versionApi';
import type { ScoreVersion } from '../../../types/version';
import { formatDateTime } from '../../../utils/score';
import Modal from '../../scores/common/Modal';
import MusicXmlViewer from '../../scores/viewer/MusicXmlViewer';
import VersionDiffView from './VersionDiffView';
import { formatVersionSize, getVersionErrorMessage, versionSourceLabel } from './versionUtils';
import './version.css';
import { useDialog } from '../../ui/dialog-context';

interface Props {
  scoreId: string;
  /** Chỉ người sửa được mới thấy nút Khôi phục. */
  canEdit: boolean;
  /** Editor đang có thay đổi chưa lưu (khôi phục sẽ bỏ chúng nên phải hỏi lại). */
  dirty: boolean;
  /** Đang lưu hoặc đang khôi phục. */
  busy: boolean;
  /** Khôi phục phiên bản; trả về true nếu thành công (panel tự đóng). */
  onRestore: (version: number) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Lịch sử phiên bản MusicXML của bản nhạc (đặc tả 3.6): danh sách tối đa 20 bản, bấm "Xem" để xem trước (chỉ đọc),
 * "Khôi phục" để lưu một bản cũ thành phiên bản mới nhất mà không xóa lịch sử.
 */
export default function VersionHistoryPanel({ scoreId, canEdit, dirty, busy, onRestore, onClose }: Props) {
  const { confirm } = useDialog();
  const [versions, setVersions] = useState<ScoreVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [compare, setCompare] = useState<{ version: number; base?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionApi
      .list(scoreId)
      .then((res) => !cancelled && setVersions(res.data.result))
      .catch((err) => !cancelled && setError(getVersionErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  const restore = async (version: number) => {
    const warning = dirty ? 'Bạn có thay đổi chưa lưu, chúng sẽ bị bỏ. ' : '';
    const ok = await confirm({
      title: `Khôi phục phiên bản ${version}?`,
      message: `${warning}Nội dung của nó sẽ được lưu thành phiên bản mới nhất, các phiên bản hiện có vẫn nằm trong lịch sử.`,
      confirmLabel: 'Khôi phục',
      tone: dirty ? 'danger' : 'primary',
    });
    if (!ok) return;
    setRestoring(version);
    const done = await onRestore(version);
    setRestoring(null);
    if (done) onClose();
  };

  const hasOmr = versions?.some((v) => v.source === 'OMR') ?? false;

  if (compare !== null) {
    return (
      <Modal title={`So sánh phiên bản ${compare.version}`} onClose={onClose} className="vh-modal--wide">
        <VersionDiffView scoreId={scoreId} version={compare.version} base={compare.base} />
        <div className="sc-modal__actions">
          <button className="sc-btn" onClick={() => setCompare(null)}>
            Quay lại danh sách
          </button>
        </div>
      </Modal>
    );
  }

  if (preview !== null) {
    const target = versions?.find((v) => v.version === preview);
    return (
      <Modal title={`Xem phiên bản ${preview}`} onClose={onClose} className="vh-modal--wide">
        <VersionPreview scoreId={scoreId} version={preview} />
        <div className="sc-modal__actions">
          <button className="sc-btn" onClick={() => setPreview(null)}>
            Quay lại danh sách
          </button>
          {canEdit && target && !target.isCurrent && (
            <button
              className="sc-btn sc-btn--primary"
              disabled={busy || restoring !== null}
              onClick={() => void restore(preview)}
            >
              {restoring === preview ? 'Đang khôi phục...' : 'Khôi phục phiên bản này'}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Lịch sử phiên bản" onClose={onClose}>
      {error ? (
        <p className="vh-empty" role="alert">
          {error}
        </p>
      ) : versions === null ? (
        <p className="vh-empty" aria-busy="true">
          Đang tải...
        </p>
      ) : versions.length === 0 ? (
        <p className="vh-empty">Bản nhạc chưa có phiên bản nào.</p>
      ) : (
        <>
          <p className="vh-hint">Chỉ giữ 20 phiên bản mới nhất. Khôi phục không xóa các phiên bản hiện có.</p>
          <ul className="vh-list">
            {versions.map((v, index) => {
              const previous = versions[index + 1]; // danh sách mới nhất trước nên bản kế tiếp là bản trước đó
              return (
                <li key={v.version} className={`vh-item${v.isCurrent ? ' is-current' : ''}`}>
                  <div className="vh-item__main">
                    <div className="vh-item__title">
                      <strong>Phiên bản {v.version}</strong>
                      {v.isCurrent && <span className="vh-badge vh-badge--current">Hiện tại</span>}
                      <span className="vh-badge">{versionSourceLabel(v)}</span>
                    </div>
                    <div className="vh-item__meta">
                      {formatDateTime(v.createdAt)} · {v.savedByName || '—'}
                      {v.measureCount ? ` · ${v.measureCount} ô nhịp` : ''}
                      {formatVersionSize(v.sizeBytes) ? ` · ${formatVersionSize(v.sizeBytes)}` : ''}
                    </div>
                  </div>
                  <div className="vh-item__actions">
                    <button className="sc-btn sc-btn--sm" onClick={() => setPreview(v.version)}>
                      Xem
                    </button>
                    {hasOmr && v.source !== 'OMR' && (
                      <button className="sc-btn sc-btn--sm" onClick={() => setCompare({ version: v.version })}>
                        So với bản OMR
                      </button>
                    )}
                    {previous && (
                      <button
                        className="sc-btn sc-btn--sm"
                        onClick={() => setCompare({ version: v.version, base: previous.version })}
                      >
                        So với bản trước
                      </button>
                    )}
                    {canEdit && !v.isCurrent && (
                      <button
                        className="sc-btn sc-btn--sm"
                        disabled={busy || restoring !== null}
                        onClick={() => void restore(v.version)}
                      >
                        {restoring === v.version ? 'Đang khôi phục...' : 'Khôi phục'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}

/** Tải MusicXML của một phiên bản cũ và vẽ ra (chỉ xem). */
function VersionPreview({ scoreId, version }: { scoreId: string; version: number }) {
  const [xml, setXml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionApi
      .content(scoreId, version)
      .then((text) => !cancelled && setXml(text))
      .catch((err) => {
        if (cancelled) return;
        setError(getVersionErrorMessage(err));
        toast.error(getVersionErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [scoreId, version]);

  if (error) return <p className="vh-empty">{error}</p>;
  if (xml === null) return <p className="vh-empty">Đang tải phiên bản...</p>;
  return (
    <div className="vh-preview">
      <MusicXmlViewer xml={xml} />
    </div>
  );
}
