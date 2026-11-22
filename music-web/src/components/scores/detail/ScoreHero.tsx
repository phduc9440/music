import { useEffect, useState } from 'react';
import { fetchMusicXml, scoreApi } from '../../../services';
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
  getErrorMessage,
  useScoreBase,
} from '../../../utils/score';
import type { ScoreDetail } from '../../../types';
import DownloadMenu from '../viewer/DownloadMenu';
import MusicXmlViewer from '../viewer/MusicXmlViewer';
import VisibilityBadge from '../common/VisibilityBadge';
import MidiConvertButton from '../../export/MidiConvertButton';
import { isTaskFinished } from '../../export/exportUtils';
import { Icon } from '../../ui';
import OfficialRequestBanner from './OfficialRequestBanner';
import ChordSuggestDialog from '../chords/ChordSuggestDialog';
import { aiChordsEditPath } from '../suggestions/suggestionUtils';
import PlaylistPicker from '../library/PlaylistPicker';
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
  const [forking, setForking] = useState(false);
  const [suggestingChords, setSuggestingChords] = useState(false);
  const [savingToPlaylist, setSavingToPlaylist] = useState(false);
  // Tạo bản phối riêng tư từ bản công khai chủ cho phép (R4), xong thì mở bản mới
  const fork = async () => {
    setForking(true);
    try {
      const res = await scoreApi.fork(score.id);
      toast.success(t('scores.fork.done'));
      navigate(`/scores/${res.data.result.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.fork.failed')));
    } finally {
      setForking(false);
    }
  };
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

  // Thông số chính hiện thành hàng viên thuốc ngay dưới tiêu đề (trước đây nằm ở cột phải, phải cuộn mới thấy)
  const pills: [string, string][] = [
    [score.measureCount != null ? String(score.measureCount) : '—', t('scores.hero.measures')],
    [score.pageCount != null ? String(score.pageCount) : '—', t('scores.hero.pages')],
    [score.keySignature || '—', t('scores.hero.key')],
    [score.timeSignature || '—', t('scores.hero.timeSignature')],
    [score.tempoBpm ? `${score.tempoBpm}` : '—', 'BPM'],
    [score.averageRating != null ? `${score.averageRating.toFixed(1)}★` : '—', t('scores.hero.rating')],
  ];

  return (
    <>
      <header className="sd-head sd-hero">
        <div className="sd-hero__cover">
          <ScoreCover score={score} onChanged={onVisibilityChanged} />
        </div>
        <div className="sd-hero__body">
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
          <ul className="sd-pills" aria-label={t('scores.hero.info')}>
            {pills.map(([value, label]) => (
              <li key={label} className="sd-pill">
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          {/* Thao tác chính đứng ngay dưới tên bản nhạc, theo thứ tự hay dùng: mở → phát → tải → chia sẻ */}
          <div className="sd-actions">
            <Link
              className={`sc-btn sc-btn--primary sd-actions__main${ready ? '' : ' is-disabled'}`}
              to={`${base}/${score.id}/edit`}
              aria-disabled={!ready}
              title={ready ? undefined : t('scores.hero.noXmlOpen')}
              onClick={(e) => !ready && e.preventDefault()}
            >
              <Icon name={score.canEdit ? 'edit' : 'eye'} size={16} />
              {score.canEdit ? t('scores.hero.openEditor') : t('scores.hero.viewScore')}
            </Link>
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
            {ready && !base.startsWith('/admin') && (
              <Link className="sc-btn" to={`/studio/scores/${score.id}/play`}>
                {t('scores.hero.studioPractice')}
              </Link>
            )}
            {score.canReview && ready && (
              <button
                type="button"
                className="sc-btn"
                onClick={() => setSuggestingChords(true)}
                title={t('chords.buttonHint')}
              >
                <Icon name="music" size={16} />
                {t('chords.button')}
              </button>
            )}
            {canConvertMidi && (
              <MidiConvertButton
                scoreId={score.id}
                resume={activeConversion}
                autoStart={autoConvert}
                onDone={() => navigate(`${base}/${score.id}/edit`)}
              />
            )}
            {!base.startsWith('/admin') && (
              <button type="button" className="sc-btn" onClick={() => setSavingToPlaylist(true)}>
                <Icon name="listPlus" size={16} />
                {t('scores.libMenu.addToPlaylist')}
              </button>
            )}
            <DownloadMenu
              scoreId={score.id}
              files={score.files}
              title={score.title}
              staffCount={score.staffCount}
              canDownload={score.canDownload}
            />
            {score.canFork && (
              <button type="button" className="sc-btn" disabled={forking} onClick={fork} title={t('scores.fork.hint')}>
                <Icon name="copy" size={16} />
                {forking ? t('scores.fork.working') : t('scores.fork.button')}
              </button>
            )}
            <button
              type="button"
              className={`sc-btn sd-actions__icon${linkCopied ? ' is-done' : ''}`}
              onClick={copyLink}
              title={linkCopied ? t('scores.hero.copyLinkCopied') : t('scores.hero.copyLinkHint')}
              aria-label={t('scores.hero.copyLink')}
            >
              <Icon name={linkCopied ? 'check' : 'link'} size={16} />
            </button>
            {canRequestMore && onRequestMore && (
              <button type="button" className="sc-btn" onClick={onRequestMore}>
                <Icon name="key" size={16} />
                {t('scores.detail.requestMoreTitle')}
              </button>
            )}
          </div>
        </div>
      </header>

      {suggestingChords && (
        <ChordSuggestDialog
          scoreId={score.id}
          onClose={() => setSuggestingChords(false)}
          onCompleted={score.canEdit ? (id) => navigate(aiChordsEditPath(base, score.id, id)) : undefined}
        />
      )}
      {savingToPlaylist && <PlaylistPicker score={score} onClose={() => setSavingToPlaylist(false)} />}

      <div className="sd-alerts">
        {score.accessLevel === 'OWNER' && !base.startsWith('/admin') && <OfficialRequestBanner scoreId={score.id} />}
        {score.forkedFrom && (
          <div className="sd-alert sd-alert--info" role="status">
            <Icon name="copy" size={16} />
            <span>
              {t('scores.fork.attribution', {
                title: score.forkedFrom.title,
                owner: score.forkedFrom.ownerName ?? t('scores.fork.unknownOwner'),
                license: t(`scores.license.${score.forkedFrom.license}`),
              })}
            </span>
            <Link to={`/scores/${score.forkedFrom.id}`}>{t('scores.fork.openSource')} →</Link>
          </div>
        )}
        {(score.forkCount ?? 0) > 0 && (
          <div className="sd-alert sd-alert--info" role="status">
            <Icon name="copy" size={16} />
            <span>{t('scores.fork.count', { count: score.forkCount ?? 0 })}</span>
          </div>
        )}
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
      </div>
    </>
  );
}

/** Số ô nhịp vẽ trong khung xem trước khi bản nhạc không có ảnh trang. */
const PREVIEW_MEASURES = 8;

/** Vẽ vài ô nhịp đầu từ MusicXML (bản nhập từ file MusicXML/MIDI không có ảnh trang để xem trước). */
function LivePreview({ scoreId }: { scoreId: string }) {
  const [xml, setXml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchMusicXml(scoreId)
      .then((text) => !cancelled && setXml(text))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scoreId]);
  if (failed) return null;
  if (!xml) return <div className="sc-skeleton sd-preview__skeleton" aria-busy="true" />;
  return <MusicXmlViewer xml={xml} lastMeasure={PREVIEW_MEASURES} />;
}

/** Khung xem trước: ảnh trang 1, hoặc vài ô nhịp đầu vẽ từ MusicXML; bấm để mở bản nhạc. */
export function ScorePreview({ score }: { score: ScoreDetail }) {
  const base = useScoreBase();
  const ready = hasMusicXml(score);
  const head = (
    <div className="sd-preview__head">
      <h2 className="sd-card__title">{t('scores.hero.preview')}</h2>
      {ready && (
        <Link to={`${base}/${score.id}/edit`} className="sc-btn sc-btn--sm">
          <Icon name="eye" size={14} />
          {t('scores.hero.openScore')}
        </Link>
      )}
    </div>
  );
  if (!score.thumbnailUrl) {
    if (ready) {
      return (
        <section className="sd-card sd-preview sd-preview--live">
          {head}
          <Link to={`${base}/${score.id}/edit`} className="sd-preview__paper" title={t('scores.hero.openScore')}>
            <LivePreview scoreId={score.id} />
          </Link>
        </section>
      );
    }
    return (
      <section className="sd-card sd-preview sd-preview--empty">
        <span className="sd-preview__empty-icon">
          <Icon name="music" size={22} />
        </span>
        <strong>{t('scores.hero.noPreview')}</strong>
        <span>{t('scores.hero.noPreviewHint')}</span>
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
      {head}
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

/** Cột phải: các thông tin còn lại (độ khó, nguồn, thể loại...) và ghi chú luyện tập. */
export function ScoreSidebar({ score }: { score: ScoreDetail }) {
  const facts: [string, React.ReactNode][] = [
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
    [t('scores.hero.createdAt'), score.createdAt ? formatDateTime(score.createdAt) : '—'],
  ];
  return (
    <aside className="sd-side">
      <section className="sd-card">
        <h2 className="sd-card__title">{t('scores.hero.details')}</h2>
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
          <h2 className="sd-card__title">{t('scores.hero.studyNotes')}</h2>
          <p className="sd-notes">{score.studyNotes}</p>
        </section>
      )}
    </aside>
  );
}
