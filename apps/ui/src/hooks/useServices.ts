import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceService } from '@/services/serviceService';

export const serviceKeys = {
  all: ['services'] as const,
  lists: () => [...serviceKeys.all, 'list'] as const,
  logs: (service: string, tail: number) => [...serviceKeys.all, 'logs', service, { tail }] as const,
};

export const useServices = (enabledPolling = false) => {
  const queryClient = useQueryClient();

  const servicesQuery = useQuery({
    queryKey: serviceKeys.lists(),
    queryFn: serviceService.getServices,
    refetchInterval: enabledPolling ? 5000 : false,
  });

  const actionMutation = useMutation({
    mutationFn: ({ service, action }: { service: string; action: 'start' | 'stop' | 'restart' }) =>
      serviceService.runServiceAction(service, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
  });

  return {
    services: servicesQuery.data ?? [],
    isFetching: servicesQuery.isFetching,
    error: servicesQuery.error,
    isError: servicesQuery.isError,
    runAction: actionMutation.mutate,
    isActionLoading: actionMutation.isPending,
  };
};
