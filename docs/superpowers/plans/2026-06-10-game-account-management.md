# Game Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mantine-based game account management tab that lists, searches, creates, edits, and soft-deletes MSSQL `account_tong` accounts.

**Architecture:** Add a small backend feature around `gameAccounts`, with schemas, hashing, service orchestration, and an MSSQL repository isolated behind an interface. Add a frontend feature under `apps/ui/src/features/gameAccounts/` that uses TanStack Query for data and Mantine + `@mantine/form` for modal forms.

**Tech Stack:** Fastify, Zod, `mssql`, Vitest, React, Mantine, `@mantine/form`, TanStack Query, Testing Library.

---

## File Structure

Backend files:

- Create `apps/api/src/gameAccounts/accountSchemas.ts`: zod request/query schemas and API-facing types.
- Create `apps/api/src/gameAccounts/passwordHash.ts`: uppercase MD5 password hashing.
- Create `apps/api/src/gameAccounts/gameAccountService.ts`: business logic over a repository interface.
- Create `apps/api/src/gameAccounts/mssqlGameAccountRepository.ts`: SQL Server implementation and transactions.
- Create `apps/api/src/routes/gameAccountRoutes.ts`: Fastify route registration.
- Modify `apps/api/src/config.ts`: MSSQL config from env without hardcoded user/password.
- Modify `apps/api/src/api/errors.ts`: add HTTP error classes used by account routes.
- Modify `apps/api/src/app.ts`: add game account deps and register routes.
- Create tests beside backend modules.

Frontend files:

- Modify `apps/ui/src/services/types.ts`: account API types.
- Modify `apps/ui/src/services/client.ts`: account API methods.
- Create `apps/ui/src/features/gameAccounts/index.ts`.
- Create `apps/ui/src/features/gameAccounts/components/GameAccountPanel.tsx`: list/search/pagination/modal state.
- Create `apps/ui/src/features/gameAccounts/components/GameAccountTable.tsx`: account table and actions.
- Create `apps/ui/src/features/gameAccounts/components/CreateGameAccountModal.tsx`: create modal using `@mantine/form`.
- Create `apps/ui/src/features/gameAccounts/components/EditGameAccountModal.tsx`: edit modal using `@mantine/form`.
- Create `apps/ui/src/features/gameAccounts/components/SoftDeleteAccountModal.tsx`: ban-confirmation modal.
- Modify `apps/ui/src/App.tsx`: add the `Tài khoản game` tab and route.
- Create component tests beside frontend components.

Dependencies:

- API workspace needs `mssql`.
- UI workspace needs `@mantine/form`.

---

### Task 1: Dependencies And MSSQL Config

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/ui/package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/api/errors.ts`
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/src/config.test.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install --workspace apps/api mssql
npm install --workspace apps/ui @mantine/form
```

Expected: `apps/api/package.json`, `apps/ui/package.json`, and `package-lock.json` update. `npm` should exit with code `0`.

- [ ] **Step 2: Add HTTP error classes**

Modify `apps/api/src/api/errors.ts`:

```ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(503, message);
  }
}

export class CommandError extends AppError {
  constructor(message: string) {
    super(500, message);
  }
}
```

- [ ] **Step 3: Write failing config tests**

Create `apps/api/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig MSSQL settings', () => {
  it('loads MSSQL connection settings from environment variables', () => {
    const config = loadConfig({
      MANAGER_PROJECT_ROOT: '/repo',
      MSSQL_HOST: 'sql.example.local',
      MSSQL_PORT: '1444',
      MSSQL_DATABASE: 'account_tong',
      MSSQL_USER: 'manager_user',
      MSSQL_PASSWORD: 'secret',
      MSSQL_ENCRYPT: 'true',
      MSSQL_TRUST_SERVER_CERTIFICATE: 'false'
    });

    expect(config.mssql).toEqual({
      host: 'sql.example.local',
      port: 1444,
      database: 'account_tong',
      user: 'manager_user',
      password: 'secret',
      encrypt: true,
      trustServerCertificate: false
    });
  });

  it('does not invent MSSQL username or password defaults', () => {
    const config = loadConfig({ MANAGER_PROJECT_ROOT: '/repo' });

    expect(config.mssql.user).toBeNull();
    expect(config.mssql.password).toBeNull();
    expect(config.mssql).toMatchObject({
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      encrypt: false,
      trustServerCertificate: true
    });
  });
});
```

- [ ] **Step 4: Run config test and verify it fails**

Run:

```bash
npm --workspace apps/api run test -- config.test.ts
```

Expected: FAIL because `ManagerConfig` has no `mssql` property.

- [ ] **Step 5: Implement MSSQL config**

Update `apps/api/src/config.ts`:

```ts
import path from 'node:path';

export type MssqlConfig = {
  host: string;
  port: number;
  database: string;
  user: string | null;
  password: string | null;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export type ManagerConfig = {
  projectRoot: string;
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupSchedule: string;
  backupRetentionDays: number;
  backupMetadataFile: string;
  backupScheduleFile: string;
  schedulerEnabled: boolean;
  mssql: MssqlConfig;
};

export function loadConfig(env = process.env): ManagerConfig {
  const projectRoot = path.resolve(env.MANAGER_PROJECT_ROOT ?? process.cwd());
  const backupRoot = path.resolve(projectRoot, env.BACKUP_ROOT_DIR ?? 'apps/jx-services/mount/database/backups');

  return {
    projectRoot,
    mysqlBackupDir: path.resolve(projectRoot, env.MYSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/backups/mysql'),
    mssqlBackupDir: path.resolve(projectRoot, env.MSSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/mssql/data/database_backups'),
    backupSchedule: env.BACKUP_SCHEDULE ?? '0 3 * * *',
    backupRetentionDays: Number(env.BACKUP_RETENTION_DAYS ?? '14'),
    backupMetadataFile: path.resolve(projectRoot, env.BACKUP_METADATA_FILE ?? path.join(backupRoot, 'backup-metadata.json')),
    backupScheduleFile: path.resolve(projectRoot, env.BACKUP_SCHEDULE_FILE ?? path.join(backupRoot, 'backup-schedules.json')),
    schedulerEnabled: env.BACKUP_SCHEDULER_ENABLED === 'true',
    mssql: {
      host: env.MSSQL_HOST ?? 'localhost',
      port: Number(env.MSSQL_PORT ?? '1433'),
      database: env.MSSQL_DATABASE ?? 'account_tong',
      user: env.MSSQL_USER ?? null,
      password: env.MSSQL_PASSWORD ?? null,
      encrypt: env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false'
    }
  };
}
```

Update all test helper `ManagerConfig` literals in existing API tests to include:

```ts
mssql: {
  host: 'localhost',
  port: 1433,
  database: 'account_tong',
  user: null,
  password: null,
  encrypt: false,
  trustServerCertificate: true
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm --workspace apps/api run test -- config.test.ts
npm --workspace apps/api run typecheck
```

Expected: both commands PASS.

Commit:

```bash
git add apps/api/package.json apps/ui/package.json package-lock.json apps/api/src/api/errors.ts apps/api/src/config.ts apps/api/src/config.test.ts apps/api/src/**/*.test.ts
git commit -m "feat: add account database config"
```

---

### Task 2: Account Schemas And Password Hashing

**Files:**
- Create: `apps/api/src/gameAccounts/accountSchemas.ts`
- Create: `apps/api/src/gameAccounts/passwordHash.ts`
- Create: `apps/api/src/gameAccounts/accountSchemas.test.ts`
- Create: `apps/api/src/gameAccounts/passwordHash.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `apps/api/src/gameAccounts/accountSchemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGameAccountSchema, listGameAccountsQuerySchema, updateGameAccountSchema } from './accountSchemas.js';

describe('game account schemas', () => {
  it('defaults list paging to page 1 and pageSize 10', () => {
    expect(listGameAccountsQuerySchema.parse({})).toEqual({ search: '', page: 1, pageSize: 10 });
  });

  it('caps pageSize at 100', () => {
    expect(listGameAccountsQuerySchema.parse({ pageSize: '1000' }).pageSize).toBe(100);
  });

  it('accepts safe account names and rejects unsafe names', () => {
    expect(createGameAccountSchema.parse({
      accountName: 'jx_user-01',
      password: 'secret123',
      secondaryPassword: 'pin456',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    }).accountName).toBe('jx_user-01');

    expect(() => createGameAccountSchema.parse({
      accountName: '../bad',
      password: 'secret123',
      secondaryPassword: 'pin456',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    })).toThrow();
  });

  it('allows update without password fields', () => {
    expect(updateGameAccountSchema.parse({ expiresAt: '2027-06-10', leftSeconds: 0 })).toEqual({
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });
  });
});
```

- [ ] **Step 2: Write failing hash tests**

Create `apps/api/src/gameAccounts/passwordHash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashGamePassword } from './passwordHash.js';

describe('hashGamePassword', () => {
  it('returns uppercase MD5 hashes', () => {
    expect(hashGamePassword('a')).toBe('0CC175B9C0F1B6A831C399E269772661');
  });

  it('hashes the exact input string', () => {
    expect(hashGamePassword('Password123')).toBe('42F749ADE7F9E195BF475F37A44CAFCB');
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm --workspace apps/api run test -- gameAccounts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Implement schemas and hashing**

Create `apps/api/src/gameAccounts/passwordHash.ts`:

```ts
import { createHash } from 'node:crypto';

export function hashGamePassword(password: string): string {
  return createHash('md5').update(password, 'utf8').digest('hex').toUpperCase();
}
```

Create `apps/api/src/gameAccounts/accountSchemas.ts`:

```ts
import { z } from 'zod';

const accountNameSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Account name can contain letters, numbers, _ and - only');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD');
const leftSecondsSchema = z.coerce.number().int().min(0);
const optionalPasswordSchema = z.string().trim().min(1).max(64).optional();

export const listGameAccountsQuerySchema = z.object({
  search: z.string().trim().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(10).catch(10).transform((value) => Math.min(value, 100))
});

export const createGameAccountSchema = z.object({
  accountName: accountNameSchema,
  password: z.string().trim().min(1).max(64),
  secondaryPassword: z.string().trim().min(1).max(64),
  expiresAt: dateSchema,
  leftSeconds: leftSecondsSchema
});

export const updateGameAccountSchema = z.object({
  password: optionalPasswordSchema,
  secondaryPassword: optionalPasswordSchema,
  expiresAt: dateSchema,
  leftSeconds: leftSecondsSchema
});

export type ListGameAccountsQuery = z.infer<typeof listGameAccountsQuerySchema>;
export type CreateGameAccountRequest = z.infer<typeof createGameAccountSchema>;
export type UpdateGameAccountRequest = z.infer<typeof updateGameAccountSchema>;

export type GameAccountView = {
  accountName: string;
  expiresAt: string | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  status: 'active' | 'banned';
};

export type GameAccountListResponse = {
  items: GameAccountView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm --workspace apps/api run test -- gameAccounts
npm --workspace apps/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/gameAccounts/accountSchemas.ts apps/api/src/gameAccounts/accountSchemas.test.ts apps/api/src/gameAccounts/passwordHash.ts apps/api/src/gameAccounts/passwordHash.test.ts
git commit -m "feat: add game account schemas"
```

---

### Task 3: Game Account Service With Repository Interface

**Files:**
- Create: `apps/api/src/gameAccounts/gameAccountService.ts`
- Create: `apps/api/src/gameAccounts/gameAccountService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/gameAccounts/gameAccountService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../api/errors.js';
import { createGameAccountService, type GameAccountRepository } from './gameAccountService.js';

function fakeRepository(overrides: Partial<GameAccountRepository> = {}): GameAccountRepository {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    existsInPrimaryOrSecondary: vi.fn().mockResolvedValue(false),
    findByName: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('game account service', () => {
  it('hashes passwords before creating accounts', async () => {
    const repository = fakeRepository();
    const service = createGameAccountService(repository);

    await service.create({
      accountName: 'jxuser',
      password: 'a',
      secondaryPassword: 'b',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });

    expect(repository.create).toHaveBeenCalledWith({
      accountName: 'jxuser',
      passwordHash: '0CC175B9C0F1B6A831C399E269772661',
      secondaryPasswordHash: '92EB5FFEE6AE2FEC3AD71C777531578F',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });
  });

  it('rejects duplicate accounts', async () => {
    const service = createGameAccountService(fakeRepository({ existsInPrimaryOrSecondary: vi.fn().mockResolvedValue(true) }));

    await expect(service.create({
      accountName: 'jxuser',
      password: 'a',
      secondaryPassword: 'b',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('omits blank password updates', async () => {
    const repository = fakeRepository();
    const service = createGameAccountService(repository);

    await service.update('jxuser', { password: '', secondaryPassword: undefined, expiresAt: '2027-06-10', leftSeconds: 5 });

    expect(repository.update).toHaveBeenCalledWith('jxuser', { expiresAt: '2027-06-10', leftSeconds: 5 });
  });

  it('returns not found when updating a missing account', async () => {
    const service = createGameAccountService(fakeRepository({ findByName: vi.fn().mockResolvedValue(null) }));

    await expect(service.update('missing', { expiresAt: '2027-06-10', leftSeconds: 0 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
npm --workspace apps/api run test -- gameAccountService.test.ts
```

Expected: FAIL because `gameAccountService.ts` does not exist.

- [ ] **Step 3: Implement service and interface**

Create `apps/api/src/gameAccounts/gameAccountService.ts`:

```ts
import { ConflictError, NotFoundError } from '../api/errors.js';
import type { CreateGameAccountRequest, GameAccountListResponse, GameAccountView, ListGameAccountsQuery, UpdateGameAccountRequest } from './accountSchemas.js';
import { hashGamePassword } from './passwordHash.js';

export type CreateGameAccountRecord = {
  accountName: string;
  passwordHash: string;
  secondaryPasswordHash: string;
  expiresAt: string;
  leftSeconds: number;
};

export type UpdateGameAccountRecord = {
  passwordHash?: string;
  secondaryPasswordHash?: string;
  expiresAt: string;
  leftSeconds: number;
};

export type GameAccountRepository = {
  list: (query: ListGameAccountsQuery) => Promise<{ items: GameAccountView[]; total: number }>;
  existsInPrimaryOrSecondary: (accountName: string) => Promise<boolean>;
  findByName: (accountName: string) => Promise<GameAccountView | null>;
  create: (record: CreateGameAccountRecord) => Promise<void>;
  update: (accountName: string, record: UpdateGameAccountRecord) => Promise<void>;
  softDelete: (accountName: string) => Promise<void>;
};

export function createGameAccountService(repository: GameAccountRepository) {
  return {
    async list(query: ListGameAccountsQuery): Promise<GameAccountListResponse> {
      const result = await repository.list(query);
      return {
        items: result.items,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / query.pageSize))
        }
      };
    },

    async create(input: CreateGameAccountRequest): Promise<GameAccountView> {
      if (await repository.existsInPrimaryOrSecondary(input.accountName)) {
        throw new ConflictError('Account already exists');
      }

      await repository.create({
        accountName: input.accountName,
        passwordHash: hashGamePassword(input.password),
        secondaryPasswordHash: hashGamePassword(input.secondaryPassword),
        expiresAt: input.expiresAt,
        leftSeconds: input.leftSeconds
      });

      const created = await repository.findByName(input.accountName);
      if (!created) {
        throw new NotFoundError('Created account was not found');
      }
      return created;
    },

    async update(accountName: string, input: UpdateGameAccountRequest): Promise<GameAccountView> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }

      const record: UpdateGameAccountRecord = {
        expiresAt: input.expiresAt,
        leftSeconds: input.leftSeconds
      };
      if (input.password) record.passwordHash = hashGamePassword(input.password);
      if (input.secondaryPassword) record.secondaryPasswordHash = hashGamePassword(input.secondaryPassword);

      await repository.update(accountName, record);
      const updated = await repository.findByName(accountName);
      if (!updated) {
        throw new NotFoundError('Account not found');
      }
      return updated;
    },

    async softDelete(accountName: string): Promise<GameAccountView> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }
      await repository.softDelete(accountName);
      const updated = await repository.findByName(accountName);
      return updated ?? { ...current, status: 'banned' };
    }
  };
}

export type GameAccountService = ReturnType<typeof createGameAccountService>;
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm --workspace apps/api run test -- gameAccountService.test.ts
npm --workspace apps/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/gameAccounts/gameAccountService.ts apps/api/src/gameAccounts/gameAccountService.test.ts
git commit -m "feat: add game account service"
```

---

### Task 4: Fastify Game Account Routes

**Files:**
- Create: `apps/api/src/routes/gameAccountRoutes.ts`
- Create: `apps/api/src/routes/gameAccountRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/gameAccountRoutes.test.ts`:

```ts
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';
import type { GameAccountService } from '../gameAccounts/gameAccountService.js';

function testConfig(root: string): ManagerConfig {
  return {
    projectRoot: root,
    mysqlBackupDir: path.join(root, 'mysql'),
    mssqlBackupDir: path.join(root, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(root, 'backup-metadata.json'),
    backupScheduleFile: path.join(root, 'backup-schedules.json'),
    schedulerEnabled: false,
    mssql: { host: 'localhost', port: 1433, database: 'account_tong', user: null, password: null, encrypt: false, trustServerCertificate: true }
  };
}

function fakeService(): GameAccountService {
  return {
    list: vi.fn().mockResolvedValue({ items: [{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }),
    create: vi.fn().mockResolvedValue({ accountName: 'newuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }),
    update: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2028-01-01', leftSeconds: 5, usedSeconds: 0, status: 'active' }),
    softDelete: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2028-01-01', leftSeconds: 5, usedSeconds: 0, status: 'banned' })
  };
}

describe('game account routes', () => {
  it('lists accounts with search and pagination', async () => {
    const service = fakeService();
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: service });

    const response = await app.inject({ method: 'GET', url: '/api/game-accounts?search=jx&page=1&pageSize=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0].accountName).toBe('jxuser');
    expect(service.list).toHaveBeenCalledWith({ search: 'jx', page: 1, pageSize: 10 });
  });

  it('creates accounts', async () => {
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: fakeService() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/game-accounts',
      payload: { accountName: 'newuser', password: 'a', secondaryPassword: 'b', expiresAt: '2027-06-10', leftSeconds: 0 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.accountName).toBe('newuser');
  });

  it('soft deletes accounts', async () => {
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: fakeService() });

    const response = await app.inject({ method: 'DELETE', url: '/api/game-accounts/jxuser' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('banned');
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
npm --workspace apps/api run test -- gameAccountRoutes.test.ts
```

Expected: FAIL because app deps and routes do not include `gameAccounts`.

- [ ] **Step 3: Implement routes and register deps**

Create `apps/api/src/routes/gameAccountRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { createGameAccountSchema, listGameAccountsQuerySchema, updateGameAccountSchema } from '../gameAccounts/accountSchemas.js';

export async function registerGameAccountRoutes(app: FastifyInstance) {
  app.get('/api/game-accounts', async (request) => {
    const query = listGameAccountsQuerySchema.parse(request.query);
    return ok(await app.deps.gameAccounts.list(query));
  });

  app.post('/api/game-accounts', async (request) => {
    const payload = createGameAccountSchema.parse(request.body);
    return ok(await app.deps.gameAccounts.create(payload));
  });

  app.patch('/api/game-accounts/:accountName', async (request) => {
    const { accountName } = request.params as { accountName: string };
    const payload = updateGameAccountSchema.parse(request.body);
    return ok(await app.deps.gameAccounts.update(accountName, payload));
  });

  app.delete('/api/game-accounts/:accountName', async (request) => {
    const { accountName } = request.params as { accountName: string };
    return ok(await app.deps.gameAccounts.softDelete(accountName));
  });
}
```

Modify `apps/api/src/app.ts` by importing and wiring the default service:

```ts
import { createGameAccountService, type GameAccountService } from './gameAccounts/gameAccountService.js';
import { createMssqlGameAccountRepository } from './gameAccounts/mssqlGameAccountRepository.js';
import { registerGameAccountRoutes } from './routes/gameAccountRoutes.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[]) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  gameAccounts: GameAccountService;
};

const deps: AppDeps = {
  config,
  runCompose: overrides.runCompose ?? ((args) => runDockerCompose(args, config.projectRoot)),
  streamCompose: overrides.streamCompose ?? ((args) => runDockerComposeStream(args, config.projectRoot)),
  gameAccounts: overrides.gameAccounts ?? createGameAccountService(createMssqlGameAccountRepository(config.mssql))
};

await registerGameAccountRoutes(app);
```

This step references `createMssqlGameAccountRepository`; Task 5 replaces the initial implementation with real SQL Server access. To keep Task 4 passing before Task 5, create the repository file in Task 4 with an exported function that throws only when used:

```ts
import type { MssqlConfig } from '../config.js';
import { ServiceUnavailableError } from '../api/errors.js';
import type { GameAccountRepository } from './gameAccountService.js';

export function createMssqlGameAccountRepository(_config: MssqlConfig): GameAccountRepository {
  const unavailable = async () => {
    throw new ServiceUnavailableError('MSSQL account repository is not implemented');
  };
  return {
    list: unavailable,
    existsInPrimaryOrSecondary: unavailable,
    findByName: unavailable,
    create: unavailable,
    update: unavailable,
    softDelete: unavailable
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm --workspace apps/api run test -- gameAccountRoutes.test.ts
npm --workspace apps/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/app.ts apps/api/src/routes/gameAccountRoutes.ts apps/api/src/routes/gameAccountRoutes.test.ts apps/api/src/gameAccounts/mssqlGameAccountRepository.ts
git commit -m "feat: add game account routes"
```

---

### Task 5: MSSQL Repository Implementation

**Files:**
- Modify: `apps/api/src/gameAccounts/mssqlGameAccountRepository.ts`
- Create: `apps/api/src/gameAccounts/mssqlGameAccountRepository.test.ts`

- [ ] **Step 1: Write failing repository guard tests**

Create `apps/api/src/gameAccounts/mssqlGameAccountRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ServiceUnavailableError } from '../api/errors.js';
import { createMssqlGameAccountRepository } from './mssqlGameAccountRepository.js';

describe('createMssqlGameAccountRepository', () => {
  it('requires MSSQL username and password before opening a connection', async () => {
    const repository = createMssqlGameAccountRepository({
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      user: null,
      password: null,
      encrypt: false,
      trustServerCertificate: true
    });

    await expect(repository.list({ search: '', page: 1, pageSize: 10 })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
```

- [ ] **Step 2: Run repository test and verify the credential guard**

Run:

```bash
npm --workspace apps/api run test -- mssqlGameAccountRepository.test.ts
```

Expected: PASS when missing credentials produce `ServiceUnavailableError`. Continue to Step 3 and replace the initial implementation with real SQL Server access.

- [ ] **Step 3: Implement repository with parameterized SQL and transactions**

Modify `apps/api/src/gameAccounts/mssqlGameAccountRepository.ts`:

```ts
import sql from 'mssql';
import { ServiceUnavailableError } from '../api/errors.js';
import type { MssqlConfig } from '../config.js';
import type { GameAccountView, ListGameAccountsQuery } from './accountSchemas.js';
import type { CreateGameAccountRecord, GameAccountRepository, UpdateGameAccountRecord } from './gameAccountService.js';

type Row = {
  accountName: string;
  expiresAt: Date | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  isBanned: boolean;
};

function toView(row: Row): GameAccountView {
  return {
    accountName: row.accountName,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : null,
    leftSeconds: row.leftSeconds,
    usedSeconds: row.usedSeconds,
    status: row.isBanned ? 'banned' : 'active'
  };
}

export function createMssqlGameAccountRepository(config: MssqlConfig): GameAccountRepository {
  let poolPromise: Promise<sql.ConnectionPool> | null = null;

  async function pool() {
    if (!config.user || !config.password) {
      throw new ServiceUnavailableError('MSSQL account credentials are not configured');
    }

    poolPromise ??= new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate
      }
    }).connect();

    return poolPromise;
  }

  return {
    async list(query: ListGameAccountsQuery) {
      const offset = (query.page - 1) * query.pageSize;
      const request = (await pool()).request()
        .input('search', sql.VarChar(34), `%${query.search}%`)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, query.pageSize);

      const result = await request.query<Row & { totalRows: number }>(`
        SELECT
          ai.cAccName AS accountName,
          ah.dEndDate AS expiresAt,
          ah.iLeftSecond AS leftSeconds,
          ah.iUseSecond AS usedSeconds,
          ai.bIsBanned AS isBanned,
          COUNT(1) OVER() AS totalRows
        FROM dbo.Account_Info ai
        LEFT JOIN dbo.Account_Habitus ah ON ah.cAccName = ai.cAccName
        WHERE (@search = '%%' OR ai.cAccName LIKE @search)
        ORDER BY ai.cAccName
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);

      return {
        items: result.recordset.map(toView),
        total: result.recordset[0]?.totalRows ?? 0
      };
    },

    async existsInPrimaryOrSecondary(accountName: string) {
      const result = await (await pool()).request()
        .input('accountName', sql.VarChar(32), accountName)
        .query<{ countRows: number }>(`
          SELECT COUNT(1) AS countRows
          FROM (
            SELECT cAccName FROM dbo.Account_Info WHERE cAccName = @accountName
            UNION ALL
            SELECT cAccName FROM dbo.Account_Info2 WHERE cAccName = @accountName
          ) accounts
        `);
      return (result.recordset[0]?.countRows ?? 0) > 0;
    },

    async findByName(accountName: string) {
      const result = await (await pool()).request()
        .input('accountName', sql.VarChar(32), accountName)
        .query<Row>(`
          SELECT ai.cAccName AS accountName, ah.dEndDate AS expiresAt, ah.iLeftSecond AS leftSeconds,
                 ah.iUseSecond AS usedSeconds, ai.bIsBanned AS isBanned
          FROM dbo.Account_Info ai
          LEFT JOIN dbo.Account_Habitus ah ON ah.cAccName = ai.cAccName
          WHERE ai.cAccName = @accountName
        `);
      const row = result.recordset[0];
      return row ? toView(row) : null;
    },

    async create(record: CreateGameAccountRecord) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), record.accountName)
          .input('passwordHash', sql.VarChar(32), record.passwordHash)
          .input('secondaryPasswordHash', sql.VarChar(32), record.secondaryPasswordHash)
          .query(`
            INSERT INTO dbo.Account_Info
              (cAccName, cSecPassWord, cPassWord, nExtPoint, nExtPoint1, nExtPoint2, nExtPoint3, nExtPoint4, nExtPoint5, nExtPoint6, nExtPoint7,
               bParentalControl, bIsBanned, bIsUseOTP, iOTPSessionLifeTime, iServiceFlag)
            VALUES
              (@accountName, @secondaryPasswordHash, @passwordHash, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0)
          `);

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), record.accountName)
          .input('leftSeconds', sql.Int, record.leftSeconds)
          .input('expiresAt', sql.DateTime, record.expiresAt)
          .query(`
            INSERT INTO dbo.Account_Habitus (cAccName, iLeftSecond, dEndDate, iUseSecond)
            VALUES (@accountName, @leftSeconds, @expiresAt, 0)
          `);

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async update(accountName: string, record: UpdateGameAccountRecord) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        const passwordAssignments = [
          record.passwordHash ? 'cPassWord = @passwordHash' : null,
          record.secondaryPasswordHash ? 'cSecPassWord = @secondaryPasswordHash' : null
        ].filter(Boolean).join(', ');

        if (passwordAssignments) {
          const request = new sql.Request(transaction).input('accountName', sql.VarChar(32), accountName);
          if (record.passwordHash) request.input('passwordHash', sql.VarChar(32), record.passwordHash);
          if (record.secondaryPasswordHash) request.input('secondaryPasswordHash', sql.VarChar(32), record.secondaryPasswordHash);
          await request.query(`UPDATE dbo.Account_Info SET ${passwordAssignments} WHERE cAccName = @accountName`);
        }

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .input('leftSeconds', sql.Int, record.leftSeconds)
          .input('expiresAt', sql.DateTime, record.expiresAt)
          .query(`UPDATE dbo.Account_Habitus SET iLeftSecond = @leftSeconds, dEndDate = @expiresAt WHERE cAccName = @accountName`);

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async softDelete(accountName: string) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('UPDATE dbo.Account_Info SET bIsBanned = 1 WHERE cAccName = @accountName');

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .input('endDate', sql.DateTime, '2050-10-10T10:10:10')
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Account_Ban WHERE cAccName = @accountName)
            BEGIN
              INSERT INTO dbo.Account_Ban (cAccName, dStartDate, dEndDate, iEndTime, cReason, cOperator, bIsBannedForever)
              VALUES (@accountName, GETDATE(), @endDate, 0, N'Deleted from manager', 'manager', 1)
            END
          `);

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }
  };
}
```

- [ ] **Step 4: Run backend tests and commit**

Run:

```bash
npm --workspace apps/api run test -- gameAccounts
npm --workspace apps/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/gameAccounts/mssqlGameAccountRepository.ts apps/api/src/gameAccounts/mssqlGameAccountRepository.test.ts
git commit -m "feat: add mssql account repository"
```

---

### Task 6: Frontend API Client Types

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Modify: `apps/ui/src/services/client.ts`

- [ ] **Step 1: Add account types**

Modify `apps/ui/src/services/types.ts`:

```ts
export type GameAccountStatus = 'active' | 'banned';

export type GameAccount = {
  accountName: string;
  expiresAt: string | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  status: GameAccountStatus;
};

export type GameAccountListResponse = {
  items: GameAccount[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CreateGameAccountPayload = {
  accountName: string;
  password: string;
  secondaryPassword: string;
  expiresAt: string;
  leftSeconds: number;
};

export type UpdateGameAccountPayload = {
  password?: string;
  secondaryPassword?: string;
  expiresAt: string;
  leftSeconds: number;
};
```

- [ ] **Step 2: Add client methods**

Modify `apps/ui/src/services/client.ts` imports and `api` object:

```ts
import type {
  CreateGameAccountPayload,
  GameAccount,
  GameAccountListResponse,
  UpdateGameAccountPayload
} from '@/services/types';

gameAccounts: (params: { search: string; page: number; pageSize: number }) => {
  const query = new URLSearchParams({ search: params.search, page: String(params.page), pageSize: String(params.pageSize) });
  return request<GameAccountListResponse>(`/api/game-accounts?${query.toString()}`);
},
createGameAccount: (payload: CreateGameAccountPayload) =>
  request<GameAccount>('/api/game-accounts', { method: 'POST', body: JSON.stringify(payload) }),
updateGameAccount: (accountName: string, payload: UpdateGameAccountPayload) =>
  request<GameAccount>(`/api/game-accounts/${encodeURIComponent(accountName)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
softDeleteGameAccount: (accountName: string) =>
  request<GameAccount>(`/api/game-accounts/${encodeURIComponent(accountName)}`, { method: 'DELETE' })
```

- [ ] **Step 3: Run typecheck and commit**

Run:

```bash
npm --workspace apps/ui run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/ui/src/services/types.ts apps/ui/src/services/client.ts
git commit -m "feat: add game account client"
```

---

### Task 7: Account Panel And Table

**Files:**
- Create: `apps/ui/src/features/gameAccounts/index.ts`
- Create: `apps/ui/src/features/gameAccounts/components/GameAccountPanel.tsx`
- Create: `apps/ui/src/features/gameAccounts/components/GameAccountTable.tsx`
- Create: `apps/ui/src/features/gameAccounts/components/GameAccountPanel.test.tsx`

- [ ] **Step 1: Write failing panel test**

Create `apps/ui/src/features/gameAccounts/components/GameAccountPanel.test.tsx`:

```tsx
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameAccountPanel } from './GameAccountPanel';

const gameAccounts = vi.fn().mockResolvedValue({
  items: [{ accountName: 'jxuser01', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }],
  pagination: { page: 1, pageSize: 10, total: 11, totalPages: 2 }
});

vi.mock('@/services/client', () => ({
  api: {
    gameAccounts,
    createGameAccount: vi.fn(),
    updateGameAccount: vi.fn(),
    softDeleteGameAccount: vi.fn()
  }
}));

describe('GameAccountPanel', () => {
  afterEach(() => cleanup());

  it('renders search, account rows, and pagination', async () => {
    renderWithProviders(<GameAccountPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByText('jxuser01')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tìm theo tên tài khoản')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm tài khoản' })).toBeTruthy();
    expect(screen.getByText('Hoạt động')).toBeTruthy();
  });

  it('searches and resets to page 1', async () => {
    renderWithProviders(<GameAccountPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('Tìm theo tên tài khoản'), { target: { value: 'abc' } });

    await waitFor(() => expect(gameAccounts).toHaveBeenCalledWith({ search: 'abc', page: 1, pageSize: 10 }));
  });
});
```

- [ ] **Step 2: Run panel test and verify it fails**

Run:

```bash
npm --workspace apps/ui run test -- GameAccountPanel.test.tsx
```

Expected: FAIL because account components do not exist.

- [ ] **Step 3: Implement table and panel shell**

Create `apps/ui/src/features/gameAccounts/index.ts`:

```ts
export { GameAccountPanel } from './components/GameAccountPanel';
```

Create `apps/ui/src/features/gameAccounts/components/GameAccountTable.tsx`:

```tsx
import { Badge, Button, Group, Table } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  accounts: GameAccount[];
  onEdit: (account: GameAccount) => void;
  onDelete: (account: GameAccount) => void;
};

export function GameAccountTable({ accounts, onEdit, onDelete }: Props) {
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Tài khoản</Table.Th>
          <Table.Th>Ngày hết hạn</Table.Th>
          <Table.Th>iLeftSecond</Table.Th>
          <Table.Th>Trạng thái</Table.Th>
          <Table.Th>Thao tác</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {accounts.map((account) => (
          <Table.Tr key={account.accountName}>
            <Table.Td>{account.accountName}</Table.Td>
            <Table.Td>{account.expiresAt ?? '-'}</Table.Td>
            <Table.Td>{account.leftSeconds ?? 0}</Table.Td>
            <Table.Td>
              <Badge color={account.status === 'banned' ? 'red' : 'green'}>{account.status === 'banned' ? 'Đã ban' : 'Hoạt động'}</Badge>
            </Table.Td>
            <Table.Td>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={() => onEdit(account)}>Sửa</Button>
                <Button size="xs" color="red" variant="light" onClick={() => onDelete(account)}>Xóa</Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

Create `apps/ui/src/features/gameAccounts/components/GameAccountPanel.tsx` with modal imports added in Task 8:

```tsx
import { Button, Group, Pagination, Stack, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/client';
import type { GameAccount } from '@/services/types';
import { GameAccountTable } from './GameAccountTable';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const pageSize = 10;

export function GameAccountPanel(_props: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingAccount, setEditingAccount] = useState<GameAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(null);
  const [createOpened, setCreateOpened] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['game-accounts', search, page, pageSize],
    queryFn: () => api.gameAccounts({ search, page, pageSize })
  });

  const data = accountsQuery.data ?? { items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };

  return (
    <Stack>
      <Group align="end">
        <TextInput
          placeholder="Tìm theo tên tài khoản"
          label="Tìm kiếm"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1 }}
        />
        <Button onClick={() => setCreateOpened(true)}>Thêm tài khoản</Button>
      </Group>
      <GameAccountTable accounts={data.items} onEdit={setEditingAccount} onDelete={setDeletingAccount} />
      {data.pagination.total > pageSize && <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />}
      <span hidden>{createOpened ? 'create-open' : 'create-closed'}{editingAccount?.accountName}{deletingAccount?.accountName}</span>
    </Stack>
  );
}
```

- [ ] **Step 4: Run test and commit**

Run:

```bash
npm --workspace apps/ui run test -- GameAccountPanel.test.tsx
npm --workspace apps/ui run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/ui/src/features/gameAccounts
git commit -m "feat: add game account list UI"
```

---

### Task 8: Mantine Form Modals And Mutations

**Files:**
- Create: `apps/ui/src/features/gameAccounts/components/CreateGameAccountModal.tsx`
- Create: `apps/ui/src/features/gameAccounts/components/EditGameAccountModal.tsx`
- Create: `apps/ui/src/features/gameAccounts/components/SoftDeleteAccountModal.tsx`
- Modify: `apps/ui/src/features/gameAccounts/components/GameAccountPanel.tsx`
- Create: `apps/ui/src/features/gameAccounts/components/GameAccountModals.test.tsx`

- [ ] **Step 1: Write failing modal tests**

Create `apps/ui/src/features/gameAccounts/components/GameAccountModals.test.tsx`:

```tsx
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { EditGameAccountModal } from './EditGameAccountModal';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';

describe('game account modals', () => {
  afterEach(() => cleanup());

  it('validates matching create passwords', async () => {
    const submit = vi.fn();
    renderWithProviders(<CreateGameAccountModal opened onClose={vi.fn()} onSubmit={submit} loading={false} />);

    fireEvent.change(screen.getByLabelText('Tên tài khoản'), { target: { value: 'jxuser' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'two' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu cấp 2'), { target: { value: 'pin' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu cấp 2'), { target: { value: 'pin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('omits blank passwords when editing', async () => {
    const submit = vi.fn();
    renderWithProviders(<EditGameAccountModal opened account={{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }} onClose={vi.fn()} onSubmit={submit} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({ expiresAt: '2027-06-10', leftSeconds: 0 }));
  });

  it('labels delete as banning the account', () => {
    renderWithProviders(<SoftDeleteAccountModal opened account={{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }} onClose={vi.fn()} onConfirm={vi.fn()} loading={false} />);

    expect(screen.getByText(/ban tài khoản/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run modal tests and verify they fail**

Run:

```bash
npm --workspace apps/ui run test -- GameAccountModals.test.tsx
```

Expected: FAIL because modal components do not exist.

- [ ] **Step 3: Implement modal components with `@mantine/form`**

Create `CreateGameAccountModal.tsx`:

```tsx
import { Button, Group, Modal, NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { CreateGameAccountPayload } from '@/services/types';

type Props = {
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateGameAccountPayload) => void;
};

type FormValues = CreateGameAccountPayload & {
  confirmPassword: string;
  confirmSecondaryPassword: string;
};

const accountNamePattern = /^[A-Za-z0-9_-]+$/;

function oneYearFromToday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function CreateGameAccountModal({ opened, loading, onClose, onSubmit }: Props) {
  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: {
      accountName: '',
      password: '',
      confirmPassword: '',
      secondaryPassword: '',
      confirmSecondaryPassword: '',
      expiresAt: oneYearFromToday(),
      leftSeconds: 0
    },
    validate: (values) => ({
      accountName: values.accountName.trim().length === 0
        ? 'Tên tài khoản là bắt buộc'
        : values.accountName.length > 32
          ? 'Tên tài khoản tối đa 32 ký tự'
          : accountNamePattern.test(values.accountName)
            ? null
            : 'Tên tài khoản chỉ gồm chữ, số, _ và -',
      password: values.password.trim().length === 0 ? 'Mật khẩu là bắt buộc' : null,
      confirmPassword: values.confirmPassword === values.password ? null : 'Mật khẩu xác nhận không khớp',
      secondaryPassword: values.secondaryPassword.trim().length === 0 ? 'Mật khẩu cấp 2 là bắt buộc' : null,
      confirmSecondaryPassword: values.confirmSecondaryPassword === values.secondaryPassword ? null : 'Mật khẩu cấp 2 xác nhận không khớp',
      expiresAt: values.expiresAt ? null : 'Ngày hết hạn là bắt buộc',
      leftSeconds: Number.isInteger(values.leftSeconds) && values.leftSeconds >= 0 ? null : 'iLeftSecond phải là số nguyên không âm'
    })
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Thêm tài khoản">
      <form
        onSubmit={form.onSubmit((values) => onSubmit({
          accountName: values.accountName.trim(),
          password: values.password,
          secondaryPassword: values.secondaryPassword,
          expiresAt: values.expiresAt,
          leftSeconds: values.leftSeconds
        }))}
      >
        <Stack>
          <TextInput label="Tên tài khoản" {...form.getInputProps('accountName')} />
          <PasswordInput label="Mật khẩu" {...form.getInputProps('password')} />
          <PasswordInput label="Xác nhận mật khẩu" {...form.getInputProps('confirmPassword')} />
          <PasswordInput label="Mật khẩu cấp 2" {...form.getInputProps('secondaryPassword')} />
          <PasswordInput label="Xác nhận mật khẩu cấp 2" {...form.getInputProps('confirmSecondaryPassword')} />
          <TextInput label="Ngày hết hạn" type="date" {...form.getInputProps('expiresAt')} />
          <NumberInput label="iLeftSecond" min={0} step={1} {...form.getInputProps('leftSeconds')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={loading}>Tạo tài khoản</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

Create `EditGameAccountModal.tsx`:

```tsx
import { Button, Group, Modal, NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { GameAccount, UpdateGameAccountPayload } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: UpdateGameAccountPayload) => void;
};

type FormValues = {
  password: string;
  confirmPassword: string;
  secondaryPassword: string;
  confirmSecondaryPassword: string;
  expiresAt: string;
  leftSeconds: number;
};

export function EditGameAccountModal({ opened, account, loading, onClose, onSubmit }: Props) {
  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: {
      password: '',
      confirmPassword: '',
      secondaryPassword: '',
      confirmSecondaryPassword: '',
      expiresAt: account?.expiresAt ?? '',
      leftSeconds: account?.leftSeconds ?? 0
    },
    validate: (values) => ({
      confirmPassword: values.password && values.confirmPassword !== values.password ? 'Mật khẩu xác nhận không khớp' : null,
      confirmSecondaryPassword: values.secondaryPassword && values.confirmSecondaryPassword !== values.secondaryPassword ? 'Mật khẩu cấp 2 xác nhận không khớp' : null,
      expiresAt: values.expiresAt ? null : 'Ngày hết hạn là bắt buộc',
      leftSeconds: Number.isInteger(values.leftSeconds) && values.leftSeconds >= 0 ? null : 'iLeftSecond phải là số nguyên không âm'
    })
  });

  useEffect(() => {
    if (opened && account) {
      form.setValues({
        password: '',
        confirmPassword: '',
        secondaryPassword: '',
        confirmSecondaryPassword: '',
        expiresAt: account.expiresAt ?? '',
        leftSeconds: account.leftSeconds ?? 0
      });
    }
  }, [opened, account?.accountName]);

  return (
    <Modal opened={opened} onClose={onClose} title="Sửa tài khoản">
      <form
        onSubmit={form.onSubmit((values) => onSubmit({
          ...(values.password ? { password: values.password } : {}),
          ...(values.secondaryPassword ? { secondaryPassword: values.secondaryPassword } : {}),
          expiresAt: values.expiresAt,
          leftSeconds: values.leftSeconds
        }))}
      >
        <Stack>
          <TextInput label="Tên tài khoản" value={account?.accountName ?? ''} readOnly />
          <PasswordInput label="Mật khẩu mới" {...form.getInputProps('password')} />
          <PasswordInput label="Xác nhận mật khẩu" {...form.getInputProps('confirmPassword')} />
          <PasswordInput label="Mật khẩu cấp 2 mới" {...form.getInputProps('secondaryPassword')} />
          <PasswordInput label="Xác nhận mật khẩu cấp 2" {...form.getInputProps('confirmSecondaryPassword')} />
          <TextInput label="Ngày hết hạn" type="date" {...form.getInputProps('expiresAt')} />
          <NumberInput label="iLeftSecond" min={0} step={1} {...form.getInputProps('leftSeconds')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={loading}>Lưu thay đổi</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

Create `SoftDeleteAccountModal.tsx`:

```tsx
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { GameAccount } from '@/services/types';

type Props = {
  opened: boolean;
  account: GameAccount | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SoftDeleteAccountModal({ opened, account, loading, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Xóa tài khoản">
      <Stack>
        <Text>Thao tác này sẽ ban tài khoản {account?.accountName}, không xóa dữ liệu khỏi database.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Hủy</Button>
          <Button color="red" loading={loading} onClick={onConfirm}>Ban tài khoản</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

Wire mutations in `GameAccountPanel.tsx`. Update imports:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { EditGameAccountModal } from './EditGameAccountModal';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';
```

Rename the component parameter from `_props` to `props`, then add the mutations inside `GameAccountPanel` after the `accountsQuery` declaration:

```tsx
const queryClient = useQueryClient();
const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: ['game-accounts'] });

const createMutation = useMutation({
  mutationFn: api.createGameAccount,
  onSuccess: async () => { props.onSuccess('Đã tạo tài khoản'); setCreateOpened(false); await invalidateAccounts(); },
  onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể tạo tài khoản')
});

const updateMutation = useMutation({
  mutationFn: (payload: { accountName: string; values: Parameters<typeof api.updateGameAccount>[1] }) => api.updateGameAccount(payload.accountName, payload.values),
  onSuccess: async () => { props.onSuccess('Đã cập nhật tài khoản'); setEditingAccount(null); await invalidateAccounts(); },
  onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản')
});

const softDeleteMutation = useMutation({
  mutationFn: api.softDeleteGameAccount,
  onSuccess: async () => { props.onSuccess('Đã ban tài khoản'); setDeletingAccount(null); await invalidateAccounts(); },
  onError: (error) => props.onError(error instanceof Error ? error.message : 'Không thể ban tài khoản')
});
```

Render the modals after the pagination block:

```tsx
<CreateGameAccountModal
  opened={createOpened}
  loading={createMutation.isPending}
  onClose={() => setCreateOpened(false)}
  onSubmit={(payload) => createMutation.mutate(payload)}
/>
<EditGameAccountModal
  opened={editingAccount !== null}
  account={editingAccount}
  loading={updateMutation.isPending}
  onClose={() => setEditingAccount(null)}
  onSubmit={(values) => editingAccount && updateMutation.mutate({ accountName: editingAccount.accountName, values })}
/>
<SoftDeleteAccountModal
  opened={deletingAccount !== null}
  account={deletingAccount}
  loading={softDeleteMutation.isPending}
  onClose={() => setDeletingAccount(null)}
  onConfirm={() => deletingAccount && softDeleteMutation.mutate(deletingAccount.accountName)}
/>
```

- [ ] **Step 4: Run UI tests and commit**

Run:

```bash
npm --workspace apps/ui run test -- gameAccounts
npm --workspace apps/ui run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/ui/src/features/gameAccounts
git commit -m "feat: add game account modals"
```

---

### Task 9: App Routing And Final Verification

**Files:**
- Modify: `apps/ui/src/App.tsx`
- Modify: `apps/ui/src/App.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write failing app routing test**

Modify `apps/ui/src/App.test.tsx` to include:

```tsx
it('shows game account tab and route', async () => {
  renderWithProviders(<App />, { route: '/game-accounts' });

  expect(await screen.findByRole('tab', { name: 'Tài khoản game' })).toBeTruthy();
  expect(screen.getByPlaceholderText('Tìm theo tên tài khoản')).toBeTruthy();
});
```

Extend the existing `vi.mock('@/services/client', ...)` object in `App.test.tsx` with:

```ts
gameAccounts: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } }),
createGameAccount: vi.fn(),
updateGameAccount: vi.fn(),
softDeleteGameAccount: vi.fn()
```

- [ ] **Step 2: Run app test and verify it fails**

Run:

```bash
npm --workspace apps/ui run test -- App.test.tsx
```

Expected: FAIL because `/game-accounts` route and tab are not registered.

- [ ] **Step 3: Register the UI route**

Modify `apps/ui/src/App.tsx`:

```tsx
import { GameAccountPanel } from '@/features/gameAccounts';

const activeRootTab = location.pathname.startsWith('/backup')
  ? 'backup'
  : location.pathname.startsWith('/game-accounts')
    ? 'game-accounts'
    : 'dashboard';

<Tabs value={activeRootTab} onChange={(value) => navigate(value === 'backup' ? '/backup/files' : value === 'game-accounts' ? '/game-accounts' : '/dashboard')}>
  <Tabs.List mb="md">
    <Tabs.Tab value="dashboard">Bảng điều khiển & Logs</Tabs.Tab>
    <Tabs.Tab value="backup">Sao lưu (Backup)</Tabs.Tab>
    <Tabs.Tab value="game-accounts">Tài khoản game</Tabs.Tab>
  </Tabs.List>
</Tabs>

<Route
  path="/game-accounts"
  element={<GameAccountPanel onSuccess={showSuccess} onError={showError} />}
/>
```

- [ ] **Step 4: Document MSSQL env vars**

Add to `README.md`:

```md
## Game account management MSSQL settings

The account manager uses the `account_tong` MSSQL database. Configure credentials with environment variables:

```bash
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=account_tong
MSSQL_USER=sa
MSSQL_PASSWORD=<set locally>
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
```

The app does not hardcode MSSQL username or password. Account delete in the UI is a soft delete: it bans the account and keeps rows visible in the list.
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run typecheck
npm run test
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

Commit:

```bash
git add apps/ui/src/App.tsx apps/ui/src/App.test.tsx README.md
git commit -m "feat: add game account route"
```

---

## Self-Review Notes

- Spec coverage: account list/search/pagination, create modal, edit modal, soft delete as ban, Mantine form usage, backend API, MSSQL env config, and test coverage are each mapped to tasks above.
- Scope control: physical deletion, account rename, `nExtPoint` editing, OTP, profile data, character management, and auth changes are not included.
- Type consistency: API uses `accountName`, `expiresAt`, `leftSeconds`, `usedSeconds`, and `status` consistently across backend and frontend.
