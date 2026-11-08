import { Link } from 'react-router-dom';
import AuthImage from './AuthImage';
import StatusBadge from './StatusBadge';
import { OMR_TASK_TYPE, describeTaskError } from '../../utils/omr';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, SOURCE_LABELS, VISIBILITY_LABELS, formatDateTime } from '../../utils/score';
import type { ScoreDetail } from '../../types';
import DownloadMenu from './DownloadMenu';

interface Props {
  score: ScoreDetail;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRequestEdit: () => void;
}

/** Khối đầu trang chi tiết: ảnh bìa, tiêu đề, thông số và nút thao tác. */
export default function ScoreHero({ score, onEdit, onDelete, onShare, onRequestEdit }: Props) {
  const facts: [string, string][] = [
    ['Khóa / dấu hóa', score.keySignature || '—'],
    ['Nhịp', score.timeSignature || '—'],
    ['Tempo', score.tempoBpm ? `${score.tempoBpm} BPM` : '—'],
    ['Số ô nhịp', score.measureCount?.toString() ?? '—'],
    ['Số trang', score.pageCount?.toString() ?? '—'],
    ['Độ khó', score.difficulty ? DIFFICULTY_LABELS[score.difficulty] : '—'],
    ['Đánh giá', score.averageRating != null ? `${score.averageRating.toFixed(1)} ★ (${score.ratingCount ?? 0})` : '—'],
    ['Nguồn', score.sourceType ? SOURCE_LABELS[score.sourceType] : '—'],
    ['Cập nhật', formatDateTime(score.updatedAt)],
  ];

  // Mở được trình chỉnh sửa khi đã có MusicXML hiện hành (không phụ thuộc trạng thái xử lý, vì nhận diện lại lỗi vẫn giữ
  // bản MusicXML cũ dùng được)
  const hasMusicXml = score.files.some((f) => f.fileType === 'MUSICXML');

  // Lý do thất bại lấy từ tác vụ OMR mới nhất (cột reject_reason của bản nhạc không được ghi)
  const failedTask =
    score.processingStatus === 'FAILED'
      ? score.latestTasks.find((t) => t.taskType === OMR_TASK_TYPE && t.status === 'FAILED')
      : undefined;
  const failure = failedTask ? describeTaskError(failedTask) : null;
  const failureReason = failure ? `${failure.title}${failure.detail ? ` (${failure.detail})` : ''}` : score.rejectReason;

  return (
    <section className="sc-hero">
      <AuthImage src={score.thumbnailUrl} alt={score.title} className="sc-hero__cover" />
      <div className="sc-hero__main">
        <div className="sc-hero__badges">
          <StatusBadge status={score.processingStatus} />
          <span className="sc-chip">{VISIBILITY_LABELS[score.visibility]}</span>
          {score.accessLevel && score.accessLevel !== 'OWNER' && (
            <span className="sc-chip sc-chip--accent">Bạn là: {ACCESS_LEVEL_LABELS[score.accessLevel]}</span>
          )}
          {score.isOfficial && <span className="sc-chip sc-chip--accent">Chính thức</span>}
        </div>
        <h1 className="sc-hero__title">{score.title}</h1>
        <p className="sc-hero__composer">{score.composer || 'Chưa rõ tác giả'}</p>
        {score.tags && score.tags.length > 0 && (
          <div className="sc-hero__badges">
            {score.tags.map((t) => (
              <span key={t.id} className="sc-chip sc-chip--tag">
                {t.name}
              </span>
            ))}
          </div>
        )}
        {score.ownerEmail && <p className="sc-hero__owner">Chủ sở hữu: {score.ownerEmail}</p>}

        {(score.processingStatus === 'PENDING' || score.processingStatus === 'PROCESSING') && (
          <p className="sc-hero__owner">
            <Link to={`/scores/${score.id}/processing`}>Xem tiến độ số hóa →</Link>
          </p>
        )}

        {score.processingStatus === 'COMPLETED' && score.sourceType === 'OMR' && (
          <p className="sc-hero__owner">
            <Link to={`/scores/${score.id}/review`}>Xem kết quả số hóa →</Link>
          </p>
        )}

        {score.processingStatus === 'FAILED' && failureReason && (
          <div className="sc-error">Xử lý thất bại: {failureReason}</div>
        )}
        {score.visibility === 'PRIVATE' && score.processingStatus !== 'FAILED' && score.rejectReason && (
          <div className="sc-error">Yêu cầu công khai bị từ chối: {score.rejectReason}</div>
        )}

        <dl className="sc-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="sc-fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {score.studyNotes && (
          <div className="sc-notes">
            <h4>Ghi chú luyện tập</h4>
            <p>{score.studyNotes}</p>
          </div>
        )}

        <div className="sc-hero__actions">
          <Link
            className={`sc-btn sc-btn--primary${hasMusicXml ? '' : ' is-disabled'}`}
            to={`/scores/${score.id}/edit`}
            aria-disabled={!hasMusicXml}
            title={hasMusicXml ? undefined : 'Bản nhạc chưa có MusicXML để mở'}
            onClick={(e) => !hasMusicXml && e.preventDefault()}
          >
            {score.canEdit ? 'Mở trình chỉnh sửa' : 'Xem bản nhạc'}
          </Link>
          {/* TODO(feature/playback-basic): mở /scores/:id/play (1.22) */}
          <button className="sc-btn" disabled title="Trình phát sẽ có ở nhánh playback-basic">
            ▶ Phát
          </button>
          <DownloadMenu scoreId={score.id} files={score.files} />
          {score.canManageSharing && (
            <button className="sc-btn" onClick={onShare}>
              Chia sẻ
            </button>
          )}
          {!score.canEdit && score.accessLevel !== 'OWNER' && (
            <button className="sc-btn" onClick={onRequestEdit}>
              Xin quyền chỉnh sửa
            </button>
          )}
          {score.canEdit && (
            <button className="sc-btn" onClick={onEdit}>
              Sửa thông tin
            </button>
          )}
          {score.canDelete && (
            <button className="sc-btn sc-btn--danger" onClick={onDelete}>
              Xóa
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
