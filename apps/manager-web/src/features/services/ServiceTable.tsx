import { Badge, Button, Group, Table, Text } from '@mantine/core';
import type { ServiceStatus } from '../../api/types';

type Props = {
  services: ServiceStatus[];
  selected: string | null;
  onSelect: (service: string) => void;
  onAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
};

export function ServiceTable({ services, selected, onSelect, onAction }: Props) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Service</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Health</Table.Th>
            <Table.Th>Image</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {services.map((service) => (
            <Table.Tr key={service.name} bg={selected === service.name ? 'var(--mantine-color-blue-light)' : undefined}>
              <Table.Td>
                <button className="linkButton" onClick={() => onSelect(service.name)}>{service.name}</button>
                <Text size="xs" c="dimmed">{service.containerName}</Text>
              </Table.Td>
              <Table.Td><Badge color={service.state === 'running' ? 'green' : 'gray'}>{service.state}</Badge></Table.Td>
              <Table.Td><Badge color={service.health === 'healthy' ? 'green' : 'yellow'}>{service.health}</Badge></Table.Td>
              <Table.Td><Text size="sm" lineClamp={1}>{service.image || '-'}</Text></Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <Button size="xs" variant="light" onClick={() => onSelect(service.name)}>Log</Button>
                  <Button size="xs" color="green" onClick={() => onAction(service.name, 'start')}>Start</Button>
                  <Button size="xs" color="red" variant="light" onClick={() => onAction(service.name, 'stop')}>Stop</Button>
                  <Button size="xs" variant="light" onClick={() => onAction(service.name, 'restart')}>Restart</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
