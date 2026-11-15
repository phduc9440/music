import { authApi, userApi } from '../services';
import { adoptServerTheme } from '../theme/theme';
import type { AdminPermission, AuthResponse, Member } from '../types';

export type AppRole = 'USER' | 'ADMIN';

export const isSuperAdminMember = (member: Pick<Member, 'roles'>) => !!member.roles?.includes('SUPER_ADMIN');

/** Nhãn vai trò cao nhất: SUPER ADMIN, ADMIN, vai trò tự tạo (mã bỏ dấu gạch dưới) hoặc USER. */
export const roleLabel = (member: Pick<Member, 'roles'>) =>
  isSuperAdminMember(member)
    ? 'SUPER ADMIN'
    : isAdminMember(member)
      ? 'ADMIN'
      : (member.roles?.find((r) => r !== 'USER')?.replace(/_/g, ' ') ?? 'USER');

/** Có quyền quản trị này không (quyền tính ở BE từ vai trò và bảng quyền của vai trò). */
export const hasAdminPermission = (member: Pick<Member, 'permissions'> | null | undefined, p: AdminPermission) =>
  !!member?.permissions?.includes(p);

/** Vào được khu quản trị: có ít nhất một quyền quản trị (kể cả vai trò tự tạo, không riêng ADMIN). */
export const hasAdminAccess = (member: Pick<Member, 'permissions'> | null | undefined) =>
  !!member?.permissions?.length;

export const isAdminMember = (member: Pick<Member, 'roles'>) => !!member.roles?.includes('ADMIN');

/**
 * Token đã nằm trong cookie HttpOnly do backend set. Hàm này đọc roles từ profile và trả về route cần chuyển tới.
 * The stored role is only used for UI (menus, route guards); the backend enforces permissions.
 * Nếu không tải được profile thì xoá cookie (gọi logout).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function completeLogin(_auth: AuthResponse): Promise<string> {
  try {
    const res = await userApi.getMe();
    const admin = hasAdminAccess(res.data.result);
    adoptServerTheme(res.data.result.uiTheme); // giao diện đã chọn đi theo tài khoản giữa các máy
    localStorage.setItem('role', admin ? 'ADMIN' : 'USER');
    return admin ? '/admin' : '/'; // người dùng vào trang làm việc
  } catch {
    localStorage.removeItem('role');
    await authApi.logout().catch(() => undefined);
    throw new Error('Could not fetch profile.');
  }
}
