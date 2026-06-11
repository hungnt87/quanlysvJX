import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import SettingsView from './index';

vi.mock('./components/BackupSettingsTab', () => ({
  BackupSettingsTab: () => <div>Cấu hình sao lưu content</div>,
}));

vi.mock('./components/EnvEditor', () => ({
  EnvEditor: () => <div>Biến môi trường content</div>,
}));

vi.mock('./components/VersionManager', () => ({
  VersionManager: () => <div>Phiên bản game content</div>,
}));

describe('SettingsView routing', () => {
  afterEach(() => cleanup());

  it('selects the env tab from /settings/env', async () => {
    renderWithProviders(<SettingsView />, { route: '/settings/env' });

    expect(await screen.findByRole('tab', { name: 'Phiên bản game' })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Biến môi trường (.env)' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByText('Biến môi trường content')).toBeTruthy();
  });

  it('navigates to the backup tab path when the backup tab is clicked', async () => {
    renderWithProviders(<SettingsView />, { route: '/settings/versions' });

    fireEvent.click(await screen.findByRole('tab', { name: 'Cấu hình sao lưu' }));

    expect(
      screen.getByRole('tab', { name: 'Cấu hình sao lưu' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByText('Cấu hình sao lưu content')).toBeTruthy();
  });

  it('redirects /settings to the versions tab', async () => {
    renderWithProviders(<SettingsView />, { route: '/settings' });

    expect(
      (await screen.findByRole('tab', { name: 'Phiên bản game' })).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByText('Phiên bản game content')).toBeTruthy();
  });
});
