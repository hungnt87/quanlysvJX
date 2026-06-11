import { Button, Group, Modal, Text, Box, ScrollArea, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { serviceService } from '@/services/serviceService';
import type { ServiceStatus } from '@/services/types';

type Props = {
  opened: boolean;
  action: 'start' | 'stop' | null;
  services: ServiceStatus[];
  onClose: () => void;
  onSuccess: () => void;
};

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

interface Step {
  service: string;
  label: string;
  status: StepStatus;
  errorDetail?: string;
}

// Start sequence: database first, then game services
const START_SEQUENCE = [
  { service: 'jxmysql', label: 'Cơ sở dữ liệu MySQL (jxmysql)' },
  { service: 'jxmssql', label: 'Cơ sở dữ liệu MS SQL (jxmssql)' },
  { service: 'paysys', label: 'Hệ thống tài khoản Billing (paysys)' },
  { service: 's3relayserver', label: 'S3 Relay Server (s3relayserver)' },
  { service: 'goddess', label: 'Goddess (goddess)' },
  { service: 'bishop', label: 'Bishop (bishop)' },
  { service: 's3relay', label: 'S3 Relay (s3relay)' },
  { service: 'jxserver', label: 'JX Game Server (jxserver)' },
];

// Stop sequence: game services first, s3relay before jxserver, exclude database
const STOP_SEQUENCE = [
  { service: 's3relay', label: 'S3 Relay (s3relay)' },
  { service: 'jxserver', label: 'JX Game Server (jxserver)' },
  { service: 'bishop', label: 'Bishop (bishop)' },
  { service: 'goddess', label: 'Goddess (goddess)' },
  { service: 's3relayserver', label: 'S3 Relay Server (s3relayserver)' },
  { service: 'paysys', label: 'Hệ thống tài khoản Billing (paysys)' },
];

export function BatchActionModal({ opened, action, services, onClose, onSuccess }: Props) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState('');

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeEventSourceRef = useRef<EventSource | null>(null);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (opened && action) {
      const seq = action === 'start' ? START_SEQUENCE : STOP_SEQUENCE;
      setSteps(
        seq.map((s) => ({
          service: s.service,
          label: s.label,
          status: 'pending',
        }))
      );
      setCurrentStepIndex(-1);
      setIsRunning(false);
      setLogs('');
      isCancelledRef.current = false;
    }
  }, [opened, action]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  // Clean up on unmount or close
  const cleanup = () => {
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  const appendTerminalLine = (line: string) => {
    setLogs((current) => `${current}${line.endsWith('\n') ? line : `${line}\n`}`);
  };

  const handleStartAll = async () => {
    setIsRunning(true);
    isCancelledRef.current = false;

    // We will clone steps to manipulate them
    const currentSteps: Step[] = START_SEQUENCE.map((s) => ({
      service: s.service,
      label: s.label,
      status: 'pending',
    }));
    setSteps(currentSteps);

    for (let i = 0; i < currentSteps.length; i++) {
      if (isCancelledRef.current) {
        break;
      }
      setCurrentStepIndex(i);

      const step = currentSteps[i];
      if (!step) {
        continue;
      }
      // Check current service status from props (polled from dashboard)
      const currentServiceInfo = services.find((s) => s.name === step.service);
      const isDb = step.service === 'jxmysql' || step.service === 'jxmssql';

      if (isDb && currentServiceInfo && currentServiceInfo.state === 'running') {
        const isHealthy =
          !currentServiceInfo.health ||
          currentServiceInfo.health === '' ||
          currentServiceInfo.health === 'none' ||
          currentServiceInfo.health === 'healthy';

        if (isHealthy) {
          step.status = 'skipped';
          setSteps([...currentSteps]);
          appendTerminalLine(
            `[Hệ thống] Bỏ qua ${step.service} (Đã chạy và hoạt động bình thường)\n`
          );
          continue;
        }
      }

      step.status = 'running';
      setSteps([...currentSteps]);
      appendTerminalLine(`[Hệ thống] Đang khởi chạy ${step.service}...\n`);

      try {
        await new Promise<void>((resolve, reject) => {
          if (isCancelledRef.current) {
            reject(new Error('Tiến trình bị hủy bởi người dùng.'));
            return;
          }

          const source = new EventSource(serviceService.startStreamUrl(step.service));
          activeEventSourceRef.current = source;

          let readyReceived = false;
          let errorReceived = false;

          const parseEventData = <T,>(event: MessageEvent<string>): T | null => {
            try {
              return JSON.parse(event.data) as T;
            } catch {
              return null;
            }
          };

          source.addEventListener('phase', (e) => {
            const data = parseEventData<{ phase: string; message: string }>(e);
            if (data) {
              appendTerminalLine(`[${data.phase}] ${data.message}`);
            }
          });

          source.addEventListener('log', (e) => {
            const data = parseEventData<{ message: string }>(e);
            appendTerminalLine(data ? data.message : e.data);
          });

          source.addEventListener('error', (e) => {
            if ('data' in e) {
              const data = parseEventData<{ code: string; message: string; detail: string }>(
                e as MessageEvent<string>
              );
              errorReceived = true;
              const msg = data
                ? `[${data.code}] ${data.message}\n${data.detail}`
                : 'Lỗi tiến trình.';
              appendTerminalLine(msg);
              reject(new Error(data?.message || 'Khởi chạy thất bại.'));
            }
          });

          source.addEventListener('ready', (e) => {
            const data = parseEventData<{ message: string }>(e);
            readyReceived = true;
            appendTerminalLine(data?.message || `Dịch vụ ${step.service} đã sẵn sàng.\n`);
            cleanup();
            resolve();
          });

          source.addEventListener('close', (_e) => {
            cleanup();
            if (!readyReceived && !errorReceived) {
              // Wait short time to fetch new status if no ready received
              setTimeout(() => {
                resolve();
              }, 1500);
            }
          });
        });

        step.status = 'success';
        setSteps([...currentSteps]);
      } catch (err: any) {
        cleanup();
        step.status = 'error';
        step.errorDetail = err.message || String(err);
        setSteps([...currentSteps]);
        appendTerminalLine(
          `[Lỗi] Khởi chạy dịch vụ ${step.service} thất bại: ${err.message || err}\n`
        );
        setIsRunning(false);
        return; // stop batch execution on error
      }
    }

    setIsRunning(false);
    if (!isCancelledRef.current) {
      notifications.show({
        title: 'Thành công',
        message: 'Tất cả dịch vụ đã được khởi chạy!',
        color: 'green',
      });
      onSuccess();
    }
  };

  const handleStopAll = async () => {
    setIsRunning(true);
    isCancelledRef.current = false;

    const currentSteps: Step[] = STOP_SEQUENCE.map((s) => ({
      service: s.service,
      label: s.label,
      status: 'pending',
    }));
    setSteps(currentSteps);

    for (let i = 0; i < currentSteps.length; i++) {
      if (isCancelledRef.current) {
        break;
      }
      setCurrentStepIndex(i);

      const step = currentSteps[i];
      if (!step) {
        continue;
      }
      // Check current service status
      const currentServiceInfo = services.find((s) => s.name === step.service);
      if (currentServiceInfo && currentServiceInfo.state === 'not created') {
        step.status = 'skipped';
        setSteps([...currentSteps]);
        appendTerminalLine(`[Hệ thống] Bỏ qua ${step.service} (Container chưa được tạo/đã xóa)\n`);
        continue;
      }

      step.status = 'running';
      setSteps([...currentSteps]);
      appendTerminalLine(`[Hệ thống] Đang tắt dịch vụ ${step.service} (Sử dụng rm -fs)...\n`);

      try {
        if (isCancelledRef.current) {
          throw new Error('Tiến trình bị hủy bởi người dùng.');
        }

        const res = await serviceService.runServiceAction(step.service, 'stop');
        appendTerminalLine(`[Hệ thống] ${res.message || `Đã dừng ${step.service} thành công.`}\n`);

        step.status = 'success';
        setSteps([...currentSteps]);
      } catch (err: any) {
        step.status = 'error';
        step.errorDetail = err.message || String(err);
        setSteps([...currentSteps]);
        appendTerminalLine(`[Lỗi] Tắt dịch vụ ${step.service} thất bại: ${err.message || err}\n`);
        setIsRunning(false);
        return; // stop batch execution on error
      }
    }

    setIsRunning(false);
    if (!isCancelledRef.current) {
      notifications.show({
        title: 'Thành công',
        message: 'Đã tắt sạch các dịch vụ game (chừa lại Database)!',
        color: 'green',
      });
      onSuccess();
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    cleanup();
    setIsRunning(false);
    appendTerminalLine(`\n[Hệ thống] Đã hủy tiến trình chạy hàng loạt theo yêu cầu.\n`);
  };

  const cleanLogs = (str: string) => {
    const esc1 = String.fromCharCode(27);
    const esc2 = String.fromCharCode(155);
    const regex = new RegExp(
      `[${esc1}${esc2}]\\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
      'g'
    );
    const stripped = str.replace(regex, '');
    const lines = stripped.split('\n');
    return lines
      .map((line) => {
        const parts = line.split('\r');
        return parts[parts.length - 1];
      })
      .join('\n');
  };

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'running':
        return 'blue';
      case 'skipped':
        return 'gray';
      default:
        return 'dimmed';
    }
  };

  const getStatusSymbol = (status: StepStatus) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'running':
        return '●';
      case 'skipped':
        return '↷';
      default:
        return '○';
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={isRunning ? handleCancel : onClose}
      title={action === 'start' ? 'Khởi chạy toàn bộ dịch vụ' : 'Dừng toàn bộ dịch vụ game'}
      centered
      size="xl"
      closeOnClickOutside={!isRunning}
      closeOnEscape={!isRunning}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {action === 'start'
            ? 'Tiến trình sẽ khởi chạy các Database trước, sau đó tuần tự bật các dịch vụ game để tránh xung đột kết nối.'
            : 'Tiến trình sẽ tắt tuần tự các dịch vụ game (chừa lại Database). Game server và s3relay sẽ được dọn dẹp sạch sẽ.'}
        </Text>

        <Stack
          gap="xs"
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: '6px',
            padding: '12px',
          }}
        >
          {steps.map((step, idx) => (
            <Group key={step.service} justify="space-between">
              <Group gap="xs">
                <Text
                  fw={idx === currentStepIndex ? 700 : 500}
                  c={
                    idx === currentStepIndex
                      ? 'blue'
                      : step.status === 'skipped'
                        ? 'dimmed'
                        : 'default'
                  }
                >
                  <span
                    style={{
                      marginRight: '8px',
                      color: `var(--mantine-color-${getStatusColor(step.status)}-filled)`,
                    }}
                  >
                    {getStatusSymbol(step.status)}
                  </span>
                  {step.label}
                </Text>
              </Group>
              <Text size="xs" c={getStatusColor(step.status)} fw={700}>
                {step.status === 'running' && 'Đang chạy'}
                {step.status === 'success' && 'Hoàn thành'}
                {step.status === 'error' && 'Thất bại'}
                {step.status === 'skipped' && 'Bỏ qua'}
                {step.status === 'pending' && 'Đang chờ'}
              </Text>
            </Group>
          ))}
        </Stack>

        <Box style={{ position: 'relative' }}>
          <ScrollArea
            viewportRef={viewportRef}
            h={220}
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
                fontSize: '11px',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                color: '#4af626',
              }}
            >
              {cleanLogs(logs) || 'Nhấn nút thực hiện để bắt đầu...'}
            </Box>
          </ScrollArea>
        </Box>

        <Group justify="flex-end">
          {isRunning ? (
            <Button color="red" variant="light" onClick={handleCancel}>
              Hủy tiến trình
            </Button>
          ) : (
            <>
              <Button variant="default" onClick={onClose}>
                Đóng
              </Button>
              <Button
                color={action === 'start' ? 'green' : 'red'}
                onClick={action === 'start' ? handleStartAll : handleStopAll}
              >
                {action === 'start' ? 'Bắt đầu khởi chạy' : 'Bắt đầu dừng'}
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
