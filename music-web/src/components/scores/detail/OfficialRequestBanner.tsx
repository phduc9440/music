import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { officialRequestApi } from '../../../services';
import type { OfficialRequest } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import { Icon } from '../../ui';

/**
 * Thanh nhắc ở đầu trang chi tiết: quản trị viên đang xin đưa bản nhạc này vào kho score mẫu. Chủ sở hữu đồng ý hoặc
 * từ chối ngay tại đây (cùng lời xin với trang /scores/official-requests). Không có lời xin thì không hiện gì.
 */
export default function OfficialRequestBanner({ scoreId }: { scoreId: string }) {
  const [request, setRequest] = useState<OfficialRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    officialRequestApi
      .mine()
      .then((res) => !cancelled && setRequest(res.data.result.find((r) => r.scoreId === scoreId) ?? null))
      .catch(() => !cancelled && setRequest(null)); // lỗi thì chỉ không hiện thanh nhắc
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  if (!request) return null;

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await officialRequestApi.accept(request.id);
      else await officialRequestApi.decline(request.id);
      toast.success(accept ? 'Đã đồng ý, bản nhạc đã được đưa vào kho score mẫu' : 'Đã từ chối lời xin');
      setRequest(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không xử lý được lời xin'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-alert sd-alert--info" role="status">
      <Icon name="library" size={16} />
      <span>
        {request.requestedBy} xin đưa bản nhạc này vào kho score mẫu. Hệ thống chỉ sao chép một bản và ghi bạn là người
        phối; bản của bạn giữ nguyên.
      </span>
      <span className="sd-alert__actions">
        <button
          type="button"
          className="sc-btn sc-btn--sm sc-btn--primary"
          disabled={busy}
          onClick={() => answer(true)}
        >
          Đồng ý
        </button>
        <button type="button" className="sc-btn sc-btn--sm" disabled={busy} onClick={() => answer(false)}>
          Từ chối
        </button>
      </span>
    </div>
  );
}
