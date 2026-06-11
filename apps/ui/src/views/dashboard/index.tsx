import { Grid, Stack } from '@mantine/core';
import { useCallback, useState } from 'react';
import { ServiceActionModal } from '@/components/ServiceActionModal';
import { useServices } from '@/hooks/useServices';
import { LogsPanel } from './components/LogsPanel';
import { ServiceTable } from './components/ServiceTable';

export default function Dashboard() {
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const [actionTarget, setActionTarget] = useState<{
    service: string;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { services, runAction } = useServices(true); // polling status every 5 seconds

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
    runAction(
      { service: actionTarget.service, action: actionTarget.action },
      {
        onSuccess: () => {
          // Modal will auto-close when the service hits the target state (handled in Task 9)
        },
        onError: () => {
          setActionLoading(false);
        },
      }
    );
  }, [actionTarget, runAction]);

  const handleCloseModal = useCallback(() => {
    setActionTarget(null);
    setActionLoading(false);
  }, []);

  const handleLogsError = useCallback((_msg: string) => {
    // Error notification handled globally
  }, []);

  return (
    <Stack gap="md">
      <Grid align="stretch">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <ServiceTable
            services={services}
            selected={selectedService}
            onSelect={handleSelectService}
            onAction={handleRunAction}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <LogsPanel
            services={services.map((s) => s.name)}
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
    </Stack>
  );
}
