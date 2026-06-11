# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript monorepo for a LAN-only JX game server manager. It contains:

- `apps/api`: Fastify manager API that controls Docker Compose services, streams logs/status, manages database backups/restores, and manages MSSQL game accounts.
- `apps/ui`: Vite + React + Mantine admin UI for service control, logs, game accounts, backups, and settings.
- `apps/jx-services`: Docker Compose definitions and Dockerfiles for the underlying JX services managed by the API.
- root `docker-compose.yaml`: production-style manager deployment with the API container bound to the host project directory and Docker socket, and the UI served through nginx on port 80 by default.

The README intentionally warns that the manager has no login/auth layer and mounts the Docker socket. Treat it as trusted-LAN software only; do not expose it to the public Internet without adding authentication/authorization and network hardening.

## Common Commands

Install dependencies from the repository root:

```bash
npm install
```

Development servers:

```bash
npm run dev:api          # Fastify API via tsx watch on port 3001 by default
npm run dev:web          # Vite UI on port 5173; proxies /api to 127.0.0.1:3001
```

Build, typecheck, lint, and test all workspaces:

```bash
npm run build            # npm --workspaces run build
npm run typecheck        # npm --workspaces run typecheck
npm run lint             # oxlint . from repository root
npm run test             # npm --workspaces run test
```

Workspace-specific checks:

```bash
npm --workspace apps/api run test
npm --workspace apps/api run typecheck
npm --workspace apps/api run build

npm --workspace apps/ui run test       # typecheck + format:test + lint + vitest + build
npm --workspace apps/ui run vitest     # UI unit tests only
npm --workspace apps/ui run lint       # oxlint + stylelint
npm --workspace apps/ui run format:test
npm --workspace apps/ui run format:write
npm --workspace apps/ui run build
```

Run a single Vitest file:

```bash
npx vitest run apps/api/src/config.test.ts
npx vitest run apps/ui/src/App.test.tsx
```

End-to-end tests:

```bash
npm run e2e              # ./scripts/e2e-nginx.sh
npx playwright test      # uses tests/e2e and E2E_BASE_URL, default http://127.0.0.1
```

Docker deployment:

```bash
./setup.sh               # creates/mount-prepares expected runtime directories
# Create .env using the variables documented in README.md
MANAGER_PROJECT_ROOT=$PWD docker compose up -d --build
```

## API Architecture

The API entry point is `apps/api/src/main.ts`, which builds the Fastify app from `apps/api/src/app.ts`.

`buildApp(overrides?: Partial<AppDeps>)` is the central composition root:

- Loads `ManagerConfig` from environment in `apps/api/src/config.ts`.
- Creates dependency object `AppDeps` with Docker Compose runners and `GameAccountService`.
- Registers Fastify plugins: `@fastify/sensible` and `@fastify/multipart` with a 2GB upload limit.
- Decorates `app.deps` so route modules can access config, compose runners, and account services.
- Registers route modules: health, service control/status, logs, backups/restores/schedules/settings, game accounts, env, and versions.
- Starts the backup scheduler only when `BACKUP_SCHEDULER_ENABLED=true`.

API responses use the envelope in `apps/api/src/api/envelope.ts`:

```ts
{ success: true, data, error: null }
{ success: false, data: null, error }
```

Use `AppError` for expected API failures so the global Fastify error handler can return the intended status code and envelope. Unexpected errors are logged and returned as `Unexpected server error`.

Important API domains:

- `apps/api/src/services/composeRunner.ts`: wraps `docker compose` execution against `config.projectRoot`.
- `apps/api/src/services/serviceStatus.ts`, `logStream.ts`, `serviceAllowlist.ts`: service status/log parsing and allowlisted service operations.
- `apps/api/src/backups/`: backup file listing/upload/rename/delete, metadata, MySQL/MSSQL backup and restore jobs, schedule persistence, and cron scheduling.
- `apps/api/src/gameAccounts/`: Zod schemas, MSSQL repository, password hashing, and game account service logic.
- `apps/api/src/routes/`: thin Fastify route registration modules that call the relevant domain services and wrap responses.

When testing API routes, prefer dependency injection through `buildApp(overrides)` instead of invoking real Docker Compose or MSSQL.

## UI Architecture

The UI entry point is `apps/ui/src/main.tsx`, which renders `apps/ui/src/App.tsx`.

`App.tsx` wires global providers:

- TanStack Query with `refetchOnWindowFocus: false`, `retry: false`, and `staleTime: 30000`.
- Mantine provider and notifications.
- React Router via `RouterProvider`.

Routing is data-driven:

- Route metadata lives in `apps/ui/src/configs/routes.config.ts`.
- `apps/ui/src/components/layout/DefaultLayout.tsx` creates the browser router, redirects `/` and unknown paths to `/dashboard`, and renders each route lazily inside `DashboardLayout`.
- Navigation is derived from the same route config; update this config when adding a new top-level page.

Client API access is layered:

- `apps/ui/src/services/base/apiService.ts` and `baseService.ts` provide shared HTTP behavior.
- Domain service modules (`backupService.ts`, `gameAccountService.ts`, `serviceService.ts`, `envService.ts`, `versionService.ts`) wrap API endpoints.
- Custom hooks in `apps/ui/src/hooks/` use TanStack Query around those service modules.
- View components in `apps/ui/src/views/` consume hooks and render Mantine UI.

The Vite dev server is configured in `apps/ui/vite.config.ts` with alias `@` to `apps/ui/src` and proxies `/api` to the local API server.

## Configuration and Runtime Data

`apps/api/src/config.ts` resolves paths relative to `MANAGER_PROJECT_ROOT` or `process.cwd()`:

- MySQL backups default to `apps/jx-services/mount/database/backups/mysql`.
- MSSQL backups default to `apps/jx-services/mount/database/mssql/data/database_backups`.
- Backup metadata and schedule JSON default under `apps/jx-services/mount/database/backups`.
- Default automatic backup schedule is `0 3 * * *`; retention defaults to 14 days.
- MSSQL defaults target `localhost:1433`, database `account_tong`, with `trustServerCertificate` enabled unless explicitly disabled.

Root Docker Compose sets `MANAGER_API_HOST=0.0.0.0`, `MANAGER_API_PORT=3001`, `COMPOSE_PROJECT_NAME=quanlysvjx`, binds the project root into the API container, and mounts `/var/run/docker.sock`. Keep this coupling in mind when changing paths or compose-related code.

## Testing Notes

- API tests live next to source files as `*.test.ts` under `apps/api/src` and use Vitest.
- UI tests live next to source or view components as `*.test.tsx` and use Vitest + Testing Library + jsdom setup in `apps/ui/src/utils/test/`.
- E2E tests are under `tests/e2e`; `playwright.config.ts` defaults to `http://127.0.0.1` unless `E2E_BASE_URL` is set.
- `npm --workspace apps/ui run test` is intentionally heavier than `vitest`: it runs typecheck, formatting check, linting, unit tests, and a production build.
