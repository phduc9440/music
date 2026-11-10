import { authApi, userApi } from '../services';
import type { AuthResponse, Member } from '../types';

export type AppRole = 'USER' | 'ADMIN';

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
    const admin = isAdminMember(res.data.result);
    localStorage.setItem('role', admin ? 'ADMIN' : 'USER');
    return admin ? '/admin' : '/profile';
  } catch {
    localStorage.removeItem('role');
    await authApi.logout().catch(() => undefined);
    throw new Error('Could not fetch profile.');
  }
}
