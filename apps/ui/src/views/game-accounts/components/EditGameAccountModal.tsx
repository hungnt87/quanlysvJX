import { Button, Group, Modal, NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { GameAccount, UpdateGameAccountPayload } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: UpdateGameAccountPayload) => void;
};

type FormValues = {
  password: string;
  confirmPassword: string;
  secondaryPassword: string;
  confirmSecondaryPassword: string;
  expiresAt: string;
  leftSeconds: number;
};

export function EditGameAccountModal({ opened, account, loading, onClose, onSubmit }: Props) {
  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: {
      password: '',
      confirmPassword: '',
      secondaryPassword: '',
      confirmSecondaryPassword: '',
      expiresAt: account?.expiresAt ?? '',
      leftSeconds: account?.leftSeconds ?? 0
    },
    validate: (values) => ({
      confirmPassword: values.password && values.confirmPassword !== values.password ? 'Mật khẩu xác nhận không khớp' : null,
      confirmSecondaryPassword: values.secondaryPassword && values.confirmSecondaryPassword !== values.secondaryPassword ? 'Mật khẩu cấp 2 xác nhận không khớp' : null,
      expiresAt: values.expiresAt ? null : 'Ngày hết hạn là bắt buộc',
      leftSeconds: Number.isInteger(values.leftSeconds) && values.leftSeconds >= 0 ? null : 'iLeftSecond phải là số nguyên không âm'
    })
  });

  useEffect(() => {
    if (opened && account) {
      form.setValues({
        password: '',
        confirmPassword: '',
        secondaryPassword: '',
        confirmSecondaryPassword: '',
        expiresAt: account.expiresAt ?? '',
        leftSeconds: account.leftSeconds ?? 0
      });
    }
  }, [opened, account?.accountName]);

  return (
    <Modal opened={opened} onClose={onClose} title="Sửa tài khoản">
      <form
        onSubmit={form.onSubmit((values) => onSubmit({
          ...(values.password ? { password: values.password } : {}),
          ...(values.secondaryPassword ? { secondaryPassword: values.secondaryPassword } : {}),
          expiresAt: values.expiresAt,
          leftSeconds: values.leftSeconds
        }))}
      >
        <Stack>
          <TextInput label="Tên tài khoản" value={account?.accountName ?? ''} readOnly />
          <PasswordInput label="Mật khẩu mới" {...form.getInputProps('password')} />
          <PasswordInput label="Xác nhận mật khẩu" {...form.getInputProps('confirmPassword')} />
          <PasswordInput label="Mật khẩu cấp 2 mới" {...form.getInputProps('secondaryPassword')} />
          <PasswordInput label="Xác nhận mật khẩu cấp 2" {...form.getInputProps('confirmSecondaryPassword')} />
          <TextInput label="Ngày hết hạn" type="date" {...form.getInputProps('expiresAt')} />
          <NumberInput label="iLeftSecond" min={0} step={1} {...form.getInputProps('leftSeconds')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={loading}>Lưu thay đổi</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
