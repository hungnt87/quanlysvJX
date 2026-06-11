import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function BanAccountModal({ opened, account, loading, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Khóa tài khoản">
      <Stack>
        <Text>
          Bạn có chắc chắn muốn khóa tài khoản <strong>{account?.accountName}</strong> không?
        </Text>
        <Text size="sm" color="dimmed">
          Tài khoản này sẽ không thể đăng nhập vào game nữa, nhưng thông tin tài khoản vẫn được giữ
          lại trong cơ sở dữ liệu.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Hủy
          </Button>
          <Button color="yellow" loading={loading} onClick={onConfirm}>
            Khóa tài khoản
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
