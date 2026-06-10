import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/services/client';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { LogsPanel } from '@/features/logs';

vi.mock('@/services/client', () => ({
  api: {
    logs: vi.fn(),
    logStreamUrl: vi.fn((service: string, tail: number) => `/api/services/${service}/logs/stream?tail=${tail}`)
  }
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners = new Map<string, (event: MessageEvent<string>) => void>();
  close = vi.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (event: MessageEvent<string>) => void) {
    this.listeners.set(event, handler);
  }

  emit(event: string, data: string) {
    this.listeners.get(event)?.({ data } as MessageEvent<string>);
  }
}

describe('LogsPanel', () => {
  beforeEach(() => {
    vi.mocked(api.logs).mockResolvedValue({ service: 'jxmysql', tail: 300, logs: 'snapshot\n' });
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loads a snapshot and starts realtime streaming when a service is selected', async () => {
    renderWithProviders(<LogsPanel services={['jxmysql']} selected="jxmysql" onSelect={vi.fn()} onError={vi.fn()} />);

    await waitFor(() => expect(api.logs).toHaveBeenCalledWith('jxmysql', 300));
    await screen.findByText('snapshot');
    await waitFor(() => expect(MockEventSource.instances[0]?.url).toBe('/api/services/jxmysql/logs/stream?tail=0'));

    act(() => {
      MockEventSource.instances[0]?.emit('log', JSON.stringify('streamed\n'));
    });

    await screen.findByText('streamed');
  });
});
