import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { GameAccountPanel } from './components/GameAccountPanel';

export default function GameAccountsView() {
  const handleSuccess = useCallback((message: string) => {
    notifications.show({ color: 'green', title: 'Done', message });
  }, []);

  const handleError = useCallback((message: string) => {
    notifications.show({ color: 'red', title: 'Operation failed', message });
  }, []);

  return <GameAccountPanel onSuccess={handleSuccess} onError={handleError} />;
}
