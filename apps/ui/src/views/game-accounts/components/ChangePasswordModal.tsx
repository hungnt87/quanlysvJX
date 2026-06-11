import { Button, Group, Modal, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

export function ChangePasswordModal({ opened, account, loading, onClose, onSubmit }: Props) {
  const form = useForm({
    initialValues: {
      password: '',
      confirmPassword: ''
    },
    validate: {
      password: (val) => (val.length < 1 ? 'Mật khẩu không được để trống' : null),
      confirmPassword: (val, values) => (val !== values.password ? 'Mật khẩu xác nhận không khớp' : null)
    }
  });

  useEffect(() => {
    if (opened) {
      form.reset();
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title={`Đổi mật khẩu cấp 1: ${account?.accountName}`}>
      <form onSubmit={form.onSubmit((values) => onSubmit(values.password))}>
        <Stack>
          <PasswordInput label="Mật khẩu mới" required {...form.getInputProps('password')} />
          <PasswordInput label="Xác nhận mật khẩu mới" required {...form.getInputProps('confirmPassword')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={loading}>Lưu thay đổi</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
