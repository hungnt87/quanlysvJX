import { Button, Checkbox, Group, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { BackupKind, DatabaseBackupSchedule } from '@/services/types';
import { useBackups, backupKeys } from '@/hooks/useBackups';
import { backupService } from '@/services/backupService';

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
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<BackupKind, DatabaseBackupSchedule>>(fallbackSchedules);
  const [loadingKind, setLoadingKind] = useState<BackupKind | null>(null);

  const { schedules, saveSchedule, createBackup } = useBackups();

  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;
  }, [onError, onSuccess]);

  useEffect(() => {
    if (schedules?.schedules) {
      setDrafts(schedules.schedules);
    }
  }, [schedules]);

  const handleSaveSchedule = useCallback((kind: BackupKind) => {
    setLoadingKind(kind);
    saveSchedule({ kind, schedule: drafts[kind] })
      .then(() => onSuccessRef.current(`${kind.toUpperCase()} schedule saved`))
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Unable to save schedule'))
      .finally(() => setLoadingKind(null));
  }, [drafts, saveSchedule]);

  const handleRunNow = useCallback((kind: BackupKind) => {
    setLoadingKind(kind);
    createBackup(kind)
      .then(() => onSuccessRef.current(`${kind.toUpperCase()} backup started`))
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Unable to start backup'))
      .finally(() => setLoadingKind(null));
  }, [createBackup]);

  const handleDraftChange = useCallback((kind: BackupKind, schedule: DatabaseBackupSchedule) => {
    setDrafts((current) => ({ ...current, [kind]: schedule }));
  }, []);

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {(['mysql', 'mssql'] as const).map((kind) => (
        <SchedulePanel
          key={kind}
          kind={kind}
          schedule={drafts[kind]}
          loading={loadingKind === kind}
          onChange={(schedule) => handleDraftChange(kind, schedule)}
          onSave={() => handleSaveSchedule(kind)}
          onRunNow={() => handleRunNow(kind)}
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
  const handleEnabledChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...schedule, enabled: event.currentTarget.checked });
  }, [schedule, onChange]);

  const handleDaysChange = useCallback((values: string[]) => {
    onChange({ ...schedule, daysOfWeek: values.map(Number) as DatabaseBackupSchedule['daysOfWeek'] });
  }, [schedule, onChange]);

  const handleTimeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...schedule, time: event.currentTarget.value });
  }, [schedule, onChange]);

  const handleRetentionChange = useCallback((value: string | number) => {
    onChange({ ...schedule, retentionDays: typeof value === 'number' ? value : 14 });
  }, [schedule, onChange]);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{kind.toUpperCase()} schedule</Title>
          <Switch checked={schedule.enabled} onChange={handleEnabledChange} label="Enabled" />
        </Group>
        <Checkbox.Group
          label="Days"
          value={schedule.daysOfWeek.map(String)}
          onChange={handleDaysChange}
        >
          <Group mt="xs">
            {dayOptions.map((day) => <Checkbox key={day.value} value={day.value} label={day.label} />)}
          </Group>
        </Checkbox.Group>
        <TextInput label="Server time" type="time" value={schedule.time} onChange={handleTimeChange} />
        <NumberInput
          label="Retention days"
          min={1}
          value={schedule.retentionDays}
          onChange={handleRetentionChange}
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
