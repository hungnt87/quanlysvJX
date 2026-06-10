import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { api } from '@/services/client';
import { BrowseFolderModal } from './BrowseFolderModal';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function VersionManager({ onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [customName, setCustomName] = useState('');
  const [cloneModalOpened, setCloneModalOpened] = useState(false);
  const [browsingVersion, setBrowsingVersion] = useState<string | null>(null);

  const versionsQuery = useQuery({
    queryKey: ['versions'],
    queryFn: api.versions
  });

  const { versions = [] } = versionsQuery.data ?? { versions: [] };

  const selectMutation = useMutation({
    mutationFn: api.selectVersion,
    onSuccess: async (res) => {
      onSuccess(`Đã kích hoạt phiên bản: ${res.activeVersion} (${res.serverPath})`);
      setBrowsingVersion(null);
      await queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
    onError: (error) => onError(error instanceof Error ? error.message : 'Không thể kích hoạt phiên bản')
  });

  const cloneMutation = useMutation({
    mutationFn: api.cloneVersion,
    onSuccess: async () => {
      onSuccess('Clone thành công phiên bản game từ GitHub');
      setGitUrl('');
      setGitBranch('main');
      setCustomName('');
      setCloneModalOpened(false);
      await queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
    onError: (error) => onError(error instanceof Error ? error.message : 'Git clone thất bại')
  });

  const uploadMutation = useMutation({
    mutationFn: api.uploadVersion,
    onSuccess: async () => {
      onSuccess('Upload và giải nén phiên bản game thành công');
      await queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
    onError: (error) => onError(error instanceof Error ? error.message : 'Upload hoặc giải nén thất bại')
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteVersion,
    onSuccess: async () => {
      onSuccess('Đã xóa phiên bản game thành công');
      await queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
    onError: (error) => onError(error instanceof Error ? error.message : 'Xóa phiên bản thất bại')
  });

  const handleGitClone = () => {
    if (!gitUrl) {
      onError('Vui lòng điền URL GitHub');
      return;
    }
    if (!customName) {
      onError('Vui lòng điền tên phiên bản lưu trữ');
      return;
    }
    cloneMutation.mutate({
      name: customName,
      url: gitUrl,
      branch: gitBranch
    });
  };

  const handleUploadFile = (file: File | null) => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleSelectSubPath = (subPath: string) => {
    if (browsingVersion) {
      selectMutation.mutate({ name: browsingVersion, subPath });
    }
  };

  const loading = selectMutation.isPending || cloneMutation.isPending || uploadMutation.isPending || deleteMutation.isPending;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Quản lý các Phiên bản Game</Title>
          <Text size="xs" color="dimmed">
            Tải lên hoặc clone GitHub các phiên bản game để thay đổi nhanh thư mục chạy game (SERVER_PATH) trong .env.
          </Text>
        </div>

        <Group gap="md">
          <FileButton onChange={handleUploadFile} accept=".zip,.tar.gz,.tgz">
            {(props) => (
              <Button {...props} loading={uploadMutation.isPending}>
                Tải lên file game (.zip, .tar.gz, .tgz)
              </Button>
            )}
          </FileButton>
          <Button variant="light" onClick={() => setCloneModalOpened(true)}>
            Tải về từ GitHub
          </Button>
        </Group>

        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tên phiên bản</Table.Th>
              <Table.Th>Đường dẫn (.env)</Table.Th>
              <Table.Th>Trạng thái</Table.Th>
              <Table.Th>Thao tác</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {versions.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4} align="center">
                  <Text size="sm" color="dimmed">Chưa có phiên bản game nào tải lên.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              versions.map((ver) => (
                <Table.Tr key={ver.name}>
                  <Table.Td fw={600}>{ver.name}</Table.Td>
                  <Table.Td>
                    <Text style={{ fontFamily: 'monospace' }} size="xs">{ver.path}</Text>
                  </Table.Td>
                  <Table.Td>
                    {ver.isActive ? (
                      <Badge color="green">Đang chạy</Badge>
                    ) : (
                      <Badge color="gray">Sẵn sàng</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="filled"
                        color="green"
                        disabled={ver.isActive || loading}
                        onClick={() => selectMutation.mutate({ name: ver.name })}
                      >
                        Sử dụng bản này
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        color="blue"
                        disabled={loading}
                        onClick={() => setBrowsingVersion(ver.name)}
                      >
                        Duyệt thư mục
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={ver.isActive || loading}
                        onClick={() => deleteMutation.mutate(ver.name)}
                      >
                        Xóa
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <Modal
        opened={cloneModalOpened}
        onClose={() => setCloneModalOpened(false)}
        title="Tải về trực tiếp từ GitHub"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            placeholder="https://github.com/user/repo"
            label="GitHub URL"
            required
            value={gitUrl}
            onChange={(e) => setGitUrl(e.currentTarget.value)}
          />
          <TextInput
            placeholder="main"
            label="Nhánh (Branch)"
            value={gitBranch}
            onChange={(e) => setGitBranch(e.currentTarget.value)}
          />
          <TextInput
            placeholder="v1.0"
            label="Tên thư mục lưu trữ"
            required
            value={customName}
            onChange={(e) => setCustomName(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCloneModalOpened(false)}>
              Hủy
            </Button>
            <Button onClick={handleGitClone} loading={cloneMutation.isPending}>
              Bắt đầu tải (Clone)
            </Button>
          </Group>
        </Stack>
      </Modal>

      <BrowseFolderModal
        opened={!!browsingVersion}
        onClose={() => setBrowsingVersion(null)}
        versionName={browsingVersion || ''}
        onSelectPath={handleSelectSubPath}
        isSelecting={selectMutation.isPending}
      />
    </Card>
  );
}
