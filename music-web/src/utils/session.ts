/**
 * Khách chưa đăng nhập: giao diện chỉ dùng `localStorage.role` để quyết định hiện gì (quyền thật do backend kiểm tra).
 * Khách chỉ được gọi các API `/public/**`; gọi nhầm API cần đăng nhập sẽ bị 401 và bị đẩy ra trang đăng nhập.
 */
export const isGuest = (): boolean => !localStorage.getItem('role');
