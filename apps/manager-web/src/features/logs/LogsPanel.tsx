import { Button, Group, NumberInput, Paper, Select, Stack, Switch, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { api } from '../../api/client';

type Props = {
  services: string[];
  selected: string | null;
  onSelect: (service: string) => void;
  onError: (message: string) => void;
};

export function LogsPanel({ services, selected, onSelect, onError }: Props) {
  const [tail, setTail] = useState(300);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    if (!selected) return;
    setLoading(true);
    try {
      setLogs((await api.logs(selected, tail)).logs);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to load logs');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="end">
          <Text fw={700}>Docker logs</Text>
          <Switch label="Auto follow" disabled />
        </Group>
        <Group grow align="end">
          <Select label="Service" data={services} value={selected} onChange={(value) => value && onSelect(value)} />
          <NumberInput
            label="Tail"
            min={50}
            max={2000}
            value={tail}
            onChange={(value) => setTail(typeof value === 'number' ? value : Number(value) || 300)}
          />
        </Group>
        <Group justify="space-between">
          <Button variant="default" onClick={() => setLogs('')}>Clear</Button>
          <Button loading={loading} onClick={loadLogs}>Load logs</Button>
        </Group>
        <Textarea className="logsBox" value={logs} readOnly autosize minRows={12} maxRows={20} />
      </Stack>
    </Paper>
  );
}
