import { AppShell, Button, Group, NavLink, Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { navigationConfig } from '@/configs/routes.config';
import { serviceKeys } from '@/hooks/useServices';

export default function DashboardLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  }, [queryClient]);

  const getActiveKey = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) {
      return 'dashboard';
    }
    if (path.startsWith('/game-accounts')) {
      return 'game-accounts';
    }
    if (path.startsWith('/backup')) {
      return 'backup';
    }
    if (path.startsWith('/settings')) {
      return 'settings';
    }
    return 'dashboard';
  };

  const activeKey = getActiveKey();

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <div>
            <Title order={3}>JX Compose Manager</Title>
            <Text size="xs" c="dimmed">
              docker-compose.yaml
            </Text>
          </div>
          <Button variant="light" onClick={handleRefresh}>
            Refresh
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          {navigationConfig.map((item) => {
            const Icon = item.icon;
            const isActive = activeKey === item.key;
            return (
              <NavLink
                key={item.key}
                label={item.title}
                leftSection={<Icon size={18} />}
                active={isActive}
                onClick={() => navigate(item.path)}
                styles={{
                  root: {
                    borderRadius: '8px',
                    fontWeight: isActive ? 600 : 400,
                  },
                }}
              />
            );
          })}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-gray-0)">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
