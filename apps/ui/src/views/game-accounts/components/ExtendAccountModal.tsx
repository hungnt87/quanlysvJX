import { Button, Group, Modal, NumberInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: { expiresAt: string; leftSeconds: number }) => void;
};

export function ExtendAccountModal({ opened, account, loading, onClose, onSubmit }: Props) {
  const form = useForm({
    initialValues: {
      expiresAt: '',
      leftSeconds: 0
    },
    validate: {
      expiresAt: (val) => (!/^\d{4}-\d{2}-\d{2}$/.test(val) ? 'Ngày hết hạn phải có định dạng YYYY-MM-DD' : null),
      leftSeconds: (val) => (val < 0 ? 'Số giây còn lại không được nhỏ hơn 0' : null)
    }
  });

  useEffect(() => {
    if (opened && account) {
      form.setValues({
        expiresAt: account.expiresAt ?? '',
        leftSeconds: account.leftSeconds ?? 0
      });
    }
  }, [opened, account]);

  return (
    <Modal opened={opened} onClose={onClose} title={`Gia hạn thời gian: ${account?.accountName}`}>
      <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
        <Stack>
          <TextInput label="Ngày hết hạn (YYYY-MM-DD)" required placeholder="2027-06-10" {...form.getInputProps('expiresAt')} />
          <NumberInput label="iLeftSecond (số giây còn lại)" required min={0} {...form.getInputProps('leftSeconds')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={loading}>Lưu thay đổi</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
