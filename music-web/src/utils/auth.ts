import { userApi, adminApi } from '../services';
import type { AuthResponse } from '../types';

/**
 * Stores the issued tokens, detects whether the account is a USER or ADMIN and
 * returns the route to navigate to. Clears the tokens again if no profile can be loaded.
 */
export async function completeLogin(auth: AuthResponse): Promise<string> {
  localStorage.setItem('token', auth.token);
  if (auth.refreshToken) localStorage.setItem('refreshToken', auth.refreshToken);

  try {
    await userApi.getMe();
    localStorage.setItem('role', 'USER');
    return '/profile';
  } catch {
    try {
      await adminApi.getMe();
      localStorage.setItem('role', 'ADMIN');
      return '/admin';
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('role');
      throw new Error('Could not fetch user/admin profile.');
    }
  }
}
