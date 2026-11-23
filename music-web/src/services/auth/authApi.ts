import apiClient from '../client';
import type {
  ApiResponse,
  AuthResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyResetOtpRequest,
  VerifyResetOtpResponse,
  Member,
} from '../../types';

export const authApi = {
  login: (data: LoginRequest) => apiClient.post<ApiResponse<AuthResponse>>('/auth/login', data),
  googleLogin: (data: { idToken: string; referralCode?: string }) =>
    apiClient.post<ApiResponse<AuthResponse>>('/auth/google-login', data),
  logout: () => apiClient.post<ApiResponse<void>>('/auth/logout'),
  register: (data: RegisterRequest) => apiClient.post<ApiResponse<Member>>('/auth/register', data),
  changePassword: (data: ChangePasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/change-password', data),
  forgotPassword: (data: ForgotPasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/forgot-password', data),
  /** Bước 2: kiểm tra OTP, đúng thì nhận mã phiên dùng một lần để đặt mật khẩu mới. */
  verifyResetOtp: (data: VerifyResetOtpRequest) =>
    apiClient.post<ApiResponse<VerifyResetOtpResponse>>('/auth/verify-reset-otp', data),
  /** Bước 3: đặt mật khẩu mới bằng mã phiên (không gửi OTP). */
  resetPassword: (data: ResetPasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/reset-password', data),
};
