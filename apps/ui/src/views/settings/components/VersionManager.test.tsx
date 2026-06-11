import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { VersionManager } from './VersionManager';

const mockDeleteVersion = vi.fn();

vi.mock('@/hooks/useVersions', () => ({
  useVersions: () => ({
    versionsData: {
      activeVersion: 'mel',
      versions: [
        {
          name: 'mel',
          path: '/srv/apps/jx-services/versions/mel/server',
          uploadedAt: '2026-01-01T00:00:00.000Z',
          isActive: true,
        },
      ],
    },
    isLoading: false,
    selectVersion: vi.fn(),
    deleteVersion: mockDeleteVersion,
    renameVersion: vi.fn(),
  }),
  versionKeys: {
    all: ['versions'] as const,
    lists: () => ['versions', 'list'] as const,
    browse: (name: string, path?: string) => ['versions', 'browse', name, { path }] as const,
  },
}));

vi.mock('@/services/versionService', () => ({
  versionService: {
    cloneVersion: vi.fn(),
    uploadVersionWithProgress: vi.fn(),
    browseVersion: vi
      .fn()
      .mockResolvedValue({ currentPath: '', parentPath: null, directories: [] }),
  },
}));

describe('VersionManager', () => {
  beforeEach(() => {
    mockDeleteVersion.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the delete modal open until active version deletion succeeds', async () => {
    let resolveDelete!: () => void;
    mockDeleteVersion.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      })
    );

    renderWithProviders(<VersionManager onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText('Xóa phiên bản game')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa phiên bản' }));

    expect(mockDeleteVersion).toHaveBeenCalledWith('mel');
    expect(screen.getByText('Xóa phiên bản game')).toBeTruthy();

    resolveDelete();

    await waitFor(() => {
      expect(screen.queryByText('Xóa phiên bản game')).toBeNull();
    });
  });
});
