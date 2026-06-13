import { useCallback } from 'react';
import { showSuccessNotification, showErrorNotification } from '@/utils/notification';
import { BackupPanel } from './components/BackupPanel';

export default function BackupView() {
  const handleSuccess = useCallback((message: string) => {
    showSuccessNotification(message, 'Hoàn thành');
  }, []);

  const handleError = useCallback((message: string) => {
    showErrorNotification(message, 'Thao tác thất bại');
  }, []);

  return <BackupPanel onSuccess={handleSuccess} onError={handleError} />;
}
