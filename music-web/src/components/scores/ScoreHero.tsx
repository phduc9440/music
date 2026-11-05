import AuthImage from './AuthImage';
import StatusBadge from './StatusBadge';
import { DIFFICULTY_LABELS, SOURCE_LABELS, formatDateTime } from '../../utils/score';
import type { ScoreDetail } from '../../types';
import DownloadMenu from './DownloadMenu';

interface Props {
  score: ScoreDetail;
  onEdit: () => void;
  onDelete: () => void;
}

/** Khối đầu trang chi tiết: ảnh bìa, tiêu đề, thông số và nút thao tác. */
export default function ScoreHero({ score, onEdit, onDelete }: Props) {
  const facts: [string, string][] = [
    ['Khóa / dấu hóa', score.keySignature || '—'],
    ['Nhịp', score.timeSignature || '—'],
    ['Tempo', score.tempoBpm ? `${score.tempoBpm} BPM` : '—'],
    ['Số ô nhịp', score.measureCount?.toString() ?? '—'],
    ['Số trang', score.pageCount?.toString() ?? '—'],
    ['Độ khó', score.difficulty ? DIFFICULTY_LABELS[score.difficulty] : '—'],
    ['Nguồn', score.sourceType ? SOURCE_LABELS[score.sourceType] : '—'],
    ['Cập nhật', formatDateTime(score.updatedAt)],
  ];

  return (
    <section className="sc-hero">
      <AuthImage src={score.thumbnailUrl} alt={score.title} className="sc-hero__cover" />
      <div className="sc-hero__main">
        <div className="sc-hero__badges">
          <StatusBadge status={score.processingStatus} />
          <span className="sc-chip">{score.visibility === 'PUBLIC' ? 'Công khai' : 'Riêng tư'}</span>
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

        {score.processingStatus === 'FAILED' && score.rejectReason && (
          <div className="sc-error">Xử lý thất bại: {score.rejectReason}</div>
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
          {/* TODO(feature/score-viewer): mở /scores/:id/edit (1.17) */}
          <button className="sc-btn sc-btn--primary" disabled title="Trình chỉnh sửa sẽ có ở nhánh score-viewer">
            Mở trình chỉnh sửa
          </button>
          {/* TODO(feature/playback-basic): mở /scores/:id/play (1.22) */}
          <button className="sc-btn" disabled title="Trình phát sẽ có ở nhánh playback-basic">
            ▶ Phát
          </button>
          <DownloadMenu files={score.files} />
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
