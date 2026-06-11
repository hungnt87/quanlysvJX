import { Grid, Stack } from '@mantine/core';
import { useCallback, useState } from 'react';
import { useServices } from '@/hooks/useServices';
import { LogsPanel } from './components/LogsPanel';
import { ServiceTable } from './components/ServiceTable';

export default function Dashboard() {
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const { services, runAction } = useServices(true); // polling status every 5 seconds

  const handleSelectService = useCallback((service: string | null) => {
    setSelectedService(service);
  }, []);

  const handleRunAction = useCallback(
    (service: string, action: 'start' | 'stop' | 'restart') => {
      runAction({ service, action });
    },
    [runAction]
  );

  const handleLogsError = useCallback((_msg: string) => {
    // Error notification handled globally or through layout callbacks if needed
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
    </Stack>
  );
}
