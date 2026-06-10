import { Button, Group, NumberInput, Paper, Select, Stack, Switch, Text, Box, ScrollArea } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

type Props = {
  services: string[];
  selected: string | null;
  onSelect: (service: string | null) => void;
  onError: (message: string) => void;
};

const MAX_LOG_LINES = 5000;

// Bảng màu cho từng service
const SERVICE_COLORS: Record<string, string> = {
  goddess: '#e040fb',       // Tím
  bishop: '#448aff',        // Xanh dương
  s3relay: '#ff5252',       // Đỏ cam
  jxserver: '#ffd700',      // Vàng
  paysys: '#18ffff',        // Xanh ngọc
  s3relayserver: '#ff4081', // Hồng
  jxmysql: '#69f0ae',       // Xanh lá sáng
  jxmssql: '#ffab40',       // Vàng cam
};

export function LogsPanel({ services, selected, onSelect, onError }: Props) {
  const [tail, setTail] = useState(300);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const shouldFollowRef = useRef(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const activeService = selected || 'all';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setStreamReady(false);
    try {
      setLogs((await api.logs(activeService, tail)).logs);
      shouldFollowRef.current = true;
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to load logs');
    } finally {
      setLoading(false);
      setStreamReady(true);
    }
  }, [onError, activeService, tail]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoFollow || !streamReady) return undefined;

    const source = new EventSource(api.logStreamUrl(activeService, 0));
    const appendLog = (event: MessageEvent<string>) => {
      setLogs((current) => limitLogLines(`${current}${parseLogChunk(event.data)}`));
    };

    source.addEventListener('log', appendLog);

    return () => {
      source.close();
    };
  }, [autoFollow, activeService, streamReady, tail]);

  // Tự động cuộn xuống cuối
  useEffect(() => {
    if (!autoFollow || !shouldFollowRef.current) return;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [autoFollow, logs]);

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
      setAutoFollow(true);
      shouldFollowRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setShowScrollBottomBtn(distanceFromBottom > 150);
    shouldFollowRef.current = distanceFromBottom < 24;
  }

  // Hàm render từng dòng log có màu sắc
  const renderLogLines = () => {
    const stripAnsi = (str: string) => 
      // eslint-disable-next-line no-control-regex
      str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

    const formatTimestamp = (tsStr: string) => {
      try {
        const date = new Date(tsStr);
        if (isNaN(date.getTime())) return `[${tsStr.substring(11, 19)}]`;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `[${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}]`;
      } catch {
        return `[${tsStr.substring(11, 19)}]`;
      }
    };

    const lines = logs.replace(/\r/g, '').split('\n');
    return lines.map((line, index) => {
      if (!line.trim() && index === lines.length - 1) return null;
      
      const cleanLine = stripAnsi(line);
      const match = cleanLine.match(/^([a-zA-Z0-9_-]+)\s*\|\s*(.*)$/);
      
      let serviceName = '';
      let logContent = cleanLine;
      
      if (match && match[1] && match[2]) {
        serviceName = match[1].trim();
        logContent = match[2];
      }
      
      // Bóc tách timestamp từ logContent
      const tsMatch = logContent.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*(.*)$/);
      let ts: string | null = null;
      let actualContent = logContent;
      
      if (tsMatch && tsMatch[1] && tsMatch[2] !== undefined) {
        ts = tsMatch[1];
        actualContent = tsMatch[2] ?? '';
      }

      // Xác định màu sắc
      let color = '#4af626'; // mặc định
      if (activeService !== 'all') {
        const matchedService = Object.keys(SERVICE_COLORS).find(
          (s) => activeService.toLowerCase().includes(s)
        );
        color = matchedService ? SERVICE_COLORS[matchedService]! : '#4af626';
      } else if (serviceName) {
        const matchedService = Object.keys(SERVICE_COLORS).find(
          (s) => serviceName.toLowerCase().includes(s)
        );
        color = matchedService ? SERVICE_COLORS[matchedService]! : '#4af626';
      }

      return (
        <div key={index} style={{ color, marginBottom: '2px' }}>
          {showTimestamps && ts && (
            <span style={{ opacity: 0.5, marginRight: '8px' }}>{formatTimestamp(ts)}</span>
          )}
          {serviceName && (
            <span style={{ fontWeight: 'bold' }}>{serviceName} | </span>
          )}
          {actualContent}
        </div>
      );
    });
  };

  // Chuẩn bị dữ liệu cho Select (bao gồm lựa chọn "Tất cả")
  const selectData = [
    { value: 'all', label: 'Tất cả các dịch vụ' },
    ...services.map((name) => ({ value: name, label: name })),
  ];

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="end">
          <Text fw={700}>Docker logs</Text>
          <Group gap="md">
            <Switch
              label="Hiện thời gian"
              checked={showTimestamps}
              onChange={(event) => setShowTimestamps(event.currentTarget.checked)}
            />
            <Switch
              label="Auto follow"
              checked={autoFollow}
              onChange={(event) => {
                shouldFollowRef.current = event.currentTarget.checked;
                setAutoFollow(event.currentTarget.checked);
              }}
            />
          </Group>
        </Group>
        <Group grow align="end">
          <Select
            label="Service"
            data={selectData}
            value={activeService}
            onChange={(value) => onSelect(value === 'all' ? 'all' : value)}
          />
          <NumberInput
            label="Tail"
            min={50}
            max={2000}
            value={tail}
            onChange={(value) => setTail(typeof value === 'number' ? value : Number(value) || 300)}
          />
        </Group>
        <Group justify="space-between">
          <Group gap="xs">
            <Button variant="default" onClick={() => setLogs('')}>Clear</Button>
            <Button variant="light" onClick={() => onSelect('all')}>Tất cả</Button>
          </Group>
          <Button loading={loading} onClick={loadLogs}>Refresh logs</Button>
        </Group>
        
        {/* Custom Terminal View wrapper for floating button */}
        <Box style={{ position: 'relative' }}>
          <ScrollArea
            viewportRef={viewportRef}
            h={400}
            type="auto"
            offsetScrollbars
            onScrollPositionChange={handleScroll}
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
                fontSize: '13px',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {renderLogLines()}
            </Box>
          </ScrollArea>

          {showScrollBottomBtn && (
            <Button
              size="xs"
              variant="filled"
              color="blue"
              radius="xl"
              onClick={scrollToBottom}
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              ↓ Cuộn xuống cuối
            </Button>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

function parseLogChunk(data: string) {
  try {
    return JSON.parse(data) as string;
  } catch {
    return data;
  }
}

function limitLogLines(value: string) {
  const lines = value.split('\n');
  if (lines.length <= MAX_LOG_LINES) {
    return value;
  }

  return lines.slice(-MAX_LOG_LINES).join('\n');
}
