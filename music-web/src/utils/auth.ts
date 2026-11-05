import { userApi } from '../services';
import type { AuthResponse, Member } from '../types';

export type AppRole = 'USER' | 'ADMIN';

export const isAdminMember = (member: Pick<Member, 'roles'>) => !!member.roles?.includes('ADMIN');

/**
 * Stores the issued tokens, reads the roles from the profile and returns the route to navigate to.
 * The stored role is only used for UI (menus, route guards); the backend enforces permissions.
 * Clears the tokens again if no profile can be loaded.
 */
export async function completeLogin(auth: AuthResponse): Promise<string> {
  localStorage.setItem('token', auth.token);
  if (auth.refreshToken) localStorage.setItem('refreshToken', auth.refreshToken);

  try {
    const res = await userApi.getMe();
    const admin = isAdminMember(res.data.result);
    localStorage.setItem('role', admin ? 'ADMIN' : 'USER');
    return admin ? '/admin' : '/profile';
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('role');
    throw new Error('Could not fetch profile.');
  }
}
