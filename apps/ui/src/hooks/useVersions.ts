import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { versionService } from '@/services/versionService';

export const versionKeys = {
  all: ['versions'] as const,
  lists: () => [...versionKeys.all, 'list'] as const,
  browse: (name: string, path?: string) => [...versionKeys.all, 'browse', name, { path }] as const,
};

export const useVersions = () => {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: versionKeys.lists(),
    queryFn: versionService.getVersions,
  });

  const selectMutation = useMutation({
    mutationFn: (payload: { name: string; subPath?: string }) => versionService.selectVersion(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => versionService.deleteVersion(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ currentName, payload }: { currentName: string; payload: { name?: string; displayName?: string } }) =>
      versionService.renameVersion(currentName, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.all });
    },
  });

  return {
    versionsData: versionsQuery.data,
    isLoading: versionsQuery.isLoading,
    selectVersion: selectMutation.mutateAsync,
    deleteVersion: deleteMutation.mutateAsync,
    renameVersion: renameMutation.mutateAsync,
  };
};
