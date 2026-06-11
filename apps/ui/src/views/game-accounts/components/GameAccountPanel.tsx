import { Button, Group, Pagination, Stack, TextInput } from '@mantine/core';
import { useState, useCallback, useTransition } from 'react';
import { useGameAccounts } from '@/hooks/useGameAccounts';
import type { GameAccount } from '@/services/types';
import { BanAccountModal } from './BanAccountModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ChangeSecondaryPasswordModal } from './ChangeSecondaryPasswordModal';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { ExtendAccountModal } from './ExtendAccountModal';
import { GameAccountTable } from './GameAccountTable';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';
import { UnbanAccountModal } from './UnbanAccountModal';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const pageSize = 10;

export function GameAccountPanel({ onSuccess, onError }: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [passwordAccount, setPasswordAccount] = useState<GameAccount | null>(null);
  const [secondaryPasswordAccount, setSecondaryPasswordAccount] = useState<GameAccount | null>(
    null
  );
  const [extendAccount, setExtendAccount] = useState<GameAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(null);
  const [banningAccount, setBanningAccount] = useState<GameAccount | null>(null);
  const [unbanningAccount, setUnbanningAccount] = useState<GameAccount | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const [, startTransition] = useTransition();

  const {
    accountsData,
    createAccount,
    updateAccount,
    deleteAccount,
    banAccount,
    unbanAccount,
    isActionLoading,
  } = useGameAccounts({ search, page, pageSize });

  const data = accountsData ?? {
    items: [],
    pagination: { page, pageSize, total: 0, totalPages: 1 },
  };

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
    setPage(1);
  }, []);

  const handleCreateSubmit = useCallback(
    (payload: any) => {
      createAccount(payload)
        .then(() => {
          onSuccess('Đã tạo tài khoản');
          setCreateOpened(false);
        })
        .catch((error) =>
          onError(error instanceof Error ? error.message : 'Không thể tạo tài khoản')
        );
    },
    [createAccount, onSuccess, onError]
  );

  const handlePasswordSubmit = useCallback(
    (password: string) => {
      if (!passwordAccount) {
        return;
      }
      updateAccount({
        accountName: passwordAccount.accountName,
        payload: {
          password,
          expiresAt: passwordAccount.expiresAt ?? '',
          leftSeconds: passwordAccount.leftSeconds ?? 0,
        },
      })
        .then(() => {
          onSuccess('Đã cập nhật tài khoản');
          setPasswordAccount(null);
        })
        .catch((error) =>
          onError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản')
        );
    },
    [passwordAccount, updateAccount, onSuccess, onError]
  );

  const handleSecondaryPasswordSubmit = useCallback(
    (secondaryPassword: string) => {
      if (!secondaryPasswordAccount) {
        return;
      }
      updateAccount({
        accountName: secondaryPasswordAccount.accountName,
        payload: {
          secondaryPassword,
          expiresAt: secondaryPasswordAccount.expiresAt ?? '',
          leftSeconds: secondaryPasswordAccount.leftSeconds ?? 0,
        },
      })
        .then(() => {
          onSuccess('Đã cập nhật tài khoản');
          setSecondaryPasswordAccount(null);
        })
        .catch((error) =>
          onError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản')
        );
    },
    [secondaryPasswordAccount, updateAccount, onSuccess, onError]
  );

  const handleExtendSubmit = useCallback(
    (values: any) => {
      if (!extendAccount) {
        return;
      }
      updateAccount({
        accountName: extendAccount.accountName,
        payload: {
          expiresAt: values.expiresAt,
          leftSeconds: values.leftSeconds,
        },
      })
        .then(() => {
          onSuccess('Đã cập nhật tài khoản');
          setExtendAccount(null);
        })
        .catch((error) =>
          onError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản')
        );
    },
    [extendAccount, updateAccount, onSuccess, onError]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingAccount) {
      return;
    }
    deleteAccount(deletingAccount.accountName)
      .then(() => {
        onSuccess('Đã xóa tài khoản');
        setDeletingAccount(null);
      })
      .catch((error) =>
        onError(error instanceof Error ? error.message : 'Không thể xóa tài khoản')
      );
  }, [deletingAccount, deleteAccount, onSuccess, onError]);

  const handleBanConfirm = useCallback(() => {
    if (!banningAccount) {
      return;
    }
    banAccount(banningAccount.accountName)
      .then(() => {
        onSuccess('Đã khóa tài khoản');
        setBanningAccount(null);
      })
      .catch((error) =>
        onError(error instanceof Error ? error.message : 'Không thể khóa tài khoản')
      );
  }, [banningAccount, banAccount, onSuccess, onError]);

  const handleUnbanConfirm = useCallback(() => {
    if (!unbanningAccount) {
      return;
    }
    unbanAccount(unbanningAccount.accountName)
      .then(() => {
        onSuccess('Đã mở khóa tài khoản');
        setUnbanningAccount(null);
      })
      .catch((error) =>
        onError(error instanceof Error ? error.message : 'Không thể mở khóa tài khoản')
      );
  }, [unbanningAccount, unbanAccount, onSuccess, onError]);

  const handlePageChange = useCallback((value: number) => {
    startTransition(() => {
      setPage(value);
    });
  }, []);

  return (
    <Stack>
      <Group align="end">
        <TextInput
          placeholder="Tìm theo tên tài khoản"
          label="Tìm kiếm"
          value={search}
          onChange={handleSearchChange}
          style={{ flex: 1 }}
        />
        <Button onClick={() => setCreateOpened(true)}>Thêm tài khoản</Button>
      </Group>
      <GameAccountTable
        accounts={data.items}
        onChangePassword={setPasswordAccount}
        onChangeSecondaryPassword={setSecondaryPasswordAccount}
        onExtend={setExtendAccount}
        onDelete={setDeletingAccount}
        onBan={setBanningAccount}
        onUnban={setUnbanningAccount}
      />
      {data.pagination.total > pageSize && (
        <Pagination total={data.pagination.totalPages} value={page} onChange={handlePageChange} />
      )}
      <CreateGameAccountModal
        opened={createOpened}
        loading={isActionLoading}
        onClose={() => setCreateOpened(false)}
        onSubmit={handleCreateSubmit}
      />
      <ChangePasswordModal
        opened={passwordAccount !== null}
        account={passwordAccount}
        loading={isActionLoading}
        onClose={() => setPasswordAccount(null)}
        onSubmit={handlePasswordSubmit}
      />
      <ChangeSecondaryPasswordModal
        opened={secondaryPasswordAccount !== null}
        account={secondaryPasswordAccount}
        loading={isActionLoading}
        onClose={() => setSecondaryPasswordAccount(null)}
        onSubmit={handleSecondaryPasswordSubmit}
      />
      <ExtendAccountModal
        opened={extendAccount !== null}
        account={extendAccount}
        loading={isActionLoading}
        onClose={() => setExtendAccount(null)}
        onSubmit={handleExtendSubmit}
      />
      <SoftDeleteAccountModal
        opened={deletingAccount !== null}
        account={deletingAccount}
        loading={isActionLoading}
        onClose={() => setDeletingAccount(null)}
        onConfirm={handleDeleteConfirm}
      />
      <BanAccountModal
        opened={banningAccount !== null}
        account={banningAccount}
        loading={isActionLoading}
        onClose={() => setBanningAccount(null)}
        onConfirm={handleBanConfirm}
      />
      <UnbanAccountModal
        opened={unbanningAccount !== null}
        account={unbanningAccount}
        loading={isActionLoading}
        onClose={() => setUnbanningAccount(null)}
        onConfirm={handleUnbanConfirm}
      />
    </Stack>
  );
}
