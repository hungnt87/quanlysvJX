import { Badge, Button, Group, Table, Text, Tooltip, Stack } from '@mantine/core';
import React from 'react';
import type { ServiceStatus } from '@/services/types';

type Props = {
  services: ServiceStatus[];
  selected: string | null;
  onSelect: (service: string) => void;
  onAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
  onBatchAction?: (action: 'start' | 'stop') => void;
  missingImagesCount?: number;
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
    _isS3RelayRunning,
    areOtherServicesRunning,
    services,
  }: {
    service: ServiceStatus;
    selected: string | null;
    onSelect: (service: string) => void;
    onAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
    _isS3RelayRunning: boolean;
    areOtherServicesRunning: boolean;
    services: ServiceStatus[];
  }) => {
    const running = service.state === 'running';
    const stopped = service.state === 'stopped' || service.state === 'not created';

    const matchedService = Object.keys(SERVICE_COLORS).find((s) =>
      service.name.toLowerCase().includes(s)
    );
    const serviceColor = matchedService ? SERVICE_COLORS[matchedService] : '#4af626';

    // Lấy trạng thái của các dịch vụ khác để kiểm tra tính phụ thuộc
    // Thứ tự chuẩn: Database (jxmysql & jxmssql) -> paysys -> s3relayserver -> goddess -> bishop -> s3relay -> jxserver
    const isServiceHealthy = (name: string) => {
      const s = services.find((item: ServiceStatus) => item.name === name);
      return s ? s.state === 'running' && s.health === 'healthy' : false;
    };

    const isServiceStopped = (name: string) => {
      const s = services.find((item: ServiceStatus) => item.name === name);
      return s ? s.state === 'stopped' || s.state === 'not created' : true;
    };

    const isDatabaseHealthy = isServiceHealthy('jxmysql') && isServiceHealthy('jxmssql');

    let startDisabled = running || !service.imageExists || service.needsRebuild;
    let startTooltip = 'Khởi chạy dịch vụ';
    let stopDisabled = !running;
    let stopTooltip = 'Dừng dịch vụ';
    let restartDisabled = stopped;
    let restartTooltip = 'Khởi động lại dịch vụ';

    // Ràng buộc nếu chưa có Image
    if (!service.imageExists) {
      startTooltip = service.hasBuild
        ? 'Dịch vụ chưa có Docker Image. Vui lòng build image trước.'
        : 'Dịch vụ chưa có Docker Image. Vui lòng tải image về trước.';
    } else if (service.needsRebuild) {
      startTooltip =
        service.buildReason ?? 'Docker Image cần build lại trước khi khởi chạy dịch vụ.';
    }

    // Ràng buộc thứ tự START
    if (service.name === 'paysys') {
      if (!isDatabaseHealthy) {
        startDisabled = true;
        startTooltip = 'Yêu cầu cả hai Database (jxmysql & jxmssql) phải chạy và healthy trước.';
      }
    } else if (service.name === 's3relayserver') {
      if (!isServiceHealthy('paysys')) {
        startDisabled = true;
        startTooltip = 'Yêu cầu dịch vụ paysys phải chạy và healthy trước.';
      }
    } else if (service.name === 'goddess') {
      if (!isServiceHealthy('s3relayserver')) {
        startDisabled = true;
        startTooltip = 'Yêu cầu dịch vụ s3relayserver phải chạy và healthy trước.';
      }
    } else if (service.name === 'bishop') {
      if (!isServiceHealthy('goddess')) {
        startDisabled = true;
        startTooltip = 'Yêu cầu dịch vụ goddess phải chạy và healthy trước.';
      }
    } else if (service.name === 's3relay') {
      if (!isServiceHealthy('bishop')) {
        startDisabled = true;
        startTooltip = 'Yêu cầu dịch vụ bishop phải chạy và healthy trước.';
      }
    } else if (service.name === 'jxserver') {
      if (!isServiceHealthy('s3relay')) {
        startDisabled = true;
        startTooltip = 'Yêu cầu dịch vụ s3relay phải chạy và healthy trước.';
      }
    }

    // Ràng buộc thứ tự STOP (Tắt ngược từ cuối lên đầu)
    if (service.name === 's3relay') {
      if (!isServiceStopped('jxserver')) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt dịch vụ jxserver trước.';
      }
    } else if (service.name === 'bishop') {
      if (!isServiceStopped('s3relay')) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt dịch vụ s3relay trước.';
      }
    } else if (service.name === 'goddess') {
      if (!isServiceStopped('bishop')) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt dịch vụ bishop trước.';
      }
    } else if (service.name === 's3relayserver') {
      if (!isServiceStopped('goddess')) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt dịch vụ goddess trước.';
      }
    } else if (service.name === 'paysys') {
      if (!isServiceStopped('s3relayserver')) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt dịch vụ s3relayserver trước.';
      }
    } else if (service.name === 'jxmysql' || service.name === 'jxmssql') {
      if (areOtherServicesRunning) {
        stopDisabled = true;
        stopTooltip = 'Cần tắt toàn bộ các dịch vụ JX khác trước khi dừng Database.';
        restartDisabled = true;
        restartTooltip = 'Cần tắt toàn bộ các dịch vụ JX khác trước khi khởi động lại Database.';
      }
    }

    // Restart chỉ khả dụng khi đang chạy (state === 'running')
    if (stopped) {
      restartDisabled = true;
      restartTooltip = 'Dịch vụ cần phải ở trạng thái đang chạy để khởi động lại.';
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
            <Badge
              size="xs"
              color={!service.imageExists ? 'red' : service.needsRebuild ? 'yellow' : 'teal'}
              variant={!service.imageExists ? 'filled' : 'light'}
            >
              {!service.imageExists
                ? `Image: Thiếu (${service.hasBuild ? 'Build' : 'Tải'})`
                : service.needsRebuild
                  ? 'Image: Cần rebuild'
                  : 'Image: Sẵn sàng'}
            </Badge>
          </Group>
        </Table.Td>
        <Table.Td onClick={(e) => e.stopPropagation()}>
          <Group gap={4} wrap="nowrap">
            <Tooltip label={startTooltip} withArrow>
              <span>
                <Button
                  size="xs"
                  px={6}
                  color="green"
                  disabled={startDisabled}
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

export function ServiceTable({
  services,
  selected,
  onSelect,
  onAction,
  onBatchAction,
  missingImagesCount = 0,
}: Props) {
  const hasNoServices = services.length === 0;
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
    <Stack gap="xs">
      {onBatchAction && (
        <Group grow gap="xs">
          <Button
            size="xs"
            color="green"
            onClick={() => onBatchAction('start')}
            disabled={
              hasNoServices ||
              missingImagesCount > 0 ||
              (services.length > 0 && services.every((s) => s.state === 'running'))
            }
          >
            Start All
          </Button>
          <Button
            size="xs"
            color="red"
            onClick={() => onBatchAction('stop')}
            disabled={hasNoServices}
          >
            Stop All
          </Button>
        </Group>
      )}
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
                _isS3RelayRunning={isS3RelayRunning}
                areOtherServicesRunning={areOtherServicesRunning}
                services={services}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
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
