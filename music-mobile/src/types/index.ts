export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  authProvider?: 'LOCAL' | 'GOOGLE';
}

export interface AuthResponse {
  token: string;
}

export interface LoginRequest {
  username?: string;
  password?: string;
}

export interface RegisterRequest {
  username?: string;
  password?: string;
  email?: string;
  fullName?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword?: string;
}

export interface ChangePasswordRequest {
  oldPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface ApiResponse<T> {
  result: T;
  message?: string;
  code?: number;
}

export interface PageResponse<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalElements: number;
}
