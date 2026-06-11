import { Button, Group, Modal, NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { CreateGameAccountPayload } from '@/services/types';

type Props = {
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateGameAccountPayload) => void;
};

type FormValues = CreateGameAccountPayload & {
  confirmPassword: string;
  confirmSecondaryPassword: string;
};

const accountNamePattern = /^[A-Za-z0-9_-]+$/;

function oneYearFromToday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function CreateGameAccountModal({ opened, loading, onClose, onSubmit }: Props) {
  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: {
      accountName: '',
      password: '',
      confirmPassword: '',
      secondaryPassword: '',
      confirmSecondaryPassword: '',
      expiresAt: oneYearFromToday(),
      leftSeconds: 0,
    },
    validate: (values) => ({
      accountName:
        values.accountName.trim().length === 0
          ? 'Tên tài khoản là bắt buộc'
          : values.accountName.length > 32
            ? 'Tên tài khoản tối đa 32 ký tự'
            : accountNamePattern.test(values.accountName)
              ? null
              : 'Tên tài khoản chỉ gồm chữ, số, _ và -',
      password: values.password.trim().length === 0 ? 'Mật khẩu là bắt buộc' : null,
      confirmPassword:
        values.confirmPassword === values.password ? null : 'Mật khẩu xác nhận không khớp',
      secondaryPassword:
        values.secondaryPassword.trim().length === 0 ? 'Mật khẩu cấp 2 là bắt buộc' : null,
      confirmSecondaryPassword:
        values.confirmSecondaryPassword === values.secondaryPassword
          ? null
          : 'Mật khẩu cấp 2 xác nhận không khớp',
      expiresAt: values.expiresAt ? null : 'Ngày hết hạn là bắt buộc',
      leftSeconds:
        Number.isInteger(values.leftSeconds) && values.leftSeconds >= 0
          ? null
          : 'iLeftSecond phải là số nguyên không âm',
    }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Thêm tài khoản">
      <form
        onSubmit={form.onSubmit((values) =>
          onSubmit({
            accountName: values.accountName.trim(),
            password: values.password,
            secondaryPassword: values.secondaryPassword,
            expiresAt: values.expiresAt,
            leftSeconds: values.leftSeconds,
          })
        )}
      >
        <Stack>
          <TextInput label="Tên tài khoản" {...form.getInputProps('accountName')} />
          <PasswordInput label="Mật khẩu" {...form.getInputProps('password')} />
          <PasswordInput label="Xác nhận mật khẩu" {...form.getInputProps('confirmPassword')} />
          <PasswordInput label="Mật khẩu cấp 2" {...form.getInputProps('secondaryPassword')} />
          <PasswordInput
            label="Xác nhận mật khẩu cấp 2"
            {...form.getInputProps('confirmSecondaryPassword')}
          />
          <TextInput label="Ngày hết hạn" type="date" {...form.getInputProps('expiresAt')} />
          <NumberInput
            label="iLeftSecond"
            min={0}
            step={1}
            {...form.getInputProps('leftSeconds')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Tạo tài khoản
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
