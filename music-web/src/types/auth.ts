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

/** Bước 2 của quên mật khẩu: kiểm tra mã OTP. */
export interface VerifyResetOtpRequest {
  email: string;
  otp: string;
}

/** OTP đúng: mã phiên dùng một lần để đặt mật khẩu mới (hạn expiresInSeconds giây). */
export interface VerifyResetOtpResponse {
  resetToken: string;
  expiresInSeconds: number;
}

/** Bước 3: đặt mật khẩu mới bằng mã phiên của bước 2 (không gửi OTP). */
export interface ResetPasswordRequest {
  email: string;
  resetToken: string;
  newPassword: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}
