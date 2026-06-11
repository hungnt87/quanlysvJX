import ApiService from './base/apiService';
import type {
  GameAccountListResponse,
  GameAccount,
  CreateGameAccountPayload,
  UpdateGameAccountPayload,
} from './types';

export const gameAccountService = {
  getGameAccounts: async (params: { search: string; page: number; pageSize: number }) => {
    const query = new URLSearchParams({
      search: params.search,
      page: String(params.page),
      pageSize: String(params.pageSize),
    });
    const res = await ApiService.fetchData<any, GameAccountListResponse>({
      url: `/api/game-accounts?${query.toString()}`,
      method: 'GET',
    });
    return res.data;
  },
  createGameAccount: async (payload: CreateGameAccountPayload) => {
    const res = await ApiService.fetchData<any, GameAccount>({
      url: '/api/game-accounts',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  updateGameAccount: async (accountName: string, payload: UpdateGameAccountPayload) => {
    const res = await ApiService.fetchData<any, GameAccount>({
      url: `/api/game-accounts/${encodeURIComponent(accountName)}`,
      method: 'PATCH',
      data: payload,
    });
    return res.data;
  },
  deleteGameAccount: async (accountName: string) => {
    const res = await ApiService.fetchData<any, { message: string }>({
      url: `/api/game-accounts/${encodeURIComponent(accountName)}`,
      method: 'DELETE',
    });
    return res.data;
  },
  banGameAccount: async (accountName: string) => {
    const res = await ApiService.fetchData<any, GameAccount>({
      url: `/api/game-accounts/${encodeURIComponent(accountName)}/ban`,
      method: 'POST',
    });
    return res.data;
  },
  unbanGameAccount: async (accountName: string) => {
    const res = await ApiService.fetchData<any, GameAccount>({
      url: `/api/game-accounts/${encodeURIComponent(accountName)}/unban`,
      method: 'POST',
    });
    return res.data;
  },
};
