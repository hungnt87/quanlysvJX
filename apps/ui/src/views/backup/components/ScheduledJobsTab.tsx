import {
  Badge,
  Button,
  Group,
  Table,
  Text,
  Tooltip,
  Modal,
  Stack,
} from '@mantine/core';
import { useState } from 'react';
import { useBackups } from '@/hooks/useBackups';
import type { ScheduledBackupJob } from '@/services/types';
import { ScheduledJobModal } from './ScheduledJobModal';

type Props = {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  databaseReadiness: Record<'mysql' | 'mssql', boolean>;
};

export function ScheduledJobsTab({ onError, onSuccess, databaseReadiness }: Props) {
  const { scheduledJobs, runScheduledJobNow, deleteScheduledJob, isActionLoading } = useBackups();
  const [editingJob, setEditingJob] = useState<ScheduledBackupJob | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingJob(null);
    setModalOpened(true);
  };

  const handleEdit = (job: ScheduledBackupJob) => {
    setEditingJob(job);
    setModalOpened(true);
  };

  const handleDelete = (id: string) => {
    setDeletingJobId(id);
  };

  const confirmDelete = () => {
    if (!deletingJobId) {
      return;
    }
    deleteScheduledJob(deletingJobId)
      .then(() => {
        onSuccess('Đã xóa lịch sao lưu thành công');
        setDeletingJobId(null);
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Không thể xóa lịch sao lưu');
      });
  };

  const handleRunNow = (id: string) => {
    runScheduledJobNow(id)
      .then(() => {
        onSuccess('Đã thêm yêu cầu chạy sao lưu vào hàng đợi');
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Không thể chạy lịch sao lưu ngay');
      });
  };

  return (
    <>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">
          Quản lý lịch hẹn giờ sao lưu tự động cho database MySQL và MSSQL.
        </Text>
        <Button onClick={handleCreate}>Thêm lịch hẹn giờ</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Tên lịch</Table.Th>
            <Table.Th>Database</Table.Th>
            <Table.Th>Tần suất</Table.Th>
            <Table.Th>Kế tiếp</Table.Th>
            <Table.Th>Trạng thái</Table.Th>
            <Table.Th>Thao tác</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {scheduledJobs.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed">Chưa có lịch hẹn giờ nào</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            scheduledJobs.map((job) => (
              <Table.Tr key={job.id}>
                <Table.Td>
                  <Text fw={600}>{job.displayName}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={job.database === 'mysql' ? 'blue' : 'red'}>
                    {job.database.toUpperCase()}
                  </Badge>
                </Table.Td>
                <Table.Td>{job.summaryVi || job.schedule.type}</Table.Td>
                <Table.Td>
                  {job.nextRunPreviewAt ? new Date(job.nextRunPreviewAt).toLocaleString('vi-VN') : 'Không có'}
                </Table.Td>
                <Table.Td>
                  <Badge color={job.enabled ? 'green' : 'gray'}>
                    {job.enabled ? 'Đang bật' : 'Đang tắt'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="Chạy ngay lập tức" withArrow>
                      <Button
                        size="xs"
                        variant="light"
                        disabled={!databaseReadiness[job.database] || isActionLoading}
                        onClick={() => handleRunNow(job.id)}
                      >
                        Chạy ngay
                      </Button>
                    </Tooltip>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={isActionLoading}
                      onClick={() => handleEdit(job)}
                    >
                      Sửa
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      disabled={isActionLoading}
                      onClick={() => handleDelete(job.id)}
                    >
                      Xóa
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      <ScheduledJobModal
        opened={modalOpened}
        job={editingJob}
        onClose={() => setModalOpened(false)}
        onSuccess={onSuccess}
        onError={onError}
      />

      {/* Delete confirmation modal */}
      {deletingJobId && (
        <DeleteConfirmModal
          opened={deletingJobId !== null}
          onClose={() => setDeletingJobId(null)}
          onConfirm={confirmDelete}
          loading={isActionLoading}
        />
      )}
    </>
  );
}

function DeleteConfirmModal({
  opened,
  onClose,
  onConfirm,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Xác nhận xóa" centered>
      <Stack gap="md">
        <Text size="sm">
          Bạn có chắc chắn muốn xóa lịch hẹn giờ này? Hành động này không thể hoàn tác.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            Xóa
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
