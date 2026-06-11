import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameNetworkConfigPanel } from './GameNetworkConfigPanel';

const mockSaveGameNetwork = vi.fn();

vi.mock('@/services/systemService', () => ({
  systemService: {
    getSystemInfo: vi.fn().mockResolvedValue({
      serverTime: '2026-06-11T08:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      ipChoices: ['127.0.0.1', '192.168.1.20'],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      },
      coreServicesRunning: true,
      runningCoreServices: ['jxserver'],
    }),
    saveGameNetwork: (...args: unknown[]) => mockSaveGameNetwork(...args),
  },
}));

describe('GameNetworkConfigPanel', () => {
  beforeEach(() => {
    mockSaveGameNetwork.mockResolvedValue({
      message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows IP choices, excludes auto, warns about restart, and saves env values', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    expect(await screen.findByText('Cấu hình IP game')).toBeTruthy();
    expect(await screen.findByText(/jxserver/)).toBeTruthy();
    expect(screen.queryByText('auto')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(mockSaveGameNetwork.mock.calls[0]?.[0]).toEqual({
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      });
      expect(onSuccess).toHaveBeenCalledWith(
        'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
      );
    });
  });
});
