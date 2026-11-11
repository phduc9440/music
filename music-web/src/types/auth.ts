export interface AuthResponse {
  token: string;
  refreshToken?: string;
  authenticated?: boolean;
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
  /** Mã giới thiệu của người mời (7.5), tùy chọn. */
  referralCode?: string;
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

export interface RefreshRequest {
  refreshToken?: string;
}
