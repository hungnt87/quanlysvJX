# Fastify Layered API Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Fastify API to Pattern 1: Layered Architecture, replace the legacy `{ success, data, error }` envelope with the `nodejs-backend-patterns` response format, add global error handling and Zod validation middleware, then update the UI API client.

**Architecture:** Routes only register Fastify endpoints and validation, controllers map HTTP input/output, services own business logic, and repositories/domain utilities own data access or external process calls. JSON endpoints use `status/message/data/errors/pagination`; SSE and file download keep transport-specific output but reuse shared errors and clear messages.

**Tech Stack:** Fastify, TypeScript, Zod, Vitest, Axios, Mantine notifications.

---

## File Structure

Create:

- `apps/api/src/utils/response.ts` - API response helpers for success, error and pagination.
- `apps/api/src/utils/errors.ts` - canonical application error classes and validation issue type.
- `apps/api/src/middleware/errorHandler.ts` - Fastify global error handler.
- `apps/api/src/middleware/validate.ts` - Zod request validation middleware.
- `apps/api/src/controllers/healthController.ts`
- `apps/api/src/services/healthService.ts`
- `apps/api/src/controllers/envController.ts`
- `apps/api/src/services/envService.ts`
- `apps/api/src/controllers/systemController.ts`
- `apps/api/src/services/systemService.ts`
- `apps/api/src/controllers/versionController.ts`
- `apps/api/src/services/versionManagerService.ts`
- `apps/api/src/controllers/serviceController.ts`
- `apps/api/src/services/managerService.ts`
- `apps/api/src/controllers/logController.ts`
- `apps/api/src/services/logService.ts`
- `apps/api/src/controllers/backupController.ts`
- `apps/api/src/services/backupService.ts`
- `apps/api/src/controllers/scheduledBackupController.ts`
- `apps/api/src/services/scheduledBackupApiService.ts`
- `apps/api/src/controllers/gameAccountController.ts`
- `apps/api/src/services/gameAccountApiService.ts`
- `apps/api/src/routes/*Schemas.ts` files where schemas are specific to route groups.
- Tests next to new utilities/controllers/services where practical.

Modify:

- `apps/api/src/app.ts` - wire global error handler, remove inline error handler.
- `apps/api/src/routes/*.ts` - shrink routes to validate plus controller calls.
- `apps/api/src/api/envelope.ts` - delete after all imports are gone.
- `apps/api/src/api/errors.ts` - replace imports with `utils/errors.ts`, then delete after all imports are gone.
- `apps/ui/src/services/types.ts` - update response types.
- `apps/ui/src/services/base/baseService.ts` - read new response shape.
- API and UI tests that assert the old envelope.

Do not move all domain utility files in the first pass. Files under `backups/`, `versions/`, `gameAccounts/`, `services/`, `system/`, and `env/` can remain as implementation utilities behind new service classes.

---

### Task 1: Foundation Response, Errors, Validation, Error Handler

**Files:**
- Create: `apps/api/src/utils/response.ts`
- Create: `apps/api/src/utils/errors.ts`
- Create: `apps/api/src/middleware/errorHandler.ts`
- Create: `apps/api/src/middleware/validate.ts`
- Create: `apps/api/src/utils/response.test.ts`
- Create: `apps/api/src/middleware/validate.test.ts`
- Create: `apps/api/src/middleware/errorHandler.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write response helper tests**

Create `apps/api/src/utils/response.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { apiError, apiPaginated, apiSuccess } from './response.js';

describe('api response helpers', () => {
  it('builds success responses with optional message', () => {
    expect(apiSuccess({ status: 'ok' }, 'Ready')).toEqual({
      status: 'success',
      message: 'Ready',
      data: { status: 'ok' }
    });
  });

  it('builds error responses with validation errors', () => {
    expect(apiError('Validation failed', [{ field: 'body.name', message: 'Required' }])).toEqual({
      status: 'error',
      message: 'Validation failed',
      errors: [{ field: 'body.name', message: 'Required' }]
    });
  });

  it('builds paginated responses', () => {
    expect(apiPaginated(['a', 'b'], { page: 2, limit: 2, total: 5 })).toEqual({
      status: 'success',
      data: ['a', 'b'],
      pagination: { page: 2, limit: 2, total: 5, pages: 3 }
    });
  });
});
```

- [ ] **Step 2: Run response helper test red**

Run:

```sh
npm --workspace apps/api test -- response
```

Expected: FAIL because `apps/api/src/utils/response.ts` does not exist.

- [ ] **Step 3: Implement response helper**

Create `apps/api/src/utils/response.ts`:

```ts
export type ApiStatus = 'success' | 'error';

export type ApiValidationIssue = {
  field: string;
  message: string;
};

export type ApiSuccess<T> = {
  status: 'success';
  message?: string;
  data: T;
};

export type ApiError = {
  status: 'error';
  message: string;
  errors?: ApiValidationIssue[];
};

export type ApiPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type ApiPaginated<T> = {
  status: 'success';
  data: T[];
  pagination: ApiPagination;
};

export function apiSuccess<T>(data: T, message?: string): ApiSuccess<T> {
  return message ? { status: 'success', message, data } : { status: 'success', data };
}

export function apiError(message: string, errors?: ApiValidationIssue[]): ApiError {
  return errors && errors.length > 0
    ? { status: 'error', message, errors }
    : { status: 'error', message };
}

export function apiPaginated<T>(
  data: T[],
  options: { page: number; limit: number; total: number }
): ApiPaginated<T> {
  return {
    status: 'success',
    data,
    pagination: {
      ...options,
      pages: Math.ceil(options.total / options.limit)
    }
  };
}
```

- [ ] **Step 4: Write validation middleware tests**

Create `apps/api/src/middleware/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { validateRequestParts } from './validate.js';

describe('validateRequestParts', () => {
  it('returns parsed body/query/params', async () => {
    const parsed = await validateRequestParts(
      {
        body: z.object({ name: z.string().min(1) }),
        query: z.object({ tail: z.coerce.number().int().min(1) }),
        params: z.object({ id: z.string().min(1) })
      },
      {
        body: { name: 'mel' },
        query: { tail: '50' },
        params: { id: 'abc' }
      }
    );

    expect(parsed).toEqual({
      body: { name: 'mel' },
      query: { tail: 50 },
      params: { id: 'abc' }
    });
  });

  it('throws ValidationError with field paths', async () => {
    await expect(
      validateRequestParts(
        { body: z.object({ name: z.string().min(1) }) },
        { body: { name: '' }, query: {}, params: {} }
      )
    ).rejects.toMatchObject({
      message: 'Validation failed',
      issues: [{ field: 'body.name', message: expect.any(String) }]
    } satisfies Partial<ValidationError>);
  });
});
```

- [ ] **Step 5: Implement errors and validation middleware**

Create `apps/api/src/utils/errors.ts`:

```ts
import type { ApiValidationIssue } from './response.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues: ApiValidationIssue[] = []
  ) {
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

Create `apps/api/src/middleware/validate.ts`:

```ts
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import { ValidationError } from '../utils/errors.js';

export type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

type RequestParts = {
  body: unknown;
  query: unknown;
  params: unknown;
};

export async function validateRequestParts(schemas: RequestSchemas, parts: RequestParts): Promise<RequestParts> {
  return {
    body: await parsePart('body', schemas.body, parts.body),
    query: await parsePart('query', schemas.query, parts.query),
    params: await parsePart('params', schemas.params, parts.params)
  };
}

async function parsePart(prefix: string, schema: ZodType | undefined, value: unknown): Promise<unknown> {
  if (!schema) {
    return value;
  }

  try {
    return await schema.parseAsync(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Validation failed',
        error.issues.map((issue) => ({
          field: `${prefix}.${issue.path.join('.')}`,
          message: issue.message
        }))
      );
    }
    throw error;
  }
}

export function validate(schemas: RequestSchemas): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const parsed = await validateRequestParts(schemas, {
      body: request.body,
      query: request.query,
      params: request.params
    });

    request.body = parsed.body;
    request.query = parsed.query;
    request.params = parsed.params;
  };
}
```

- [ ] **Step 6: Write error handler integration tests**

Create `apps/api/src/middleware/errorHandler.test.ts`:

```ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../utils/errors.js';
import { registerErrorHandler } from './errorHandler.js';

describe('registerErrorHandler', () => {
  it('returns AppError using new API response format', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/boom', async () => {
      throw new ValidationError('Validation failed', [{ field: 'body.name', message: 'Required' }]);
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      status: 'error',
      message: 'Validation failed',
      errors: [{ field: 'body.name', message: 'Required' }]
    });
  });

  it('hides unexpected errors from clients', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/boom', async () => {
      throw new Error('secret stack detail');
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ status: 'error', message: 'Internal server error' });
  });
});
```

- [ ] **Step 7: Implement global error handler**

Create `apps/api/src/middleware/errorHandler.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { AppError, ValidationError } from '../utils/errors.js';
import { apiError } from '../utils/response.js';

type HttpClientError = {
  statusCode: number;
  message: string;
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      void reply.status(error.statusCode).send(apiError(error.message, error.issues));
      return;
    }

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(apiError(error.message));
      return;
    }

    if (isHttpClientError(error)) {
      void reply.status(error.statusCode).send(apiError(error.message));
      return;
    }

    app.log.error({ err: error }, 'Unhandled manager API error');
    void reply.status(500).send(apiError('Internal server error'));
  });
}

function isHttpClientError(error: unknown): error is HttpClientError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    typeof error.message === 'string'
  );
}
```

- [ ] **Step 8: Wire error handler in app.ts**

Modify `apps/api/src/app.ts`:

```ts
import { registerErrorHandler } from './middleware/errorHandler.js';
```

Remove these imports:

```ts
import { fail } from './api/envelope.js';
import { AppError } from './api/errors.js';
```

Replace the inline `app.setErrorHandler(...)` block with:

```ts
  registerErrorHandler(app);
```

Delete the local `isHttpClientError` function at the bottom of `app.ts`.

- [ ] **Step 9: Run foundation checks**

Run:

```sh
npm --workspace apps/api test -- response validate errorHandler
npm --workspace apps/api run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit foundation**

Run:

```sh
git add apps/api/src/utils/response.ts apps/api/src/utils/response.test.ts apps/api/src/utils/errors.ts apps/api/src/middleware/validate.ts apps/api/src/middleware/validate.test.ts apps/api/src/middleware/errorHandler.ts apps/api/src/middleware/errorHandler.test.ts apps/api/src/app.ts
git commit -m "refactor: add fastify api foundation"
```

---

### Task 2: Refactor Simple Routes (Health, Env, System)

**Files:**
- Create: `apps/api/src/controllers/healthController.ts`
- Create: `apps/api/src/services/healthService.ts`
- Create: `apps/api/src/controllers/envController.ts`
- Create: `apps/api/src/services/envService.ts`
- Create: `apps/api/src/controllers/systemController.ts`
- Create: `apps/api/src/services/systemService.ts`
- Create: `apps/api/src/routes/envSchemas.ts`
- Create: `apps/api/src/routes/systemSchemas.ts`
- Modify: `apps/api/src/routes/healthRoutes.ts`
- Modify: `apps/api/src/routes/envRoutes.ts`
- Modify: `apps/api/src/routes/systemRoutes.ts`
- Modify: `apps/api/src/routes/systemRoutes.test.ts`
- Add or modify env route tests if no direct coverage exists.

- [ ] **Step 1: Update tests to expect new response format**

In `apps/api/src/routes/systemRoutes.test.ts`, replace assertions like:

```ts
expect(response.json().data).toMatchObject({
  serverIp: '192.168.1.20'
});
```

with:

```ts
expect(response.json()).toMatchObject({
  status: 'success',
  data: {
    serverIp: '192.168.1.20'
  }
});
```

Replace:

```ts
expect(response.json().data.message).toBe('Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.');
```

with:

```ts
expect(response.json().message).toBe('Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.');
expect(response.json().data.gameNetwork).toMatchObject({
  jxIp: '192.168.1.20',
  mysqlIp: '10.0.0.8',
  paysysIp: '172.18.0.1',
  mssqlIp: '8.8.8.8'
});
```

Add a validation assertion:

```ts
expect(badResponse.json()).toMatchObject({
  status: 'error',
  message: expect.any(String)
});
```

- [ ] **Step 2: Run simple route tests red**

Run:

```sh
npm --workspace apps/api test -- systemRoutes
```

Expected: FAIL because routes still return legacy envelope.

- [ ] **Step 3: Add health service and controller**

Create `apps/api/src/services/healthService.ts`:

```ts
export type HealthStatus = {
  status: 'ok';
};

export class HealthService {
  getHealth(): HealthStatus {
    return { status: 'ok' };
  }
}
```

Create `apps/api/src/controllers/healthController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { HealthService } from '../services/healthService.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  getHealth() {
    return apiSuccess(this.healthService.getHealth());
  }
}
```

Modify `apps/api/src/routes/healthRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/healthController.js';
import { HealthService } from '../services/healthService.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  const controller = new HealthController(new HealthService());
  app.get('/api/health', async () => controller.getHealth());
}
```

- [ ] **Step 4: Add env schemas, service and controller**

Create `apps/api/src/routes/envSchemas.ts`:

```ts
import { z } from 'zod';

export const saveEnvSchema = z.object({
  content: z.string()
});

export type SaveEnvInput = z.infer<typeof saveEnvSchema>;
```

Create `apps/api/src/services/envService.ts`:

```ts
import fs from 'node:fs';

export class EnvService {
  constructor(private readonly envFilePath: string) {}

  readEnv(): { content: string } {
    if (!fs.existsSync(this.envFilePath)) {
      return { content: '' };
    }
    return { content: fs.readFileSync(this.envFilePath, 'utf8') };
  }

  saveEnv(content: string): { content: string } {
    fs.writeFileSync(this.envFilePath, content, 'utf8');
    return { content };
  }
}
```

Create `apps/api/src/controllers/envController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { EnvService } from '../services/envService.js';
import type { SaveEnvInput } from '../routes/envSchemas.js';

export class EnvController {
  constructor(private readonly envService: EnvService) {}

  getEnv() {
    return apiSuccess(this.envService.readEnv());
  }

  saveEnv(input: SaveEnvInput) {
    const result = this.envService.saveEnv(input.content);
    return apiSuccess(result, 'Env configuration saved successfully');
  }
}
```

Modify `apps/api/src/routes/envRoutes.ts`:

```ts
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { EnvController } from '../controllers/envController.js';
import { EnvService } from '../services/envService.js';
import { validate } from '../middleware/validate.js';
import { saveEnvSchema, type SaveEnvInput } from './envSchemas.js';

export async function registerEnvRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');
  const controller = new EnvController(new EnvService(envFilePath));

  app.get('/api/env', async () => controller.getEnv());
  app.post<{ Body: SaveEnvInput }>(
    '/api/env',
    { preHandler: validate({ body: saveEnvSchema }) },
    async (request) => controller.saveEnv(request.body)
  );
}
```

- [ ] **Step 5: Add system schemas, service and controller**

Create `apps/api/src/routes/systemSchemas.ts`:

```ts
import { z } from 'zod';

export const gameNetworkSchema = z.object({
  jxIp: z.string().min(1),
  mysqlIp: z.string().min(1),
  paysysIp: z.string().min(1),
  mssqlIp: z.string().min(1)
});

export type GameNetworkInput = z.infer<typeof gameNetworkSchema>;
```

Create `apps/api/src/services/systemService.ts`:

```ts
import type { AppDeps } from '../app.js';
import { ValidationError } from '../utils/errors.js';
import { parseManagedServiceStatuses } from './serviceStatus.js';
import {
  buildSystemInfo,
  getServerIpChoiceDetails,
  getServerIpChoices,
  saveGameNetworkConfig,
  validateGameNetworkPayload
} from '../system/systemInfo.js';
import type { GameNetworkInput } from '../routes/systemSchemas.js';

export class SystemService {
  constructor(
    private readonly deps: AppDeps,
    private readonly envFilePath: string
  ) {}

  async getSystemInfo() {
    const serverIpChoices = getServerIpChoiceDetails();
    return buildSystemInfo({
      envFilePath: this.envFilePath,
      serverIpChoices,
      coreServices: await this.readCoreServices()
    });
  }

  saveGameNetwork(input: GameNetworkInput) {
    try {
      const payload = validateGameNetworkPayload(input, getServerIpChoices());
      saveGameNetworkConfig(this.envFilePath, payload);
      return { gameNetwork: payload };
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'IP không hợp lệ.');
    }
  }

  private async readCoreServices() {
    const result = await this.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      return [];
    }
    return parseManagedServiceStatuses(result.stdout).map((service) => ({
      name: service.name,
      state: service.state
    }));
  }
}
```

Create `apps/api/src/controllers/systemController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { SystemService } from '../services/systemService.js';
import type { GameNetworkInput } from '../routes/systemSchemas.js';

export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  async getSystemInfo() {
    return apiSuccess(await this.systemService.getSystemInfo());
  }

  saveGameNetwork(input: GameNetworkInput) {
    return apiSuccess(
      this.systemService.saveGameNetwork(input),
      'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
    );
  }
}
```

Modify `apps/api/src/routes/systemRoutes.ts`:

```ts
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { SystemController } from '../controllers/systemController.js';
import { SystemService } from '../services/systemService.js';
import { validate } from '../middleware/validate.js';
import { gameNetworkSchema, type GameNetworkInput } from './systemSchemas.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');
  const controller = new SystemController(new SystemService(app.deps, envFilePath));

  app.get('/api/system/info', async () => controller.getSystemInfo());
  app.put<{ Body: GameNetworkInput }>(
    '/api/system/game-network',
    { preHandler: validate({ body: gameNetworkSchema }) },
    async (request) => controller.saveGameNetwork(request.body)
  );
}
```

- [ ] **Step 6: Run simple route checks**

Run:

```sh
npm --workspace apps/api test -- systemRoutes
npm --workspace apps/api run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit simple routes**

Run:

```sh
git add apps/api/src/controllers/healthController.ts apps/api/src/services/healthService.ts apps/api/src/controllers/envController.ts apps/api/src/services/envService.ts apps/api/src/controllers/systemController.ts apps/api/src/services/systemService.ts apps/api/src/routes/envSchemas.ts apps/api/src/routes/systemSchemas.ts apps/api/src/routes/healthRoutes.ts apps/api/src/routes/envRoutes.ts apps/api/src/routes/systemRoutes.ts apps/api/src/routes/systemRoutes.test.ts
git commit -m "refactor: layer simple api routes"
```

---

### Task 3: Refactor Version, Service and Log Routes

**Files:**
- Create: `apps/api/src/routes/versionSchemas.ts`
- Create: `apps/api/src/controllers/versionController.ts`
- Create: `apps/api/src/services/versionManagerService.ts`
- Create: `apps/api/src/routes/serviceSchemas.ts`
- Create: `apps/api/src/controllers/serviceController.ts`
- Create: `apps/api/src/services/managerService.ts`
- Create: `apps/api/src/routes/logSchemas.ts`
- Create: `apps/api/src/controllers/logController.ts`
- Create: `apps/api/src/services/logService.ts`
- Modify: `apps/api/src/routes/versionRoutes.ts`
- Modify: `apps/api/src/routes/serviceRoutes.ts`
- Modify: `apps/api/src/routes/logRoutes.ts`
- Modify: related tests under `apps/api/src/routes/*Routes.test.ts`

- [ ] **Step 1: Update route tests for new schema**

In version/service/log route tests:

- Replace `response.json().data` assertions with `response.json().data`.
- Add `expect(response.json().status).toBe('success')` for success responses.
- Replace `response.json().error` with `response.json().message`.
- For validation errors, assert:

```ts
expect(response.json()).toMatchObject({
  status: 'error',
  message: expect.any(String)
});
```

For successful commands returning a message, assert top-level message when the controller promotes it:

```ts
expect(response.json()).toMatchObject({
  status: 'success',
  message: 'Started jxmysql'
});
```

- [ ] **Step 2: Create version schemas**

Create `apps/api/src/routes/versionSchemas.ts`:

```ts
import { z } from 'zod';

export const versionNameSchema = z.string().regex(/^[A-Za-z0-9_-]{1,10}$/);

export const versionParamsSchema = z.object({
  name: versionNameSchema
});

export const selectVersionSchema = z.object({
  name: versionNameSchema,
  subPath: z.string().optional()
});

export const cloneVersionSchema = z.object({
  name: versionNameSchema,
  url: z.string().url(),
  branch: z.string().trim().min(1).default('main')
});

export const renameVersionSchema = z
  .object({
    name: versionNameSchema.optional()
  })
  .refine((value) => value.name !== undefined, 'Tên phiên bản mới là bắt buộc');

export const browseVersionQuerySchema = z.object({
  path: z.string().optional()
});

export type VersionParams = z.infer<typeof versionParamsSchema>;
export type SelectVersionInput = z.infer<typeof selectVersionSchema>;
export type CloneVersionInput = z.infer<typeof cloneVersionSchema>;
export type RenameVersionInput = z.infer<typeof renameVersionSchema>;
export type BrowseVersionQuery = z.infer<typeof browseVersionQuerySchema>;
```

- [ ] **Step 3: Create version service/controller**

Create `apps/api/src/services/versionManagerService.ts` by moving business logic from `apps/api/src/routes/versionRoutes.ts` into a class. Keep helper functions `extractArchive`, `runCommand`, `applyVersionFolderPermissions`, `assertActiveVersionCanBeDeleted`, and version error mapping inside this service file. The public methods must be:

```ts
export class VersionManagerService {
  constructor(private readonly deps: AppDeps) {}
  listVersions(): VersionListResponse;
  selectVersion(input: SelectVersionInput): { activeVersion: string; serverPath: string };
  renameVersion(currentName: string, input: RenameVersionInput): GameVersion;
  cloneVersion(input: CloneVersionInput): GameVersion;
  uploadVersion(request: FastifyRequest): Promise<GameVersion>;
  deleteVersion(name: string): Promise<{ name: string }>;
  browseVersion(name: string, query: BrowseVersionQuery): BrowseVersionResponse;
}
```

Use existing imports from `versionRoutes.ts`. Convert Fastify `app.httpErrors.*` usage to `NotFoundError`, `ConflictError`, `ValidationError`, or `CommandError` from `utils/errors.ts`.

Create `apps/api/src/controllers/versionController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { VersionManagerService } from '../services/versionManagerService.js';
import type {
  BrowseVersionQuery,
  CloneVersionInput,
  RenameVersionInput,
  SelectVersionInput
} from '../routes/versionSchemas.js';

export class VersionController {
  constructor(private readonly versionService: VersionManagerService) {}

  listVersions() {
    return apiSuccess(this.versionService.listVersions());
  }

  selectVersion(input: SelectVersionInput) {
    const result = this.versionService.selectVersion(input);
    return apiSuccess(result, `Đã kích hoạt phiên bản: ${result.activeVersion} (${result.serverPath})`);
  }

  renameVersion(currentName: string, input: RenameVersionInput) {
    return apiSuccess(this.versionService.renameVersion(currentName, input), 'Đã đổi tên phiên bản game thành công');
  }

  cloneVersion(input: CloneVersionInput) {
    return apiSuccess(this.versionService.cloneVersion(input), 'Clone thành công phiên bản game từ GitHub');
  }

  async uploadVersion(request: Parameters<VersionManagerService['uploadVersion']>[0]) {
    return apiSuccess(await this.versionService.uploadVersion(request), 'Upload và giải nén phiên bản game thành công');
  }

  async deleteVersion(name: string) {
    return apiSuccess(await this.versionService.deleteVersion(name), 'Version deleted successfully');
  }

  browseVersion(name: string, query: BrowseVersionQuery) {
    return apiSuccess(this.versionService.browseVersion(name, query));
  }
}
```

- [ ] **Step 4: Shrink version routes**

Modify `apps/api/src/routes/versionRoutes.ts` to only wire controller, schemas and validation:

```ts
import type { FastifyInstance } from 'fastify';
import { VersionController } from '../controllers/versionController.js';
import { VersionManagerService } from '../services/versionManagerService.js';
import { validate } from '../middleware/validate.js';
import {
  browseVersionQuerySchema,
  cloneVersionSchema,
  renameVersionSchema,
  selectVersionSchema,
  versionParamsSchema,
  type BrowseVersionQuery,
  type CloneVersionInput,
  type RenameVersionInput,
  type SelectVersionInput,
  type VersionParams
} from './versionSchemas.js';

export async function registerVersionRoutes(app: FastifyInstance) {
  const controller = new VersionController(new VersionManagerService(app.deps));

  app.get('/api/versions', async () => controller.listVersions());
  app.post<{ Body: SelectVersionInput }>(
    '/api/versions/select',
    { preHandler: validate({ body: selectVersionSchema }) },
    async (request) => controller.selectVersion(request.body)
  );
  app.patch<{ Params: VersionParams; Body: RenameVersionInput }>(
    '/api/versions/:name',
    { preHandler: validate({ params: versionParamsSchema, body: renameVersionSchema }) },
    async (request) => controller.renameVersion(request.params.name, request.body)
  );
  app.post<{ Body: CloneVersionInput }>(
    '/api/versions/clone',
    { preHandler: validate({ body: cloneVersionSchema }) },
    async (request) => controller.cloneVersion(request.body)
  );
  app.post('/api/versions/upload', async (request) => controller.uploadVersion(request));
  app.delete<{ Params: VersionParams }>(
    '/api/versions/:name',
    { preHandler: validate({ params: versionParamsSchema }) },
    async (request) => controller.deleteVersion(request.params.name)
  );
  app.get<{ Params: VersionParams; Querystring: BrowseVersionQuery }>(
    '/api/versions/:name/browse',
    { preHandler: validate({ params: versionParamsSchema, query: browseVersionQuerySchema }) },
    async (request) => controller.browseVersion(request.params.name, request.query)
  );
}
```

- [ ] **Step 5: Refactor service routes**

Create `apps/api/src/routes/serviceSchemas.ts`:

```ts
import { z } from 'zod';

export const serviceParamsSchema = z.object({ name: z.string().min(1) });
export const prepareImagesQuerySchema = z.object({ services: z.string().min(1) });

export type ServiceParams = z.infer<typeof serviceParamsSchema>;
export type PrepareImagesQuery = z.infer<typeof prepareImagesQuerySchema>;
```

Create `apps/api/src/services/managerService.ts` by moving non-SSE business logic from `serviceRoutes.ts`:

```ts
export class ManagerService {
  constructor(private readonly deps: AppDeps) {}
  listServices(): Promise<ServiceStatus[]>;
  startService(name: string): Promise<{ message: string; stdout: string; stderr: string }>;
  stopService(name: string): Promise<{ message: string; stdout: string; stderr: string }>;
  restartService(name: string): Promise<{ message: string; stdout: string; stderr: string }>;
  prepareImagesStream(input: { services: string[]; signal: AbortSignal; emit: (event: PrepareServiceEvent) => void }): Promise<void>;
  startServiceStream(input: { serviceName: string; signal: AbortSignal; emit: (event: StartServiceEvent) => void }): Promise<void>;
}
```

Keep `cachedComposeConfig`, `assertActiveVersion`, `preHandleStopDependency`, `runAction`, and `formatActionError` in `managerService.ts`. Replace `../api/errors.js` imports with `../utils/errors.js`.

Create `apps/api/src/controllers/serviceController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { ManagerService } from '../services/managerService.js';

export class ServiceController {
  constructor(private readonly managerService: ManagerService) {}

  async listServices() {
    return apiSuccess(await this.managerService.listServices());
  }

  async startService(name: string) {
    const result = await this.managerService.startService(name);
    return apiSuccess(result, result.message);
  }

  async stopService(name: string) {
    const result = await this.managerService.stopService(name);
    return apiSuccess(result, result.message);
  }

  async restartService(name: string) {
    const result = await this.managerService.restartService(name);
    return apiSuccess(result, result.message);
  }
}
```

Modify `apps/api/src/routes/serviceRoutes.ts` so JSON endpoints call controller. Keep SSE write/head logic in the route, but move command orchestration into `ManagerService.prepareImagesStream` and `ManagerService.startServiceStream`.

- [ ] **Step 6: Refactor log routes**

Create `apps/api/src/routes/logSchemas.ts`:

```ts
import { z } from 'zod';

export const logParamsSchema = z.object({ name: z.string().min(1) });
export const logQuerySchema = z.object({ tail: z.string().optional() });

export type LogParams = z.infer<typeof logParamsSchema>;
export type LogQuery = z.infer<typeof logQuerySchema>;
```

Create `apps/api/src/services/logService.ts`:

```ts
import type { AppDeps } from '../app.js';
import { CommandError } from '../utils/errors.js';
import { formatSseLogEvent, normalizeStreamTail, normalizeTail } from './logStream.js';
import { assertLogServiceName } from './serviceAllowlist.js';

export class LogService {
  constructor(private readonly deps: AppDeps) {}

  async getLogs(input: { name: string; tail?: string }) {
    const name = assertLogServiceName(input.name);
    const tail = normalizeTail(input.tail);
    const args = ['logs', '--no-color', '--timestamps', '--tail', String(tail)];
    if (name !== 'all') {
      args.push(name);
    }
    const result = await this.deps.runCompose(args);
    if (result.exitCode !== 0) {
      throw new CommandError(`Unable to read logs for ${name}`);
    }
    return { service: name, tail, logs: result.stdout };
  }

  createStream(input: { name: string; tail?: string }) {
    const name = assertLogServiceName(input.name);
    const tail = normalizeStreamTail(input.tail);
    const args = ['logs', '--no-color', '--timestamps', '--tail', String(tail), '--follow'];
    if (name !== 'all') {
      args.push(name);
    }
    return this.deps.streamCompose(args);
  }

  formatSseLogEvent(message: string, stream: 'stdout' | 'stderr' | 'error' = 'stdout') {
    return formatSseLogEvent(message, stream);
  }
}
```

Create `apps/api/src/controllers/logController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { LogService } from '../services/logService.js';
import type { LogQuery } from '../routes/logSchemas.js';

export class LogController {
  constructor(private readonly logService: LogService) {}

  async getLogs(name: string, query: LogQuery) {
    return apiSuccess(await this.logService.getLogs({ name, tail: query.tail }));
  }
}
```

Modify `apps/api/src/routes/logRoutes.ts` so JSON log route calls `LogController.getLogs`, and stream route only owns SSE transport using `LogService.createStream`.

- [ ] **Step 7: Run route checks**

Run:

```sh
npm --workspace apps/api test -- versionRoutes serviceRoutes logRoutes
npm --workspace apps/api run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit version/service/log refactor**

Run:

```sh
git add apps/api/src/controllers/versionController.ts apps/api/src/services/versionManagerService.ts apps/api/src/routes/versionSchemas.ts apps/api/src/routes/versionRoutes.ts apps/api/src/controllers/serviceController.ts apps/api/src/services/managerService.ts apps/api/src/routes/serviceSchemas.ts apps/api/src/routes/serviceRoutes.ts apps/api/src/controllers/logController.ts apps/api/src/services/logService.ts apps/api/src/routes/logSchemas.ts apps/api/src/routes/logRoutes.ts apps/api/src/routes/*Routes.test.ts
git commit -m "refactor: layer version service and log routes"
```

---

### Task 4: Refactor Backup and Scheduled Backup Routes

**Files:**
- Create: `apps/api/src/routes/backupSchemas.ts`
- Create: `apps/api/src/controllers/backupController.ts`
- Create: `apps/api/src/services/backupService.ts`
- Create: `apps/api/src/routes/scheduledBackupSchemas.ts`
- Create: `apps/api/src/controllers/scheduledBackupController.ts`
- Create: `apps/api/src/services/scheduledBackupApiService.ts`
- Modify: `apps/api/src/routes/backupRoutes.ts`
- Modify: `apps/api/src/routes/scheduledBackupRoutes.ts`
- Modify: related backup route tests.

- [ ] **Step 1: Update backup route tests to new schema**

In `apps/api/src/routes/backupRoutes.test.ts`, replace:

```ts
expect(response.json()).toMatchObject({ success: true, data: [], error: null });
```

with:

```ts
expect(response.json()).toMatchObject({ status: 'success', data: [] });
```

Replace:

```ts
expect(response.json().error).toContain('Cannot delete the newest mysql backup');
```

with:

```ts
expect(response.json()).toMatchObject({
  status: 'error',
  message: expect.stringContaining('Cannot delete the newest mysql backup')
});
```

Add `status: 'success'` assertions to manual backup, update, delete and restore tests.

- [ ] **Step 2: Create backup schemas**

Create `apps/api/src/routes/backupSchemas.ts`:

```ts
import { z } from 'zod';

export const backupKindSchema = z.enum(['mysql', 'mssql']);
export const backupKindParamsSchema = z.object({ kind: backupKindSchema });
export const backupFileParamsSchema = z.object({ kind: backupKindSchema, filename: z.string().min(1) });
export const restoreSchema = z.object({ filename: z.string().min(1) });
export const updateBackupSchema = z.object({ filename: z.string().min(1), note: z.string().nullable() });

export type BackupKindParams = z.infer<typeof backupKindParamsSchema>;
export type BackupFileParams = z.infer<typeof backupFileParamsSchema>;
export type RestoreInput = z.infer<typeof restoreSchema>;
export type UpdateBackupInput = z.infer<typeof updateBackupSchema>;
```

- [ ] **Step 3: Create backup service/controller**

Create `apps/api/src/services/backupService.ts` by moving logic from `backupRoutes.ts` into methods:

```ts
export class BackupService {
  constructor(private readonly deps: AppDeps) {}
  listBackups(): BackupList;
  getDownloadFile(input: { kind: BackupKind; filename: string }): { filePath: string; filename: string };
  listJobs(): BackupJob[];
  enqueueManualBackup(kind: BackupKind): ScheduledBackupRun;
  enqueueAllManualBackups(): { mysql: ScheduledBackupRun; mssql: ScheduledBackupRun };
  uploadBackup(input: { kind: BackupKind; part: MultipartFile }): Promise<BackupFile>;
  updateBackup(input: { kind: BackupKind; filename: string; body: UpdateBackupInput }): BackupFile;
  deleteBackup(input: { kind: BackupKind; filename: string }): BackupFile;
  restoreMysql(filename: string): Promise<object>;
  restoreMssql(filename: string): Promise<object>;
}
```

Move helpers `readMultipartTextField`, `normalizeOptionalNote`, `normalizeUploadFilename`, and `runJob` into this service file.

Create `apps/api/src/controllers/backupController.ts`:

```ts
import type { FastifyReply } from 'fastify';
import fs from 'node:fs';
import { apiSuccess } from '../utils/response.js';
import type { BackupService } from '../services/backupService.js';
import type { BackupFileParams, BackupKindParams, RestoreInput, UpdateBackupInput } from '../routes/backupSchemas.js';

export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  listBackups() {
    return apiSuccess(this.backupService.listBackups());
  }

  downloadBackup(params: BackupFileParams, reply: FastifyReply) {
    const file = this.backupService.getDownloadFile(params);
    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(fs.createReadStream(file.filePath));
  }

  listJobs() {
    return apiSuccess(this.backupService.listJobs());
  }

  enqueueManualBackup(params: BackupKindParams) {
    return apiSuccess(this.backupService.enqueueManualBackup(params.kind), `Đã đưa backup ${params.kind} vào hàng đợi.`);
  }

  enqueueAllManualBackups() {
    return apiSuccess(this.backupService.enqueueAllManualBackups(), 'Đã đưa backup MySQL và MSSQL vào hàng đợi.');
  }

  async uploadBackup(params: BackupKindParams, requestFile: Awaited<ReturnType<FastifyRequest['file']>>) {
    return apiSuccess(await this.backupService.uploadBackup({ kind: params.kind, part: requestFile }), 'Upload backup thành công.');
  }

  updateBackup(params: BackupFileParams, body: UpdateBackupInput) {
    return apiSuccess(this.backupService.updateBackup({ ...params, body }), 'Đã cập nhật backup.');
  }

  deleteBackup(params: BackupFileParams) {
    return apiSuccess(this.backupService.deleteBackup(params), 'Đã xóa backup.');
  }

  async restoreMysql(body: RestoreInput) {
    return apiSuccess(await this.backupService.restoreMysql(body.filename), 'Đã đưa restore MySQL vào hàng đợi.');
  }

  async restoreMssql(body: RestoreInput) {
    return apiSuccess(await this.backupService.restoreMssql(body.filename), 'Đã đưa restore MSSQL vào hàng đợi.');
  }
}
```

If the `FastifyRequest['file']` type is awkward, import the correct multipart file type from `@fastify/multipart` and use that instead.

- [ ] **Step 4: Shrink backup routes**

Modify `apps/api/src/routes/backupRoutes.ts` to instantiate `BackupController(new BackupService(app.deps))`, attach `validate`, and keep only route declarations plus multipart/file transport.

Use route patterns:

```ts
app.get('/api/backups', async () => controller.listBackups());
app.get<{ Params: BackupFileParams }>(
  '/api/backups/:kind/:filename/download',
  { preHandler: validate({ params: backupFileParamsSchema }) },
  async (request, reply) => controller.downloadBackup(request.params, reply)
);
app.post<{ Params: BackupKindParams }>(
  '/api/backups/:kind/upload',
  { preHandler: validate({ params: backupKindParamsSchema }) },
  async (request) => controller.uploadBackup(request.params, await request.file())
);
```

- [ ] **Step 5: Create scheduled backup schemas/service/controller**

Create `apps/api/src/routes/scheduledBackupSchemas.ts`:

```ts
import { z } from 'zod';
import { backupScheduleRuleSchema } from '../scheduledBackups/scheduledBackupTypes.js';

export const createScheduledJobSchema = z.object({
  database: z.enum(['mysql', 'mssql']),
  schedule: backupScheduleRuleSchema,
  enabled: z.boolean().optional()
});

export const updateScheduledJobSchema = z.object({
  schedule: backupScheduleRuleSchema.optional(),
  enabled: z.boolean().optional()
});

export const scheduledJobParamsSchema = z.object({ id: z.string().min(1) });
export const scheduledRunParamsSchema = z.object({ runId: z.string().min(1) });
export const scheduledRunQuerySchema = z.object({
  database: z.string().optional(),
  status: z.string().optional(),
  trigger: z.string().optional(),
  jobId: z.string().optional()
});
export const retentionSettingsSchema = z.object({
  mysqlRetentionDays: z.number().int().min(1),
  mssqlRetentionDays: z.number().int().min(1)
});
```

Create `apps/api/src/services/scheduledBackupApiService.ts` by moving logic from `scheduledBackupRoutes.ts`, replacing `app.httpErrors.notFound` with `NotFoundError`.

Create `apps/api/src/controllers/scheduledBackupController.ts` with methods returning `apiSuccess(...)` and message strings for create/update/delete/run/retry/settings update.

- [ ] **Step 6: Shrink scheduled backup routes**

Modify `apps/api/src/routes/scheduledBackupRoutes.ts` so every route uses `validate` and calls the controller. Keep sorting logic inside service, not route.

- [ ] **Step 7: Run backup checks**

Run:

```sh
npm --workspace apps/api test -- backupRoutes scheduledBackupRoutes
npm --workspace apps/api run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit backup refactor**

Run:

```sh
git add apps/api/src/controllers/backupController.ts apps/api/src/services/backupService.ts apps/api/src/routes/backupSchemas.ts apps/api/src/routes/backupRoutes.ts apps/api/src/controllers/scheduledBackupController.ts apps/api/src/services/scheduledBackupApiService.ts apps/api/src/routes/scheduledBackupSchemas.ts apps/api/src/routes/scheduledBackupRoutes.ts apps/api/src/routes/*Backup*test.ts apps/api/src/routes/backupRoutes.test.ts apps/api/src/routes/scheduledBackupRoutes.test.ts
git commit -m "refactor: layer backup api routes"
```

---

### Task 5: Refactor Game Account Routes

**Files:**
- Create: `apps/api/src/controllers/gameAccountController.ts`
- Create: `apps/api/src/services/gameAccountApiService.ts`
- Create: `apps/api/src/routes/gameAccountSchemas.ts`
- Modify: `apps/api/src/routes/gameAccountRoutes.ts`
- Modify: `apps/api/src/routes/gameAccountRoutes.test.ts`

- [ ] **Step 1: Update tests to new response format**

In `apps/api/src/routes/gameAccountRoutes.test.ts`, assert `status: 'success'` for success and `status: 'error'` for errors. Replace old `error` field checks with `message`.

- [ ] **Step 2: Create params schema**

Create `apps/api/src/routes/gameAccountSchemas.ts`:

```ts
import { z } from 'zod';

export const accountNameParamsSchema = z.object({
  accountName: z.string().min(1)
});

export type AccountNameParams = z.infer<typeof accountNameParamsSchema>;
```

Use existing `createGameAccountSchema`, `listGameAccountsQuerySchema`, and `updateGameAccountSchema` from `apps/api/src/gameAccounts/accountSchemas.ts`.

- [ ] **Step 3: Create service/controller**

Create `apps/api/src/services/gameAccountApiService.ts`:

```ts
import type { GameAccountService } from '../gameAccounts/gameAccountService.js';
import type {
  CreateGameAccountRequest,
  ListGameAccountsQuery,
  UpdateGameAccountRequest
} from '../gameAccounts/accountSchemas.js';

export class GameAccountApiService {
  constructor(private readonly gameAccounts: GameAccountService) {}

  list(query: ListGameAccountsQuery) {
    return this.gameAccounts.list(query);
  }

  create(payload: CreateGameAccountRequest) {
    return this.gameAccounts.create(payload);
  }

  update(accountName: string, payload: UpdateGameAccountRequest) {
    return this.gameAccounts.update(accountName, payload);
  }

  async delete(accountName: string) {
    await this.gameAccounts.delete(accountName);
    return { accountName };
  }

  ban(accountName: string) {
    return this.gameAccounts.ban(accountName);
  }

  unban(accountName: string) {
    return this.gameAccounts.unban(accountName);
  }
}
```

Create `apps/api/src/controllers/gameAccountController.ts`:

```ts
import { apiSuccess } from '../utils/response.js';
import type { GameAccountApiService } from '../services/gameAccountApiService.js';
import type {
  CreateGameAccountRequest,
  ListGameAccountsQuery,
  UpdateGameAccountRequest
} from '../gameAccounts/accountSchemas.js';

export class GameAccountController {
  constructor(private readonly gameAccountService: GameAccountApiService) {}

  async list(query: ListGameAccountsQuery) {
    return apiSuccess(await this.gameAccountService.list(query));
  }

  async create(payload: CreateGameAccountRequest) {
    return apiSuccess(await this.gameAccountService.create(payload), 'Tạo tài khoản thành công.');
  }

  async update(accountName: string, payload: UpdateGameAccountRequest) {
    return apiSuccess(await this.gameAccountService.update(accountName, payload), 'Cập nhật tài khoản thành công.');
  }

  async delete(accountName: string) {
    return apiSuccess(await this.gameAccountService.delete(accountName), 'Account deleted');
  }

  async ban(accountName: string) {
    return apiSuccess(await this.gameAccountService.ban(accountName), 'Đã khóa tài khoản.');
  }

  async unban(accountName: string) {
    return apiSuccess(await this.gameAccountService.unban(accountName), 'Đã mở khóa tài khoản.');
  }
}
```

- [ ] **Step 4: Shrink game account routes**

Modify `apps/api/src/routes/gameAccountRoutes.ts` to only wire route schema/controller:

```ts
import type { FastifyInstance } from 'fastify';
import { GameAccountController } from '../controllers/gameAccountController.js';
import { GameAccountApiService } from '../services/gameAccountApiService.js';
import { validate } from '../middleware/validate.js';
import {
  createGameAccountSchema,
  listGameAccountsQuerySchema,
  updateGameAccountSchema,
  type CreateGameAccountRequest,
  type ListGameAccountsQuery,
  type UpdateGameAccountRequest
} from '../gameAccounts/accountSchemas.js';
import { accountNameParamsSchema, type AccountNameParams } from './gameAccountSchemas.js';

export async function registerGameAccountRoutes(app: FastifyInstance) {
  const controller = new GameAccountController(new GameAccountApiService(app.deps.gameAccounts));

  app.get<{ Querystring: ListGameAccountsQuery }>(
    '/api/game-accounts',
    { preHandler: validate({ query: listGameAccountsQuerySchema }) },
    async (request) => controller.list(request.query)
  );
  app.post<{ Body: CreateGameAccountRequest }>(
    '/api/game-accounts',
    { preHandler: validate({ body: createGameAccountSchema }) },
    async (request) => controller.create(request.body)
  );
  app.patch<{ Params: AccountNameParams; Body: UpdateGameAccountRequest }>(
    '/api/game-accounts/:accountName',
    { preHandler: validate({ params: accountNameParamsSchema, body: updateGameAccountSchema }) },
    async (request) => controller.update(request.params.accountName, request.body)
  );
  app.delete<{ Params: AccountNameParams }>(
    '/api/game-accounts/:accountName',
    { preHandler: validate({ params: accountNameParamsSchema }) },
    async (request) => controller.delete(request.params.accountName)
  );
  app.post<{ Params: AccountNameParams }>(
    '/api/game-accounts/:accountName/ban',
    { preHandler: validate({ params: accountNameParamsSchema }) },
    async (request) => controller.ban(request.params.accountName)
  );
  app.post<{ Params: AccountNameParams }>(
    '/api/game-accounts/:accountName/unban',
    { preHandler: validate({ params: accountNameParamsSchema }) },
    async (request) => controller.unban(request.params.accountName)
  );
}
```

- [ ] **Step 5: Run game account checks**

Run:

```sh
npm --workspace apps/api test -- gameAccountRoutes gameAccountService accountSchemas
npm --workspace apps/api run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit game account refactor**

Run:

```sh
git add apps/api/src/controllers/gameAccountController.ts apps/api/src/services/gameAccountApiService.ts apps/api/src/routes/gameAccountSchemas.ts apps/api/src/routes/gameAccountRoutes.ts apps/api/src/gameAccounts/accountSchemas.ts apps/api/src/routes/gameAccountRoutes.test.ts
git commit -m "refactor: layer game account routes"
```

---

### Task 6: Update UI API Client for New Response Format

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Modify: `apps/ui/src/services/base/baseService.ts`
- Modify: `apps/ui/src/services/base/baseService.test.ts`
- Modify: any UI tests that mock `ApiService.fetchData` with old envelopes.
- Modify: `apps/ui/src/services/versionService.ts` upload XHR parser.

- [ ] **Step 1: Update UI response tests first**

Modify `apps/ui/src/services/base/baseService.test.ts` to use new response shape:

```ts
await expect(
  BaseService({
    url: '/api/test',
    method: 'POST',
    adapter: async () =>
      mockResponse(
        {
          status: 'error',
          message: 'Chưa có phiên bản game nào được kích hoạt.'
        },
        'POST'
      )
  })
).rejects.toThrow('Chưa có phiên bản game nào được kích hoạt.');
```

For success:

```ts
mockResponse(
  {
    status: 'success',
    message: 'Đã lưu cấu hình.',
    data: { saved: true }
  },
  'POST'
)
```

Expected data after interceptor:

```ts
expect(response.data).toEqual({ saved: true });
```

- [ ] **Step 2: Run UI baseService test red**

Run:

```sh
npm --workspace apps/ui run vitest -- baseService
```

Expected: FAIL because interceptor still expects `success`.

- [ ] **Step 3: Update UI response types**

Modify top of `apps/ui/src/services/types.ts`:

```ts
export type ApiValidationIssue = {
  field: string;
  message: string;
};

export type ApiResponse<T> =
  | { status: 'success'; message?: string; data: T; pagination?: never }
  | { status: 'success'; data: T[]; pagination: { page: number; limit: number; total: number; pages: number }; message?: string }
  | { status: 'error'; message: string; errors?: ApiValidationIssue[] };

export type ApiEnvelope<T> = ApiResponse<T>;
```

- [ ] **Step 4: Update BaseService interceptor**

Modify `apps/ui/src/services/base/baseService.ts` response interceptor logic:

```ts
BaseService.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<unknown>;
    if (apiResponse && typeof apiResponse === 'object' && 'status' in apiResponse) {
      if (apiResponse.status === 'success') {
        if (
          shouldShowSuccessToast(response.config) &&
          typeof apiResponse.message === 'string' &&
          apiResponse.message.trim().length > 0
        ) {
          showBackendSuccessToast(apiResponse.message);
        }
        response.data = 'pagination' in apiResponse && apiResponse.pagination
          ? { data: apiResponse.data, pagination: apiResponse.pagination }
          : apiResponse.data;
      } else {
        const errorMsg = apiResponse.message || 'Yêu cầu thất bại';
        showBackendErrorToast(errorMsg);
        const err: ToastedError = new Error(errorMsg);
        err.response = response;
        err.hasBackendToast = true;
        return Promise.reject(err);
      }
    }
    return response;
  },
  (error) => Promise.reject(error)
);
```

Remove `BackendMessagePayload` and `isBackendMessagePayload`; they are no longer needed.

- [ ] **Step 5: Update upload parser**

In `apps/ui/src/services/versionService.ts`, replace old upload error parsing:

```ts
reject(new Error(body.success === false ? body.error : `Upload failed with status ${xhr.status}`))
```

with:

```ts
reject(new Error(body.status === 'error' ? body.message : `Upload failed with status ${xhr.status}`));
```

If upload success response is read directly, ensure it returns `body.data`.

- [ ] **Step 6: Update UI service tests and mocks**

Search:

```sh
rg -n "success:|error: null|error:" apps/ui/src
```

For mocks of `ApiService.fetchData`, keep them as `fetchData` resolved Axios data when the interceptor is mocked. For direct `BaseService` tests, use the new `status` shape.

- [ ] **Step 7: Run UI checks**

Run:

```sh
npm --workspace apps/ui run vitest
npm --workspace apps/ui run typecheck
npm --workspace apps/ui run oxlint
npm --workspace apps/ui run format:test
```

Expected: PASS, except pre-existing warning in `ServiceActionModal.tsx` may still appear as a warning.

- [ ] **Step 8: Commit UI response update**

Run:

```sh
git add apps/ui/src/services/types.ts apps/ui/src/services/base/baseService.ts apps/ui/src/services/base/baseService.test.ts apps/ui/src/services/versionService.ts apps/ui/src
git commit -m "refactor: update ui api response handling"
```

---

### Task 7: Remove Legacy API Envelope and Final Verification

**Files:**
- Delete: `apps/api/src/api/envelope.ts`
- Delete or leave compatibility-free: `apps/api/src/api/errors.ts`
- Modify: imports across `apps/api/src`.
- Modify: API route tests still asserting old shape.

- [ ] **Step 1: Search for old envelope**

Run:

```sh
rg -n "api/envelope|success: true|success: false|error: null|\\.error\\)|json\\(\\)\\.error|from '../api/errors|from './api/errors" apps/api/src apps/ui/src
```

Expected: Results show remaining old API format references.

- [ ] **Step 2: Remove old imports**

For every `apps/api/src/routes/*.ts` file, replace:

```ts
import { ok } from '../api/envelope.js';
```

with controller/response helper usage. If a route still needs direct response for a very small endpoint, use:

```ts
import { apiSuccess } from '../utils/response.js';
```

For every old error import:

```ts
import { ValidationError } from '../api/errors.js';
```

replace with:

```ts
import { ValidationError } from '../utils/errors.js';
```

- [ ] **Step 3: Delete legacy files**

Delete:

```sh
git rm apps/api/src/api/envelope.ts apps/api/src/api/errors.ts
```

If a compile error remains because a file still imports these modules, fix that file before continuing.

- [ ] **Step 4: Update final API assertions**

For each remaining API route test:

```ts
expect(response.json()).toMatchObject({ success: true });
```

must become:

```ts
expect(response.json()).toMatchObject({ status: 'success' });
```

For errors:

```ts
expect(response.json().error).toContain('message');
```

must become:

```ts
expect(response.json().message).toContain('message');
```

- [ ] **Step 5: Full verification**

Run:

```sh
npm --workspace apps/api run typecheck
npm --workspace apps/api test
npm --workspace apps/ui run typecheck
npm --workspace apps/ui run vitest
npm --workspace apps/ui run oxlint
npm --workspace apps/ui run format:test
```

Expected: PASS. `oxlint` may report the existing `no-control-regex` warning in `ServiceActionModal.tsx`; it must not report new errors.

- [ ] **Step 6: Final cleanup search**

Run:

```sh
rg -n "success: true|success: false|error: null|api/envelope|api/errors" apps/api/src apps/ui/src
```

Expected: no references to the old API envelope or old API error module. Test names may mention legacy only if explicitly documenting migration; prefer removing them.

- [ ] **Step 7: Commit cleanup**

Run:

```sh
git add apps/api/src apps/ui/src
git commit -m "refactor: remove legacy api envelope"
```

---

## Self-Review Checklist

- Spec coverage: plan covers Pattern 1 folder shape, global error handler, validation middleware, response format, all API route groups, UI response handling, and cleanup.
- Plan hygiene: route migration tasks name exact source files and target files.
- Type consistency: response helper uses `status/message/data/errors/pagination`; UI interceptor reads the same shape.
- Risk control: streaming and download endpoints keep transport-specific behavior; JSON endpoints move to new schema.
