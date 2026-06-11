import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gameAccountService } from '@/services/gameAccountService';
import type { CreateGameAccountPayload, UpdateGameAccountPayload } from '@/services/types';

export const gameAccountKeys = {
  all: ['gameAccounts'] as const,
  lists: (params: { search: string; page: number; pageSize: number }) => [...gameAccountKeys.all, 'list', params] as const,
};

export const useGameAccounts = (params: { search: string; page: number; pageSize: number }) => {
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: gameAccountKeys.lists(params),
    queryFn: () => gameAccountService.getGameAccounts(params),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateGameAccountPayload) => gameAccountService.createGameAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameAccountKeys.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ accountName, payload }: { accountName: string; payload: UpdateGameAccountPayload }) =>
      gameAccountService.updateGameAccount(accountName, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameAccountKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (accountName: string) => gameAccountService.deleteGameAccount(accountName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameAccountKeys.all });
    },
  });

  const banMutation = useMutation({
    mutationFn: (accountName: string) => gameAccountService.banGameAccount(accountName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameAccountKeys.all });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (accountName: string) => gameAccountService.unbanGameAccount(accountName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameAccountKeys.all });
    },
  });

  return {
    accountsData: accountsQuery.data,
    isLoading: accountsQuery.isLoading,
    createAccount: createMutation.mutateAsync,
    updateAccount: updateMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
    banAccount: banMutation.mutateAsync,
    unbanAccount: unbanMutation.mutateAsync,
  };
};
