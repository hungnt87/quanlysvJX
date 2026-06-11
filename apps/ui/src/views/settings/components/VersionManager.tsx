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
  Title,
} from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useTransition, useRef, useEffect } from 'react';
import { z } from 'zod';
import { useVersions, versionKeys } from '@/hooks/useVersions';
import type { GameVersion } from '@/services/types';
import { versionService } from '@/services/versionService';
import { focusFirstError } from '@/utils/formUtils';
import { BrowseFolderModal } from './BrowseFolderModal';
import { GameNetworkConfigPanel } from './GameNetworkConfigPanel';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const versionNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,10}$/, 'Tên phiên bản phải từ 1-10 ký tự không dấu (chữ, số, -, _)');

const cloneSchema = z.object({
  url: z.string().url('GitHub URL không hợp lệ'),
  branch: z.string().trim().min(1, 'Nhánh (Branch) không được để trống'),
  name: versionNameSchema,
});

const uploadSchema = z.object({
  name: versionNameSchema,
  file: z.any().refine((file) => file !== null, 'Vui lòng chọn file game'),
});

const renameSchema = z.object({
  name: versionNameSchema,
});

export function VersionManager({ onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [cloneModalOpened, setCloneModalOpened] = useState(false);
  const [uploadModalOpened, setUploadModalOpened] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting'>('idle');
  const [renamingVersion, setRenamingVersion] = useState<GameVersion | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<GameVersion | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [browsingVersion, setBrowsingVersion] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { versionsData, selectVersion, deleteVersion, renameVersion, isLoading } = useVersions();

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const { versions = [] } = versionsData ?? { versions: [] };

  // 1. Clone Form
  const cloneForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      url: '',
      branch: 'main',
      name: '',
    },
    validate: schemaResolver(cloneSchema),
  });

  // 2. Upload Form
  const uploadForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: '',
      file: null as File | null,
    },
    validate: schemaResolver(uploadSchema),
  });

  // 3. Rename Form
  const renameForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: '',
    },
    validate: schemaResolver(renameSchema),
  });

  const cloneMutation = useMutation({
    mutationFn: versionService.cloneVersion,
    onSuccess: async () => {
      onSuccessRef.current('Clone thành công phiên bản game từ GitHub');
      cloneForm.reset();
      setCloneModalOpened(false);
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
    onError: (error) =>
      onErrorRef.current(error instanceof Error ? error.message : 'Git clone thất bại'),
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
        },
      });
    },
    onSuccess: async () => {
      onSuccessRef.current('Upload và giải nén phiên bản game thành công');
      uploadForm.reset();
      setUploadProgress(0);
      setUploadStatus('idle');
      setUploadModalOpened(false);
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
    onError: (error) => {
      setUploadStatus('idle');
      onErrorRef.current(error instanceof Error ? error.message : 'Upload hoặc giải nén thất bại');
    },
  });

  const handleActivateVersion = useCallback(
    (name: string) => {
      selectVersion({ name })
        .then((res) => {
          onSuccessRef.current(`Đã kích hoạt phiên bản: ${res.activeVersion} (${res.serverPath})`);
          setBrowsingVersion(null);
        })
        .catch((error) =>
          onErrorRef.current(
            error instanceof Error ? error.message : 'Không thể kích hoạt phiên bản'
          )
        );
    },
    [selectVersion]
  );

  const handleSelectSubPath = useCallback(
    (subPath: string) => {
      if (browsingVersion) {
        selectVersion({ name: browsingVersion, subPath })
          .then((res) => {
            onSuccessRef.current(
              `Đã kích hoạt phiên bản: ${res.activeVersion} (${res.serverPath})`
            );
            setBrowsingVersion(null);
          })
          .catch((error) =>
            onErrorRef.current(
              error instanceof Error ? error.message : 'Không thể kích hoạt phiên bản'
            )
          );
      }
    },
    [browsingVersion, selectVersion]
  );

  const handleGitClone = useCallback(
    (values: typeof cloneForm.values) => {
      const nameExists = versions.some((version) => version.name === values.name.trim());
      if (nameExists) {
        cloneForm.setFieldError('name', 'Tên phiên bản đã tồn tại');
        setTimeout(() => {
          const input =
            document.getElementsByName('name')[0] || document.getElementById('clone-name');
          input?.focus();
        }, 50);
        return;
      }
      cloneMutation.mutate({
        name: values.name,
        url: values.url,
        branch: values.branch,
      });
    },
    [versions, cloneMutation, cloneForm]
  );

  const handleUpload = useCallback(
    (values: typeof uploadForm.values) => {
      const nameExists = versions.some((version) => version.name === values.name.trim());
      if (nameExists) {
        uploadForm.setFieldError('name', 'Tên phiên bản đã tồn tại');
        setTimeout(() => {
          const input =
            document.getElementsByName('name')[0] || document.getElementById('upload-name');
          input?.focus();
        }, 50);
        return;
      }
      if (!values.file) {
        uploadForm.setFieldError('file', 'Vui lòng chọn file game');
        return;
      }
      uploadMutation.mutate({ name: values.name, file: values.file });
    },
    [versions, uploadMutation, uploadForm]
  );

  const openRenameModal = useCallback(
    (version: GameVersion) => {
      setRenamingVersion(version);
      renameForm.setValues({
        name: version.name,
      });
    },
    [renameForm]
  );

  const handleRename = useCallback(
    (values: typeof renameForm.values) => {
      if (!renamingVersion) {
        return;
      }
      const targetName = values.name.trim();
      if (targetName !== renamingVersion.name) {
        const nameExists = versions.some((version) => version.name === targetName);
        if (nameExists) {
          renameForm.setFieldError('name', 'Tên phiên bản đã tồn tại');
          setTimeout(() => {
            const input =
              document.getElementsByName('name')[0] || document.getElementById('rename-name');
            input?.focus();
          }, 50);
          return;
        }
      }
      renameVersion({
        currentName: renamingVersion.name,
        payload: { name: targetName },
      })
        .then(() => {
          onSuccessRef.current('Đã đổi tên phiên bản game thành công');
          setRenamingVersion(null);
          renameForm.reset();
        })
        .catch((error) =>
          onErrorRef.current(error instanceof Error ? error.message : 'Đổi tên phiên bản thất bại')
        );
    },
    [renamingVersion, renameVersion, renameForm, versions]
  );

  const handleDeleteVersion = useCallback((version: GameVersion) => {
    setDeletingVersion(version);
  }, []);

  const handleConfirmDeleteVersion = useCallback(async () => {
    if (!deletingVersion) {
      return;
    }

    setDeleteLoading(true);
    try {
      await deleteVersion(deletingVersion.name);
      onSuccessRef.current('Đã xóa phiên bản game thành công');
      setDeletingVersion(null);
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : 'Xóa phiên bản thất bại');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteVersion, deletingVersion]);

  const handleBrowseFolder = useCallback((name: string) => {
    startTransition(() => {
      setBrowsingVersion(name);
    });
  }, []);

  const loading = isLoading || cloneMutation.isPending || uploadMutation.isPending || deleteLoading;

  return (
    <Stack gap="md">
      <GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />
      <Card withBorder padding="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Quản lý các Phiên bản Game</Title>
          <Text size="xs" color="dimmed">
            Tải lên hoặc clone GitHub các phiên bản game để thay đổi nhanh thư mục chạy game
            (SERVER_PATH) trong .env.
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
                  <Text size="sm" color="dimmed">
                    Chưa có phiên bản game nào tải lên.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              versions.map((ver) => (
                <Table.Tr key={ver.name}>
                  <Table.Td>
                    <Text fw={600}>{ver.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text style={{ fontFamily: 'monospace' }} size="xs">
                      {ver.path}
                    </Text>
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
                        disabled={loading}
                        onClick={() => handleDeleteVersion(ver)}
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
        onClose={() => {
          cloneForm.reset();
          setCloneModalOpened(false);
        }}
        title="Tải về trực tiếp từ GitHub"
        size="md"
      >
        <form noValidate onSubmit={cloneForm.onSubmit(handleGitClone, focusFirstError)}>
          <Stack gap="md">
            <TextInput
              id="url"
              placeholder="https://github.com/user/repo"
              label="GitHub URL"
              required
              {...cloneForm.getInputProps('url')}
              key={cloneForm.key('url')}
            />
            <TextInput
              id="branch"
              placeholder="main"
              label="Nhánh (Branch)"
              required
              {...cloneForm.getInputProps('branch')}
              key={cloneForm.key('branch')}
            />
            <TextInput
              id="clone-name"
              placeholder="v1"
              label="Tên thư mục lưu trữ"
              required
              {...cloneForm.getInputProps('name')}
              key={cloneForm.key('name')}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  cloneForm.reset();
                  setCloneModalOpened(false);
                }}
              >
                Hủy
              </Button>
              <Button type="submit" loading={cloneMutation.isPending}>
                Bắt đầu tải (Clone)
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={uploadModalOpened}
        onClose={() => {
          if (!uploadMutation.isPending) {
            uploadForm.reset();
            setUploadModalOpened(false);
          }
        }}
        title="Tải lên phiên bản game"
        size="md"
      >
        <form noValidate onSubmit={uploadForm.onSubmit(handleUpload, focusFirstError)}>
          <Stack gap="md">
            <TextInput
              id="upload-name"
              label="Tên phiên bản"
              required
              placeholder="mel2026"
              {...uploadForm.getInputProps('name')}
              key={uploadForm.key('name')}
            />
            <Stack gap="xs">
              <Group gap="sm">
                <FileButton
                  onChange={(file) => uploadForm.setFieldValue('file', file)}
                  accept=".zip,.tar.gz,.tgz"
                >
                  {(props) => (
                    <Button {...props} variant="light">
                      Chọn file
                    </Button>
                  )}
                </FileButton>
                <Text size="sm" color={uploadForm.values.file ? undefined : 'dimmed'}>
                  {uploadForm.values.file
                    ? (uploadForm.values.file as File).name
                    : 'Chưa chọn file'}
                </Text>
              </Group>
              {uploadForm.errors.file && (
                <Text size="xs" color="red">
                  {uploadForm.errors.file}
                </Text>
              )}
            </Stack>

            {(uploadMutation.isPending || uploadProgress > 0) && (
              <Stack gap={4}>
                <Progress value={uploadProgress} />
                <Text size="xs" color="dimmed">
                  {uploadStatus === 'extracting'
                    ? 'Đang giải nén...'
                    : `Đang tải lên ${uploadProgress}%`}
                </Text>
              </Stack>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={uploadMutation.isPending}
                onClick={() => {
                  uploadForm.reset();
                  setUploadModalOpened(false);
                }}
              >
                Hủy
              </Button>
              <Button type="submit" loading={uploadMutation.isPending}>
                Upload
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!renamingVersion}
        onClose={() => {
          renameForm.reset();
          setRenamingVersion(null);
        }}
        title="Đổi tên phiên bản"
        size="md"
      >
        <form noValidate onSubmit={renameForm.onSubmit(handleRename, focusFirstError)}>
          <Stack gap="md">
            <TextInput
              id="rename-name"
              label="Tên phiên bản mới"
              required
              {...renameForm.getInputProps('name')}
              key={renameForm.key('name')}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  renameForm.reset();
                  setRenamingVersion(null);
                }}
              >
                Hủy
              </Button>
              <Button type="submit" loading={loading}>
                Lưu
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!deletingVersion}
        onClose={() => {
          if (!deleteLoading) {
            setDeletingVersion(null);
          }
        }}
        title="Xóa phiên bản game"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Bạn có chắc muốn xóa phiên bản {deletingVersion?.name}? Thư mục phiên bản game sẽ bị xóa
            khỏi máy chủ.
          </Text>
          {deletingVersion?.isActive && (
            <Text size="sm" color="red">
              Đây là phiên bản đang kích hoạt. Hệ thống chỉ cho xóa nếu các dịch vụ jxserver,
              s3relay, bishop và goddess không chạy.
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={deleteLoading}
              onClick={() => setDeletingVersion(null)}
            >
              Hủy
            </Button>
            <Button color="red" loading={deleteLoading} onClick={handleConfirmDeleteVersion}>
              Xóa phiên bản
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
    </Stack>
  );
}

function formatUploadedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('vi-VN', { hour12: false });
}
