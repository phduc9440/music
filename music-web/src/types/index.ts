export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  phone?: string;
  address?: string;
  authProvider?: 'LOCAL' | 'GOOGLE' | string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  authenticated?: boolean;
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

export interface PageRequest {
  page?: number;
  size?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  keyword?: string;
}

export interface LoginRequest {
  username?: string;
  password?: string;
}

export interface RegisterRequest {
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  fullName?: string;
  address?: string;
}

export interface ChangePasswordRequest {
  oldPassword?: string;
  newPassword?: string;
}

export interface ForgotPasswordRequest {
  email?: string;
}

export interface ResetPasswordRequest {
  email?: string;
  otp?: string;
  newPassword?: string;
}

export interface AccountCreationRequest {
  username?: string;
  password?: string;
  email?: string;
  fullName?: string;
  role?: string;
}

export interface AccountUpdateRequest {
  email?: string;
  fullName?: string;
  password?: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}
