import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribePlanLimit } from '../../utils/planLimit';
import type { PlanLimitInfo } from '../../utils/planLimit';
import UpgradeDialog from './UpgradeDialog';

/** Gắn một lần ở gốc ứng dụng: nghe lỗi vượt hạn mức từ mọi nơi và hiện hộp thoại nâng cấp. */
export default function PlanLimitHost() {
  const [info, setInfo] = useState<PlanLimitInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => subscribePlanLimit(setInfo), []);

  const close = useCallback(() => setInfo(null), []);
  const upgrade = useCallback(() => {
    setInfo(null);
    navigate('/pricing');
  }, [navigate]);

  return info ? <UpgradeDialog info={info} onClose={close} onUpgrade={upgrade} /> : null;
}
