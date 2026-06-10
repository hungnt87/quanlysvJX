# Tab Routing And Query Design

## Context

The UI currently uses Mantine `Tabs` with component-local state. Clicking the top-level dashboard/backup tabs or backup sub-tabs changes visible content but does not update the browser URL. Users cannot bookmark or open a direct path such as `/backup/schedule`.

The app also fetches data with local `useEffect` and `useState` calls. Services, logs, and backup screens each manage their own request lifecycle. Backup now has several read/write flows, so cache invalidation and refresh behavior should be centralized.

## Goals

- Add clean browser paths for all main tabs and backup sub-tabs.
- Use React Router as the routing layer.
- Use TanStack Query across the UI for request/response data fetching and mutations.
- Preserve the existing visual layout and component boundaries where possible.
- Keep realtime log streaming via `EventSource`; TanStack Query should manage only the initial log snapshot.

## Routes

- `/` redirects to `/dashboard`.
- `/dashboard` shows the dashboard and logs view.
- `/backup` redirects to `/backup/files`.
- `/backup/files` shows backup file management.
- `/backup/schedule` shows backup schedule management.
- `/backup/jobs` shows backup job history.
- `/backup/settings` shows backup settings.
- Unknown paths redirect to `/dashboard`.

## Routing Design

- Add `react-router-dom`.
- Wrap the app with `BrowserRouter` in `apps/ui/src/main.tsx`.
- `App.tsx` uses `Routes`, `Route`, `Navigate`, `useLocation`, and `useNavigate`.
- Top-level Mantine tabs derive their active value from `location.pathname`.
- Clicking `Bảng điều khiển & Logs` navigates to `/dashboard`.
- Clicking `Sao lưu (Backup)` navigates to `/backup/files`.
- `BackupPanel.tsx` derives its active tab from the current backup path.
- Backup sub-tab clicks navigate to `/backup/files`, `/backup/schedule`, `/backup/jobs`, or `/backup/settings`.

## TanStack Query Design

- Add `@tanstack/react-query`.
- Create one `QueryClient` in `apps/ui/src/main.tsx`.
- Wrap the app with `QueryClientProvider`.
- Query keys:
  - `['services']`
  - `['logs', service, tail]`
  - `['backups']`
  - `['backupJobs']`
  - `['backupSchedules']`
  - `['backupSettings']`
- Mutations:
  - service start/stop/restart invalidates `['services']`.
  - backup now, upload, edit, delete, and restore invalidate `['backups']` and `['backupJobs']`.
  - save schedule invalidates `['backupSchedules']`.
- `LogsPanel` uses TanStack Query for the snapshot request and keeps the existing `EventSource` stream for realtime updates.
- Components should use `isLoading`, `isFetching`, `isError`, and `mutateAsync` instead of manual request state where the data is request/response based.

## Component Impact

- `main.tsx`: add `BrowserRouter` and `QueryClientProvider`.
- `App.tsx`: replace local service fetching with `useQuery`; replace tab local state with URL-derived active tabs; service actions use `useMutation`.
- `LogsPanel.tsx`: replace snapshot fetch effect with `useQuery`; keep stream effect.
- `BackupPanel.tsx`: route-aware nested tabs and route outlets/panels.
- `BackupFilesTab.tsx`: use queries for files and mutations for backup/upload/edit/delete/restore.
- `BackupScheduleTab.tsx`: use query for schedules and mutations for save/run now.
- `BackupJobsTab.tsx`: use query for jobs, with polling while jobs are running.
- `BackupSettingsTab.tsx`: use query for readonly settings.

## Deploy Fallback

Because the app uses `BrowserRouter`, direct browser refreshes on nested routes must serve `index.html`. Check `apps/ui/nginx.conf` and add or preserve a fallback equivalent to:

```nginx
try_files $uri /index.html;
```

## Error Handling

- API request errors continue to surface through existing notification handlers.
- Route fallback redirects unknown routes to `/dashboard`.
- Query errors should call existing `onError` handlers or render compact inline fallback text where the component already owns the data display.
- Realtime log stream errors remain handled by the existing stream path.

## Testing Plan

- UI tests use `MemoryRouter` and `QueryClientProvider` wrappers.
- Test `/backup/schedule` renders the backup tab shell with `Schedule` active.
- Test top-level backup tab navigation targets `/backup/files`.
- Test backup sub-tab navigation changes to `/backup/jobs`.
- Regression test dashboard services still render from query data.
- Regression test log snapshot loads through query and stream append still works.
- E2E tests cover direct navigation to `/backup/schedule`, tab click URL changes, `/backup` defaulting to files, and unknown route fallback.

## Out Of Scope

- Changing API endpoints.
- Adding auth or permissions.
- Changing backup UI layout beyond route/query integration.
- Replacing the `EventSource` log stream with TanStack Query.
- Adding React Query Devtools.
