import { Button, FileInput, Group, Modal, Select } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { BackupKind } from '@/services/types';

type Props = {
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onUpload: (kind: BackupKind, file: File) => void;
};

export function BackupUploadModal({ opened, loading, onClose, onUpload }: Props) {
  const [kind, setKind] = useState<BackupKind>('mysql');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!opened) {
      setKind('mysql');
      setFile(null);
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Upload backup" centered>
      <Select
        label="Database"
        data={[{ value: 'mysql', label: 'MySQL' }, { value: 'mssql', label: 'MSSQL' }]}
        value={kind}
        onChange={(value) => setKind((value ?? 'mysql') as BackupKind)}
        mb="md"
      />
      <FileInput label="Backup file" value={file} onChange={setFile} placeholder="Choose backup file" mb="md" />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button disabled={!file} loading={loading} onClick={() => file && onUpload(kind, file)}>Upload</Button>
      </Group>
    </Modal>
  );
}
