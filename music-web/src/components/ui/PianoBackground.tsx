import pianoKeys from '../../assets/piano-keys.jpg';
import './piano-background.css';

/**
 * Ảnh đàn piano thật làm hình nền phía sau cả trang, nằm chéo ngang màn hình. Ảnh phủ kín khung nhìn, được làm tối và
 * mờ để chữ và thẻ phía trên vẫn đọc rõ. Chỉ để trang trí (ẩn với trình đọc màn hình), nằm dưới mọi nội dung (z-index
 * -1, nên khung cha cần `isolation: isolate`). `soft`: bản nhạt cho các trang nhiều chữ (nền sáng, ảnh mờ dần).
 */
export default function PianoBackground({ soft = false }: { soft?: boolean }) {
  return (
    <div className={`pbg${soft ? ' pbg--soft' : ''}`} aria-hidden="true">
      <div className="pbg__photo" style={{ backgroundImage: `url(${pianoKeys})` }} />
    </div>
  );
}
