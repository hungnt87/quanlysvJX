import { Paper, Tabs } from '@mantine/core';
import { BackupFilesTab } from './BackupFilesTab';
import { BackupJobsTab } from './BackupJobsTab';
import { BackupScheduleTab } from './BackupScheduleTab';
import { BackupSettingsTab } from './BackupSettingsTab';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function BackupPanel({ onSuccess, onError }: Props) {
  return (
    <Paper withBorder p="md">
      <Tabs defaultValue="files" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="files">Files</Tabs.Tab>
          <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
          <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="files">
          <BackupFilesTab onSuccess={onSuccess} onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="schedule">
          <BackupScheduleTab onSuccess={onSuccess} onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="jobs">
          <BackupJobsTab onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <BackupSettingsTab onError={onError} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
