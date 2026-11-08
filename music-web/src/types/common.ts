export interface ApiResponse<T> {
  result: T;
  message?: string;
  code?: number;
}

export interface PageRequest {
  page?: number;
  size?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  keyword?: string;
}
