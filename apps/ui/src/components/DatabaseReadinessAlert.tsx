import './DatabaseReadinessAlert.css';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { ServiceStatus } from '@/services/types';

export type DatabaseKind = 'mysql' | 'mssql';

const databaseLabels: Record<DatabaseKind, string> = {
  mysql: 'MySQL',
  mssql: 'MSSQL',
};

const databaseServices: Record<DatabaseKind, string> = {
  mysql: 'jxmysql',
  mssql: 'jxmssql',
};

export function isDatabaseHealthy(services: ServiceStatus[], database: DatabaseKind) {
  const service = services.find((item) => item.name === databaseServices[database]);
  return service?.state === 'running' && service.health === 'healthy';
}

export function getUnavailableDatabases(services: ServiceStatus[], databases: DatabaseKind[]) {
  return databases.filter((database) => !isDatabaseHealthy(services, database));
}

type Props = {
  unavailable: DatabaseKind[];
  scope: 'accounts' | 'backup';
};

export function DatabaseReadinessAlert({ unavailable, scope }: Props) {
  if (unavailable.length === 0) {
    return null;
  }

  const names = unavailable.map((database) => databaseLabels[database]).join(' và ');
  const message =
    scope === 'accounts'
      ? `${names} chưa sẵn sàng. Cần bật database jxmssql trước khi quản lý tài khoản.`
      : `${names} chưa sẵn sàng. Một số thao tác sao lưu và khôi phục đang bị khóa.`;

  return (
    <Alert
      className="database-readiness-alert"
      color="orange"
      icon={<IconAlertTriangle size={20} />}
      radius="sm"
      variant="light"
    >
      <Group justify="space-between" align="center" gap="md">
        <Stack gap={2} style={{ flex: 1 }}>
          <Text fw={700}>Dịch vụ database chưa sẵn sàng</Text>
          <Text size="sm">{message}</Text>
        </Stack>
        <Button component={Link} to="/dashboard" variant="filled" color="orange" size="xs">
          Đi tới Dịch vụ
        </Button>
      </Group>
    </Alert>
  );
}
