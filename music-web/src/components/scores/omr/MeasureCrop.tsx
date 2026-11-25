import { useEffect, useState } from 'react';
import { fetchFileBlob } from '../../../services';
import type { OmrMeasure } from '../../../types';
import { cropOfBox } from '../../../utils/omr';
import { t } from '../../../i18n/core';

/** Ảnh trang đã tải (object URL), dùng chung cho mọi ô cùng trang trong một lần mở Editor. */
const cache = new Map<string, Promise<string>>();

const loadPage = (url: string): Promise<string> => {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetchFileBlob(url).then((blob) => URL.createObjectURL(blob));
    pending.catch(() => cache.delete(url)); // lỗi thì lần sau thử lại
    cache.set(url, pending);
  }
  return pending;
};

interface Props {
  measure: OmrMeasure;
  /** Link tải ảnh trang đã tiền xử lý (khung ô tính theo ảnh này). */
  pageUrl?: string | null;
  width?: number;
}

/** Ô nhịp cắt từ ảnh trang gốc theo khung của measureMap, để so với bản nhạc đang sửa mà không phải mở tab khác. */
export default function MeasureCrop({ measure, pageUrl, width = 300 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const crop = cropOfBox(measure.box, width);
  const hasCrop = crop !== null;

  useEffect(() => {
    if (!pageUrl || !hasCrop) return;
    let cancelled = false;
    loadPage(pageUrl)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [pageUrl, hasCrop]);

  if (!crop || !pageUrl || failed) {
    return <p className="om-field__hint">{t('upload.check.noCrop')}</p>;
  }
  const alt = t('upload.check.cropAlt', { measure: measure.measure, page: measure.page });
  return (
    <div className="om-crop" style={{ width, height: crop.height }} role="img" aria-label={alt}>
      {src && <img src={src} alt="" style={{ width: crop.imageWidth, left: crop.left, top: crop.top }} />}
    </div>
  );
}
