import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ChangeSecondaryPasswordModal } from './ChangeSecondaryPasswordModal';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { ExtendAccountModal } from './ExtendAccountModal';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';

describe('game account modals', () => {
  afterEach(() => cleanup());

  it('validates matching create passwords', async () => {
    const submit = vi.fn();
    renderWithProviders(
      <CreateGameAccountModal opened onClose={vi.fn()} onSubmit={submit} loading={false} />
    );

    fireEvent.change(screen.getByLabelText('Tên tài khoản'), { target: { value: 'jxuser' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'two' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu cấp 2'), { target: { value: 'pin' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu cấp 2'), {
      target: { value: 'pin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('validates change password submit', async () => {
    const submit = vi.fn();
    renderWithProviders(
      <ChangePasswordModal
        opened
        account={{
          accountName: 'jxuser',
          expiresAt: '2027-06-10',
          leftSeconds: 0,
          usedSeconds: 0,
          status: 'active',
        }}
        onClose={vi.fn()}
        onSubmit={submit}
        loading={false}
      />
    );

    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới/i), { target: { value: 'newpass' } });
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), {
      target: { value: 'newpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('newpass'));
  });

  it('validates change secondary password submit', async () => {
    const submit = vi.fn();
    renderWithProviders(
      <ChangeSecondaryPasswordModal
        opened
        account={{
          accountName: 'jxuser',
          expiresAt: '2027-06-10',
          leftSeconds: 0,
          usedSeconds: 0,
          status: 'active',
        }}
        onClose={vi.fn()}
        onSubmit={submit}
        loading={false}
      />
    );

    fireEvent.change(screen.getByLabelText(/^Mật khẩu cấp 2 mới/i), {
      target: { value: 'newsecpass' },
    });
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu cấp 2 mới/i), {
      target: { value: 'newsecpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('newsecpass'));
  });

  it('validates extend time submit', async () => {
    const submit = vi.fn();
    renderWithProviders(
      <ExtendAccountModal
        opened
        account={{
          accountName: 'jxuser',
          expiresAt: '2027-06-10',
          leftSeconds: 100,
          usedSeconds: 0,
          status: 'active',
        }}
        onClose={vi.fn()}
        onSubmit={submit}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ expiresAt: '2027-06-10', leftSeconds: 100 })
    );
  });

  it('labels delete as deleting the account', () => {
    renderWithProviders(
      <SoftDeleteAccountModal
        opened
        account={{
          accountName: 'jxuser',
          expiresAt: '2027-06-10',
          leftSeconds: 0,
          usedSeconds: 0,
          status: 'active',
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getAllByText(/xóa tài khoản/i).length).toBeGreaterThan(0);
  });
});
