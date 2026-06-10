# Tab Routing And Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clean URL paths for dashboard/backup tabs and migrate UI request data to TanStack Query.

**Architecture:** Add React Router at the app root and make URL path the source of truth for the top-level and backup tabs. Add TanStack Query provider at the app root, then migrate services, log snapshots, and backup request/mutation flows to query keys and cache invalidation while preserving the existing EventSource log stream.

**Tech Stack:** React, TypeScript, Mantine, React Router, TanStack Query, Vitest, Testing Library, Playwright, Vite, nginx.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-06-10-tab-routing-query-design.md`

## File Structure

- Modify: `apps/ui/package.json` and `package-lock.json` to add `react-router-dom` and `@tanstack/react-query`.
- Modify: `apps/ui/src/main.tsx` to wrap `App` with `BrowserRouter` and `QueryClientProvider`.
- Create: `apps/ui/src/test/renderWithProviders.tsx` to make UI tests easy with router/query providers.
- Modify: `apps/ui/src/App.tsx` to use route-based tabs and TanStack Query for services/actions.
- Modify: `apps/ui/src/features/logs/LogsPanel.tsx` to use TanStack Query for snapshot loading and keep EventSource streaming.
- Modify: `apps/ui/src/features/backups/BackupPanel.tsx` to use URL-based nested tabs.
- Modify: `apps/ui/src/features/backups/BackupFilesTab.tsx` to use TanStack Query for files and mutations.
- Modify: `apps/ui/src/features/backups/BackupScheduleTab.tsx` to use TanStack Query for schedules and mutations.
- Modify: `apps/ui/src/features/backups/BackupJobsTab.tsx` to use TanStack Query with conditional polling.
- Modify: `apps/ui/src/features/backups/BackupSettingsTab.tsx` to use TanStack Query.
- Modify: `apps/ui/src/features/backups/BackupPanel.test.tsx` for route-aware backup tab tests.
- Modify: `apps/ui/src/features/logs/LogsPanel.test.tsx` for query provider wrapper.
- Create: `apps/ui/src/App.test.tsx` for top-level route behavior.
- Modify: `tests/e2e/manager-dashboard.spec.ts` for direct route and click URL behavior.
- Review: `apps/ui/nginx.conf` to confirm the current Docker dev proxy remains compatible with Vite history fallback.

---

## Task 1: Dependencies And Test Provider

**Files:**
- Modify: `apps/ui/package.json`
- Modify: `package-lock.json`
- Modify: `apps/ui/src/main.tsx`
- Create: `apps/ui/src/test/renderWithProviders.tsx`

- [ ] **Step 1: Install frontend dependencies**

Run:

```bash
npm install --workspace apps/ui react-router-dom @tanstack/react-query
```

Expected: `apps/ui/package.json` includes `react-router-dom` and `@tanstack/react-query`; `package-lock.json` updates.

- [ ] **Step 2: Create test provider helper**

Create `apps/ui/src/test/renderWithProviders.tsx`:

```tsx
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

type Options = RenderOptions & {
  route?: string;
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = createTestQueryClient();
  const route = options.route ?? '/dashboard';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <MantineProvider>{children}</MantineProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  return { queryClient, ...render(ui, { ...options, wrapper: Wrapper }) };
}
```

- [ ] **Step 3: Wrap app providers in `main.tsx`**

Modify `apps/ui/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm --workspace apps/ui run typecheck
```

Expected: PASS after dependencies are installed and imports resolve.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/package.json package-lock.json apps/ui/src/main.tsx apps/ui/src/test/renderWithProviders.tsx
git commit -m "feat: add ui router query providers"
```

---

## Task 2: Top-Level Route Tabs And Service Query

**Files:**
- Modify: `apps/ui/src/App.tsx`
- Create: `apps/ui/src/App.test.tsx`

- [ ] **Step 1: Write failing route test**

Create `apps/ui/src/App.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api/client';
import { renderWithProviders } from './test/renderWithProviders';

vi.mock('./api/client', () => ({
  api: {
    services: vi.fn().mockResolvedValue([]),
    action: vi.fn(),
    logs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
    backups: vi.fn().mockResolvedValue([]),
    jobs: vi.fn().mockResolvedValue([]),
    schedules: vi.fn().mockResolvedValue({
      version: 1,
      schedules: {
        mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null },
        mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null }
      }
    }),
    backupSettings: vi.fn().mockResolvedValue({
      mysqlBackupDir: '/mysql',
      mssqlBackupDir: '/mssql',
      backupMetadataFile: '/backup-metadata.json',
      backupScheduleFile: '/backup-schedules.json'
    })
  }
}));

describe('App routing', () => {
  it('renders dashboard on /dashboard and loads services through query', async () => {
    renderWithProviders(<App />, { route: '/dashboard' });

    expect(screen.getByRole('tab', { name: 'Bảng điều khiển & Logs' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(api.services).toHaveBeenCalledTimes(1));
  });

  it('renders backup files when opened at /backup/files', async () => {
    renderWithProviders(<App />, { route: '/backup/files' });

    expect(screen.getByRole('tab', { name: 'Sao lưu (Backup)' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('tab', { name: 'Files' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace apps/ui run test -- App.test.tsx
```

Expected: FAIL because `App.tsx` still uses local Mantine `Tabs defaultValue` and does not use route state.

- [ ] **Step 3: Implement route-aware `App.tsx`**

Update imports in `apps/ui/src/App.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Grid, Group, MantineProvider, Tabs, Text, Title } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
```

Inside `App`, replace service fetch state/effects with:

```tsx
const location = useLocation();
const navigate = useNavigate();
const queryClient = useQueryClient();
const activeRootTab = location.pathname.startsWith('/backup') ? 'backup' : 'dashboard';
const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services, refetchInterval: 5000 });
const services = servicesQuery.data ?? [];
```

Replace `submitAction` internals with a mutation:

```tsx
const serviceActionMutation = useMutation({
  mutationFn: ({ service, action }: { service: string; action: 'start' | 'stop' | 'restart' }) => api.action(service, action),
  onSuccess: async (result) => {
    showSuccess(result.message);
    await queryClient.invalidateQueries({ queryKey: ['services'] });
  },
  onError: (error) => showError(error instanceof Error ? error.message : 'Service action failed'),
  onSettled: () => {
    setLoadingAction(false);
    setPendingAction(null);
  }
});
```

Keep `runAction`, but make `submitAction` call:

```tsx
setLoadingAction(true);
serviceActionMutation.mutate({ service, action });
```

Replace the top-level tabs and panels with:

```tsx
<Tabs value={activeRootTab} onChange={(value) => navigate(value === 'backup' ? '/backup/files' : '/dashboard')}>
  <Tabs.List mb="md">
    <Tabs.Tab value="dashboard">Bảng điều khiển & Logs</Tabs.Tab>
    <Tabs.Tab value="backup">Sao lưu (Backup)</Tabs.Tab>
  </Tabs.List>
</Tabs>

<Routes>
  <Route path="/" element={<Navigate to="/dashboard" replace />} />
  <Route path="/dashboard" element={<DashboardView services={services} selectedService={selectedService} setSelectedService={setSelectedService} runAction={runAction} showError={showError} />} />
  <Route path="/backup" element={<Navigate to="/backup/files" replace />} />
  <Route path="/backup/*" element={<BackupPanel onSuccess={showSuccess} onError={showError} />} />
  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>
```

Extract `DashboardView` in the same file with explicit props:

```tsx
function DashboardView({ services, selectedService, setSelectedService, runAction, showError }: {
  services: ServiceStatus[];
  selectedService: string | null;
  setSelectedService: (service: string | null) => void;
  runAction: (service: string, action: 'start' | 'stop' | 'restart') => void;
  showError: (message: string) => void;
}) {
  return (
    <Grid align="stretch">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <ServiceTable services={services} selected={selectedService} onSelect={setSelectedService} onAction={runAction} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 9 }}>
        <LogsPanel services={services.map((service) => service.name)} selected={selectedService} onSelect={setSelectedService} onError={showError} />
      </Grid.Col>
    </Grid>
  );
}
```

Change header Refresh button to:

```tsx
<Button variant="light" onClick={() => queryClient.invalidateQueries({ queryKey: ['services'] })}>Refresh</Button>
```

- [ ] **Step 4: Verify top-level route tests pass**

Run:

```bash
npm --workspace apps/ui run test -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm --workspace apps/ui run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/App.tsx apps/ui/src/App.test.tsx
git commit -m "feat: route main tabs"
```

---

## Task 3: Backup Nested Routes

**Files:**
- Modify: `apps/ui/src/features/backups/BackupPanel.tsx`
- Modify: `apps/ui/src/features/backups/BackupPanel.test.tsx`

- [ ] **Step 1: Replace backup panel test with route-aware coverage**

Modify `apps/ui/src/features/backups/BackupPanel.test.tsx` to use the shared provider helper:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackupPanel } from './BackupPanel';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('../../api/client', () => ({
  api: {
    backups: vi.fn().mockResolvedValue([]),
    jobs: vi.fn().mockResolvedValue([]),
    schedules: vi.fn().mockResolvedValue({
      version: 1,
      schedules: {
        mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null },
        mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null }
      }
    }),
    backupSettings: vi.fn().mockResolvedValue({ mysqlBackupDir: '/mysql', mssqlBackupDir: '/mssql', backupMetadataFile: '/backup-metadata.json', backupScheduleFile: '/backup-schedules.json' })
  }
}));

describe('BackupPanel routing', () => {
  it('selects Schedule tab from /backup/schedule', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/backup/schedule' });

    expect(await screen.findByRole('tab', { name: 'Schedule' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' }).getAttribute('aria-selected')).toBe('true');
  });

  it('navigates to jobs when Jobs tab is clicked', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/backup/files' });

    fireEvent.click(await screen.findByRole('tab', { name: 'Jobs' }));

    expect(screen.getByRole('tab', { name: 'Jobs' }).getAttribute('aria-selected')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx
```

Expected: FAIL because `BackupPanel` still uses `defaultValue` and does not read the URL.

- [ ] **Step 3: Implement route-aware backup tabs**

Modify `BackupPanel.tsx` imports:

```tsx
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
```

Add helpers:

```tsx
const backupRoutes = new Map([
  ['files', '/backup/files'],
  ['schedule', '/backup/schedule'],
  ['jobs', '/backup/jobs'],
  ['settings', '/backup/settings']
]);

function getActiveBackupTab(pathname: string) {
  if (pathname.startsWith('/backup/schedule')) return 'schedule';
  if (pathname.startsWith('/backup/jobs')) return 'jobs';
  if (pathname.startsWith('/backup/settings')) return 'settings';
  return 'files';
}
```

Replace the component body:

```tsx
const location = useLocation();
const navigate = useNavigate();
const activeTab = getActiveBackupTab(location.pathname);

return (
  <Paper withBorder p="md">
    <Tabs value={activeTab} onChange={(value) => value && navigate(backupRoutes.get(value) ?? '/backup/files')} keepMounted={false}>
      <Tabs.List mb="md">
        <Tabs.Tab value="files">Files</Tabs.Tab>
        <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
        <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>
    </Tabs>
    <Routes>
      <Route path="/" element={<Navigate to="files" replace />} />
      <Route path="files" element={<BackupFilesTab onSuccess={onSuccess} onError={onError} />} />
      <Route path="schedule" element={<BackupScheduleTab onSuccess={onSuccess} onError={onError} />} />
      <Route path="jobs" element={<BackupJobsTab onError={onError} />} />
      <Route path="settings" element={<BackupSettingsTab onError={onError} />} />
      <Route path="*" element={<Navigate to="files" replace />} />
    </Routes>
  </Paper>
);
```

- [ ] **Step 4: Verify backup route tests pass**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/backups/BackupPanel.tsx apps/ui/src/features/backups/BackupPanel.test.tsx
git commit -m "feat: route backup tabs"
```

---

## Task 4: TanStack Query For Logs Snapshot

**Files:**
- Modify: `apps/ui/src/features/logs/LogsPanel.tsx`
- Modify: `apps/ui/src/features/logs/LogsPanel.test.tsx`

- [ ] **Step 1: Update log test wrapper**

Modify `LogsPanel.test.tsx` to import `renderWithProviders` and remove direct `MantineProvider` usage:

```tsx
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LogsPanel } from './LogsPanel';
```

Render with:

```tsx
renderWithProviders(<LogsPanel services={['jxmysql']} selected="jxmysql" onSelect={vi.fn()} onError={vi.fn()} />);
```

- [ ] **Step 2: Run log test before migration**

Run:

```bash
npm --workspace apps/ui run test -- LogsPanel.test.tsx
```

Expected: PASS. This confirms the provider helper works before changing behavior.

- [ ] **Step 3: Replace snapshot `useEffect` with `useQuery`**

Modify `LogsPanel.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
```

Remove `loading` and `loadLogs`. Add:

```tsx
const logsQuery = useQuery({
  queryKey: ['logs', activeService, tail],
  queryFn: () => api.logs(activeService, tail),
  retry: false
});
```

Replace the load effect with:

```tsx
useEffect(() => {
  if (logsQuery.isError) {
    onError(logsQuery.error instanceof Error ? logsQuery.error.message : 'Unable to load logs');
    setStreamReady(true);
    return;
  }
  if (logsQuery.data) {
    setLogs(logsQuery.data.logs);
    shouldFollowRef.current = true;
    setStreamReady(true);
  }
}, [logsQuery.data, logsQuery.error, logsQuery.isError, onError]);
```

When `activeService` or `tail` changes, reset stream readiness:

```tsx
useEffect(() => {
  setStreamReady(false);
}, [activeService, tail]);
```

Change refresh button:

```tsx
<Button loading={logsQuery.isFetching} onClick={() => logsQuery.refetch()}>Refresh logs</Button>
```

- [ ] **Step 4: Verify logs test passes**

Run:

```bash
npm --workspace apps/ui run test -- LogsPanel.test.tsx
npm --workspace apps/ui run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/logs/LogsPanel.tsx apps/ui/src/features/logs/LogsPanel.test.tsx
git commit -m "feat: query log snapshots"
```

---

## Task 5: TanStack Query For Backup Screens

**Files:**
- Modify: `apps/ui/src/features/backups/BackupFilesTab.tsx`
- Modify: `apps/ui/src/features/backups/BackupScheduleTab.tsx`
- Modify: `apps/ui/src/features/backups/BackupJobsTab.tsx`
- Modify: `apps/ui/src/features/backups/BackupSettingsTab.tsx`
- Modify: `apps/ui/src/features/backups/BackupPanel.test.tsx`

- [ ] **Step 1: Run current backup tests as baseline**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx
```

Expected: PASS from Task 3.

- [ ] **Step 2: Migrate `BackupFilesTab.tsx`**

Add imports:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

Replace `files`, `loading`, `refresh`, and `runAction` request state with:

```tsx
const queryClient = useQueryClient();
const filesQuery = useQuery({ queryKey: ['backups'], queryFn: api.backups });
const files = filesQuery.data ?? [];
const invalidateBackupData = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['backups'] }),
    queryClient.invalidateQueries({ queryKey: ['backupJobs'] })
  ]);
};
```

Create mutations:

```tsx
const backupMutation = useMutation({ mutationFn: () => api.backup('all'), onSuccess: invalidateBackupData });
const uploadMutation = useMutation({ mutationFn: ({ kind, file }: { kind: BackupKind; file: File }) => api.uploadBackup(kind, file), onSuccess: invalidateBackupData });
const updateMutation = useMutation({ mutationFn: ({ file, filename, note }: { file: BackupFile; filename: string; note: string | null }) => api.updateBackup(file.kind, file.filename, { filename, note }), onSuccess: invalidateBackupData });
const deleteMutation = useMutation({ mutationFn: (file: BackupFile) => api.deleteBackup(file.kind, file.filename), onSuccess: invalidateBackupData });
const restoreMutation = useMutation({ mutationFn: (file: BackupFile) => api.restore(file.kind, file.filename), onSuccess: invalidateBackupData });
```

Use `mutateAsync` in handlers and close modals on success. Compute loading:

```tsx
const loading = backupMutation.isPending || uploadMutation.isPending || updateMutation.isPending || deleteMutation.isPending || restoreMutation.isPending;
```

Replace Refresh button with:

```tsx
<Button variant="default" loading={filesQuery.isFetching} onClick={() => queryClient.invalidateQueries({ queryKey: ['backups'] })}>Refresh</Button>
```

Add error effect:

```tsx
useEffect(() => {
  if (filesQuery.isError) {
    onError(filesQuery.error instanceof Error ? filesQuery.error.message : 'Unable to load backups');
  }
}, [filesQuery.error, filesQuery.isError, onError]);
```

- [ ] **Step 3: Migrate `BackupScheduleTab.tsx`**

Use query for schedules:

```tsx
const queryClient = useQueryClient();
const schedulesQuery = useQuery({ queryKey: ['backupSchedules'], queryFn: api.schedules });
const [drafts, setDrafts] = useState<Record<BackupKind, DatabaseBackupSchedule>>(fallbackSchedules);

useEffect(() => {
  if (schedulesQuery.data) setDrafts(schedulesQuery.data.schedules);
}, [schedulesQuery.data]);
```

Use mutations:

```tsx
const saveMutation = useMutation({
  mutationFn: ({ kind, schedule }: { kind: BackupKind; schedule: DatabaseBackupSchedule }) => api.saveSchedule(kind, schedule),
  onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['backupSchedules'] })
});
const runNowMutation = useMutation({ mutationFn: (kind: BackupKind) => api.backup(kind) });
```

Call `onSuccess`/`onError` around `mutateAsync` in `saveSchedule` and `runNow`.

- [ ] **Step 4: Migrate `BackupJobsTab.tsx`**

Use query with conditional polling:

```tsx
const jobsQuery = useQuery({
  queryKey: ['backupJobs'],
  queryFn: api.jobs,
  refetchInterval: (query) => (query.state.data?.some((job) => job.status === 'running') ? 5000 : false)
});
const jobs = jobsQuery.data ?? [];
```

Refresh button:

```tsx
<Button variant="default" loading={jobsQuery.isFetching} onClick={() => jobsQuery.refetch()}>Refresh</Button>
```

- [ ] **Step 5: Migrate `BackupSettingsTab.tsx`**

Use query:

```tsx
const settingsQuery = useQuery({ queryKey: ['backupSettings'], queryFn: api.backupSettings });
const settings = settingsQuery.data;
```

Render loading text when `settingsQuery.isLoading`, and call `onError` in an effect when `isError`.

- [ ] **Step 6: Verify backup tests and typecheck**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx
npm --workspace apps/ui run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/features/backups/BackupFilesTab.tsx apps/ui/src/features/backups/BackupScheduleTab.tsx apps/ui/src/features/backups/BackupJobsTab.tsx apps/ui/src/features/backups/BackupSettingsTab.tsx apps/ui/src/features/backups/BackupPanel.test.tsx
git commit -m "feat: query backup workspace data"
```

---

## Task 6: E2E Routes And Final Verification

**Files:**
- Modify: `tests/e2e/manager-dashboard.spec.ts`
- Review: `apps/ui/nginx.conf`

- [ ] **Step 1: Update E2E route tests**

Modify `tests/e2e/manager-dashboard.spec.ts`:

```ts
test('backup schedule route opens schedule tab', async ({ page }) => {
  await page.goto('/backup/schedule');

  await expect(page.getByRole('tab', { name: 'Sao lưu (Backup)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
});

test('backup tab clicks update the URL', async ({ page }) => {
  await page.goto('/backup/files');

  await page.getByRole('tab', { name: 'Jobs' }).click();

  await expect(page).toHaveURL(/\/backup\/jobs$/);
});

test('unknown route falls back to dashboard', async ({ page }) => {
  await page.goto('/not-real');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('tab', { name: 'Bảng điều khiển & Logs' })).toHaveAttribute('aria-selected', 'true');
});
```

Keep the existing `manager dashboard loads` smoke test.

- [ ] **Step 2: Review nginx fallback**

Open `apps/ui/nginx.conf` and confirm the current `/` location still proxies to the Vite dev server:

```nginx
location / {
  proxy_pass http://ui:5173/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Expected: no nginx change is needed in this task because Vite handles BrowserRouter history fallback during the current Docker dev deployment.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run e2e
```

Expected: all commands PASS. Vite may warn about chunk size; that warning is acceptable if build exits 0.

- [ ] **Step 4: Commit final route coverage**

```bash
git add tests/e2e/manager-dashboard.spec.ts
git commit -m "test: cover routed backup tabs"
```

---

## Acceptance Criteria

- `/` redirects to `/dashboard`.
- `/dashboard` shows the dashboard/logs view and highlights the dashboard tab.
- `/backup` redirects to `/backup/files`.
- `/backup/files`, `/backup/schedule`, `/backup/jobs`, and `/backup/settings` open the correct backup tab directly.
- Clicking top-level tabs updates the URL.
- Clicking backup sub-tabs updates the URL.
- Unknown routes redirect to `/dashboard`.
- Services, log snapshots, backup files, schedules, jobs, and settings use TanStack Query.
- Service actions invalidate `['services']`.
- Backup mutations invalidate `['backups']` and `['backupJobs']`.
- Schedule save invalidates `['backupSchedules']`.
- Log realtime streaming still uses `EventSource` and still appends streamed messages.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run e2e` pass.

## Self-Review Notes

- Spec coverage: routing, query provider, query keys, mutations, log stream preservation, fallback routes, and E2E are all covered.
- Scope check: this plan does not change API endpoints, auth, backup UI layout, or replace EventSource streaming.
- Type consistency: route paths and query keys match the design spec; mutation invalidation keys are consistent across tasks.
