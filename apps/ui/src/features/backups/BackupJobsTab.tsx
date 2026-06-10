import { Badge, Button, Group, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../api/client';

type Props = {
  onError: (message: string) => void;
};

export function BackupJobsTab({ onError }: Props) {
  const jobsQuery = useQuery({
    queryKey: ['backupJobs'],
    queryFn: api.jobs,
    refetchInterval: (query) => (query.state.data?.some((job) => job.status === 'running') ? 5000 : false)
  });
  const jobs = jobsQuery.data ?? [];

  useEffect(() => {
    if (jobsQuery.isError) {
      onError(jobsQuery.error instanceof Error ? jobsQuery.error.message : 'Unable to load jobs');
    }
  }, [jobsQuery.error, jobsQuery.isError, onError]);

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button variant="default" loading={jobsQuery.isFetching} onClick={() => jobsQuery.refetch()}>Refresh</Button>
      </Group>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Kind</Table.Th>
            <Table.Th>Database</Table.Th>
            <Table.Th>Trigger</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Started</Table.Th>
            <Table.Th>Finished</Table.Th>
            <Table.Th>Error</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {jobs.length === 0 ? (
            <Table.Tr><Table.Td colSpan={7}><Text c="dimmed">No backup jobs yet</Text></Table.Td></Table.Tr>
          ) : (
            jobs.map((job) => (
              <Table.Tr key={job.id}>
                <Table.Td>{job.kind}</Table.Td>
                <Table.Td>{job.database ?? '-'}</Table.Td>
                <Table.Td>{job.trigger}</Table.Td>
                <Table.Td><Badge color={job.status === 'failed' ? 'red' : job.status === 'running' ? 'blue' : 'green'}>{job.status}</Badge></Table.Td>
                <Table.Td>{formatDate(job.startedAt)}</Table.Td>
                <Table.Td>{job.finishedAt ? formatDate(job.finishedAt) : '-'}</Table.Td>
                <Table.Td>{job.error ?? '-'}</Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
