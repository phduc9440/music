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
  password?: string;
  email?: string;
  fullName?: string;
  roles?: string[];
}

export interface AccountUpdateRequest {
  email?: string;
  fullName?: string;
  password?: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}
