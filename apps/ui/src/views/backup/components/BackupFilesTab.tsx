import { Badge, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useCallback } from 'react';
import { useBackups, backupKeys } from '@/hooks/useBackups';
import type { BackupFile, BackupKind } from '@/services/types';
import { BackupEditModal } from './BackupEditModal';
import { BackupUploadModal } from './BackupUploadModal';
import { DeleteBackupModal } from './DeleteBackupModal';
import { RestoreModal } from './RestoreModal';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type FilterKind = 'all' | BackupKind;

export function BackupFilesTab({ onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [uploadOpened, setUploadOpened] = useState(false);
  const [editingFile, setEditingFile] = useState<BackupFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<BackupFile | null>(null);
  const [restoringFile, setRestoringFile] = useState<BackupFile | null>(null);

  const {
    backups: files,
    createBackup,
    uploadBackup,
    updateBackup,
    deleteBackup,
    restoreBackup,
    isLoading,
  } = useBackups();

  const handleBackupNow = useCallback(() => {
    createBackup('all')
      .then(() => onSuccess('Backup completed'))
      .catch((error) => onError(error instanceof Error ? error.message : 'Backup action failed'));
  }, [createBackup, onSuccess, onError]);

  const handleUpload = useCallback(
    (kind: BackupKind, file: File) => {
      uploadBackup({ kind, file })
        .then(() => {
          onSuccess('Backup uploaded');
          setUploadOpened(false);
        })
        .catch((error) => onError(error instanceof Error ? error.message : 'Upload failed'));
    },
    [uploadBackup, onSuccess, onError]
  );

  const handleSaveEdit = useCallback(
    (filename: string, note: string | null) => {
      if (!editingFile) {
        return;
      }
      updateBackup({
        kind: editingFile.kind,
        currentFilename: editingFile.filename,
        payload: { filename, note },
      })
        .then(() => {
          onSuccess('Backup updated');
          setEditingFile(null);
        })
        .catch((error) => onError(error instanceof Error ? error.message : 'Update failed'));
    },
    [editingFile, updateBackup, onSuccess, onError]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingFile) {
      return;
    }
    deleteBackup({ kind: deletingFile.kind, filename: deletingFile.filename })
      .then(() => {
        onSuccess('Backup deleted');
        setDeletingFile(null);
      })
      .catch((error) => onError(error instanceof Error ? error.message : 'Delete failed'));
  }, [deletingFile, deleteBackup, onSuccess, onError]);

  const handleRestoreConfirm = useCallback(() => {
    if (!restoringFile) {
      return;
    }
    restoreBackup({ kind: restoringFile.kind, filename: restoringFile.filename })
      .then(() => {
        onSuccess('Restore completed');
        setRestoringFile(null);
      })
      .catch((error) => onError(error instanceof Error ? error.message : 'Restore failed'));
  }, [restoringFile, restoreBackup, onSuccess, onError]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: backupKeys.lists() });
  }, [queryClient]);

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files
      .filter((file) => filterKind === 'all' || file.kind === filterKind)
      .filter(
        (file) =>
          !normalizedQuery ||
          file.filename.toLowerCase().includes(normalizedQuery) ||
          (file.note ?? '').toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }, [files, filterKind, query]);

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Group align="flex-end">
            <Button onClick={handleBackupNow}>Backup now</Button>
            <Button variant="light" onClick={() => setUploadOpened(true)}>
              Upload
            </Button>
            <Button variant="default" onClick={handleRefresh}>
              Refresh
            </Button>
          </Group>
          <Group align="flex-end">
            <Select
              label="Database"
              data={[
                { value: 'all', label: 'All' },
                { value: 'mysql', label: 'MySQL' },
                { value: 'mssql', label: 'MSSQL' },
              ]}
              value={filterKind}
              onChange={(value) => setFilterKind((value ?? 'all') as FilterKind)}
            />
            <TextInput
              label="Search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filename or note"
            />
          </Group>
        </Group>

        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Database</Table.Th>
              <Table.Th>Filename</Table.Th>
              <Table.Th>Size</Table.Th>
              <Table.Th>Modified</Table.Th>
              <Table.Th>Note</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredFiles.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed">No backup files found</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredFiles.map((file) => (
                <Table.Tr key={`${file.kind}/${file.filename}`}>
                  <Table.Td>
                    <Badge variant="light" color={file.kind === 'mysql' ? 'blue' : 'red'}>
                      {file.kind.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Text fw={600}>{file.filename}</Text>
                      {file.isLatest ? <Badge color="green">Latest</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{formatBytes(file.size)}</Table.Td>
                  <Table.Td>{formatDate(file.modifiedAt)}</Table.Td>
                  <Table.Td>{file.note ?? '-'}</Table.Td>
                  <Table.Td>{file.source}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => setRestoringFile(file)}>
                        Restore
                      </Button>
                      <Button size="xs" variant="default" onClick={() => setEditingFile(file)}>
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        component="a"
                        href={`/api/backups/${file.kind}/${encodeURIComponent(file.filename)}/download`}
                        download
                      >
                        Download
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={file.isLatest}
                        onClick={() => setDeletingFile(file)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <BackupUploadModal
        opened={uploadOpened}
        loading={isLoading}
        onClose={() => setUploadOpened(false)}
        onUpload={handleUpload}
      />
      <BackupEditModal
        opened={editingFile !== null}
        file={editingFile}
        loading={isLoading}
        onClose={() => setEditingFile(null)}
        onSave={handleSaveEdit}
      />
      <DeleteBackupModal
        opened={deletingFile !== null}
        file={deletingFile}
        loading={isLoading}
        onClose={() => setDeletingFile(null)}
        onConfirm={handleDeleteConfirm}
      />
      <RestoreModal
        opened={restoringFile !== null}
        kind={restoringFile?.kind ?? 'mysql'}
        filename={restoringFile?.filename ?? null}
        loading={isLoading}
        onClose={() => setRestoringFile(null)}
        onConfirm={handleRestoreConfirm}
      />
    </>
  );
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
