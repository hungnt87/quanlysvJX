export type SuccessResponse<T> = {
  status: 'success';
  message?: string;
  data: T;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
  errors?: Array<{ field: string; message: string }>;
};

export type PaginatedResponse<T> = {
  status: 'success';
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

/**
 * Trả về phản hồi thành công tiêu chuẩn
 * @param data Dữ liệu trả về
 * @param message Thông điệp kèm theo (tùy chọn)
 */
export function success<T>(data: T, message?: string): SuccessResponse<T> {
  return {
    status: 'success',
    ...(message ? { message } : {}),
    data
  };
}

/**
 * Trả về phản hồi phân trang tiêu chuẩn
 */
export function paginated<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): PaginatedResponse<T> {
  const pages = Math.ceil(pagination.total / pagination.limit);
  return {
    status: 'success',
    data,
    pagination: {
      ...pagination,
      pages
    }
  };
}

/**
 * Trả về phản hồi lỗi tiêu chuẩn
 */
export function error(
  message: string,
  errors?: Array<{ field: string; message: string }>
): ErrorResponse {
  return {
    status: 'error',
    message,
    ...(errors ? { errors } : {})
  };
}
