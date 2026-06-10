import { Badge, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { BackupFile, BackupKind } from '../../api/types';
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
  const filesQuery = useQuery({ queryKey: ['backups'], queryFn: api.backups });
  const files = filesQuery.data ?? [];

  async function invalidateBackupData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['backups'] }),
      queryClient.invalidateQueries({ queryKey: ['backupJobs'] })
    ]);
  }

  const backupMutation = useMutation({ mutationFn: () => api.backup('all'), onSuccess: invalidateBackupData });
  const uploadMutation = useMutation({ mutationFn: ({ kind, file }: { kind: BackupKind; file: File }) => api.uploadBackup(kind, file), onSuccess: invalidateBackupData });
  const updateMutation = useMutation({
    mutationFn: ({ file, filename, note }: { file: BackupFile; filename: string; note: string | null }) => api.updateBackup(file.kind, file.filename, { filename, note }),
    onSuccess: invalidateBackupData
  });
  const deleteMutation = useMutation({ mutationFn: (file: BackupFile) => api.deleteBackup(file.kind, file.filename), onSuccess: invalidateBackupData });
  const restoreMutation = useMutation({ mutationFn: (file: BackupFile) => api.restore(file.kind, file.filename), onSuccess: invalidateBackupData });
  const loading = backupMutation.isPending || uploadMutation.isPending || updateMutation.isPending || deleteMutation.isPending || restoreMutation.isPending;

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      onSuccess(successMessage);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Backup action failed');
    }
  }

  useEffect(() => {
    if (filesQuery.isError) {
      onError(filesQuery.error instanceof Error ? filesQuery.error.message : 'Unable to load backups');
    }
  }, [filesQuery.error, filesQuery.isError, onError]);

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files
      .filter((file) => filterKind === 'all' || file.kind === filterKind)
      .filter((file) => !normalizedQuery || file.filename.toLowerCase().includes(normalizedQuery) || (file.note ?? '').toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }, [files, filterKind, query]);

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Group align="flex-end">
            <Button loading={backupMutation.isPending} onClick={() => runAction(() => backupMutation.mutateAsync(), 'Backup completed')}>Backup now</Button>
            <Button variant="light" onClick={() => setUploadOpened(true)}>Upload</Button>
            <Button variant="default" loading={filesQuery.isFetching} onClick={() => queryClient.invalidateQueries({ queryKey: ['backups'] })}>Refresh</Button>
          </Group>
          <Group align="flex-end">
            <Select
              label="Database"
              data={[{ value: 'all', label: 'All' }, { value: 'mysql', label: 'MySQL' }, { value: 'mssql', label: 'MSSQL' }]}
              value={filterKind}
              onChange={(value) => setFilterKind((value ?? 'all') as FilterKind)}
            />
            <TextInput label="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filename or note" />
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
                <Table.Td colSpan={7}><Text c="dimmed">No backup files found</Text></Table.Td>
              </Table.Tr>
            ) : (
              filteredFiles.map((file) => (
                <Table.Tr key={`${file.kind}/${file.filename}`}>
                  <Table.Td><Badge variant="light">{file.kind.toUpperCase()}</Badge></Table.Td>
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
                      <Button size="xs" variant="light" onClick={() => setRestoringFile(file)}>Restore</Button>
                      <Button size="xs" variant="default" onClick={() => setEditingFile(file)}>Edit</Button>
                      <Button size="xs" color="red" variant="light" disabled={file.isLatest} onClick={() => setDeletingFile(file)}>Delete</Button>
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
        loading={loading}
        onClose={() => setUploadOpened(false)}
        onUpload={(kind, file) =>
          runAction(async () => {
            await uploadMutation.mutateAsync({ kind, file });
            setUploadOpened(false);
          }, 'Backup uploaded')
        }
      />
      <BackupEditModal
        opened={editingFile !== null}
        file={editingFile}
        loading={loading}
        onClose={() => setEditingFile(null)}
        onSave={(filename, note) =>
          editingFile &&
          runAction(async () => {
            await updateMutation.mutateAsync({ file: editingFile, filename, note });
            setEditingFile(null);
          }, 'Backup updated')
        }
      />
      <DeleteBackupModal
        opened={deletingFile !== null}
        file={deletingFile}
        loading={loading}
        onClose={() => setDeletingFile(null)}
        onConfirm={() =>
          deletingFile &&
          runAction(async () => {
            await deleteMutation.mutateAsync(deletingFile);
            setDeletingFile(null);
          }, 'Backup deleted')
        }
      />
      <RestoreModal
        opened={restoringFile !== null}
        kind={restoringFile?.kind ?? 'mysql'}
        filename={restoringFile?.filename ?? null}
        loading={loading}
        onClose={() => setRestoringFile(null)}
        onConfirm={() =>
          restoringFile &&
          runAction(async () => {
            await restoreMutation.mutateAsync(restoringFile);
            setRestoringFile(null);
          }, 'Restore completed')
        }
      />
    </>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
