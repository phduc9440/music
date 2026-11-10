import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { API_BASE_URL, homeApi } from '../../services';
import ThemeToggle from '../../theme/ThemeToggle';
import type { Composer, PublicHome, ScoreSummary } from '../../types';
import { useReveal } from '../../hooks/useReveal';
import { lifespan } from '../../utils/composer';
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

/** Ảnh công khai (/api/public/...) tải thẳng bằng <img>, không cần token như ảnh trong thư viện. */
const publicUrl = (path: string) => `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;

/**
 * Bìa thẻ: ảnh trang 1 nếu có, nếu không (hoặc tải lỗi) thì vẽ một trang nhạc trống có năm dòng kẻ khuông và tên bài,
 * để thẻ không bị trống trơn.
 */
function FeaturedCover({ score }: { score: ScoreSummary }) {
  const [broken, setBroken] = useState(false);
  if (score.thumbnailUrl && !broken) {
    return (
      <img
        src={publicUrl(score.thumbnailUrl)}
        alt=""
        className="gh-card__img"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="gh-sheet" aria-hidden="true">
      <span className="gh-sheet__title">{score.title}</span>
      {score.composer && <span className="gh-sheet__composer">{score.composer}</span>}
      <span className="gh-sheet__staves">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="gh-sheet__staff" />
        ))}
      </span>
    </span>
  );
}

function FeaturedCard({ score, rank, onOpen }: { score: ScoreSummary; rank: number; onOpen: () => void }) {
  return (
    <button type="button" className="gh-card" onClick={onOpen} aria-label={`Mở bản nhạc ${score.title}`}>
      <span className="gh-card__cover">
        <FeaturedCover score={score} />
        <span className="gh-card__rank">#{rank}</span>
        <span className="gh-card__open">
          Mở bản nhạc
          <Icon name="chevronRight" size={14} />
        </span>
      </span>
      <span className="gh-card__body">
        <strong className="gh-card__title" title={score.title}>
          {score.title}
        </strong>
        <span className="gh-card__composer">{score.composer || 'Chưa rõ tác giả'}</span>
        <span className="gh-card__meta">
          {score.difficulty && <span className="gh-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          <span className="gh-card__stat" title="Lượt xem">
            <Icon name="eye" size={14} />
            {formatNumber(score.viewCount ?? 0)}
          </span>
          {score.ratingAverage != null && (
            <span className="gh-card__stat" title="Điểm sao trung bình">
              <Icon name="star" size={14} />
              {score.ratingAverage.toFixed(1)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Dải thẻ cuộn ngang; ít thẻ thì căn giữa, nhiều thẻ thì hiện nút trái/phải. */
function FeaturedStrip({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [children]);

  const scrollBy = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className="gh-strip-wrap">
      {!edges.start && (
        <button
          type="button"
          className="gh-strip__nav gh-strip__nav--prev"
          aria-label="Xem bản trước"
          onClick={() => scrollBy(-1)}
        >
          <Icon name="chevronLeft" size={20} />
        </button>
      )}
      <div ref={ref} className="gh-strip">
        {children}
      </div>
      {!edges.end && (
        <button
          type="button"
          className="gh-strip__nav gh-strip__nav--next"
          aria-label="Xem bản tiếp"
          onClick={() => scrollBy(1)}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      )}
    </div>
  );
}

function ComposerCard({ composer }: { composer: Composer }) {
  const titles = composer.topTitles ?? [];
  return (
    // Thẻ lật: mặt trước chân dung và tên, rê chuột hoặc chọn bằng bàn phím thì lật ra năm sinh–mất và các bản tiêu biểu
    <Link
      to={`/composers/${composer.slug}`}
      className="gh-composer"
      aria-label={`${composer.name}: ${composer.scoreCount} bản nhạc công khai`}
    >
      <span className="gh-composer__inner">
        <span className="gh-composer__face gh-composer__face--front">
          <span className="gh-composer__portrait">
            <ComposerPortrait name={composer.name} imageUrl={composer.imageUrl} />
          </span>
          <strong>{composer.name}</strong>
          <span>{composer.scoreCount} bản nhạc</span>
        </span>
        <span className="gh-composer__face gh-composer__face--back">
          <strong>{composer.name}</strong>
          {lifespan(composer) && <span>{lifespan(composer)}</span>}
          {titles.length > 0 && (
            <ul>
              {titles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <span>{composer.scoreCount} bản trên hệ thống</span>
        </span>
      </span>
    </Link>
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
            <FeaturedStrip>
              {data.featured.map((s, i) => (
                <FeaturedCard key={s.id} score={s} rank={i + 1} onOpen={() => loginThen(`/scores/${s.id}`)} />
              ))}
            </FeaturedStrip>
          )}
        </Section>

        {data && data.composers.length > 0 && (
          <Section title="Những nhạc sĩ được yêu thích" lead="Nhạc sĩ có nhiều bản nhạc công khai nhất trên hệ thống.">
            <div className="gh-composers">
              {data.composers.map((c) => (
                <ComposerCard key={c.id} composer={c} />
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
