import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemService } from '@/services/systemService';

export const systemKeys = {
  all: ['system'] as const,
  info: () => [...systemKeys.all, 'info'] as const,
};

export function useSystemInfo(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: systemKeys.info(),
    queryFn: systemService.getSystemInfo,
    refetchInterval: options.refetchInterval,
  });
}

export function useSaveGameNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: systemService.saveGameNetwork,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: systemKeys.all });
    },
  });
}
