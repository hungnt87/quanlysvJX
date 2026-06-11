import ApiService from './base/apiService';
import type { VersionListResponse, GameVersion, ApiResponse } from './types';

export const versionService = {
  getVersions: async () => {
    const res = await ApiService.fetchData<any, VersionListResponse>({
      url: '/api/versions',
      method: 'GET',
    });
    return res.data;
  },
  selectVersion: async (payload: { name: string; subPath?: string }) => {
    const res = await ApiService.fetchData<any, { activeVersion: string; serverPath: string }>({
      url: '/api/versions/select',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  cloneVersion: async (payload: { name: string; url: string; branch?: string }) => {
    const res = await ApiService.fetchData<any, unknown>({
      url: '/api/versions/clone',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  uploadVersion: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await ApiService.fetchData<FormData, unknown>({
      url: '/api/versions/upload',
      method: 'POST',
      data: form,
    });
    return res.data;
  },
  renameVersion: async (currentName: string, payload: { name?: string; displayName?: string }) => {
    const res = await ApiService.fetchData<any, GameVersion>({
      url: `/api/versions/${encodeURIComponent(currentName)}`,
      method: 'PATCH',
      data: payload,
    });
    return res.data;
  },
  deleteVersion: async (name: string) => {
    const res = await ApiService.fetchData<any, unknown>({
      url: `/api/versions/${encodeURIComponent(name)}`,
      method: 'DELETE',
    });
    return res.data;
  },
  browseVersion: async (name: string, path?: string) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await ApiService.fetchData<
      any,
      { currentPath: string; parentPath: string | null; directories: string[] }
    >({
      url: `/api/versions/${encodeURIComponent(name)}/browse${query}`,
      method: 'GET',
    });
    return res.data;
  },
  uploadVersionWithProgress: (payload: {
    name: string;
    displayName?: string;
    file: File;
    onProgress: (progress: number) => void;
  }) => uploadWithProgress('/api/versions/upload', payload),
};

function uploadWithProgress(
  url: string,
  payload: {
    name: string;
    displayName?: string;
    file: File;
    onProgress: (progress: number) => void;
  }
): Promise<GameVersion> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('name', payload.name);
    if (payload.displayName) {
      form.append('displayName', payload.displayName);
    }
    form.append('file', payload.file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        payload.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}') as ApiResponse<GameVersion>;
        if (xhr.status >= 200 && xhr.status < 300 && body.success) {
          resolve(body.data);
          return;
        }
        reject(
          new Error(body.success === false ? body.error : `Upload failed with status ${xhr.status}`)
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
