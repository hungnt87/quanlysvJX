import { Badge, Button, Group, Table, Text, Tooltip } from '@mantine/core';
import React from 'react';
import type { ServiceStatus } from '@/services/types';

type Props = {
  services: ServiceStatus[];
  selected: string | null;
  onSelect: (service: string) => void;
  onAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
};

const SERVICE_COLORS: Record<string, string> = {
  goddess: '#e040fb', // Tím
  bishop: '#448aff', // Xanh dương
  s3relay: '#ff5252', // Đỏ cam
  jxserver: '#ffd700', // Vàng
  paysys: '#18ffff', // Xanh ngọc
  s3relayserver: '#ff4081', // Hồng
  jxmysql: '#69f0ae', // Xanh lá sáng
  jxmssql: '#ffab40', // Vàng cam
};

const ServiceRow = React.memo(
  ({
    service,
    selected,
    onSelect,
    onAction,
    isS3RelayRunning,
    areOtherServicesRunning,
  }: {
    service: ServiceStatus;
    selected: string | null;
    onSelect: (service: string) => void;
    onAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
    isS3RelayRunning: boolean;
    areOtherServicesRunning: boolean;
  }) => {
    const running = service.state === 'running';
    const stopped = service.state === 'stopped' || service.state === 'not created';

    const matchedService = Object.keys(SERVICE_COLORS).find((s) =>
      service.name.toLowerCase().includes(s)
    );
    const serviceColor = matchedService ? SERVICE_COLORS[matchedService] : '#4af626';

    let stopDisabled = !running;
    let stopTooltip = 'Dừng dịch vụ';
    let restartDisabled = stopped;
    let restartTooltip = 'Khởi động lại dịch vụ';

    if (service.name === 'jxserver') {
      if (isS3RelayRunning) {
        stopDisabled = !running;
        stopTooltip = 'Dừng jxserver (sẽ tự động dừng s3relay trước)';
        restartDisabled = stopped;
        restartTooltip = 'Khởi động lại jxserver (sẽ tự động dừng s3relay trước)';
      }
    } else if (service.name === 'jxmysql' || service.name === 'jxmssql') {
      if (areOtherServicesRunning) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt các dịch vụ JX khác trước khi dừng Database';
        restartDisabled = true;
        restartTooltip = 'Cần tắt các dịch vụ JX khác trước khi khởi động lại Database';
      }
    }

    return (
      <Table.Tr
        bg={selected === service.name ? 'var(--mantine-color-blue-light)' : undefined}
        onClick={() => onSelect(service.name)}
        style={{ cursor: 'pointer' }}
      >
        <Table.Td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Tooltip
            label={
              <div>
                <div>Container: {service.containerName}</div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                  Click để xem log
                </div>
              </div>
            }
            position="top-start"
            withArrow
          >
            <Text fw={700} style={{ color: serviceColor, display: 'inline-block' }} mb={4}>
              {service.name}
            </Text>
          </Tooltip>
          <Group gap={4}>
            <Badge size="xs" color={stateColor(service.state)}>
              {service.state}
            </Badge>
            <Badge size="xs" color={service.health === 'healthy' ? 'green' : 'yellow'}>
              {service.health}
            </Badge>
          </Group>
        </Table.Td>
        <Table.Td onClick={(e) => e.stopPropagation()}>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Chạy dịch vụ" withArrow>
              <span>
                <Button
                  size="xs"
                  px={6}
                  color="green"
                  disabled={running}
                  onClick={() => onAction(service.name, 'start')}
                >
                  Start
                </Button>
              </span>
            </Tooltip>
            <Tooltip label={stopTooltip} withArrow>
              <span>
                <Button
                  size="xs"
                  px={6}
                  color="red"
                  variant="light"
                  disabled={stopDisabled}
                  onClick={() => onAction(service.name, 'stop')}
                >
                  Stop
                </Button>
              </span>
            </Tooltip>
            <Tooltip label={restartTooltip} withArrow>
              <span>
                <Button
                  size="xs"
                  px={6}
                  variant="light"
                  disabled={restartDisabled}
                  onClick={() => onAction(service.name, 'restart')}
                >
                  Restart
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  }
);

ServiceRow.displayName = 'ServiceRow';

export function ServiceTable({ services, selected, onSelect, onAction }: Props) {
  const isS3RelayRunning = React.useMemo(
    () =>
      services.some(
        (s) => s.name === 's3relay' && (s.state === 'running' || s.state === 'starting')
      ),
    [services]
  );

  const areOtherServicesRunning = React.useMemo(
    () =>
      services.some(
        (s) =>
          s.name !== 'jxmysql' &&
          s.name !== 'jxmssql' &&
          (s.state === 'running' || s.state === 'starting')
      ),
    [services]
  );

  return (
    <Table.ScrollContainer minWidth={320}>
      <Table
        striped
        highlightOnHover
        withTableBorder
        style={{ tableLayout: 'fixed', width: '100%' }}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: '45%' }}>Service (Status / Health)</Table.Th>
            <Table.Th style={{ width: '55%' }}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {services.map((service) => (
            <ServiceRow
              key={service.name}
              service={service}
              selected={selected}
              onSelect={onSelect}
              onAction={onAction}
              isS3RelayRunning={isS3RelayRunning}
              areOtherServicesRunning={areOtherServicesRunning}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function stateColor(state: string) {
  if (state === 'running') {
    return 'green';
  }
  if (state === 'starting') {
    return 'yellow';
  }
  if (state === 'stopped' || state === 'not created') {
    return 'gray';
  }
  return 'orange';
}
