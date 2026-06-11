import { Badge, Button, Group, Table } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  accounts: GameAccount[];
  onChangePassword: (account: GameAccount) => void;
  onChangeSecondaryPassword: (account: GameAccount) => void;
  onExtend: (account: GameAccount) => void;
  onDelete: (account: GameAccount) => void;
  onBan: (account: GameAccount) => void;
  onUnban: (account: GameAccount) => void;
};

export function GameAccountTable({
  accounts,
  onChangePassword,
  onChangeSecondaryPassword,
  onExtend,
  onDelete,
  onBan,
  onUnban,
}: Props) {
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Tài khoản</Table.Th>
          <Table.Th>Ngày hết hạn</Table.Th>
          <Table.Th>iLeftSecond</Table.Th>
          <Table.Th>Trạng thái</Table.Th>
          <Table.Th>Thao tác</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {accounts.map((account) => (
          <Table.Tr key={account.accountName}>
            <Table.Td>{account.accountName}</Table.Td>
            <Table.Td>{account.expiresAt ?? '-'}</Table.Td>
            <Table.Td>{account.leftSeconds ?? 0}</Table.Td>
            <Table.Td>
              <Badge color={account.status === 'banned' ? 'red' : 'green'}>
                {account.status === 'banned' ? 'Đã ban' : 'Hoạt động'}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={() => onChangePassword(account)}>
                  Đổi MK1
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => onChangeSecondaryPassword(account)}
                >
                  Đổi MK2
                </Button>
                <Button size="xs" variant="light" onClick={() => onExtend(account)}>
                  Gia hạn
                </Button>
                {account.status === 'banned' ? (
                  <Button size="xs" color="green" variant="light" onClick={() => onUnban(account)}>
                    Mở khóa
                  </Button>
                ) : (
                  <Button size="xs" color="yellow" variant="light" onClick={() => onBan(account)}>
                    Khóa
                  </Button>
                )}
                <Button size="xs" color="red" variant="light" onClick={() => onDelete(account)}>
                  Xóa
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
