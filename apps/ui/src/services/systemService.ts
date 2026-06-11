import ApiService from './base/apiService';
import type { GameNetworkConfig, SaveGameNetworkResponse, SystemInfo } from './types';

export const systemService = {
  getSystemInfo: async () => {
    const res = await ApiService.fetchData<any, SystemInfo>({
      url: '/api/system/info',
      method: 'GET',
    });
    return res.data;
  },
  saveGameNetwork: async (payload: GameNetworkConfig) => {
    const res = await ApiService.fetchData<GameNetworkConfig, SaveGameNetworkResponse>({
      url: '/api/system/game-network',
      method: 'PUT',
      data: payload,
    });
    return res.data;
  },
};
