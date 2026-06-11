import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  List,
  ThemeIcon,
  Loader,
  Alert
} from '@mantine/core';
import { versionService } from '@/services/versionService';
import { versionKeys } from '@/hooks/useVersions';

type Props = {
  opened: boolean;
  onClose: () => void;
  versionName: string;
  onSelectPath: (subPath: string) => void;
  isSelecting: boolean;
};

export function BrowseFolderModal({ opened, onClose, versionName, onSelectPath, isSelecting }: Props) {
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    if (opened) {
      setCurrentPath('');
    }
  }, [opened, versionName]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: versionKeys.browse(versionName, currentPath),
    queryFn: () => versionService.browseVersion(versionName, currentPath),
    enabled: opened && !!versionName
  });

  const handleSelectDir = useCallback((dir: string) => {
    setCurrentPath((prev) => (prev ? `${prev}/${dir}` : dir));
  }, []);

  const handleGoBack = useCallback(() => {
    if (data && data.parentPath !== undefined) {
      setCurrentPath(data.parentPath || '');
    }
  }, [data]);

  const handleSelectPathClick = useCallback(() => {
    onSelectPath(currentPath);
  }, [onSelectPath, currentPath]);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Duyệt thư mục phiên bản: ${versionName}`}
      size="lg"
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Thư mục hiện tại: <Text span style={{ fontFamily: 'monospace' }} color="blue">./versions/{versionName}/{currentPath ? `${currentPath}/` : ''}</Text>
          </Text>
          {currentPath && (
            <Button size="xs" variant="outline" onClick={handleGoBack}>
              Quay lại thư mục cha
            </Button>
          )}
        </Group>

        {isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="md" />
            <Text size="sm" color="dimmed">Đang tải danh sách thư mục...</Text>
          </Group>
        ) : error ? (
          <Alert color="red" title="Lỗi">
            Không thể tải cấu trúc thư mục.
            <Button size="xs" variant="subtle" color="red" onClick={handleRefetch} mt="xs">Tải lại</Button>
          </Alert>
        ) : (
          <Stack gap="xs">
            <Text size="xs" fw={700} color="dimmed" tt="uppercase">Thư mục con:</Text>
            {data?.directories && data.directories.length > 0 ? (
              <List spacing="xs" size="sm" center>
                {data.directories.map((dir) => (
                  <List.Item
                    key={dir}
                    icon={
                      <ThemeIcon color="yellow" size={24} radius="xl">
                        📁
                      </ThemeIcon>
                    }
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSelectDir(dir)}
                  >
                    <Text span fw={500} style={{ textDecoration: 'underline' }}>
                      {dir}
                    </Text>
                  </List.Item>
                ))}
              </List>
            ) : (
              <Text size="sm" color="dimmed" fs="italic">Không tìm thấy thư mục con nào.</Text>
            )}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={isSelecting}>
            Hủy
          </Button>
          <Button
            color="green"
            loading={isSelecting}
            onClick={handleSelectPathClick}
          >
            Sử dụng đường dẫn này
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
