import { useState, useCallback, useTransition, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import type { GameVersion } from '@/services/types';
import { useVersions, versionKeys } from '@/hooks/useVersions';
import { versionService } from '@/services/versionService';
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
  const [uploadModalOpened, setUploadModalOpened] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting'>('idle');
  const [renamingVersion, setRenamingVersion] = useState<GameVersion | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameDisplayName, setRenameDisplayName] = useState('');
  const [browsingVersion, setBrowsingVersion] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const {
    versionsData,
    selectVersion,
    deleteVersion,
    renameVersion,
    isLoading
  } = useVersions();

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const { versions = [] } = versionsData ?? { versions: [] };
  const uploadNameTrimmed = uploadName.trim();
  const uploadNameExists = versions.some((version) => version.name === uploadNameTrimmed);
  const uploadDisabled = !uploadNameTrimmed || !uploadFile || uploadNameExists;

  const cloneMutation = useMutation({
    mutationFn: versionService.cloneVersion,
    onSuccess: async () => {
      onSuccessRef.current('Clone thành công phiên bản game từ GitHub');
      setGitUrl('');
      setGitBranch('main');
      setCustomName('');
      setCloneModalOpened(false);
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
    onError: (error) => onErrorRef.current(error instanceof Error ? error.message : 'Git clone thất bại')
  });

  const uploadMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => {
      setUploadStatus('uploading');
      setUploadProgress(0);
      return versionService.uploadVersionWithProgress({
        name,
        file,
        onProgress: (progress) => {
          setUploadProgress(progress);
          if (progress >= 100) {
            setUploadStatus('extracting');
          }
        }
      });
    },
    onSuccess: async () => {
      onSuccessRef.current('Upload và giải nén phiên bản game thành công');
      setUploadName('');
      setUploadFile(null);
      setUploadProgress(0);
      setUploadStatus('idle');
      setUploadModalOpened(false);
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
    onError: (error) => {
      setUploadStatus('idle');
      onErrorRef.current(error instanceof Error ? error.message : 'Upload hoặc giải nén thất bại');
    }
  });

  const handleActivateVersion = useCallback((name: string) => {
    selectVersion({ name })
      .then((res) => {
        onSuccessRef.current(`Đã kích hoạt phiên bản: ${res.activeVersion} (${res.serverPath})`);
        setBrowsingVersion(null);
      })
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Không thể kích hoạt phiên bản'));
  }, [selectVersion]);

  const handleSelectSubPath = useCallback((subPath: string) => {
    if (browsingVersion) {
      selectVersion({ name: browsingVersion, subPath })
        .then((res) => {
          onSuccessRef.current(`Đã kích hoạt phiên bản: ${res.activeVersion} (${res.serverPath})`);
          setBrowsingVersion(null);
        })
        .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Không thể kích hoạt phiên bản'));
    }
  }, [browsingVersion, selectVersion]);

  const handleGitClone = useCallback(() => {
    if (!gitUrl) {
      onErrorRef.current('Vui lòng điền URL GitHub');
      return;
    }
    if (!customName) {
      onErrorRef.current('Vui lòng điền tên phiên bản lưu trữ');
      return;
    }
    cloneMutation.mutate({
      name: customName,
      url: gitUrl,
      branch: gitBranch
    });
  }, [gitUrl, customName, gitBranch, cloneMutation]);

  const handleUpload = useCallback(() => {
    if (!uploadNameTrimmed) {
      onErrorRef.current('Vui lòng điền tên phiên bản');
      return;
    }
    if (!uploadFile) {
      onErrorRef.current('Vui lòng chọn file game');
      return;
    }
    if (uploadNameExists) {
      onErrorRef.current('Tên phiên bản đã tồn tại');
      return;
    }
    uploadMutation.mutate({ name: uploadNameTrimmed, file: uploadFile });
  }, [uploadNameTrimmed, uploadFile, uploadNameExists, uploadMutation]);

  const openRenameModal = useCallback((version: GameVersion) => {
    setRenamingVersion(version);
    setRenameName(version.name);
    setRenameDisplayName(version.displayName);
  }, []);

  const handleRename = useCallback(() => {
    if (!renamingVersion) return;
    renameVersion({ currentName: renamingVersion.name, payload: { name: renameName.trim(), displayName: renameDisplayName.trim() } })
      .then(() => {
        onSuccessRef.current('Đã đổi tên phiên bản game thành công');
        setRenamingVersion(null);
      })
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Đổi tên phiên bản thất bại'));
  }, [renamingVersion, renameName, renameDisplayName, renameVersion]);

  const handleDeleteVersion = useCallback((name: string) => {
    deleteVersion(name)
      .then(() => onSuccessRef.current('Đã xóa phiên bản game thành công'))
      .catch((error) => onErrorRef.current(error instanceof Error ? error.message : 'Xóa phiên bản thất bại'));
  }, [deleteVersion]);

  const handleBrowseFolder = useCallback((name: string) => {
    startTransition(() => {
      setBrowsingVersion(name);
    });
  }, []);

  const loading = isLoading || cloneMutation.isPending || uploadMutation.isPending;

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
          <Button loading={uploadMutation.isPending} onClick={() => setUploadModalOpened(true)}>
            Tải lên file game
          </Button>
          <Button variant="light" onClick={() => setCloneModalOpened(true)}>
            Tải về từ GitHub
          </Button>
        </Group>

        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tên phiên bản</Table.Th>
              <Table.Th>Đường dẫn (.env)</Table.Th>
              <Table.Th>Thời gian tải lên</Table.Th>
              <Table.Th>Trạng thái</Table.Th>
              <Table.Th>Thao tác</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {versions.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5} align="center">
                  <Text size="sm" color="dimmed">Chưa có phiên bản game nào tải lên.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              versions.map((ver) => (
                <Table.Tr key={ver.name}>
                  <Table.Td>
                    <Text fw={600}>{ver.displayName || ver.name}</Text>
                    <Text size="xs" color="dimmed">{ver.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text style={{ fontFamily: 'monospace' }} size="xs">{ver.path ?? `./${ver.serverPath}/`}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{formatUploadedAt(ver.uploadedAt)}</Text>
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
                        onClick={() => handleActivateVersion(ver.name)}
                      >
                        Sử dụng bản này
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        color="blue"
                        disabled={loading}
                        onClick={() => handleBrowseFolder(ver.name)}
                      >
                        Duyệt thư mục
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        disabled={loading}
                        onClick={() => openRenameModal(ver)}
                      >
                        Đổi tên
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={ver.isActive || loading}
                        onClick={() => handleDeleteVersion(ver.name)}
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

      <Modal
        opened={uploadModalOpened}
        onClose={() => !uploadMutation.isPending && setUploadModalOpened(false)}
        title="Tải lên phiên bản game"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Tên phiên bản"
            required
            placeholder="mel_2026"
            value={uploadName}
            error={uploadNameExists ? 'Tên phiên bản đã tồn tại' : undefined}
            onChange={(event) => setUploadName(event.currentTarget.value)}
          />
          <Group gap="sm">
            <FileButton onChange={setUploadFile} accept=".zip,.tar.gz,.tgz">
              {(props) => <Button {...props} variant="light">Chọn file</Button>}
            </FileButton>
            <Text size="sm" color={uploadFile ? undefined : 'dimmed'}>
              {uploadFile ? uploadFile.name : 'Chưa chọn file'}
            </Text>
          </Group>
          {(uploadMutation.isPending || uploadProgress > 0) && (
            <Stack gap={4}>
              <Progress value={uploadProgress} />
              <Text size="xs" color="dimmed">
                {uploadStatus === 'extracting' ? 'Đang giải nén...' : `Đang tải lên ${uploadProgress}%`}
              </Text>
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" disabled={uploadMutation.isPending} onClick={() => setUploadModalOpened(false)}>
              Hủy
            </Button>
            <Button onClick={handleUpload} loading={uploadMutation.isPending} disabled={uploadDisabled}>
              Upload
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!renamingVersion}
        onClose={() => setRenamingVersion(null)}
        title="Đổi tên phiên bản"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Tên phiên bản"
            required
            value={renameName}
            onChange={(event) => setRenameName(event.currentTarget.value)}
          />
          <TextInput
            label="Tên hiển thị"
            required
            value={renameDisplayName}
            onChange={(event) => setRenameDisplayName(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenamingVersion(null)}>
              Hủy
            </Button>
            <Button onClick={handleRename} loading={loading} disabled={!renameName.trim() || !renameDisplayName.trim()}>
              Lưu
            </Button>
          </Group>
        </Stack>
      </Modal>

      <BrowseFolderModal
        opened={!!browsingVersion}
        onClose={() => setBrowsingVersion(null)}
        versionName={browsingVersion || ''}
        onSelectPath={handleSelectSubPath}
        isSelecting={loading}
      />
    </Card>
  );
}

function formatUploadedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', { hour12: false });
}
