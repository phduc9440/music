import { useState } from 'react';
import { initials } from '../../utils/composer';
import './composers.css';

interface Props {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

/** Chân dung nhạc sĩ; chưa có ảnh (hoặc ảnh lỗi) thì hiện chữ lồng vàng đồng trên nền nâu đen. */
export default function ComposerPortrait({ name, imageUrl, className = '' }: Props) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={`Chân dung ${name}`}
        className={`composer-portrait ${className}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`composer-portrait composer-portrait--empty ${className}`} role="img" aria-label={name}>
      {initials(name)}
    </span>
  );
}
