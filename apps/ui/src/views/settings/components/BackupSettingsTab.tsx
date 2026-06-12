import { Alert, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { legacyBackupService } from '@/services/legacyBackupService';

type Props = {
  onError: (message: string) => void;
};

export function BackupSettingsTab({ onError }: Props) {
  const settingsQuery = useQuery({
    queryKey: ['backups', 'legacy-settings'],
    queryFn: legacyBackupService.getLegacySettings,
  });
  const settings = settingsQuery.data;

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (settingsQuery.isError) {
      onErrorRef.current(
        settingsQuery.error instanceof Error
          ? settingsQuery.error.message
          : 'Unable to load backup settings'
      );
    }
  }, [settingsQuery.error, settingsQuery.isError]);

  if (!settings) {
    return <Text c="dimmed">Loading backup settings...</Text>;
  }

  return (
    <Stack gap="md">
      <Alert color="blue">Backup paths are managed by server environment configuration.</Alert>
      <Table withTableBorder>
        <Table.Tbody>
          <SettingRow label="MySQL backup directory" value={settings.mysqlBackupDir} />
          <SettingRow label="MSSQL backup directory" value={settings.mssqlBackupDir} />
          <SettingRow label="Metadata file" value={settings.backupMetadataFile} />
          <SettingRow label="Schedule file" value={settings.backupScheduleFile} />
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <Table.Tr>
      <Table.Th w={260}>{label}</Table.Th>
      <Table.Td>
        <Text ff="monospace" size="sm">
          {value}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}
