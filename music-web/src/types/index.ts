export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
}

export interface AuthResponse {
  token: string;
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
