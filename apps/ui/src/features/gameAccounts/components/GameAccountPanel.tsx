import { Button, Group, Pagination, Stack, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/client';
import type { GameAccount, UpdateGameAccountPayload } from '@/services/types';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { EditGameAccountModal } from './EditGameAccountModal';
import { GameAccountTable } from './GameAccountTable';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';
import { BanAccountModal } from './BanAccountModal';
import { UnbanAccountModal } from './UnbanAccountModal';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const pageSize = 10;

export function GameAccountPanel(props: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingAccount, setEditingAccount] = useState<GameAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(null);
  const [banningAccount, setBanningAccount] = useState<GameAccount | null>(null);
  const [unbanningAccount, setUnbanningAccount] = useState<GameAccount | null>(null);
  const [createOpened, setCreateOpened] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['game-accounts', search, page, pageSize],
    queryFn: () => api.gameAccounts({ search, page, pageSize })
  });

  const data = accountsQuery.data ?? { items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };

  const queryClient = useQueryClient();
  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: ['game-accounts'] });

  const createMutation = useMutation({
    mutationFn: api.createGameAccount,
    onSuccess: async () => { props.onSuccess('Đã tạo tài khoản'); setCreateOpened(false); await invalidateAccounts(); },
    onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể tạo tài khoản')
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { accountName: string; values: UpdateGameAccountPayload }) => api.updateGameAccount(payload.accountName, payload.values),
    onSuccess: async () => { props.onSuccess('Đã cập nhật tài khoản'); setEditingAccount(null); await invalidateAccounts(); },
    onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản')
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteGameAccount,
    onSuccess: async () => { props.onSuccess('Đã xóa tài khoản'); setDeletingAccount(null); await invalidateAccounts(); },
    onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể xóa tài khoản')
  });

  const banMutation = useMutation({
    mutationFn: api.banGameAccount,
    onSuccess: async () => { props.onSuccess('Đã khóa tài khoản'); setBanningAccount(null); await invalidateAccounts(); },
    onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể khóa tài khoản')
  });

  const unbanMutation = useMutation({
    mutationFn: api.unbanGameAccount,
    onSuccess: async () => { props.onSuccess('Đã mở khóa tài khoản'); setUnbanningAccount(null); await invalidateAccounts(); },
    onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể mở khóa tài khoản')
  });

  return (
    <Stack>
      <Group align="end">
        <TextInput
          placeholder="Tìm theo tên tài khoản"
          label="Tìm kiếm"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1 }}
        />
        <Button onClick={() => setCreateOpened(true)}>Thêm tài khoản</Button>
      </Group>
      <GameAccountTable accounts={data.items} onEdit={setEditingAccount} onDelete={setDeletingAccount} onBan={setBanningAccount} onUnban={setUnbanningAccount} />
      {data.pagination.total > pageSize && <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />}
      <CreateGameAccountModal
        opened={createOpened}
        loading={createMutation.isPending}
        onClose={() => setCreateOpened(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />
      <EditGameAccountModal
        opened={editingAccount !== null}
        account={editingAccount}
        loading={updateMutation.isPending}
        onClose={() => setEditingAccount(null)}
        onSubmit={(values) => editingAccount && updateMutation.mutate({ accountName: editingAccount.accountName, values })}
      />
      <SoftDeleteAccountModal
        opened={deletingAccount !== null}
        account={deletingAccount}
        loading={deleteMutation.isPending}
        onClose={() => setDeletingAccount(null)}
        onConfirm={() => deletingAccount && deleteMutation.mutate(deletingAccount.accountName)}
      />
      <BanAccountModal
        opened={banningAccount !== null}
        account={banningAccount}
        loading={banMutation.isPending}
        onClose={() => setBanningAccount(null)}
        onConfirm={() => banningAccount && banMutation.mutate(banningAccount.accountName)}
      />
      <UnbanAccountModal
        opened={unbanningAccount !== null}
        account={unbanningAccount}
        loading={unbanMutation.isPending}
        onClose={() => setUnbanningAccount(null)}
        onConfirm={() => unbanningAccount && unbanMutation.mutate(unbanningAccount.accountName)}
      />
    </Stack>
  );
}
