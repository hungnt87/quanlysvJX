import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { LogsPanel } from './LogsPanel';

vi.mock('@/services/serviceService', () => ({
  serviceService: {
    getLogs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
  },
}));

class MockEventSource {
  close = vi.fn();
  constructor(public readonly url: string) {}
  addEventListener() {
    return undefined;
  }
}

describe('LogsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses operator-friendly log wording and a taller log viewport', async () => {
    renderWithProviders(
      <LogsPanel services={[]} selected={null} onSelect={vi.fn()} onError={vi.fn()} />
    );

    expect(await screen.findByText('Nhật ký dịch vụ')).toBeTruthy();
    expect(screen.queryByText('Docker logs')).toBeNull();
    expect(screen.getByRole('button', { name: 'Xóa nhật ký hiển thị' })).toBeTruthy();
    const viewport = screen.getByTestId('service-log-viewport');
    expect(viewport.style.height).toBe('55vh');
    expect(viewport.style.maxHeight).toBe('560px');
    expect(viewport.style.minHeight).toBe('320px');
  });
});
