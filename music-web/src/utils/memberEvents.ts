import type { Member } from '../types';

/** Sự kiện báo hồ sơ tài khoản vừa đổi (tên, ảnh...), để header cập nhật ngay mà không phải tải lại trang. */
const MEMBER_UPDATED_EVENT = 'app:member-updated';

export function announceMemberUpdated(member: Member): void {
  window.dispatchEvent(new CustomEvent<Member>(MEMBER_UPDATED_EVENT, { detail: member }));
}

/** Đăng ký nghe hồ sơ thay đổi; trả hàm hủy đăng ký (dùng làm cleanup của useEffect). */
export function onMemberUpdated(listener: (member: Member) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<Member>).detail);
  window.addEventListener(MEMBER_UPDATED_EVENT, handler);
  return () => window.removeEventListener(MEMBER_UPDATED_EVENT, handler);
}
