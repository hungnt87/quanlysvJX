import { Button, Group, Modal, Text, Box, ScrollArea, Loader } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import { serviceService } from '@/services/serviceService';
import type { ServiceStatus } from '@/services/types';
import { showSuccessNotification, showErrorNotification } from '@/utils/notification';

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

type StartPhaseEvent = { type: 'phase'; phase: string; message: string };
type StartLogEvent = { type: 'log'; stream: 'stdout' | 'stderr'; message: string };
type StartErrorEvent = {
  type: 'error';
  code: string;
  message: string;
  detail: string;
  exitCode?: number;
};
type StartReadyEvent = {
  type: 'ready';
  service: string;
  state: string;
  health: string;
  message: string;
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
  const activeEventSourceRef = useRef<EventSource | null>(null);
  const activeStreamTargetRef = useRef<{ service: string; action: string } | null>(null);

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

    if (action === 'start') {
      return;
    }

    const currentService = services.find((s) => s.name === service);
    if (!currentService) {
      return;
    }

    // Xác định xem dịch vụ có hỗ trợ healthcheck hay không
    // Docker Compose trả về:
    // - health: 'healthy' | 'unhealthy' | 'starting'
    // - Hoặc rỗng/không có trường health (đối với container không cấu hình healthcheck)
    const hasHealthCheck =
      currentService.health && currentService.health !== '' && currentService.health !== 'none';

    let isRestartSuccess = false;
    if (action === 'restart') {
      if (hasHealthCheck) {
        // Nếu dịch vụ cấu hình healthcheck: chỉ coi là hoàn tất khi trạng thái là running VÀ health đạt 'healthy'
        isRestartSuccess =
          currentService.state === 'running' && currentService.health === 'healthy';
      } else {
        // Nếu không có healthcheck: chỉ cần trạng thái là running
        isRestartSuccess = currentService.state === 'running';
      }
    }

    const isStopSuccess =
      action === 'stop' &&
      (currentService.state === 'stopped' || currentService.state === 'not created');

    if (isRestartSuccess || isStopSuccess) {
      setLogs((current) => `${current}\n[Hệ thống] Tác vụ thực thi thành công!\n`);

      // Đóng EventSource sớm
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
        activeEventSourceRef.current = null;
        activeStreamTargetRef.current = null;
      }

      // Đóng modal và hiển thị Toast thông báo
      setTimeout(() => {
        showSuccessNotification(
          `${action === 'stop' ? 'Dừng' : 'Khởi động lại'} dịch vụ ${service} thành công!`,
          'Thành công'
        );
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, 1500);
    }
  }, [services, opened, loading, service, action]);

  useEffect(() => {
    if (!loading || !service || !opened || !action) {
      setLogs('');
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
        activeEventSourceRef.current = null;
      }
      activeStreamTargetRef.current = null;
      return undefined;
    }

    // Nếu đã kết nối cho service và action này thì không chạy lại
    if (
      activeStreamTargetRef.current?.service === service &&
      activeStreamTargetRef.current?.action === action &&
      activeEventSourceRef.current
    ) {
      return undefined;
    }

    // Đóng kết nối cũ nếu có trước khi mở mới
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
    }

    const initialMsg =
      action === 'start'
        ? `[Hệ thống] Đang chạy lệnh khởi dựng container cho dịch vụ ${service}...\n`
        : `[Hệ thống] Đang dừng/khởi động lại dịch vụ ${service}...\n`;

    setLogs(initialMsg);
    activeStreamTargetRef.current = { service, action };

    let connectionTimeout: NodeJS.Timeout | null = null;
    let source: EventSource | null = null;
    let streamEnded = false;

    if (action === 'start') {
      // Trì hoãn 250ms để tránh việc React StrictMode mount/unmount/mount liên tục khởi tạo trùng lặp
      connectionTimeout = setTimeout(() => {
        if (!loading || !service || !opened || !action) {
          return;
        }

        source = new EventSource(serviceService.startStreamUrl(service));
        activeEventSourceRef.current = source;

        let readyReceived = false;
        let errorReceived = false;

        const appendTerminalLine = (line: string) => {
          setLogs((current) => `${current}${line.endsWith('\n') ? line : `${line}\n`}`);
        };

        const parseEventData = <T,>(event: MessageEvent<string>): T | null => {
          try {
            return JSON.parse(event.data) as T;
          } catch {
            return null;
          }
        };

        const handlePhase = (event: MessageEvent<string>) => {
          const data = parseEventData<StartPhaseEvent>(event);
          if (data) {
            appendTerminalLine(`[${data.phase}] ${data.message}`);
          }
        };

        const handleLog = (event: MessageEvent<string>) => {
          const data = parseEventData<StartLogEvent>(event);
          appendTerminalLine(data ? data.message : event.data);
        };

        const handleStartError = (event: MessageEvent<string>) => {
          const data = parseEventData<StartErrorEvent>(event);
          errorReceived = true;
          const message = data
            ? `[${data.code}] ${data.message}${data.exitCode !== undefined ? ` (exitCode: ${data.exitCode})` : ''}\n${data.detail}`
            : event.data;
          appendTerminalLine(message);
          showErrorNotification(
            data?.message ?? 'Tiến trình start thất bại.',
            data ? `Lỗi ${data.code}` : 'Lỗi tiến trình'
          );
        };

        const handleReady = (event: MessageEvent<string>) => {
          const data = parseEventData<StartReadyEvent>(event);
          readyReceived = true;
          appendTerminalLine(data?.message ?? `Dịch vụ ${service} đã sẵn sàng.`);
          showSuccessNotification(`Khởi động dịch vụ ${service} thành công!`, 'Thành công');
          setTimeout(() => {
            if (onCompleteRef.current) {
              onCompleteRef.current();
            }
          }, 1500);
        };

        const handleCloseEvent = (event: Event) => {
          streamEnded = true;
          const messageEvent = event as MessageEvent;
          let data: { exitCode?: number } = {};
          try {
            data = JSON.parse(messageEvent.data);
          } catch {
            void 0;
          }

          if (source) {
            source.close();
          }
          if (activeEventSourceRef.current === source) {
            activeEventSourceRef.current = null;
            activeStreamTargetRef.current = null;
          }

          if (!readyReceived && !errorReceived) {
            appendTerminalLine(
              `[Hệ thống] Tiến trình kết thúc với mã ${data.exitCode ?? 'không xác định'}, đang chờ trạng thái ready.`
            );
          }
        };

        const handleError = (event: Event) => {
          if ('data' in event) {
            handleStartError(event as MessageEvent<string>);
            return;
          }

          // Trì hoãn báo lỗi để đợi handleCloseEvent chạy trước và thiết lập streamEnded = true
          setTimeout(() => {
            if (streamEnded) {
              return;
            }
            // Chỉ báo lỗi "Mất kết nối" nếu EventSource bị ngắt đột ngột mà KHÔNG phải do server end stream (close event)
            if (source) {
              source.close();
            }
            if (activeEventSourceRef.current === source) {
              activeEventSourceRef.current = null;
              activeStreamTargetRef.current = null;
            }

            showErrorNotification(
              `Mất kết nối theo dõi tiến trình của dịch vụ ${service}.`,
              'Lỗi kết nối'
            );

            if (onCloseRef.current) {
              onCloseRef.current();
            }
          }, 150);
        };

        source.addEventListener('phase', handlePhase);
        source.addEventListener('log', handleLog);
        source.addEventListener('error', handleError);
        source.addEventListener('ready', handleReady);
        source.addEventListener('close', handleCloseEvent);
      }, 250);

      return () => {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        if (source) {
          source.close();
        }
        if (activeEventSourceRef.current === source && source !== null) {
          activeEventSourceRef.current = null;
          activeStreamTargetRef.current = null;
        }
      };
    } else if (action === 'restart') {
      // Vì restart không dùng stream, ta tự động chạy qua POST API trực tiếp trong modal
      let active = true;
      serviceService
        .runServiceAction(service, 'restart')
        .then(() => {
          if (!active) {
            return;
          }
          setLogs((current) => `${current}\n[Hệ thống] Đã gửi lệnh khởi động lại thành công.\n`);
        })
        .catch((err) => {
          if (!active) {
            return;
          }
          const errMsg = err instanceof Error ? err.message : 'Khởi động lại thất bại';
          setLogs((current) => `${current}\n[Hệ thống Lỗi] ${errMsg}\n`);
          showErrorNotification(errMsg, 'Lỗi khởi động lại');
          if (onCloseRef.current) {
            onCloseRef.current();
          }
        });

      return () => {
        active = false;
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
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    activeStreamTargetRef.current = null;
    if (onCloseRef.current) {
      onCloseRef.current();
    }
  };

  const cleanLogs = (str: string) => {
    const stripped = str.replace(
      // eslint-disable-next-line no-control-regex
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
      title={<ModalTitle title={`${verb} dịch vụ`} subtitle={service ?? undefined} />}
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
          {service === 's3relay' && action === 'restart' ? (
            <Text mb="md">
              <strong>Cảnh báo:</strong> Khởi động lại <strong>s3relay</strong> sẽ làm đóng{' '}
              <strong>jxserver</strong>. Bạn sẽ cần phải khởi động lại jxserver thủ công sau đó. Bạn
              có chắc chắn muốn tiếp tục?
            </Text>
          ) : (
            <Text mb="md">
              Bạn có chắc chắn muốn thực hiện hành động <strong>{verb.toLowerCase()}</strong> dịch
              vụ <strong>{service}</strong>?
            </Text>
          )}
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
