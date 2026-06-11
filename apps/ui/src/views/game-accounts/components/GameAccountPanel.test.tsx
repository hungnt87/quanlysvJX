import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameAccountPanel } from './GameAccountPanel';

const mockGameAccounts = vi.fn();

vi.mock('@/hooks/useGameAccounts', () => ({
  useGameAccounts: vi.fn((params) => {
    mockGameAccounts(params);
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

describe('GameAccountPanel', () => {
  afterEach(() => cleanup());

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
});
