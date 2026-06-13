import axios, { type AxiosRequestConfig } from 'axios';
import { showSuccessNotification, showErrorNotification } from '@/utils/notification';
import type { ApiResponse } from '../types';

type BackendMessagePayload = {
  message?: unknown;
};

type ToastedError = Error & {
  response?: unknown;
  hasBackendToast?: boolean;
};

const BaseService = axios.create({
  timeout: 60000,
  baseURL: '/',
});

function isBackendMessagePayload(data: unknown): data is BackendMessagePayload {
  return typeof data === 'object' && data !== null && 'message' in data;
}

function shouldShowSuccessToast(config?: AxiosRequestConfig) {
  return (config?.method ?? 'get').toLowerCase() !== 'get';
}

function showBackendErrorToast(message: string) {
  showErrorNotification(message, 'Lỗi');
}

function showBackendSuccessToast(message: string) {
  showSuccessNotification(message, 'Thành công');
}

BaseService.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<unknown>;
    if (apiResponse && typeof apiResponse === 'object' && 'status' in apiResponse) {
      if (apiResponse.status === 'success') {
        const successMsg =
          apiResponse.message ||
          (isBackendMessagePayload(apiResponse.data) && typeof apiResponse.data.message === 'string'
            ? apiResponse.data.message
            : null);
        if (shouldShowSuccessToast(response.config) && successMsg && successMsg.trim().length > 0) {
          showBackendSuccessToast(successMsg);
        }
        response.data = apiResponse.data;
      } else if (apiResponse.status === 'error') {
        const errorMsg = apiResponse.message || 'Yêu cầu thất bại';
        showBackendErrorToast(errorMsg);
        const err: ToastedError = new Error(errorMsg);
        err.response = response;
        err.hasBackendToast = true;
        return Promise.reject(err);
      }
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default BaseService;
