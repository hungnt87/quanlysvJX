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
      ipChoices: ['192.168.1.20'],
      serverIpChoices: [{ address: '192.168.1.20', interfaceName: 'eth0', kind: 'host' }],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '10.0.0.8',
        paysysIp: '172.18.0.1',
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
        mysqlIp: '10.0.0.9',
        paysysIp: '172.18.0.2',
        mssqlIp: '8.8.8.8',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses host choices for game IP and free IPv4 inputs for other IPs', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    expect(await screen.findByText('Cấu hình IP game')).toBeTruthy();
    expect(await screen.findByText(/jxserver/)).toBeTruthy();
    expect(screen.queryByText('auto')).toBeNull();
    expect((screen.getAllByLabelText('Game server IP')[0] as HTMLInputElement).value).toBe(
      'eth0 - 192.168.1.20 (Host)'
    );
    expect(screen.queryByText('127.0.0.1')).toBeNull();

    fireEvent.change(screen.getByLabelText('MySQL IP'), { target: { value: '10.0.0.9' } });
    fireEvent.change(screen.getByLabelText('Paysys IP'), { target: { value: '172.18.0.2' } });
    fireEvent.change(screen.getByLabelText('MSSQL IP'), { target: { value: '8.8.8.8' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(mockSaveGameNetwork.mock.calls[0]?.[0]).toEqual({
        jxIp: '192.168.1.20',
        mysqlIp: '10.0.0.9',
        paysysIp: '172.18.0.2',
        mssqlIp: '8.8.8.8',
      });
      expect(onSuccess).toHaveBeenCalledWith(
        'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
      );
    });
  });
});
