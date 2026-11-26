import { useEffect, useState } from 'react';
import { fetchFileBlob } from '../../../services';

interface AuthImageProps {
  /** Link tải của BE, ví dụ /api/files/{id}/download?inline=true */
  src?: string | null;
  alt: string;
  className?: string;
}

/**
 * Hiển thị ảnh cần Authorization header. Thẻ <img> thường không gửi được token nên phải tải blob
 * qua axios rồi tạo object URL.
 */
export default function AuthImage({ src, alt, className = '' }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // Ảnh bìa trên Cloudinary là địa chỉ tuyệt đối, công khai: dùng thẳng, không cần token
  const direct = !!src && /^https?:\/\//.test(src);

  useEffect(() => {
    if (!src || direct) return;
    let cancelled = false;
    let created: string | null = null;
    fetchFileBlob(src)
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        // Lỗi tải ảnh thì giữ ảnh giữ chỗ
      });
    // Dọn dẹp: bỏ qua kết quả đang chờ và giải phóng object URL
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, direct]);

  if (direct) {
    return <img src={src} alt={alt} className={`sc-thumb ${className}`} loading="lazy" />;
  }
  if (!src || !objectUrl) {
    return (
      <div className={`sc-thumb sc-thumb--empty ${className}`} role="img" aria-label={alt}>
        <svg viewBox="0 0 24 24" width="40%" height="40%" fill="currentColor" aria-hidden="true">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
        </svg>
      </div>
    );
  }
  return <img src={objectUrl} alt={alt} className={`sc-thumb ${className}`} />;
}
