import { Button, Group, Modal, Text, Box, ScrollArea, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { serviceService } from '@/services/serviceService';
import type { ServiceStatus } from '@/services/types';

type Props = {
  opened: boolean;
  service: string | null;
  action: 'stop' | 'restart' | 'start' | null;
  loading: boolean;
  services: ServiceStatus[];
  onClose: () => void;
  onConfirm: () => void;
  onComplete?: () => void;
};

export function ServiceActionModal({
  opened,
  service,
  action,
  loading,
  services,
  onClose,
  onConfirm,
  onComplete,
}: Props) {
  const [logs, setLogs] = useState('');
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCloseRef.current = onClose;
  }, [onComplete, onClose]);

  // Reset confirm close state when modal opens/closes
  useEffect(() => {
    if (!opened) {
      setShowConfirmClose(false);
    }
  }, [opened]);

  // Lắng nghe trạng thái dịch vụ từ props để tự động đóng khi hoàn tất
  useEffect(() => {
    if (!opened || !loading || !service || !action) {
      return;
    }

    const currentService = services.find((s) => s.name === service);
    if (!currentService) {
      return;
    }

    const isStartSuccess =
      (action === 'start' || action === 'restart') &&
      (currentService.state === 'running' || currentService.health === 'healthy');

    const isStopSuccess =
      action === 'stop' &&
      (currentService.state === 'stopped' || currentService.state === 'not created');

    if (isStartSuccess || isStopSuccess) {
      setLogs((current) => `${current}\n[Hệ thống] Tác vụ thực thi thành công!\n`);

      // Đóng modal và hiển thị Toast thông báo
      setTimeout(() => {
        notifications.show({
          title: 'Thành công',
          message: `${action === 'start' ? 'Khởi động' : action === 'stop' ? 'Dừng' : 'Khởi động lại'} dịch vụ ${service} thành công!`,
          color: 'green',
        });
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, 1500);
    }
  }, [services, opened, loading, service, action]);

  useEffect(() => {
    if (!loading || !service || !opened || !action) {
      setLogs('');
      return undefined;
    }

    const initialMsg =
      action === 'start'
        ? `[Hệ thống] Đang chạy lệnh khởi dựng container cho dịch vụ ${service}...\n`
        : `[Hệ thống] Đang dừng/khởi động lại dịch vụ ${service}...\n`;

    setLogs(initialMsg);

    if (action === 'start') {
      const source = new EventSource(serviceService.startStreamUrl(service));

      const appendLog = (event: MessageEvent<string>) => {
        let chunk = event.data;
        try {
          chunk = JSON.parse(event.data) as string;
        } catch {
          void 0;
        }
        setLogs((current) => `${current}${chunk}`);
      };

      source.addEventListener('log', appendLog);

      return () => {
        source.close();
      };
    }
  }, [loading, service, opened, action]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCloseClick = () => {
    if (loading) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const handleConfirmCloseClick = () => {
    if (onCloseRef.current) {
      onCloseRef.current();
    }
  };

  const cleanLogs = (str: string) => {
    const stripped = str.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    );
    const lines = stripped.split('\n');
    return lines
      .map((line) => {
        const parts = line.split('\r');
        return parts[parts.length - 1];
      })
      .join('\n');
  };

  const verb = action === 'start' ? 'Khởi động' : action === 'stop' ? 'Dừng' : 'Khởi động lại';

  return (
    <Modal
      opened={opened}
      onClose={handleCloseClick}
      title="Xác nhận hành động dịch vụ"
      centered
      size={loading ? 'lg' : 'md'}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      {showConfirmClose ? (
        <>
          <Text mb="md">
            Tiến trình đang chạy ngầm trong container. Đóng giao diện theo dõi lúc này có thể làm
            mất thông tin tiến trình. Bạn có chắc chắn muốn đóng modal?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowConfirmClose(false)}>
              Quay lại theo dõi
            </Button>
            <Button color="red" onClick={handleConfirmCloseClick}>
              Xác nhận đóng
            </Button>
          </Group>
        </>
      ) : !loading ? (
        <>
          <Text mb="md">
            Bạn có chắc chắn muốn thực hiện hành động <strong>{verb.toLowerCase()}</strong> dịch vụ{' '}
            <strong>{service}</strong>?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Hủy
            </Button>
            <Button color="blue" onClick={onConfirm}>
              Xác nhận
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Text mb="sm" fw={700} c="blue">
            {verb} dịch vụ {service}... Vui lòng đợi trong giây lát.
          </Text>
          <Box style={{ position: 'relative' }} mb="md">
            <ScrollArea
              viewportRef={viewportRef}
              h={250}
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
                  color: '#4af626',
                }}
              >
                {cleanLogs(logs) || 'Đang kết nối tới container terminal logs...'}
              </Box>
            </ScrollArea>
          </Box>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
              Không tắt trình duyệt khi đang thực thi lệnh...
            </Text>
            <Group gap="xs">
              <Loader size="xs" color="blue" />
              <Text size="sm" c="blue" fw={500}>
                Đang thực hiện, vui lòng chờ...
              </Text>
            </Group>
          </Group>
        </>
      )}
    </Modal>
  );
}
