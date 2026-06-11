import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import DashboardLayout from './DashboardLayout';

describe('DashboardLayout navbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('persists the desktop collapsed state across renders', () => {
    const firstRender = renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));

    expect(window.localStorage.getItem('jx-manager-navbar-collapsed')).toBe('true');
    firstRender.unmount();

    renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    expect(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toBeTruthy();
  });
});
