/** Máy Apple (macOS, iOS): phím tắt dùng Cmd thay cho Ctrl. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
