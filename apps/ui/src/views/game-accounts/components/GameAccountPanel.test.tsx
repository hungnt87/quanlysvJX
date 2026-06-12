import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameAccountPanel } from './GameAccountPanel';

const mockGameAccounts = vi.fn();
const mockUseServices = vi.fn();

vi.mock('@/hooks/useGameAccounts', () => ({
  useGameAccounts: vi.fn((params, options) => {
    mockGameAccounts(params);
    mockGameAccounts(options);
    return {
      accountsData: {
        items: [
          {
            accountName: 'jxuser01',
            expiresAt: '2027-06-10',
            leftSeconds: 0,
            usedSeconds: 0,
            status: 'active',
          },
        ],
        pagination: { page: params.page, pageSize: params.pageSize, total: 11, totalPages: 2 },
      },
      isLoading: false,
      isActionLoading: false,
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
      banAccount: vi.fn(),
      unbanAccount: vi.fn(),
    };
  }),
}));

vi.mock('@/hooks/useServices', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
}));

describe('GameAccountPanel', () => {
  afterEach(() => {
    cleanup();
    mockGameAccounts.mockReset();
    mockUseServices.mockReset();
  });

  beforeEach(() => {
    mockUseServices.mockReturnValue({
      services: [
        {
          name: 'jxmssql',
          state: 'running',
          health: 'healthy',
        },
      ],
    });
  });

  it('renders search, account rows, and pagination', async () => {
    renderWithProviders(<GameAccountPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByText('jxuser01')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tìm theo tên tài khoản')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm tài khoản' })).toBeTruthy();
    expect(screen.getByText('Hoạt động')).toBeTruthy();
  });

  it('searches and resets to page 1', async () => {
    renderWithProviders(<GameAccountPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('Tìm theo tên tài khoản'), {
      target: { value: 'abc' },
    });

    await waitFor(() =>
      expect(mockGameAccounts).toHaveBeenCalledWith({ search: 'abc', page: 1, pageSize: 10 })
    );
  });

  it('shows a database warning and disables account actions when MSSQL is not healthy', async () => {
    mockUseServices.mockReturnValue({
      services: [{ name: 'jxmssql', state: 'running', health: 'unhealthy' }],
    });

    renderWithProviders(<GameAccountPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByText(/MSSQL chưa sẵn sàng/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đi tới Dịch vụ' }).getAttribute('href')).toBe(
      '/dashboard'
    );
    expect(screen.getByRole('button', { name: 'Thêm tài khoản' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(mockGameAccounts).toHaveBeenCalledWith({ enabled: false });
  });
});
