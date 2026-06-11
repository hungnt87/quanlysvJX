import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { ServiceActionModal } from './ServiceActionModal';

type Listener = (event: MessageEvent<string>) => void;

const listeners = new Map<string, Listener[]>();

class MockEventSource {
  url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: Listener) {
    const current = listeners.get(type) ?? [];
    listeners.set(type, [...current, listener]);
  }
}

function emitSse(type: string, data: unknown) {
  const event = new MessageEvent(type, { data: JSON.stringify(data) });
  for (const listener of listeners.get(type) ?? []) {
    listener(event);
  }
}

const service = {
  name: 'paysys',
  containerName: 'paysys',
  state: 'stopped',
  health: 'none',
  image: 'paysys',
  ports: [],
  startedAt: null,
  imageExists: true,
  hasBuild: false,
  imageName: 'paysys',
};

describe('ServiceActionModal structured start events', () => {
  beforeEach(() => {
    listeners.clear();
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders phase and log events in the terminal', () => {
    renderWithProviders(
      <ServiceActionModal
        opened
        service="paysys"
        action="start"
        loading
        services={[service]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => {
      emitSse('phase', { type: 'phase', phase: 'build', message: 'Đang build image paysys...' });
      emitSse('log', { type: 'log', stream: 'stdout', message: 'Step 1/4\n' });
    });

    expect(screen.getByText(/Đang build image paysys/)).toBeTruthy();
    expect(screen.getByText(/Step 1\/4/)).toBeTruthy();
  });

  it('shows structured error details and does not call onComplete', () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <ServiceActionModal
        opened
        service="paysys"
        action="start"
        loading
        services={[service]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onComplete={onComplete}
      />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => {
      emitSse('error', {
        type: 'error',
        code: 'BUILD_FAILED',
        phase: 'build',
        message: 'Build image paysys thất bại.',
        detail: 'missing package',
        exitCode: 17,
      });
      emitSse('close', { type: 'close', exitCode: 17 });
    });

    expect(screen.getByText(/BUILD_FAILED/)).toBeTruthy();
    expect(screen.getByText(/missing package/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete only after ready', () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <ServiceActionModal
        opened
        service="paysys"
        action="start"
        loading
        services={[service]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onComplete={onComplete}
      />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => emitSse('close', { type: 'close', exitCode: 0 }));
    expect(onComplete).not.toHaveBeenCalled();

    act(() =>
      emitSse('ready', {
        type: 'ready',
        service: 'paysys',
        state: 'running',
        health: 'healthy',
        message: 'Dịch vụ paysys đã sẵn sàng.',
      })
    );
    act(() => vi.advanceTimersByTime(1500));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
