import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import type { BackupFile } from '@/services/types';

type Props = {
  opened: boolean;
  file: BackupFile | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteBackupModal({ opened, file, loading, onClose, onConfirm }: Props) {
  const blocked = file?.isLatest === true;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete backup" centered>
      {blocked ? <Alert color="red" mb="md">Newest backup cannot be deleted</Alert> : null}
      <Text mb="md">Delete backup file {file ? <strong>{file.filename}</strong> : null}?</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button color="red" disabled={!file || blocked} loading={loading} onClick={onConfirm}>Delete</Button>
      </Group>
    </Modal>
  );
}
