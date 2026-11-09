import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui';
import type { IconName } from '../components/ui';
import './Home.css';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'music', title: 'Số hóa bản nhạc', text: 'Tải ảnh chụp hoặc PDF, hệ thống chuyển thành MusicXML và MIDI để chỉnh sửa.' },
  { icon: 'activity', title: 'Luyện tập có chấm điểm', text: 'Theo dõi cao độ, nhịp và tiến bộ qua từng phiên tập.' },
  { icon: 'share', title: 'Chia sẻ và cộng đồng', text: 'Mời bạn bè xem, nhận xét hoặc cùng chỉnh sửa bản nhạc.' },
];

/** Trang giới thiệu cho người chưa đăng nhập. */
export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home">
      <header className="home__bar">
        <span className="home__brand">
          <span className="home__logo">
            <Icon name="music" size={16} />
          </span>
          Music App
        </span>
        <button type="button" className="btn" onClick={() => navigate('/auth/login')}>
          Đăng nhập
        </button>
      </header>

      <main className="home__hero">
        <h1>Thư viện bản nhạc của bạn, số hóa và luyện tập ở một nơi</h1>
        <p>Lưu trữ, chỉnh sửa và luyện tập bản nhạc từ ảnh chụp hay file PDF, rồi chia sẻ với bạn bè.</p>
        <div className="home__cta">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/auth/login')}>
            Bắt đầu ngay
          </button>
        </div>

        <ul className="home__features">
          {FEATURES.map((f) => (
            <li key={f.title} className="home__feature">
              <span className="home__feature-icon">
                <Icon name={f.icon} size={18} />
              </span>
              <strong>{f.title}</strong>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
