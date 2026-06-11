import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { BackupPanel } from './components/BackupPanel';

export default function BackupView() {
  const handleSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const handleError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  return <BackupPanel onSuccess={handleSuccess} onError={handleError} />;
}
