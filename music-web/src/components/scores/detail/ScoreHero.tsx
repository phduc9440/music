import { Link } from 'react-router-dom';
import AuthImage from '../common/AuthImage';
import StatusBadge from '../common/StatusBadge';
import { OMR_TASK_TYPE, describeTaskError } from '../../../utils/omr';
import {
  ACCESS_LEVEL_LABELS,
  DIFFICULTY_LABELS,
  SOURCE_LABELS,
  formatDateTime,
  useScoreBase,
} from '../../../utils/score';
import type { ScoreDetail } from '../../../types';
import DownloadMenu from '../viewer/DownloadMenu';
import VisibilityBadge from '../common/VisibilityBadge';
import MidiConvertButton from '../../export/MidiConvertButton';
import { isTaskFinished } from '../../export/exportUtils';
import { Icon } from '../../ui';
import PublishToggle from './PublishToggle';

interface Props {
  score: ScoreDetail;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRequestEdit: () => void;
  /** Gọi khi chủ sở hữu đổi chế độ hiển thị (công khai, hủy yêu cầu, về riêng tư) với bản nhạc đã cập nhật. */
  onVisibilityChanged: (score: ScoreDetail) => void;
  /** Gọi khi bản nhạc nhập từ MIDI chuyển xong thành MusicXML để trang tải lại. */
  onConverted?: () => void;
}

/** Mở được trình chỉnh sửa/trình phát khi đã có MusicXML hiện hành (nhận diện lại lỗi vẫn giữ bản cũ dùng được). */
const hasMusicXml = (score: ScoreDetail) => score.files.some((f) => f.fileType === 'MUSICXML');

/**
 * Đầu trang chi tiết: nhãn trạng thái, tiêu đề, dòng phụ, ba thao tác chính (mở, phát, tải xuống) và các thông báo
 * (đang số hóa, xử lý lỗi, bị từ chối công khai).
 */
export default function ScoreHero({ score, onConverted }: Pick<Props, 'score' | 'onConverted'>) {
  const base = useScoreBase();
  const ready = hasMusicXml(score);
  // Bản nhạc nhập từ MIDI chưa có MusicXML: cho chuyển đổi để mở được trình chỉnh sửa và trình phát
  const canConvertMidi = score.canEdit && !ready && score.files.some((f) => f.fileType === 'ORIGINAL_MIDI');
  const activeConversion = score.latestTasks.find(
    (t) => t.taskType === 'FORMAT_CONVERSION' && !isTaskFinished(t.status),
  );

  // Lý do thất bại lấy từ tác vụ OMR mới nhất (cột reject_reason của bản nhạc không được ghi)
  const failedTask =
    score.processingStatus === 'FAILED'
      ? score.latestTasks.find((t) => t.taskType === OMR_TASK_TYPE && t.status === 'FAILED')
      : undefined;
  const failure = failedTask ? describeTaskError(failedTask) : null;
  const failureReason = failure
    ? `${failure.title}${failure.detail ? ` (${failure.detail})` : ''}`
    : score.rejectReason;
  const processing = score.processingStatus === 'PENDING' || score.processingStatus === 'PROCESSING';

  const meta = [
    score.composer || 'Chưa rõ tác giả',
    score.ownerEmail ? `Chủ sở hữu: ${score.ownerEmail}` : null,
    `Cập nhật ${formatDateTime(score.updatedAt)}`,
  ].filter(Boolean);

  return (
    <header className="sd-head">
      <div className="sd-head__row">
        <div className="sd-head__text">
          <div className="sd-badges">
            <StatusBadge status={score.processingStatus} />
            <VisibilityBadge value={score.visibility} />
            {score.isOfficial && <span className="sc-chip sc-chip--accent">Kho score mẫu</span>}
            {score.accessLevel && score.accessLevel !== 'OWNER' && (
              <span className="sc-chip sc-chip--accent">Bạn là: {ACCESS_LEVEL_LABELS[score.accessLevel]}</span>
            )}
          </div>
          <h1 className="sd-title">{score.title}</h1>
          <p className="sd-meta">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </p>
        </div>

        <div className="sd-actions">
          {canConvertMidi && (
            <MidiConvertButton scoreId={score.id} resume={activeConversion} onDone={() => onConverted?.()} />
          )}
          <DownloadMenu
            scoreId={score.id}
            files={score.files}
            title={score.title}
            staffCount={score.staffCount}
            canDownload={score.canDownload}
          />
          <Link
            className={`sc-btn${ready ? '' : ' is-disabled'}`}
            to={`${base}/${score.id}/play`}
            aria-disabled={!ready}
            title={ready ? undefined : 'Bản nhạc chưa có MusicXML để phát'}
            onClick={(e) => !ready && e.preventDefault()}
          >
            <Icon name="play" size={16} />
            Phát
          </Link>
          <Link
            className={`sc-btn sc-btn--primary${ready ? '' : ' is-disabled'}`}
            to={`${base}/${score.id}/edit`}
            aria-disabled={!ready}
            title={ready ? undefined : 'Bản nhạc chưa có MusicXML để mở'}
            onClick={(e) => !ready && e.preventDefault()}
          >
            <Icon name={score.canEdit ? 'edit' : 'eye'} size={16} />
            {score.canEdit ? 'Mở trình chỉnh sửa' : 'Xem bản nhạc'}
          </Link>
        </div>
      </div>

      {processing && (
        <div className="sd-alert sd-alert--info" role="status">
          <Icon name="clock" size={16} />
          <span>Bản nhạc đang được số hóa.</span>
          <Link to={`${base}/${score.id}/processing`}>Xem tiến độ →</Link>
        </div>
      )}
      {score.processingStatus === 'COMPLETED' && score.sourceType === 'OMR' && (
        <div className="sd-alert sd-alert--info">
          <Icon name="check" size={16} />
          <span>Số hóa xong. Nên xem lại kết quả trước khi dùng.</span>
          <Link to={`${base}/${score.id}/review`}>Xem kết quả số hóa →</Link>
        </div>
      )}
      {score.processingStatus === 'FAILED' && failureReason && (
        <div className="sd-alert sd-alert--danger" role="alert">
          <Icon name="alert" size={16} />
          <span>Xử lý thất bại: {failureReason}</span>
        </div>
      )}
      {score.visibility === 'PRIVATE' && score.processingStatus !== 'FAILED' && score.rejectReason && (
        <div className="sd-alert sd-alert--warning" role="alert">
          <Icon name="alert" size={16} />
          <span>Yêu cầu công khai bị từ chối: {score.rejectReason}</span>
        </div>
      )}
    </header>
  );
}

/** Khung xem trước trang 1, bấm để mở bản nhạc. */
export function ScorePreview({ score }: { score: ScoreDetail }) {
  const base = useScoreBase();
  const ready = hasMusicXml(score);
  // Bản nhập từ file MusicXML/MIDI không có ảnh trang: hiện khung trống gọn thay cho ảnh giữ chỗ cỡ lớn
  if (!score.thumbnailUrl) {
    return (
      <section className="sd-card sd-preview sd-preview--empty">
        <span className="sd-preview__empty-icon">
          <Icon name="music" size={22} />
        </span>
        <strong>Chưa có ảnh xem trước</strong>
        <span>Bản nhạc nhập từ file không có ảnh trang.{ready ? ' Mở bản nhạc để xem nốt.' : ''}</span>
        {ready && (
          <Link to={`${base}/${score.id}/edit`} className="sc-btn sc-btn--sm">
            <Icon name="eye" size={14} />
            Mở bản nhạc
          </Link>
        )}
      </section>
    );
  }
  const image = <AuthImage src={score.thumbnailUrl} alt={`Trang 1 của ${score.title}`} className="sd-preview__img" />;
  return (
    <section className="sd-card sd-preview">
      {ready ? (
        <Link to={`${base}/${score.id}/edit`} className="sd-preview__link" title="Mở bản nhạc">
          {image}
          <span className="sd-preview__hint">
            <Icon name="eye" size={16} />
            Mở bản nhạc
          </span>
        </Link>
      ) : (
        image
      )}
    </section>
  );
}

/** Cột phải: số liệu nổi bật, thông số, ghi chú luyện tập và các thao tác quản lý. */
export function ScoreSidebar({
  score,
  onEdit,
  onDelete,
  onShare,
  onRequestEdit,
  onVisibilityChanged,
}: Omit<Props, 'onConverted'>) {
  const base = useScoreBase();
  const highlights: [string, string][] = [
    ['Ô nhịp', score.measureCount?.toString() ?? '—'],
    ['Trang', score.pageCount?.toString() ?? '—'],
    ['Đánh giá', score.averageRating != null ? `${score.averageRating.toFixed(1)}★` : '—'],
  ];
  const facts: [string, React.ReactNode][] = [
    ['Khóa / dấu hóa', score.keySignature || '—'],
    ['Nhịp', score.timeSignature || '—'],
    ['Tempo', score.tempoBpm ? `${score.tempoBpm} BPM` : '—'],
    ['Độ khó', score.difficulty ? DIFFICULTY_LABELS[score.difficulty] : '—'],
    ['Nguồn', score.sourceType ? SOURCE_LABELS[score.sourceType] : '—'],
    ['Lượt đánh giá', `${score.ratingCount ?? 0}`],
    [
      'Thể loại',
      score.tags && score.tags.length > 0 ? (
        <span className="sd-tags">
          {score.tags.map((t) => (
            <span key={t.id} className="sc-chip sc-chip--tag">
              {t.name}
            </span>
          ))}
        </span>
      ) : (
        '—'
      ),
    ],
  ];
  const canRequestEdit = !score.canEdit && score.accessLevel !== 'OWNER' && !base.startsWith('/admin');
  // Chỉ chủ sở hữu đổi được chế độ hiển thị; admin kiểm duyệt có nút riêng ở trang quản trị. Bản trong kho mẫu do
  // hệ thống quản lý nên không có nút này.
  const canChangeVisibility =
    score.canManageSharing && score.accessLevel === 'OWNER' && !base.startsWith('/admin') && !score.isOfficial;
  const hasManage = score.canManageSharing || score.canEdit || canRequestEdit || score.canDelete || canChangeVisibility;

  return (
    <aside className="sd-side">
      <section className="sd-card">
        <h2 className="sd-card__title">Thông tin</h2>
        <div className="sd-highlights">
          {highlights.map(([label, value]) => (
            <div key={label} className="sd-highlight">
              <span className="sd-highlight__value">{value}</span>
              <span className="sd-highlight__label">{label}</span>
            </div>
          ))}
        </div>
        <dl className="sd-dl">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {score.studyNotes && (
        <section className="sd-card">
          <h2 className="sd-card__title">Ghi chú luyện tập</h2>
          <p className="sd-notes">{score.studyNotes}</p>
        </section>
      )}

      {hasManage && (
        <section className="sd-card">
          <h2 className="sd-card__title">Quản lý</h2>
          <div className="sd-manage">
            {score.canManageSharing && (
              <button type="button" className="sd-manage__item" onClick={onShare}>
                <Icon name="share" size={16} />
                Chia sẻ
              </button>
            )}
            {canChangeVisibility && <PublishToggle score={score} onChanged={onVisibilityChanged} />}
            {canRequestEdit && (
              <button type="button" className="sd-manage__item" onClick={onRequestEdit}>
                <Icon name="key" size={16} />
                Xin quyền chỉnh sửa
              </button>
            )}
            {score.canEdit && (
              <button type="button" className="sd-manage__item" onClick={onEdit}>
                <Icon name="edit" size={16} />
                Sửa thông tin
              </button>
            )}
            {score.canDelete && (
              <button type="button" className="sd-manage__item sd-manage__item--danger" onClick={onDelete}>
                <Icon name="trash" size={16} />
                Xóa bản nhạc
              </button>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
