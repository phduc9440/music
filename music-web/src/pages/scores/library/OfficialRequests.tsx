import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { officialRequestApi } from '../../../services';
import type { OfficialRequest } from '../../../types';
import { formatRelative } from '../../../utils/score';
import '../../../components/scores/scores.css';

/** Trang /scores/official-requests: quản trị viên xin đưa bản nhạc công khai của bạn vào kho score mẫu. */
export default function OfficialRequests() {
  const [items, setItems] = useState<OfficialRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    officialRequestApi
      .mine()
      .then((res) => setItems(res.data.result))
      .catch(() => toast.error('Không tải được các lời xin'));
  }, []);

  useEffect(load, [load]);

  const answer = async (request: OfficialRequest, accept: boolean) => {
    setBusyId(request.id);
    try {
      if (accept) await officialRequestApi.accept(request.id);
      else await officialRequestApi.decline(request.id);
      toast.success(accept ? 'Đã đồng ý, bản nhạc đã được đưa vào kho score mẫu' : 'Đã từ chối');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message ?? 'Không xử lý được lời xin');
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Lời xin vào kho score mẫu</h1>
            <p>Quản trị viên muốn đưa bản nhạc công khai của bạn vào kho dùng chung cho người mới học.</p>
          </div>
        </header>

        <p className="mb-4">
          Nếu bạn đồng ý, hệ thống chỉ <strong>sao chép</strong> một bản vào kho và ghi bạn là người phối. Bản của bạn
          giữ nguyên: bạn vẫn sửa, xóa và chia sẻ như trước. Từ chối cũng không ảnh hưởng gì.
        </p>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>Không có lời xin nào đang chờ</h3>
            <p>Khi quản trị viên xin đưa một bản nhạc của bạn vào kho, lời xin sẽ hiện ở đây.</p>
          </div>
        )}

        {items?.map((r) => (
          <article key={r.id} className="sc-card mb-3" style={{ cursor: 'default' }}>
            <div className="sc-card__body">
              <h3 className="sc-card__title">
                <Link to={`/scores/${r.scoreId}`} state={{ from: '/scores/official-requests' }}>
                  {r.scoreTitle}
                </Link>
              </h3>
              <p className="sc-card__composer">{r.composer || 'Chưa rõ tác giả'}</p>
              <p className="sc-card__composer">
                {r.requestedBy} gửi lời xin {formatRelative(r.createdAt)}
              </p>
              <div className="d-flex gap-2 mt-2">
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  disabled={busyId === r.id}
                  onClick={() => answer(r, true)}
                >
                  Đồng ý
                </button>
                <button type="button" className="sc-btn" disabled={busyId === r.id} onClick={() => answer(r, false)}>
                  Từ chối
                </button>
              </div>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
