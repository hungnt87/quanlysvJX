import ApiService from './base/apiService';
import type { ServiceStatus } from './types';

export const serviceService = {
  getServices: async () => {
    const res = await ApiService.fetchData<any, ServiceStatus[]>({
      url: '/api/services',
      method: 'GET',
    });
    return res.data;
  },
  runServiceAction: async (service: string, action: 'start' | 'stop' | 'restart') => {
    const res = await ApiService.fetchData<any, { message: string }>({
      url: `/api/services/${service}/${action}`,
      method: 'POST',
    });
    return res.data;
  },
  getLogs: async (service: string, tail: number) => {
    const res = await ApiService.fetchData<any, { service: string; tail: number; logs: string }>({
      url: `/api/services/${service}/logs?tail=${tail}`,
      method: 'GET',
    });
    return res.data;
  },
  startStreamUrl: (service: string) => `/api/services/${service}/start/stream`,
  logStreamUrl: (service: string, tail: number) =>
    `/api/services/${service}/logs/stream?tail=${tail}`,
};
