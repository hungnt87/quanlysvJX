import { Badge, Button, Group, Table, Text, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import type { GameAccount } from '@/services/types';

type Props = {
  accounts: GameAccount[];
  onChangePassword: (account: GameAccount) => void;
  onChangeSecondaryPassword: (account: GameAccount) => void;
  onExtend: (account: GameAccount) => void;
  onDelete: (account: GameAccount) => void;
  onBan: (account: GameAccount) => void;
  onUnban: (account: GameAccount) => void;
  actionsDisabled?: boolean;
  disabledReason?: string;
  emptyMessage?: string;
};

export function GameAccountTable({
  accounts,
  onChangePassword,
  onChangeSecondaryPassword,
  onExtend,
  onDelete,
  onBan,
  onUnban,
  actionsDisabled = false,
  disabledReason = 'Thao tác đang bị khóa',
  emptyMessage = 'Không có tài khoản',
}: Props) {
  const wrapAction = (button: ReactNode) => {
    if (!actionsDisabled) {
      return button;
    }

    return (
      <Tooltip label={disabledReason} withArrow>
        <span>{button}</span>
      </Tooltip>
    );
  };

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
        {accounts.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={5}>
              <Text c="dimmed">{emptyMessage}</Text>
            </Table.Td>
          </Table.Tr>
        ) : (
          accounts.map((account) => (
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
                  {wrapAction(
                    <Button
                      size="xs"
                      variant="light"
                      disabled={actionsDisabled}
                      onClick={() => onChangePassword(account)}
                    >
                      Đổi MK1
                    </Button>
                  )}
                  {wrapAction(
                    <Button
                      size="xs"
                      variant="light"
                      disabled={actionsDisabled}
                      onClick={() => onChangeSecondaryPassword(account)}
                    >
                      Đổi MK2
                    </Button>
                  )}
                  {wrapAction(
                    <Button
                      size="xs"
                      variant="light"
                      disabled={actionsDisabled}
                      onClick={() => onExtend(account)}
                    >
                      Gia hạn
                    </Button>
                  )}
                  {account.status === 'banned'
                    ? wrapAction(
                        <Button
                          size="xs"
                          color="green"
                          variant="light"
                          disabled={actionsDisabled}
                          onClick={() => onUnban(account)}
                        >
                          Mở khóa
                        </Button>
                      )
                    : wrapAction(
                        <Button
                          size="xs"
                          color="yellow"
                          variant="light"
                          disabled={actionsDisabled}
                          onClick={() => onBan(account)}
                        >
                          Khóa
                        </Button>
                      )}
                  {wrapAction(
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      disabled={actionsDisabled}
                      onClick={() => onDelete(account)}
                    >
                      Xóa
                    </Button>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  );
}
