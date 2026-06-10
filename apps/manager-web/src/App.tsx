import { AppShell, Button, Grid, Group, MantineProvider, Stack, Text, Title, Tabs } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { ServiceStatus } from './api/types';
import { BackupPanel } from './features/backups/BackupPanel';
import { LogsPanel } from './features/logs/LogsPanel';
import { ServiceActionModal } from './features/services/ServiceActionModal';
import { ServiceTable } from './features/services/ServiceTable';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

type PendingAction = { service: string; action: 'stop' | 'restart' } | null;

export function App() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const showError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  const showSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const refreshServices = useCallback(async () => {
    try {
      const nextServices = await api.services();
      setServices(nextServices);
      setSelectedService((current) => current ?? 'all');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to load services');
    }
  }, [showError]);

  async function runAction(service: string, action: 'start' | 'stop' | 'restart') {
    if (action === 'stop' || action === 'restart') {
      setPendingAction({ service, action });
      return;
    }

    await submitAction(service, action);
  }

  async function submitAction(service: string, action: 'start' | 'stop' | 'restart') {
    setLoadingAction(true);
    try {
      const result = await api.action(service, action);
      showSuccess(result.message);
      await refreshServices();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Service action failed');
    } finally {
      setLoadingAction(false);
      setPendingAction(null);
    }
  }

  useEffect(() => {
    void refreshServices();
  }, [refreshServices]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshServices();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [refreshServices]);

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
            <Button variant="light" onClick={refreshServices}>Refresh</Button>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Tabs defaultValue="dashboard">
            <Tabs.List mb="md">
              <Tabs.Tab value="dashboard">Bảng điều khiển & Logs</Tabs.Tab>
              <Tabs.Tab value="backup">Sao lưu (Backup)</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="dashboard">
              <Grid align="stretch">
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <ServiceTable services={services} selected={selectedService} onSelect={setSelectedService} onAction={runAction} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 9 }}>
                  <LogsPanel services={services.map((service) => service.name)} selected={selectedService} onSelect={setSelectedService} onError={showError} />
                </Grid.Col>
              </Grid>
            </Tabs.Panel>

            <Tabs.Panel value="backup">
              <BackupPanel onSuccess={showSuccess} onError={showError} />
            </Tabs.Panel>
          </Tabs>
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
