import { Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';

type Props = {
  opened: boolean;
  kind: 'mysql' | 'mssql';
  filename: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RestoreModal({ opened, kind, filename, loading, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const matches = filename !== null && confirmText === filename;

  useEffect(() => {
    if (!opened) setConfirmText('');
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title={`Restore ${kind.toUpperCase()}`} centered>
      <Text mb="sm">This will overwrite current data. Type the filename to confirm.</Text>
      <Text fw={700} mb="sm">{filename}</Text>
      <TextInput value={confirmText} onChange={(event) => setConfirmText(event.currentTarget.value)} placeholder="Backup filename" mb="md" />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button color="red" disabled={!matches} loading={loading} onClick={onConfirm}>Restore</Button>
      </Group>
    </Modal>
  );
}
