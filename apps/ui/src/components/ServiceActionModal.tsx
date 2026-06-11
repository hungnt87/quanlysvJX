import { Button, Group, Modal, Text, Box, ScrollArea, Loader } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { serviceService } from '@/services/serviceService';

type Props = {
  opened: boolean;
  service: string | null;
  action: 'stop' | 'restart' | 'start' | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onComplete?: () => void;
};

export function ServiceActionModal({ opened, service, action, loading, onClose, onConfirm, onComplete }: Props) {
  const [logs, setLogs] = useState('');
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!loading || !service || !opened) {
      setLogs('');
      return undefined;
    }

    const initialMsg = action === 'start' 
      ? `[Hệ thống] Đang chạy lệnh khởi dựng container cho dịch vụ ${service}...\n`
      : `[Hệ thống] Đang dừng/khởi động lại dịch vụ ${service}...\n`;

    setLogs(initialMsg);
    
    const source = action === 'start' 
      ? new EventSource(serviceService.startStreamUrl(service))
      : new EventSource(serviceService.logStreamUrl(service, 100));

    const appendLog = (event: MessageEvent<string>) => {
      let chunk = event.data;
      try {
        chunk = JSON.parse(event.data) as string;
      } catch {
        void 0;
      }
      setLogs((current) => current + chunk);
    };

    const handleClose = () => {
      if (action === 'start' && onCompleteRef.current) {
        setTimeout(onCompleteRef.current, 1500);
      }
    };

    const handleError = () => {
      if (action === 'start' && onCompleteRef.current) {
        setTimeout(onCompleteRef.current, 1500);
      }
    };

    source.addEventListener('log', appendLog);
    source.addEventListener('close', handleClose);
    source.addEventListener('error', handleError);
    
    source.onerror = () => {
      if (action === 'start' && onCompleteRef.current) {
        onCompleteRef.current();
      }
    };

    return () => {
      source.close();
    };
  }, [loading, service, opened, action]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  const cleanLogs = (str: string) => {
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    const lines = stripped.split('\n');
    const processedLines = lines.map((line) => {
      const parts = line.split('\r');
      return parts[parts.length - 1];
    });
    return processedLines.join('\n');
  };

  const verb = action === 'start' ? 'Khởi động' : action === 'stop' ? 'Dừng' : 'Khởi động lại';

  return (
    <Modal opened={opened} onClose={loading ? () => void 0 : onClose} title="Xác nhận hành động dịch vụ" centered size={loading ? 'lg' : 'md'}>
      {!loading ? (
        <>
          <Text mb="md">
            Bạn có chắc chắn muốn thực hiện hành động <strong>{verb.toLowerCase()}</strong> dịch vụ <strong>{service}</strong>?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button color="blue" onClick={onConfirm}>Xác nhận</Button>
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
                  wordBreak: 'break-all',
                  color: '#4af626'
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
            <Button variant="default" disabled leftSection={<Loader size="xs" color="blue" />}>
              Đang thực hiện, vui lòng chờ...
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}
