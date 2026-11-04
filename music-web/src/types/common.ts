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
