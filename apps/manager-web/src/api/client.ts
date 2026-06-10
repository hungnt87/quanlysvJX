import type { ApiEnvelope, BackupList, ServiceStatus } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body === undefined ? init?.headers : { 'Content-Type': 'application/json', ...init.headers };
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!body.success) {
    throw new Error(body.error);
  }

  return body.data;
}

export const api = {
  services: () => request<ServiceStatus[]>('/api/services'),
  action: (service: string, action: 'start' | 'stop' | 'restart') =>
    request<{ message: string }>(`/api/services/${service}/${action}`, { method: 'POST' }),
  logs: (service: string, tail: number) =>
    request<{ service: string; tail: number; logs: string }>(`/api/services/${service}/logs?tail=${tail}`),
  backups: () => request<BackupList>('/api/backups'),
  backup: (kind: 'mysql' | 'mssql' | 'all') => request<unknown>(`/api/backups/${kind}`, { method: 'POST' }),
  restore: (kind: 'mysql' | 'mssql', filename: string) =>
    request<unknown>(`/api/restores/${kind}`, { method: 'POST', body: JSON.stringify({ filename }) })
};
