import { Alert, Stack, Text, NumberInput, Button, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { useBackups } from '@/hooks/useBackups';

type Props = {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function BackupSettingsTab({ onError, onSuccess }: Props) {
  const { settings, saveBackupSettings, isActionLoading } = useBackups();

  const form = useForm({
    initialValues: {
      mysqlRetentionDays: 14,
      mssqlRetentionDays: 14,
    },
    validate: {
      mysqlRetentionDays: (value) => (value < 1 ? 'Số ngày giữ tối thiểu là 1 ngày' : null),
      mssqlRetentionDays: (value) => (value < 1 ? 'Số ngày giữ tối thiểu là 1 ngày' : null),
    },
  });

  useEffect(() => {
    if (settings) {
      form.setValues({
        mysqlRetentionDays: settings.mysqlRetentionDays,
        mssqlRetentionDays: settings.mssqlRetentionDays,
      });
    }
  }, [settings]);

  const handleSubmit = (values: typeof form.values) => {
    saveBackupSettings(values)
      .then(() => {
        onSuccess('Đã cập nhật cài đặt lưu trữ thành công');
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Không thể lưu cài đặt');
      });
  };

  if (!settings) {
    return <Text c="dimmed">Đang tải cài đặt...</Text>;
  }

  return (
    <Stack gap="md">
      <Alert color="blue">
        Cấu hình số ngày lưu trữ (Retention Days) cho các file sao lưu tự động của từng loại cơ sở dữ liệu.
      </Alert>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <NumberInput
            label="Số ngày lưu trữ file backup MySQL"
            min={1}
            disabled={isActionLoading}
            {...form.getInputProps('mysqlRetentionDays')}
          />
          <NumberInput
            label="Số ngày lưu trữ file backup MSSQL"
            min={1}
            disabled={isActionLoading}
            {...form.getInputProps('mssqlRetentionDays')}
          />
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={isActionLoading}>
              Lưu cài đặt
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
