import { Alert, Button, Card, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useSaveGameNetwork, useSystemInfo } from '@/hooks/useSystemInfo';
import type { GameNetworkConfig } from '@/services/types';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const fallbackConfig: GameNetworkConfig = {
  jxIp: '127.0.0.1',
  mysqlIp: '127.0.0.1',
  paysysIp: '127.0.0.1',
  mssqlIp: '127.0.0.1',
};

export function GameNetworkConfigPanel({ onSuccess, onError }: Props) {
  const { data, isLoading } = useSystemInfo();
  const saveMutation = useSaveGameNetwork();
  const [values, setValues] = useState<GameNetworkConfig>(fallbackConfig);

  useEffect(() => {
    if (data?.gameNetwork) {
      setValues(data.gameNetwork);
    }
  }, [data?.gameNetwork]);

  const ipOptions = useMemo(
    () => (data?.ipChoices ?? ['127.0.0.1']).map((ip) => ({ value: ip, label: ip })),
    [data?.ipChoices]
  );

  const setField = (field: keyof GameNetworkConfig, value: string | null) => {
    if (!value) {
      return;
    }
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    saveMutation.mutate(values, {
      onSuccess: (result) => onSuccess(result.message),
      onError: (error) =>
        onError(error instanceof Error ? error.message : 'Không thể lưu cấu hình IP game'),
    });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Cấu hình IP game</Title>
          <Text size="xs" c="dimmed">
            Lưu IP vào .env; restart dịch vụ để container áp dụng cấu hình mới.
          </Text>
        </div>

        {data?.coreServicesRunning && (
          <Alert color="yellow" title="Cần restart dịch vụ để áp dụng">
            Đang chạy: {data.runningCoreServices.join(', ')}
          </Alert>
        )}

        <Group grow align="flex-start">
          <Select
            label="Game server IP"
            data={ipOptions}
            value={values.jxIp}
            onChange={(value) => setField('jxIp', value)}
            disabled={isLoading || saveMutation.isPending}
          />
          <Select
            label="MySQL IP"
            data={ipOptions}
            value={values.mysqlIp}
            onChange={(value) => setField('mysqlIp', value)}
            disabled={isLoading || saveMutation.isPending}
          />
        </Group>
        <Group grow align="flex-start">
          <Select
            label="Paysys IP"
            data={ipOptions}
            value={values.paysysIp}
            onChange={(value) => setField('paysysIp', value)}
            disabled={isLoading || saveMutation.isPending}
          />
          <Select
            label="MSSQL IP"
            data={ipOptions}
            value={values.mssqlIp}
            onChange={(value) => setField('mssqlIp', value)}
            disabled={isLoading || saveMutation.isPending}
          />
        </Group>

        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saveMutation.isPending} disabled={isLoading}>
            Lưu cấu hình IP
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
