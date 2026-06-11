import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEnv } from '@/hooks/useEnv';
import { useQueryClient } from '@tanstack/react-query';
import { versionKeys } from '@/hooks/useVersions';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function EnvEditor({ onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const { envData, isLoading, saveEnv } = useEnv();

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  useEffect(() => {
    if (envData) {
      setContent(envData.content);
    }
  }, [envData]);

  const handleSave = useCallback(() => {
    saveEnv(content)
      .then(() => {
        onSuccessRef.current('Lưu cấu hình file .env thành công');
        queryClient.invalidateQueries({ queryKey: versionKeys.all });
      })
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Lưu file cấu hình thất bại'));
  }, [content, saveEnv, queryClient]);

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <div>
          <Title order={4}>Cấu hình biến môi trường (.env)</Title>
          <Text size="xs" color="dimmed">
            Chỉnh sửa trực tiếp file .env cấu hình hệ thống máy chủ JX. Nhớ kiểm tra kỹ các thông số trước khi lưu.
          </Text>
        </div>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          rows={15}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />

        <Group justify="flex-end">
          <Button
            color="blue"
            loading={isLoading}
            onClick={handleSave}
          >
            Lưu thay đổi
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
