import { Grid, Stack, Button, Group, Paper, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BatchActionModal } from '@/components/BatchActionModal';
import { ServiceActionModal } from '@/components/ServiceActionModal';
import { useServices, serviceKeys } from '@/hooks/useServices';
import { useVersions } from '@/hooks/useVersions';
import { LogsPanel } from './components/LogsPanel';
import { PrepareImagesModal } from './components/PrepareImagesModal';
import { ServiceTable } from './components/ServiceTable';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const [actionTarget, setActionTarget] = useState<{
    service: string;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { services, runAction, error, isError } = useServices(true); // polling status every 5 seconds
  const { versionsData } = useVersions();

  const [prepareOpened, setPrepareOpened] = useState(false);
  const [servicesToPrepare, setServicesToPrepare] = useState<string[]>([]);
  const [batchAction, setBatchAction] = useState<'start' | 'stop' | null>(null);

  const handleSelectService = useCallback((service: string | null) => {
    setSelectedService(service);
  }, []);

  const handleRunAction = useCallback((service: string, action: 'start' | 'stop' | 'restart') => {
    setActionTarget({ service, action });
  }, []);

  const handleConfirmAction = useCallback(() => {
    if (!actionTarget) {
      return;
    }
    setActionLoading(true);

    // Chỉ hành động stop là chạy qua POST API trực tiếp.
    // Hành động start/restart được thực hiện và theo dõi trực tiếp qua SSE của ServiceActionModal.
    if (actionTarget.action === 'stop') {
      runAction(
        { service: actionTarget.service, action: actionTarget.action },
        {
          onSuccess: () => {
            // Modal tự động đóng thông qua polling trạng thái của useServices
          },
          onError: () => {
            setActionLoading(false);
          },
        }
      );
    }
  }, [actionTarget, runAction]);

  const handleCloseModal = useCallback(() => {
    setActionTarget(null);
    setActionLoading(false);
  }, []);

  const handleLogsError = useCallback((_msg: string) => {
    // Error notification handled globally
  }, []);

  const handlePrepareAllImages = useCallback(() => {
    const uniqueMissingServices: string[] = [];
    const seenImages = new Set<string>();

    services.forEach((s) => {
      if (!s.imageExists && !seenImages.has(s.imageName)) {
        seenImages.add(s.imageName);
        uniqueMissingServices.push(s.name);
      }
    });

    if (uniqueMissingServices.length > 0) {
      setServicesToPrepare(uniqueMissingServices);
      setPrepareOpened(true);
    }
  }, [services]);

  const handlePrepareSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  }, [queryClient]);

  const handleOpenBatch = useCallback((action: 'start' | 'stop') => {
    setBatchAction(action);
  }, []);

  const handleBatchSuccess = useCallback(() => {
    setBatchAction(null);
    void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  }, [queryClient]);

  const missingImagesCount = services.reduce((acc, s) => {
    if (!s.imageExists) {
      acc.add(s.imageName);
    }
    return acc;
  }, new Set<string>()).size;
  const serviceErrorMessage = error instanceof Error ? error.message : '';
  const hasNoActiveVersion = versionsData !== undefined && versionsData.activeVersion === null;
  const hasMissingGameVersion =
    hasNoActiveVersion ||
    (isError && serviceErrorMessage.toLocaleLowerCase('vi-VN').includes('phiên bản game'));

  return (
    <Stack gap="md">
      {hasMissingGameVersion && (
        <Paper
          withBorder
          p="md"
          bg="var(--mantine-color-red-light)"
          style={{ borderColor: 'var(--mantine-color-red-outline)' }}
        >
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text fw={700} c="red" size="md">
                Cảnh báo: Chưa có Phiên bản Game
              </Text>
              <Text size="sm" c="dimmed">
                Vui lòng vào Quản lý phiên bản game để tải lên hoặc tải về từ GitHub, sau đó kích
                hoạt một phiên bản trước khi khởi chạy dịch vụ.
              </Text>
            </Stack>
            <Button color="red" size="md" component={Link} to="/settings/versions">
              Mở quản lý phiên bản
            </Button>
          </Group>
        </Paper>
      )}

      {missingImagesCount > 0 && (
        <Paper
          withBorder
          p="md"
          bg="var(--mantine-color-red-light)"
          style={{ borderColor: 'var(--mantine-color-red-outline)' }}
        >
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text fw={700} c="red" size="md">
                Cảnh báo: Thiếu Docker Images
              </Text>
              <Text size="sm" c="dimmed">
                Hệ thống phát hiện có {missingImagesCount} Docker Images chưa được tải về hoặc build
                cục bộ. Bạn cần chuẩn bị đầy đủ các images này để kích hoạt nút Start và khởi chạy
                dịch vụ.
              </Text>
            </Stack>
            <Button color="red" size="md" onClick={handlePrepareAllImages}>
              {`Tải hàng loạt docker image (${missingImagesCount})`}
            </Button>
          </Group>
        </Paper>
      )}

      <Grid align="stretch">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <ServiceTable
            services={services}
            selected={selectedService}
            onSelect={handleSelectService}
            onAction={handleRunAction}
            onBatchAction={handleOpenBatch}
            missingImagesCount={missingImagesCount}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <LogsPanel
            services={services}
            selected={selectedService}
            onSelect={handleSelectService}
            onError={handleLogsError}
          />
        </Grid.Col>
      </Grid>
      <ServiceActionModal
        opened={actionTarget !== null}
        service={actionTarget?.service ?? null}
        action={actionTarget?.action ?? null}
        loading={actionLoading}
        services={services}
        onClose={handleCloseModal}
        onConfirm={handleConfirmAction}
        onComplete={handleCloseModal}
      />
      <PrepareImagesModal
        opened={prepareOpened}
        onClose={() => setPrepareOpened(false)}
        servicesToPrepare={servicesToPrepare}
        servicesInfo={services}
        onSuccess={handlePrepareSuccess}
      />
      <BatchActionModal
        opened={batchAction !== null}
        action={batchAction}
        services={services}
        onClose={() => setBatchAction(null)}
        onSuccess={handleBatchSuccess}
      />
    </Stack>
  );
}
