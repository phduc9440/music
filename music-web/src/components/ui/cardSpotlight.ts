import { useEffect } from 'react';

/*
 * Vùng sáng xanh đi theo con trỏ bên trong thẻ / khung nội dung (như bản nhạc hạt sáng ở trang khách): một bộ nghe chuột
 * duy nhất ở khung trang ghi toạ độ con trỏ vào --spot-x / --spot-y của mọi thẻ khớp SPOT_SELECTOR dưới con trỏ (cả thẻ
 * lồng trong thẻ); CSS chung trong styles/vibrant.css vẽ quầng sáng bằng ::after và chỉ cho thẻ trong cùng sáng.
 * Thêm thẻ mới thì thêm class vào cả SPOT_SELECTOR lẫn danh sách trong vibrant.css.
 */
export const SPOT_SELECTOR = [
  '.sc-card',
  '.fm-row',
  '.fm-post',
  '.pl-card',
  '.pl-row',
  '.pl-hero',
  '.pl-panel',
  '.cp-card',
  '.tm-card',
  '.tm-item',
  '.tm-summary',
  '.tm-invitation',
  '.tm-workspace',
  '.tm-mytasks',
  '.tm-feed__item',
  '.ph-item',
  '.mt-card',
  '.mt-stat',
  '.sg-item',
  '.sd-card',
  '.pf-card',
  '.bl-card',
  '.ns-card',
  '.ps-card',
  '.ps-chart',
  '.sc-settings__card',
  '.sc-access',
  '.sc-people',
  '.sc-trash__item',
  '.sc-cr-steps li',
  '.sc-cr-tips article',
  '.sp-card',
  '.sc-upfile',
  '.studio-report__cards article',
  '.wh-panel',
  '.wh-tile',
  '.wh-feature',
  '.wh-recent',
  '.wh-pending',
  '.wh-task',
  '.wh-streak',
  '.wh-feat',
  '.wh-quick__item',
  '.wh-journey__item',
  '.wh-cta',
].join(',');

export function useCardSpotlight() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      let card = (e.target as Element | null)?.closest?.<HTMLElement>(SPOT_SELECTOR) ?? null;
      while (card) {
        const box = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', `${e.clientX - box.left}px`);
        card.style.setProperty('--spot-y', `${e.clientY - box.top}px`);
        card = card.parentElement?.closest<HTMLElement>(SPOT_SELECTOR) ?? null;
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
}
