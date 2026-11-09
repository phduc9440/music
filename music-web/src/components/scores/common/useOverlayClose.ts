import { useRef } from 'react';
import type { MouseEvent } from 'react';

/**
 * Props cho lớp phủ của hộp thoại: chỉ đóng khi cả lúc nhấn chuột lẫn lúc thả đều nằm trên lớp phủ.
 * Nhờ vậy kéo thanh trượt trong hộp thoại rồi thả chuột ra ngoài sẽ không làm hộp thoại tự đóng.
 *
 * @param onClose hàm đóng hộp thoại
 */
export const useOverlayClose = (onClose: () => void) => {
  const pressedOnOverlay = useRef(false);
  return {
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      pressedOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (pressedOnOverlay.current && e.target === e.currentTarget) onClose();
      pressedOnOverlay.current = false;
    },
  };
};
