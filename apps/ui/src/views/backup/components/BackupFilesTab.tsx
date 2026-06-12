import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { useBackups, backupKeys } from '@/hooks/useBackups';
import type { BackupFile, BackupKind, UploadBackupPayload } from '@/services/types';
import { BackupEditModal } from './BackupEditModal';
import { BackupUploadModal } from './BackupUploadModal';
import { DeleteBackupModal } from './DeleteBackupModal';
import { RestoreModal } from './RestoreModal';
import {
  IconDatabase,
  IconDatabaseExport,
  IconDownload,
  IconPencil,
  IconRefresh,
  IconRestore,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { formatBackupNoteSummary, formatBackupNoteTooltip } from '../utils/backupDisplay';

type Props = {
  databaseReadiness: Record<BackupKind, boolean>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type FilterKind = 'all' | BackupKind;

export function BackupFilesTab({ databaseReadiness, onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [uploadOpened, setUploadOpened] = useState(false);
  const [editingFile, setEditingFile] = useState<BackupFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<BackupFile | null>(null);
  const [restoringFile, setRestoringFile] = useState<BackupFile | null>(null);
  const [highlightedFile, setHighlightedFile] = useState<Pick<
    BackupFile,
    'kind' | 'filename'
  > | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const isMobile = useMediaQuery('(max-width: 48em)');
  const iconProps = { size: 16, stroke: 1.5 } as const;

  const {
    backups: files,
    createBackup,
    uploadBackup,
    updateBackup,
    deleteBackup,
    restoreBackup,
    isActionLoading,
  } = useBackups();

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const handleBackupNow = useCallback(
    (kind: BackupKind | 'all') => {
      createBackup(kind)
        .then(() => onSuccess('Đã bắt đầu sao lưu'))
        .catch((error) => onError(error instanceof Error ? error.message : 'Backup action failed'));
    },
    [createBackup, onSuccess, onError]
  );

  const wrapDisabled = useCallback((content: ReactNode, disabled: boolean, label: string) => {
    if (!disabled) {
      return content;
    }

    return (
      <Tooltip label={label} withArrow>
        <span>{content}</span>
      </Tooltip>
    );
  }, []);

  const isBackupAllDisabled = !databaseReadiness.mysql || !databaseReadiness.mssql;
  const getDatabaseDisabledReason = (kind: BackupKind) =>
    kind === 'mysql' ? 'Cần bật MySQL trước' : 'Cần bật MSSQL trước';

  const handleBackupAll = useCallback(() => handleBackupNow('all'), [handleBackupNow]);
  const handleBackupMysql = useCallback(() => handleBackupNow('mysql'), [handleBackupNow]);
  const handleBackupMssql = useCallback(() => handleBackupNow('mssql'), [handleBackupNow]);

  const handleUpload = useCallback(
    (payload: UploadBackupPayload) => {
      uploadBackup(payload)
        .then((uploaded) => {
          onSuccess('Đã tải file backup lên');
          setUploadOpened(false);
          if (uploaded) {
            setHighlightedFile({ kind: uploaded.kind, filename: uploaded.filename });
            if (highlightTimerRef.current) {
              clearTimeout(highlightTimerRef.current);
            }
            highlightTimerRef.current = setTimeout(() => setHighlightedFile(null), 3500);
          }
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
          onSuccess('Đã cập nhật file backup');
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
        onSuccess('Đã xóa file backup');
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
        onSuccess('Đã khôi phục dữ liệu');
        setRestoringFile(null);
      })
      .catch((error) => onError(error instanceof Error ? error.message : 'Restore failed'));
  }, [restoringFile, restoreBackup, onSuccess, onError]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: backupKeys.lists() });
  }, [queryClient]);

  const renderResponsiveLabel = useCallback(
    (label: string) => (isMobile ? null : label),
    [isMobile]
  );

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
            {wrapDisabled(
              <Button disabled={isBackupAllDisabled} leftSection={<IconDatabaseExport {...iconProps} />} onClick={handleBackupAll}>
                {renderResponsiveLabel('Sao lưu tất cả')}
              </Button>,
              isBackupAllDisabled,
              'Cần bật MySQL và MSSQL trước'
            )}
            {wrapDisabled(
              <Button
                disabled={!databaseReadiness.mysql}
                variant="light"
                leftSection={<IconDatabase {...iconProps} />}
                onClick={handleBackupMysql}
              >
                {renderResponsiveLabel('Sao lưu MySQL')}
              </Button>,
                !databaseReadiness.mysql,
              getDatabaseDisabledReason('mysql')
            )}
            {wrapDisabled(
              <Button
                disabled={!databaseReadiness.mssql}
                variant="light"
                leftSection={<IconDatabase {...iconProps} />}
                onClick={handleBackupMssql}
              >
                {renderResponsiveLabel('Sao lưu MSSQL')}
              </Button>,
              !databaseReadiness.mssql,
              getDatabaseDisabledReason('mssql')
            )}
            <Button variant="light" leftSection={<IconUpload {...iconProps} />} onClick={() => setUploadOpened(true)}>
              {renderResponsiveLabel('Tải file backup lên')}
            </Button>
            <Button variant="default" leftSection={<IconRefresh {...iconProps} />} onClick={handleRefresh}>
              {renderResponsiveLabel('Làm mới')}
            </Button>
          </Group>
          <Group align="flex-end">
            <Select
              label="Database"
              data={[
                { value: 'all', label: 'Tất cả' },
                { value: 'mysql', label: 'MySQL' },
                { value: 'mssql', label: 'MSSQL' },
              ]}
              value={filterKind}
              onChange={(value) => setFilterKind((value ?? 'all') as FilterKind)}
            />
            <TextInput
              label="Tìm kiếm"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Tên file hoặc ghi chú"
            />
          </Group>
        </Group>

        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Database</Table.Th>
              <Table.Th>Tên file</Table.Th>
              <Table.Th>Dung lượng</Table.Th>
              <Table.Th>Cập nhật</Table.Th>
              <Table.Th>Ghi chú</Table.Th>
              <Table.Th>Nguồn</Table.Th>
              <Table.Th>Thao tác</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredFiles.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed">Chưa có file backup</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredFiles.map((file) => {
                const isHighlighted =
                  highlightedFile?.kind === file.kind && highlightedFile.filename === file.filename;
                return (
                  <Table.Tr
                    key={`${file.kind}/${file.filename}`}
                    style={{
                      backgroundColor: isHighlighted ? 'var(--mantine-color-yellow-0)' : undefined,
                      transition: 'background-color 300ms ease',
                    }}
                  >
                    <Table.Td>
                      <Badge variant="light" color={file.kind === 'mysql' ? 'blue' : 'red'}>
                        {file.kind.toUpperCase()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={600}>{file.filename}</Text>
                        {file.isLatest ? <Badge color="green">Mới nhất</Badge> : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>{formatBytes(file.size)}</Table.Td>
                    <Table.Td>{formatDate(file.modifiedAt)}</Table.Td>
                    <Table.Td>
                      <Tooltip label={<Text style={{ whiteSpace: 'pre-line' }}>{formatBackupNoteTooltip(file)}</Text>} withArrow multiline>
                        <Stack gap={2}>
                          {formatBackupNoteSummary(file).map((line) => (
                            <Text key={line} size="sm" lineClamp={1}>
                              {line}
                            </Text>
                          ))}
                        </Stack>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      {file.source === 'uploaded' ? (
                        <Badge color="cyan" variant="outline">
                          Tải lên
                        </Badge>
                      ) : file.generatedBy?.trigger === 'schedule' ? (
                        <Badge color="indigo" variant="outline">
                          Từ lịch hẹn giờ
                        </Badge>
                      ) : (
                        <Badge color="teal" variant="outline">
                          Thủ công
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {wrapDisabled(
                          <Tooltip label="Khôi phục file backup này" withArrow>
                            <Button
                              aria-label={`Khôi phục file backup ${file.filename}`}
                              size="xs"
                              variant="light"
                              px="xs"
                              disabled={!databaseReadiness[file.kind]}
                              onClick={() => setRestoringFile(file)}
                            >
                              <IconRestore {...iconProps} />
                            </Button>
                          </Tooltip>,
                          !databaseReadiness[file.kind],
                          getDatabaseDisabledReason(file.kind)
                        )}
                        <Tooltip label="Sửa tên file hoặc ghi chú" withArrow>
                          <Button
                            aria-label={`Sửa ghi chú file backup ${file.filename}`}
                            size="xs"
                            variant="default"
                            px="xs"
                            onClick={() => setEditingFile(file)}
                          >
                            <IconPencil {...iconProps} />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Tải file backup xuống máy" withArrow>
                          <Button
                            aria-label={`Tải xuống file backup ${file.filename}`}
                            size="xs"
                            variant="light"
                            component="a"
                            px="xs"
                            href={`/api/backups/${file.kind}/${encodeURIComponent(file.filename)}/download`}
                            download
                          >
                            <IconDownload {...iconProps} />
                          </Button>
                        </Tooltip>
                        <Tooltip label={file.isLatest ? 'Không thể xóa backup mới nhất' : 'Xóa file backup'} withArrow>
                          <Button
                            aria-label={`Xóa file backup ${file.filename}`}
                            size="xs"
                            color="red"
                            variant="light"
                            px="xs"
                            disabled={file.isLatest}
                            onClick={() => setDeletingFile(file)}
                          >
                            <IconTrash {...iconProps} />
                          </Button>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <BackupUploadModal
        opened={uploadOpened}
        loading={isActionLoading}
        onClose={() => setUploadOpened(false)}
        onUpload={handleUpload}
      />
      <BackupEditModal
        opened={editingFile !== null}
        file={editingFile}
        loading={isActionLoading}
        onClose={() => setEditingFile(null)}
        onSave={handleSaveEdit}
      />
      <DeleteBackupModal
        opened={deletingFile !== null}
        file={deletingFile}
        loading={isActionLoading}
        onClose={() => setDeletingFile(null)}
        onConfirm={handleDeleteConfirm}
      />
      <RestoreModal
        opened={restoringFile !== null}
        kind={restoringFile?.kind ?? 'mysql'}
        filename={restoringFile?.filename ?? null}
        loading={isActionLoading}
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
