import { Button, Checkbox, Group, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { BackupKind, DatabaseBackupSchedule } from '../../api/types';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const dayOptions = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' }
];

const fallbackSchedules: Record<BackupKind, DatabaseBackupSchedule> = {
  mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null },
  mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null }
};

export function BackupScheduleTab({ onSuccess, onError }: Props) {
  const [schedules, setSchedules] = useState<Record<BackupKind, DatabaseBackupSchedule>>(fallbackSchedules);
  const [loadingKind, setLoadingKind] = useState<BackupKind | null>(null);

  useEffect(() => {
    api.schedules()
      .then((config) => setSchedules(config.schedules))
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to load schedules'));
  }, [onError]);

  async function saveSchedule(kind: BackupKind) {
    setLoadingKind(kind);
    try {
      const config = await api.saveSchedule(kind, schedules[kind]);
      setSchedules(config.schedules);
      onSuccess(`${kind.toUpperCase()} schedule saved`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to save schedule');
    } finally {
      setLoadingKind(null);
    }
  }

  async function runNow(kind: BackupKind) {
    setLoadingKind(kind);
    try {
      await api.backup(kind);
      onSuccess(`${kind.toUpperCase()} backup started`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to start backup');
    } finally {
      setLoadingKind(null);
    }
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {(['mysql', 'mssql'] as const).map((kind) => (
        <SchedulePanel
          key={kind}
          kind={kind}
          schedule={schedules[kind]}
          loading={loadingKind === kind}
          onChange={(schedule) => setSchedules((current) => ({ ...current, [kind]: schedule }))}
          onSave={() => saveSchedule(kind)}
          onRunNow={() => runNow(kind)}
        />
      ))}
    </SimpleGrid>
  );
}

type PanelProps = {
  kind: BackupKind;
  schedule: DatabaseBackupSchedule;
  loading: boolean;
  onChange: (schedule: DatabaseBackupSchedule) => void;
  onSave: () => void;
  onRunNow: () => void;
};

function SchedulePanel({ kind, schedule, loading, onChange, onSave, onRunNow }: PanelProps) {
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{kind.toUpperCase()} schedule</Title>
          <Switch checked={schedule.enabled} onChange={(event) => onChange({ ...schedule, enabled: event.currentTarget.checked })} label="Enabled" />
        </Group>
        <Checkbox.Group
          label="Days"
          value={schedule.daysOfWeek.map(String)}
          onChange={(values) => onChange({ ...schedule, daysOfWeek: values.map(Number) as DatabaseBackupSchedule['daysOfWeek'] })}
        >
          <Group mt="xs">
            {dayOptions.map((day) => <Checkbox key={day.value} value={day.value} label={day.label} />)}
          </Group>
        </Checkbox.Group>
        <TextInput label="Server time" type="time" value={schedule.time} onChange={(event) => onChange({ ...schedule, time: event.currentTarget.value })} />
        <NumberInput
          label="Retention days"
          min={1}
          value={schedule.retentionDays}
          onChange={(value) => onChange({ ...schedule, retentionDays: typeof value === 'number' ? value : 14 })}
        />
        <Text size="sm" c="dimmed">Last run key: {schedule.lastRunKey ?? 'Never'}</Text>
        <Group justify="flex-end">
          <Button variant="default" loading={loading} onClick={onRunNow}>Run now</Button>
          <Button loading={loading} onClick={onSave}>Save schedule</Button>
        </Group>
      </Stack>
    </Paper>
  );
}
