import { Badge, Button, Group, Table, Text, Select } from '@mantine/core';
import { useState, useMemo } from 'react';
import { useBackups } from '@/hooks/useBackups';

type Props = {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function ScheduledRunsTab({ onError, onSuccess }: Props) {
  const { scheduledRuns, retryScheduledRun, isActionLoading } = useBackups();
  const [filterDb, setFilterDb] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const handleRetry = (runId: string) => {
    retryScheduledRun(runId)
      .then(() => {
        onSuccess('Đã yêu cầu chạy lại bản sao lưu');
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Không thể chạy lại bản sao lưu');
      });
  };

  const filteredRuns = useMemo(() => {
    return scheduledRuns
      .filter((run) => filterDb === 'all' || run.database === filterDb)
      .filter((run) => filterStatus === 'all' || run.status === filterStatus);
  }, [scheduledRuns, filterDb, filterStatus]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'yellow';
      case 'running':
        return 'blue';
      case 'succeeded':
        return 'green';
      case 'failed':
        return 'red';
      case 'skipped':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued':
        return 'Đang chờ';
      case 'running':
        return 'Đang chạy';
      case 'succeeded':
        return 'Thành công';
      case 'failed':
        return 'Thất bại';
      case 'skipped':
        return 'Bị bỏ qua';
      default:
        return status;
    }
  };

  return (
    <>
      <Group justify="space-between" mb="sm">
        <Group>
          <Select
            label="Database"
            data={[
              { value: 'all', label: 'Tất cả' },
              { value: 'mysql', label: 'MySQL' },
              { value: 'mssql', label: 'MSSQL' },
            ]}
            value={filterDb}
            onChange={(val) => setFilterDb(val ?? 'all')}
          />
          <Select
            label="Trạng thái"
            data={[
              { value: 'all', label: 'Tất cả' },
              { value: 'queued', label: 'Đang chờ' },
              { value: 'running', label: 'Đang chạy' },
              { value: 'succeeded', label: 'Thành công' },
              { value: 'failed', label: 'Thất bại' },
              { value: 'skipped', label: 'Bị bỏ qua' },
            ]}
            value={filterStatus}
            onChange={(val) => setFilterStatus(val ?? 'all')}
          />
        </Group>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID/Lịch hẹn giờ</Table.Th>
            <Table.Th>Database</Table.Th>
            <Table.Th>Nguồn</Table.Th>
            <Table.Th>Thời gian lập lịch</Table.Th>
            <Table.Th>Trạng thái</Table.Th>
            <Table.Th>File backup</Table.Th>
            <Table.Th>Thao tác</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredRuns.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed">Không có lịch sử chạy sao lưu nào</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            filteredRuns.map((run) => (
              <Table.Tr key={run.runId}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {run.jobDisplayName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {run.runId}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={run.database === 'mysql' ? 'blue' : 'red'}>
                    {run.database.toUpperCase()}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge variant="outline" color={run.trigger === 'schedule' ? 'blue' : 'teal'}>
                    {run.trigger === 'schedule' ? 'Theo lịch' : 'Thủ công'}
                  </Badge>
                </Table.Td>
                <Table.Td>{new Date(run.scheduledFor).toLocaleString('vi-VN')}</Table.Td>
                <Table.Td>
                  <Badge color={getStatusBadgeColor(run.status)} variant="filled">
                    {getStatusText(run.status)}
                  </Badge>
                  {run.error && (
                    <Text size="xs" color="red" mt={4} style={{ maxWidth: 200 }} lineClamp={2}>
                      {run.error}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {run.backupFilename ? (
                    <Text size="sm" fw={500} style={{ wordBreak: 'break-all' }}>
                      {run.backupFilename}
                    </Text>
                  ) : run.status === 'succeeded' ? (
                    <Text size="xs" c="dimmed" fs="italic">
                      File đã bị dọn dẹp
                    </Text>
                  ) : (
                    '-'
                  )}
                </Table.Td>
                <Table.Td>
                  {run.status === 'failed' && (
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      loading={isActionLoading}
                      onClick={() => handleRetry(run.runId)}
                    >
                      Chạy lại
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}
