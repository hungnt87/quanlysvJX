import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { BackupList } from '../../api/types';
import { RestoreModal } from './RestoreModal';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function BackupPanel({ onSuccess, onError }: Props) {
  const [backups, setBackups] = useState<BackupList>({ mysql: [], mssql: [] });
  const [kind, setKind] = useState<'mysql' | 'mssql'>('mysql');
  const [filename, setFilename] = useState<string | null>(null);
  const [restoreOpened, setRestoreOpened] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setBackups(await api.backups());
  }

  async function runBackup(nextKind: 'mysql' | 'mssql') {
    setLoading(true);
    try {
      await api.backup(nextKind);
      await refresh();
      onSuccess(`${nextKind.toUpperCase()} backup completed`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Backup failed');
    } finally {
      setLoading(false);
    }
  }

  async function restoreSelected() {
    if (!filename) return;
    setLoading(true);
    try {
      await api.restore(kind, filename);
      setRestoreOpened(false);
      await refresh();
      onSuccess(`${kind.toUpperCase()} restore completed`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Restore failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch((error) => onError(error instanceof Error ? error.message : 'Unable to load backups'));
  }, [onError]);

  const options = backups[kind].map((file) => ({ value: file.filename, label: file.filename }));

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Text fw={700}>Database backup / restore</Text>
          <Group grow>
            <Button loading={loading} onClick={() => runBackup('mysql')}>Backup MySQL</Button>
            <Button loading={loading} onClick={() => runBackup('mssql')}>Backup MSSQL</Button>
          </Group>
          <Select
            label="Database"
            data={[{ value: 'mysql', label: 'MySQL' }, { value: 'mssql', label: 'MSSQL' }]}
            value={kind}
            onChange={(value) => {
              setKind(value as 'mysql' | 'mssql');
              setFilename(null);
            }}
          />
          <Select label="Backup file" data={options} value={filename} onChange={setFilename} />
          <Button color="red" disabled={!filename} onClick={() => setRestoreOpened(true)}>Restore selected backup</Button>
        </Stack>
      </Paper>
      <RestoreModal opened={restoreOpened} kind={kind} filename={filename} loading={loading} onClose={() => setRestoreOpened(false)} onConfirm={restoreSelected} />
    </>
  );
}
