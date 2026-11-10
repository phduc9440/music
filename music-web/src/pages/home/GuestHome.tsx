import { useEffect, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthImage from '../../components/scores/common/AuthImage';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { homeApi } from '../../services';
import ThemeToggle from '../../theme/ThemeToggle';
import type { HomeComposer, PublicHome, ScoreSummary } from '../../types';
import { useReveal } from '../../hooks/useReveal';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { isImportBatch, setPendingUpload } from '../../utils/pendingUpload';
import './guest-home.css';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'upload',
    title: 'Chụp',
    text: 'Chụp ảnh hoặc tải PDF bản nhạc giấy. Hệ thống nhận diện nốt và chuyển thành bản nhạc số.',
  },
  {
    icon: 'edit',
    title: 'Sửa',
    text: 'Chỉnh từng nốt trong trình soạn thảo, nghe lại ngay, lưu thành nhiều phiên bản.',
  },
  { icon: 'play', title: 'Tập', text: 'Tập chậm, lặp đoạn khó, theo dõi chuỗi ngày và thời gian luyện tập của bạn.' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Tôi cần chuẩn bị gì để số hóa bản nhạc?',
    a: 'Một ảnh chụp rõ nét hoặc file PDF. Bạn cũng có thể nhập thẳng file MusicXML hoặc MIDI đã có sẵn.',
  },
  {
    q: 'Bản nhạc của tôi có bị người khác xem không?',
    a: 'Không. Bản nhạc mặc định là riêng tư. Bạn chủ động chia sẻ bằng liên kết, mời theo email, hoặc gửi yêu cầu công khai để quản trị viên duyệt.',
  },
  {
    q: 'Có mất phí không?',
    a: 'Ứng dụng đang trong giai đoạn thử nghiệm và dùng miễn phí. Các gói dịch vụ sẽ được công bố sau.',
  },
  {
    q: 'Tôi có thể dùng trên điện thoại không?',
    a: 'Có. Giao diện tự co giãn theo màn hình; thanh tab dưới cùng giúp mở nhanh Khám phá, Thư viện và Luyện tập.',
  },
];

const formatNumber = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** Khối có tiêu đề, hiện dần khi cuộn tới. */
function Section({ id, title, lead, children }: { id?: string; title: string; lead?: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section id={id} ref={ref} className="gh-section reveal">
      <header className="gh-section__head">
        <span className="gh-staff-rule" aria-hidden="true" />
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** Năm dòng kẻ khuông chạy ngang và vài nốt nhạc trôi chậm (trang trí, ẩn với trình đọc màn hình). */
function StaffBackdrop() {
  return (
    <svg className="gh-hero__staff" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="0" x2="1200" y1={30 + i * 25} y2={30 + i * 25} />
      ))}
      <g className="gh-hero__notes">
        <g transform="translate(180 92)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(420 67)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(700 117)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(960 80)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
      </g>
    </svg>
  );
}

function FeaturedCard({ score, onOpen }: { score: ScoreSummary; onOpen: () => void }) {
  return (
    <button type="button" className="gh-card" onClick={onOpen}>
      <span className="gh-card__cover">
        <AuthImage src={score.thumbnailUrl} alt={score.title} className="gh-card__img" />
      </span>
      <span className="gh-card__body">
        <strong className="gh-card__title" title={score.title}>
          {score.title}
        </strong>
        <span className="gh-card__composer">{score.composer || 'Chưa rõ tác giả'}</span>
        <span className="gh-card__meta">
          {score.difficulty && <span className="gh-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          <span>{formatNumber(score.viewCount ?? 0)} lượt xem</span>
          {score.ratingAverage != null && <span>★ {score.ratingAverage.toFixed(1)}</span>}
        </span>
      </span>
    </button>
  );
}

function ComposerCard({ composer }: { composer: HomeComposer }) {
  const initials = composer.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    // Thẻ lật: mặt trước tên tác giả, rê chuột hoặc chọn bằng bàn phím thì lật ra các bản tiêu biểu
    <div
      className="gh-composer"
      tabIndex={0}
      aria-label={`${composer.name}: ${composer.scoreCount} bản nhạc công khai`}
    >
      <div className="gh-composer__inner">
        <div className="gh-composer__face gh-composer__face--front">
          <span className="gh-composer__monogram" aria-hidden="true">
            {initials || '♪'}
          </span>
          <strong>{composer.name}</strong>
          <span>{composer.scoreCount} bản nhạc</span>
        </div>
        <div className="gh-composer__face gh-composer__face--back">
          <strong>{composer.name}</strong>
          <ul>
            {composer.topTitles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <span>{composer.scoreCount} bản trên hệ thống</span>
        </div>
      </div>
    </div>
  );
}

/** Trang chủ cho khách chưa đăng nhập (mục 5.3). Người đã đăng nhập thấy trang làm việc ở cùng đường dẫn /. */
export default function GuestHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<PublicHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    homeApi
      .publicHome()
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Đăng nhập rồi quay lại đúng trang định vào. */
  const loginThen = (from: string) => navigate('/auth/login', { state: { from } });

  // Thả file vào hero: giữ file lại, đăng nhập, rồi về đúng luồng tải lên (MusicXML/MIDI thì nhập, còn lại số hóa)
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    setPendingUpload(files);
    loginThen(isImportBatch(files) ? '/scores/import' : CREATE_SCORE_PATH);
  };

  const stats = data?.stats;

  return (
    <div className="gh">
      <header className="gh-bar">
        <span className="gh-brand">
          <span className="gh-brand__logo">
            <Icon name="music" size={16} />
          </span>
          Music App
        </span>
        <div className="gh-bar__actions">
          <ThemeToggle />
          <button type="button" className="gh-btn gh-btn--ghost" onClick={() => navigate('/auth/login')}>
            Đăng nhập
          </button>
        </div>
      </header>

      <section
        className={`gh-hero${dragging ? ' gh-hero--drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <StaffBackdrop />
        <div className="gh-hero__content">
          <p className="gh-hero__eyebrow">Chụp · Sửa · Nghe · Tập</p>
          <h1>Biến bản nhạc giấy thành bản nhạc số, rồi luyện tập ngay trên trình duyệt</h1>
          <p className="gh-hero__lead">
            Số hóa từ ảnh chụp hoặc PDF, chỉnh từng nốt, nghe lại và theo dõi tiến bộ, tất cả bằng tiếng Việt.
          </p>
          <div className="gh-hero__cta">
            <button type="button" className="gh-btn gh-btn--velvet" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              <Icon name="upload" size={18} />
              Số hóa bản nhạc đầu tiên
            </button>
            <a className="gh-btn gh-btn--brass" href="#featured">
              Khám phá kho nhạc
            </a>
          </div>
          <p className="gh-hero__hint">
            {dragging ? 'Thả file để bắt đầu' : 'Hoặc thả ảnh, PDF, MusicXML, MIDI vào đây'}
          </p>
        </div>
      </section>

      <main className="gh-main">
        {failed && <p className="gh-note">Chưa tải được dữ liệu trang chủ. Bạn vẫn có thể đăng nhập để bắt đầu.</p>}

        <Section
          id="featured"
          title="Bản nhạc nổi bật"
          lead="Những bản được cộng đồng xem nhiều nhất. Đăng nhập để mở, nghe và luyện tập."
        >
          {!data && !failed && (
            <div className="gh-strip">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="gh-card gh-card--skeleton" aria-hidden="true" />
              ))}
            </div>
          )}
          {data && data.featured.length === 0 && (
            <p className="gh-note">Chưa có bản nhạc công khai nào. Hãy là người đầu tiên chia sẻ!</p>
          )}
          {data && data.featured.length > 0 && (
            <div className="gh-strip">
              {data.featured.map((s) => (
                <FeaturedCard key={s.id} score={s} onOpen={() => loginThen(`/scores/${s.id}`)} />
              ))}
            </div>
          )}
        </Section>

        {data && data.composers.length > 0 && (
          <Section title="Những nhạc sĩ được yêu thích" lead="Tác giả có nhiều bản nhạc công khai nhất trên hệ thống.">
            <div className="gh-composers">
              {data.composers.map((c) => (
                <ComposerCard key={c.name} composer={c} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Cách hoạt động" lead="Ba bước từ tờ nhạc giấy tới buổi tập.">
          <ol className="gh-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="gh-step" style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="gh-step__icon">
                  <Icon name={s.icon} size={22} />
                </span>
                <span className="gh-step__no">Bước {i + 1}</span>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        {stats && (
          <Section title="Con số thật" lead="Đếm trực tiếp từ hệ thống, cập nhật mỗi 5 phút.">
            <dl className="gh-stats">
              <div>
                <dt>Bản nhạc</dt>
                <dd>{formatNumber(stats.scores)}</dd>
              </div>
              <div>
                <dt>Trang đã số hóa</dt>
                <dd>{formatNumber(stats.digitizedPages)}</dd>
              </div>
              <div>
                <dt>Giờ luyện tập</dt>
                <dd>{formatNumber(stats.practiceHours)}</dd>
              </div>
              <div>
                <dt>Thành viên</dt>
                <dd>{formatNumber(stats.members)}</dd>
              </div>
            </dl>
          </Section>
        )}

        <Section id="faq" title="Câu hỏi thường gặp">
          <div className="gh-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <div className="gh-final">
            <p>Sẵn sàng số hóa bản nhạc đầu tiên?</p>
            <button type="button" className="gh-btn gh-btn--velvet" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              Bắt đầu miễn phí
            </button>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
