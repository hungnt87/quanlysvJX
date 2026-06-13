import { Modal, Button, Group, Stack, Text, ScrollArea, Box, Badge, Paper } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import { serviceService } from '@/services/serviceService';
import type { ServiceStatus } from '@/services/types';
import { showErrorNotification } from '@/utils/notification';

type Props = {
  opened: boolean;
  onClose: () => void;
  servicesToPrepare: string[];
  servicesInfo: ServiceStatus[];
  onSuccess: () => void;
};

type ServiceState = 'waiting' | 'running' | 'success' | 'error';

export function PrepareImagesModal({
  opened,
  onClose,
  servicesToPrepare,
  servicesInfo,
  onSuccess,
}: Props) {
  const [logs, setLogs] = useState<string>('');
  const [activeService, setActiveService] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ServiceState>>({});
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const getImageName = (serviceName: string) => {
    const s = servicesInfo.find((item) => item.name === serviceName);
    return s ? s.imageName : serviceName;
  };

  // Initialize service statuses when modal is opened
  useEffect(() => {
    if (opened && servicesToPrepare.length > 0) {
      const initialStatuses: Record<string, ServiceState> = {};
      servicesToPrepare.forEach((name) => {
        initialStatuses[name] = 'waiting';
      });
      setStatuses(initialStatuses);
      setLogs('');
      setActiveService(null);
      setIsFinished(false);
      setHasError(false);

      // Start SSE connection
      const url = serviceService.prepareStreamUrl(servicesToPrepare.join(','));
      const source = new EventSource(url);
      eventSourceRef.current = source;

      source.addEventListener('start', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const imgName = getImageName(data.service);
          setActiveService(imgName);
          setStatuses((prev) => ({ ...prev, [data.service]: 'running' }));
          setLogs((prev) => `${prev}\n>>> [${imgName}] ${data.message}\n`);
        } catch (e) {
          // ignore
        }
      });

      source.addEventListener('log', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          setLogs((prev) => prev + data.message);
        } catch (e) {
          // ignore
        }
      });

      source.addEventListener('success', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const imgName = getImageName(data.service);
          setStatuses((prev) => ({ ...prev, [data.service]: 'success' }));
          setLogs((prev) => `${prev}\n>>> [${imgName}] ${data.message}\n`);
        } catch (e) {
          // ignore
        }
      });

      source.addEventListener('error', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const imgName = getImageName(data.service);
          const message =
            typeof data.detail === 'string' && data.detail.trim().length > 0
              ? data.detail
              : data.message;
          showErrorNotification(message, 'Lỗi');
          setStatuses((prev) => ({ ...prev, [data.service]: 'error' }));
          setLogs((prev) => `${prev}\n>>> LỖI [${imgName}]: ${data.message}\n${data.detail}\n`);
          setHasError(true);
        } catch (e) {
          // ignore
        }
      });

      source.addEventListener('close', (_event: any) => {
        setIsFinished(true);
        onSuccess(); // Refresh status
        source.close();
      });

      source.onerror = () => {
        const message = 'Không kết nối được tới máy chủ. Kiểm tra API/Web Manager rồi thử lại.';
        showErrorNotification(message, 'Lỗi');
        setLogs((prev) => `${prev}\n>>> ${message}\n`);
        setHasError(true);
        setIsFinished(true);
        source.close();
      };

      return () => {
        source.close();
      };
    }
  }, [opened, servicesToPrepare, onSuccess]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs]);

  const handleClose = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    onClose();
  };

  const getServiceLabel = (name: string) => {
    const s = servicesInfo.find((item) => item.name === name);
    if (!s) {
      return name;
    }
    return `${s.imageName} [${s.hasBuild ? 'Build' : 'Tải'}]`;
  };

  const getStatusBadge = (state: ServiceState) => {
    switch (state) {
      case 'waiting':
        return <Badge color="gray">Đang chờ</Badge>;
      case 'running':
        return (
          <Badge color="yellow" variant="filled">
            Đang chạy
          </Badge>
        );
      case 'success':
        return <Badge color="green">Thành công</Badge>;
      case 'error':
        return (
          <Badge color="red" variant="filled">
            Lỗi
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={<ModalTitle title="Chuẩn bị Docker Images" subtitle="Tải hoặc build lại image" />}
      size="xl"
      closeOnClickOutside={isFinished}
      closeOnEscape={isFinished}
      withCloseButton={isFinished}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Hệ thống đang tiến hành chuẩn bị các Docker Images bị thiếu hoặc cần build lại. Việc này
          sẽ chạy tuần tự để đảm bảo hiệu suất của máy chủ.
        </Text>

        <Paper withBorder p="xs" bg="var(--mantine-color-gray-light)">
          <Text size="xs" fw={700} mb={6}>
            Danh sách Docker Image:
          </Text>
          <Group gap="xs">
            {servicesToPrepare.map((name) => (
              <Paper
                key={name}
                withBorder
                p={6}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor:
                    activeService === getImageName(name)
                      ? 'var(--mantine-color-blue-light)'
                      : '#fff',
                }}
              >
                <Text size="xs" fw={activeService === getImageName(name) ? 700 : 500}>
                  {getServiceLabel(name)}
                </Text>
                {getStatusBadge(statuses[name] || 'waiting')}
              </Paper>
            ))}
          </Group>
        </Paper>

        <Text size="xs" fw={700}>
          Log tiến trình:
        </Text>
        <ScrollArea
          viewportRef={viewportRef}
          h={300}
          type="auto"
          offsetScrollbars
          style={{
            backgroundColor: '#0a0a0a',
            borderRadius: '4px',
            border: '1px solid #333',
          }}
        >
          <Box
            p="sm"
            style={{
              fontFamily: 'JetBrains Mono, Courier New, Courier, monospace',
              fontSize: '12px',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#4af626',
            }}
          >
            {logs || 'Đang kết nối để nhận log...'}
          </Box>
        </ScrollArea>

        <Group justify="flex-end" mt="md">
          {!isFinished && !hasError ? (
            <Button color="red" variant="light" onClick={handleClose}>
              Hủy bỏ (Abort)
            </Button>
          ) : (
            <Button onClick={handleClose} color={hasError ? 'red' : 'blue'}>
              {hasError ? 'Đóng (Có lỗi xảy ra)' : 'Hoàn tất'}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
