import { useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../../routes/transition-nav';
import { useNavigate } from '../../../routes/useTransitionNavigate';
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
import OfficialRequestBanner from './OfficialRequestBanner';
import ScoreCover from './ScoreCover';
import { t } from '../../../i18n/core';

interface Props {
  score: ScoreDetail;
  /** Mở hộp xin thêm quyền (người không phải chủ, chưa có quyền sửa). */
  onRequestMore?: () => void;
  /** Gọi khi chủ sở hữu đổi chế độ hiển thị (công khai, hủy yêu cầu, về riêng tư) với bản nhạc đã cập nhật. */
  onVisibilityChanged: (score: ScoreDetail) => void;
}

/** Mở được trình chỉnh sửa/trình phát khi đã có MusicXML hiện hành (nhận diện lại lỗi vẫn giữ bản cũ dùng được). */
const hasMusicXml = (score: ScoreDetail) => score.files.some((f) => f.fileType === 'MUSICXML');

/**
 * Đầu trang chi tiết: nhãn trạng thái, tiêu đề, dòng phụ, ba thao tác chính (mở, phát, tải xuống) và các thông báo
 * (đang số hóa, xử lý lỗi, bị từ chối công khai).
 */
export default function ScoreHero({ score, onVisibilityChanged, onRequestMore }: Props) {
  // Đổi hoặc gỡ ảnh bìa trả về bản nhạc đã cập nhật, dùng chung đường cập nhật với đổi chế độ hiển thị
  const base = useScoreBase();
  const navigate = useNavigate();
  const ready = hasMusicXml(score);
  const [linkCopied, setLinkCopied] = useState(false);
  // Đường dẫn trang chi tiết của bản nhạc (người nhận cần đăng nhập và có quyền xem bản này)
  const copyLink = async () => {
    const url = `${window.location.origin}/scores/${score.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Trình duyệt chặn Clipboard API (http, không có quyền): chép bằng ô nhập tạm
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      if (!ok) {
        toast.error(t('scores.hero.copyLinkFailed'));
        return;
      }
    }
    toast.success(t('scores.hero.copyLinkDone'));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  // Bản nhạc nhập từ MIDI chưa có MusicXML: cho chuyển đổi để mở được trình chỉnh sửa và trình phát
  const canConvertMidi = score.canEdit && !ready && score.files.some((f) => f.fileType === 'ORIGINAL_MIDI');
  const activeConversion = score.latestTasks.find(
    (t) => t.taskType === 'FORMAT_CONVERSION' && !isTaskFinished(t.status),
  );
  // Chuyển xong thì mở luôn trình chỉnh sửa. Chưa từng chuyển (kể cả thất bại) thì tự chuyển ngay, để file MIDI vừa nhập không phải bấm tay
  const autoConvert = !score.latestTasks.some((t) => t.taskType === 'FORMAT_CONVERSION');

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

  // Bản trong kho mẫu do hệ thống quản lý, chỉ admin sửa: không có chuyện xin quyền chỉnh sửa
  const canRequestMore =
    !score.canEdit && score.accessLevel !== 'OWNER' && !base.startsWith('/admin') && !score.isOfficial;

  const meta = [
    score.composer || t('scores.card.unknownComposer'),
    score.ownerEmail ? t('scores.hero.owner', { name: score.ownerEmail }) : null,
    t('scores.hero.updated', { when: formatDateTime(score.updatedAt) }),
  ].filter(Boolean);

  return (
    <header className="sd-head">
      <div className="sd-head__row">
        <div className="sd-head__lead">
          <div className="sd-head__cover">
            <ScoreCover score={score} onChanged={onVisibilityChanged} />
            {/* Biểu tượng nhỏ ở góc ảnh bìa: chép đường dẫn bản nhạc để gửi cho người khác (báo cáo vi phạm nằm ở tab Cài đặt) */}
            <div className="sd-cover-tools">
              <button
                type="button"
                className={`sd-iconbtn${linkCopied ? ' is-done' : ''}`}
                onClick={copyLink}
                title={linkCopied ? t('scores.hero.copyLinkCopied') : t('scores.hero.copyLinkHint')}
                aria-label={t('scores.hero.copyLink')}
              >
                <Icon name={linkCopied ? 'check' : 'copy'} size={14} />
              </button>
            </div>
          </div>
          <div className="sd-head__text">
            <div className="sd-badges">
              <StatusBadge status={score.processingStatus} />
              <VisibilityBadge value={score.visibility} />
              {score.isOfficial && (
                <span className="sc-chip sc-chip--accent">{t('common.nav.items.officialLibrary')}</span>
              )}
              {score.accessLevel && score.accessLevel !== 'OWNER' && (
                <span className="sc-chip sc-chip--accent">
                  {t('scores.hero.youAre', { role: ACCESS_LEVEL_LABELS[score.accessLevel] })}
                </span>
              )}
            </div>
            <h1 className="sd-title">{score.title}</h1>
            <p className="sd-meta">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </p>
          </div>
        </div>

        <div className="sd-actions">
          {canConvertMidi && (
            <MidiConvertButton
              scoreId={score.id}
              resume={activeConversion}
              autoStart={autoConvert}
              onDone={() => navigate(`${base}/${score.id}/edit`)}
            />
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
            title={ready ? undefined : t('scores.hero.noXmlPlay')}
            onClick={(e) => !ready && e.preventDefault()}
          >
            <Icon name="play" size={16} />
            {t('scores.hero.play')}
          </Link>
          <Link
            className={`sc-btn sc-btn--primary${ready ? '' : ' is-disabled'}`}
            to={`${base}/${score.id}/edit`}
            aria-disabled={!ready}
            title={ready ? undefined : t('scores.hero.noXmlOpen')}
            onClick={(e) => !ready && e.preventDefault()}
          >
            <Icon name={score.canEdit ? 'edit' : 'eye'} size={16} />
            {score.canEdit ? t('scores.hero.openEditor') : t('scores.hero.viewScore')}
          </Link>
          {canRequestMore && onRequestMore && (
            <button type="button" className="sc-btn" onClick={onRequestMore}>
              <Icon name="key" size={16} />
              {t('scores.detail.requestMoreTitle')}
            </button>
          )}
        </div>
      </div>

      {score.accessLevel === 'OWNER' && !base.startsWith('/admin') && <OfficialRequestBanner scoreId={score.id} />}
      {score.myOriginalScoreId && (
        <div className="sd-alert sd-alert--info" role="status">
          <Icon name="library" size={16} />
          <span>{t('scores.hero.officialCopy')}</span>
          <Link to={`/scores/${score.myOriginalScoreId}`}>{t('scores.hero.openMine')} →</Link>
        </div>
      )}

      {processing && (
        <div className="sd-alert sd-alert--info" role="status">
          <Icon name="clock" size={16} />
          <span>{t('scores.hero.digitizing')}</span>
          <Link to={`${base}/${score.id}/processing`}>{t('scores.hero.viewProgress')} →</Link>
        </div>
      )}
      {score.processingStatus === 'COMPLETED' && score.sourceType === 'OMR' && (
        <div className="sd-alert sd-alert--info">
          <Icon name="check" size={16} />
          <span>{t('scores.hero.digitized')}</span>
          <Link to={`${base}/${score.id}/review`}>{t('scores.hero.viewResult')} →</Link>
        </div>
      )}
      {score.processingStatus === 'FAILED' && failureReason && (
        <div className="sd-alert sd-alert--danger" role="alert">
          <Icon name="alert" size={16} />
          <span>{t('scores.hero.failed', { reason: failureReason })}</span>
        </div>
      )}
      {score.visibility === 'PRIVATE' && score.processingStatus !== 'FAILED' && score.rejectReason && (
        <div className="sd-alert sd-alert--warning" role="alert">
          <Icon name="alert" size={16} />
          <span>{t('scores.hero.rejected', { reason: score.rejectReason })}</span>
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
        <strong>{t('scores.hero.noPreview')}</strong>
        <span>
          {t('scores.hero.noPreviewHint')}
          {ready ? ` ${t('scores.hero.noPreviewOpen')}` : ''}
        </span>
        {ready && (
          <Link to={`${base}/${score.id}/edit`} className="sc-btn sc-btn--sm">
            <Icon name="eye" size={14} />
            {t('scores.hero.openScore')}
          </Link>
        )}
      </section>
    );
  }
  const image = (
    <AuthImage
      src={score.thumbnailUrl}
      alt={t('scores.hero.pageOneAlt', { title: score.title })}
      className="sd-preview__img"
    />
  );
  return (
    <section className="sd-card sd-preview">
      {ready ? (
        <Link to={`${base}/${score.id}/edit`} className="sd-preview__link" title={t('scores.hero.openScore')}>
          {image}
          <span className="sd-preview__hint">
            <Icon name="eye" size={16} />
            {t('scores.hero.openScore')}
          </span>
        </Link>
      ) : (
        image
      )}
    </section>
  );
}

/** Cột phải: số liệu nổi bật, thông số, ghi chú luyện tập và các thao tác quản lý. */
export function ScoreSidebar({ score }: { score: ScoreDetail }) {
  const highlights: [string, string][] = [
    [t('scores.hero.measures'), score.measureCount?.toString() ?? '—'],
    [t('scores.hero.pages'), score.pageCount?.toString() ?? '—'],
    [t('scores.hero.rating'), score.averageRating != null ? `${score.averageRating.toFixed(1)}★` : '—'],
  ];
  const facts: [string, React.ReactNode][] = [
    [t('scores.hero.key'), score.keySignature || '—'],
    [t('scores.hero.timeSignature'), score.timeSignature || '—'],
    ['Tempo', score.tempoBpm ? `${score.tempoBpm} BPM` : '—'],
    [t('scores.hero.difficulty'), score.difficulty ? DIFFICULTY_LABELS[score.difficulty] : '—'],
    [t('scores.hero.source'), score.sourceType ? SOURCE_LABELS[score.sourceType] : '—'],
    [t('scores.hero.ratingCount'), `${score.ratingCount ?? 0}`],
    [
      t('scores.explore.tag'),
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
  return (
    <aside className="sd-side">
      <section className="sd-card reveal-item">
        <h2 className="sd-card__title">{t('scores.hero.info')}</h2>
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
        <section className="sd-card reveal-item">
          <h2 className="sd-card__title">{t('scores.hero.studyNotes')}</h2>
          <p className="sd-notes">{score.studyNotes}</p>
        </section>
      )}
    </aside>
  );
}
