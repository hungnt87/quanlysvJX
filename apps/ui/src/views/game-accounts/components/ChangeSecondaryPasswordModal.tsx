import { Button, Group, Modal, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (secondaryPassword: string) => void;
};

export function ChangeSecondaryPasswordModal({
  opened,
  account,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const form = useForm({
    initialValues: {
      secondaryPassword: '',
      confirmSecondaryPassword: '',
    },
    validate: {
      secondaryPassword: (val) => (val.length < 1 ? 'Mật khẩu cấp 2 không được để trống' : null),
      confirmSecondaryPassword: (val, values) =>
        val !== values.secondaryPassword ? 'Mật khẩu xác nhận không khớp' : null,
    },
  });

  useEffect(() => {
    if (opened) {
      form.reset();
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title={`Đổi mật khẩu cấp 2: ${account?.accountName}`}>
      <form onSubmit={form.onSubmit((values) => onSubmit(values.secondaryPassword))}>
        <Stack>
          <PasswordInput
            label="Mật khẩu cấp 2 mới"
            required
            {...form.getInputProps('secondaryPassword')}
          />
          <PasswordInput
            label="Xác nhận mật khẩu cấp 2 mới"
            required
            {...form.getInputProps('confirmSecondaryPassword')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Lưu thay đổi
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
