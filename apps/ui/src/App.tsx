import { AppShell, Button, Grid, Group, MantineProvider, Tabs, Text, Title } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/services/client';
import type { ServiceStatus } from '@/services/types';
import { BackupPanel } from '@/features/backup';
import { LogsPanel } from '@/features/logs';
import { ServiceActionModal } from '@/features/services';
import { ServiceTable } from '@/features/services';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/assets/styles/styles.css';

type PendingAction = { service: string; action: 'stop' | 'restart' } | null;

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const activeRootTab = location.pathname.startsWith('/backup') ? 'backup' : 'dashboard';
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: api.services,
    enabled: activeRootTab === 'dashboard',
    refetchInterval: activeRootTab === 'dashboard' ? 5000 : false
  });
  const services = servicesQuery.data ?? [];

  const showError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  const showSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const serviceActionMutation = useMutation({
    mutationFn: ({ service, action }: { service: string; action: 'start' | 'stop' | 'restart' }) => api.action(service, action),
    onSuccess: async (result) => {
      showSuccess(result.message);
      await queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error) => showError(error instanceof Error ? error.message : 'Service action failed'),
    onSettled: () => {
      setLoadingAction(false);
      setPendingAction(null);
    }
  });

  async function runAction(service: string, action: 'start' | 'stop' | 'restart') {
    if (action === 'stop' || action === 'restart') {
      setPendingAction({ service, action });
      return;
    }

    await submitAction(service, action);
  }

  function submitAction(service: string, action: 'start' | 'stop' | 'restart') {
    setLoadingAction(true);
    serviceActionMutation.mutate({ service, action });
  }

  useEffect(() => {
    if (servicesQuery.isError) {
      showError(servicesQuery.error instanceof Error ? servicesQuery.error.message : 'Unable to load services');
    }
  }, [servicesQuery.error, servicesQuery.isError, showError]);

  return (
    <MantineProvider defaultColorScheme="auto">
      <Notifications />
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header px="md">
          <Group h="100%" justify="space-between">
            <div>
              <Title order={3}>JX Compose Manager</Title>
              <Text size="xs" c="dimmed">docker-compose.yaml</Text>
            </div>
            <Button variant="light" loading={servicesQuery.isFetching} onClick={() => queryClient.invalidateQueries({ queryKey: ['services'] })}>Refresh</Button>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Tabs value={activeRootTab} onChange={(value) => navigate(value === 'backup' ? '/backup/files' : '/dashboard')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="dashboard">Bảng điều khiển & Logs</Tabs.Tab>
              <Tabs.Tab value="backup">Sao lưu (Backup)</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardView
                  services={services}
                  selectedService={selectedService}
                  setSelectedService={setSelectedService}
                  runAction={runAction}
                  showError={showError}
                />
              }
            />
            <Route path="/backup" element={<Navigate to="/backup/files" replace />} />
            <Route
              path="/backup/*"
              element={
              <BackupPanel onSuccess={showSuccess} onError={showError} />
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell.Main>
      </AppShell>
      <ServiceActionModal
        opened={pendingAction !== null}
        service={pendingAction?.service ?? null}
        action={pendingAction?.action ?? null}
        loading={loadingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={() => pendingAction && submitAction(pendingAction.service, pendingAction.action)}
      />
    </MantineProvider>
  );
}

type DashboardViewProps = {
  services: ServiceStatus[];
  selectedService: string | null;
  setSelectedService: (service: string | null) => void;
  runAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
  showError: (message: string) => void;
};

function DashboardView({ services, selectedService, setSelectedService, runAction, showError }: DashboardViewProps) {
  return (
    <Grid align="stretch">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <ServiceTable services={services} selected={selectedService} onSelect={setSelectedService} onAction={runAction} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 9 }}>
        <LogsPanel services={services.map((service) => service.name)} selected={selectedService} onSelect={setSelectedService} onError={showError} />
      </Grid.Col>
    </Grid>
  );
}
