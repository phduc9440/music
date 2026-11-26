import { useNavigate } from '../../../routes/useTransitionNavigate';
import BlankScoreForm from '../../../components/scores/create/BlankScoreForm';
import '../../../components/scores/scores.css';
import { t } from '../../../i18n/core';

/**
 * Trang /scores/blank: tạo bản nhạc trống (chọn nhạc cụ, hóa biểu, nhịp, tempo, số ô) rồi mở thẳng trình chỉnh sửa để
 * viết nhạc. BE: POST /api/scores/blank (ScoreCreateServiceImpl). Lối vào: nút trên trang tải lên và trang nhập file.
 */
export default function ScoreBlank() {
  const navigate = useNavigate();
  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('upload.create.blank.title')}</h1>
            <p>{t('upload.create.blank.subtitle')}</p>
          </div>
        </header>
        <BlankScoreForm
          onCreated={(id) => navigate(`/scores/${id}/edit`)}
          onCancel={() => navigate('/scores/upload')}
        />
      </main>
    </div>
  );
}
