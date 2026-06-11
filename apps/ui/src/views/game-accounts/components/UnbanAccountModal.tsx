import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function UnbanAccountModal({ opened, account, loading, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Mở khóa tài khoản">
      <Stack>
        <Text>Bạn có chắc chắn muốn mở khóa cho tài khoản <strong>{account?.accountName}</strong> không?</Text>
        <Text size="sm" color="dimmed">
          Tài khoản này sẽ được chuyển về trạng thái hoạt động và có thể đăng nhập vào game bình thường.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Hủy</Button>
          <Button color="green" loading={loading} onClick={onConfirm}>Mở khóa</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
