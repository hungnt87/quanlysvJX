import { useCallback } from 'react';
import { showSuccessNotification, showErrorNotification } from '@/utils/notification';
import { GameAccountPanel } from './components/GameAccountPanel';

export default function GameAccountsView() {
  const handleSuccess = useCallback((message: string) => {
    showSuccessNotification(message, 'Hoàn thành');
  }, []);

  const handleError = useCallback((message: string) => {
    showErrorNotification(message, 'Thao tác thất bại');
  }, []);

  return <GameAccountPanel onSuccess={handleSuccess} onError={handleError} />;
}
