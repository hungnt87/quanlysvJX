import { Paper, Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState, useCallback } from 'react';
import { EnvEditor } from './components/EnvEditor';
import { VersionManager } from './components/VersionManager';
import { BackupSettingsTab } from './components/BackupSettingsTab';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<string | null>('env');

  const handleSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const handleError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  return (
    <Paper withBorder p="md">
      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="env">Biến môi trường (.env)</Tabs.Tab>
          <Tabs.Tab value="versions">Phiên bản game</Tabs.Tab>
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
