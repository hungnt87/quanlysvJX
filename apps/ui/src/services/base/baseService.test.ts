import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BaseService from './baseService';

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mocks.showNotification,
  },
}));

function mockResponse(data: unknown, method = 'GET'): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      method,
      headers: {} as any,
    },
  };
}

describe('BaseService response envelope notifications', () => {
  afterEach(() => {
    mocks.showNotification.mockClear();
  });

  it('shows a red toast with backend error content for success false responses', async () => {
    await expect(
      BaseService({
        url: '/api/test',
        method: 'POST',
        adapter: async () =>
          mockResponse(
            {
              status: 'error',
              message: 'Chưa có phiên bản game nào được kích hoạt.',
            },
            'POST'
          ),
      })
    ).rejects.toThrow('Chưa có phiên bản game nào được kích hoạt.');

    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'red',
        title: 'Lỗi',
        message: 'Chưa có phiên bản game nào được kích hoạt.',
      })
    );
  });

  it('shows a green toast with backend message for non-GET success responses', async () => {
    const response = await BaseService({
      url: '/api/test',
      method: 'POST',
      adapter: async () =>
        mockResponse(
          {
            status: 'success',
            message: 'Đã lưu cấu hình.',
            data: { message: 'Đã lưu cấu hình.' },
          },
          'POST'
        ),
    });

    expect(response.data).toEqual({ message: 'Đã lưu cấu hình.' });
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'teal',
        title: 'Thành công',
        message: 'Đã lưu cấu hình.',
      })
    );
  });

  it('does not show success toast for GET responses', async () => {
    await BaseService({
      url: '/api/test',
      method: 'GET',
      adapter: async () =>
        mockResponse({
          status: 'success',
          message: 'Danh sách đã tải.',
          data: { message: 'Danh sách đã tải.' },
        }),
    });

    expect(mocks.showNotification).not.toHaveBeenCalled();
  });
});
