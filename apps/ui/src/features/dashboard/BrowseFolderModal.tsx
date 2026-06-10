import { useState, useEffect } from 'react';
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
import { api } from '@/services/client';

type Props = {
  opened: boolean;
  onClose: () => void;
  versionName: string;
  onSelectPath: (subPath: string) => void;
  isSelecting: boolean;
};

export function BrowseFolderModal({ opened, onClose, versionName, onSelectPath, isSelecting }: Props) {
  const [currentPath, setCurrentPath] = useState('');

  // Reset current path when modal opens/changes version
  useEffect(() => {
    if (opened) {
      setCurrentPath('');
    }
  }, [opened, versionName]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['browseVersion', versionName, currentPath],
    queryFn: () => api.browseVersion(versionName, currentPath),
    enabled: opened && !!versionName
  });

  const handleSelectDir = (dir: string) => {
    setCurrentPath(currentPath ? `${currentPath}/${dir}` : dir);
  };

  const handleGoBack = () => {
    if (data && data.parentPath !== undefined) {
      setCurrentPath(data.parentPath || '');
    }
  };

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
            <Button size="xs" variant="subtle" color="red" onClick={() => refetch()} mt="xs">Tải lại</Button>
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
                        {/* Folder icon representation */}
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
            onClick={() => onSelectPath(currentPath)}
          >
            Sử dụng đường dẫn này
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
