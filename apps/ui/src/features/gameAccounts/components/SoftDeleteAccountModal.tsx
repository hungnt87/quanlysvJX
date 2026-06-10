import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SoftDeleteAccountModal({ opened, account, loading, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Xóa tài khoản">
      <Stack>
        <Text>Thao tác này sẽ xóa vĩnh viễn tài khoản {account?.accountName} khỏi cơ sở dữ liệu.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Hủy</Button>
          <Button color="red" loading={loading} onClick={onConfirm}>Xóa tài khoản</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
