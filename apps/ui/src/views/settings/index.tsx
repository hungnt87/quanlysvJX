import { Paper, Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BackupSettingsTab } from './components/BackupSettingsTab';
import { EnvEditor } from './components/EnvEditor';
import { VersionManager } from './components/VersionManager';

type SettingsTab = 'versions' | 'env' | 'backup';

const settingsRoutes = new Map<SettingsTab, string>([
  ['versions', '/settings/versions'],
  ['env', '/settings/env'],
  ['backup', '/settings/backup'],
]);

function getActiveSettingsTab(pathname: string): SettingsTab | null {
  if (pathname === '/settings' || pathname === '/settings/') {
    return null;
  }
  if (pathname.startsWith('/settings/env')) {
    return 'env';
  }
  if (pathname.startsWith('/settings/backup')) {
    return 'backup';
  }
  if (pathname.startsWith('/settings/versions')) {
    return 'versions';
  }
  return null;
}

export default function SettingsView() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveSettingsTab(location.pathname);

  const handleSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const handleError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  if (!activeTab) {
    return <Navigate to="/settings/versions" replace />;
  }

  return (
    <Paper withBorder p="md">
      <Tabs
        value={activeTab}
        onChange={(value) =>
          value && navigate(settingsRoutes.get(value as SettingsTab) ?? '/settings/versions')
        }
        keepMounted={false}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="versions">Phiên bản game</Tabs.Tab>
          <Tabs.Tab value="env">Biến môi trường (.env)</Tabs.Tab>
          <Tabs.Tab value="backup">Cấu hình sao lưu</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="env">
          <EnvEditor onSuccess={handleSuccess} onError={handleError} />
        </Tabs.Panel>
        <Tabs.Panel value="versions">
          <VersionManager onSuccess={handleSuccess} onError={handleError} />
        </Tabs.Panel>
        <Tabs.Panel value="backup">
          <BackupSettingsTab onError={handleError} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
