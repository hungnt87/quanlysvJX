import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { envService } from '@/services/envService';

export const envKeys = {
  all: ['env'] as const,
};

export const useEnv = () => {
  const queryClient = useQueryClient();

  const envQuery = useQuery({
    queryKey: envKeys.all,
    queryFn: envService.getEnv,
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) => envService.saveEnv(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: envKeys.all });
    },
  });

  return {
    envData: envQuery.data,
    isLoading: envQuery.isLoading,
    saveEnv: saveMutation.mutateAsync,
  };
};
