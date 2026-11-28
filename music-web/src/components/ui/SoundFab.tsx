import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '../../i18n/core';
import Icon from './Icon';
import { clickMusicAllowedAt, readFabY, writeFabY } from './clickMelody';
import { playClickNote, setClickSoundOn, useClickSoundOn } from './clickMusic';
import './sound-fab.css';

/** Kéo quá bấy nhiêu px thì coi là kéo nút, không phải bấm. */
const DRAG_THRESHOLD = 4;
/** Khoảng chừa trên (thanh trên) và dưới để nút không che chúng (px); màn hẹp có thanh tab ở đáy nên chừa nhiều hơn. */
const TOP_GAP = 72;
const BOTTOM_GAP = 20;
const BOTTOM_GAP_TABBAR = 80;
/** Cùng mốc với thanh tab điện thoại (user-layout.css). */
const TABBAR_QUERY = '(max-width: 900px)';
const SIZE = 44;

const bottomGap = (): number => (window.matchMedia?.(TABBAR_QUERY).matches ? BOTTOM_GAP_TABBAR : BOTTOM_GAP);

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Tọa độ đỉnh nút (px) từ tỉ lệ 0–1, giữ trong vùng an toàn của màn hình. */
const topOf = (ratio: number): number => {
  const min = TOP_GAP;
  const max = Math.max(min, window.innerHeight - bottomGap() - SIZE);
  return min + (max - min) * ratio;
};
const ratioOf = (top: number): number => {
  const min = TOP_GAP;
  const max = Math.max(min + 1, window.innerHeight - bottomGap() - SIZE);
  return Math.min(1, Math.max(0, (top - min) / (max - min)));
};

/**
 * Nút loa nổi ở mép phải màn hình: bấm để bật / tắt nhạc khi bấm (bật lại thì chơi ngay một nốt). Luôn nằm trên màn hình
 * khi cuộn; kéo lên xuống dọc mép phải để đổi chỗ, vị trí nhớ trong trình duyệt. Ẩn ở các trang có âm thanh riêng
 * (soạn bản nhạc, trình phát, luyện tập...), nơi cũng không phát nhạc khi bấm.
 */
export default function SoundFab() {
  const { pathname } = useLocation();
  const on = useClickSoundOn();
  const [ratio, setRatio] = useState(() => readFabY(storage()));
  const [, setViewport] = useState(0);
  const drag = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  /** Cú bấm vừa rồi là kéo nút: click theo sau không bật / tắt tiếng. */
  const dragged = useRef(false);

  // Đổi cỡ cửa sổ (xoay máy) thì tính lại vị trí theo tỉ lệ đã lưu
  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!clickMusicAllowedAt(pathname)) return null;
  const label = `${t('common.header.clickSound')}: ${on ? t('common.header.soundStateOn') : t('common.header.soundStateOff')}`;

  return (
    <button
      type="button"
      className={`sound-fab${on ? ' is-on' : ''}`}
      style={{ top: topOf(ratio) }}
      aria-pressed={on}
      aria-label={label}
      title={`${label} · ${t('common.header.soundFabHint')}`}
      data-no-click-sound
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { startY: e.clientY, startTop: topOf(ratio), moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        setRatio(ratioOf(d.startTop + dy));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        dragged.current = d?.moved ?? false;
        if (d?.moved) writeFabY(storage(), ratio);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClick={(e) => {
        // Vừa kéo xong thì không tính là bấm (bấm bằng bàn phím có detail 0 nên luôn tính)
        const wasDrag = e.detail > 0 && dragged.current;
        dragged.current = false;
        if (wasDrag) return;
        setClickSoundOn(!on);
        if (!on) playClickNote();
      }}
    >
      <Icon name={on ? 'volume' : 'volumeOff'} size={20} />
    </button>
  );
}
