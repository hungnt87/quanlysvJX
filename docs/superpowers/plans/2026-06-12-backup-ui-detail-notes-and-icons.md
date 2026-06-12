# Backup UI Detail Notes And Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị ghi chú file backup chi tiết hơn cho backup tự động, làm tên lịch hẹn giờ rõ theo tần suất, và đổi các button thao tác sang icon đúng rule UI.

**Architecture:** Backend mở rộng metadata `generatedBy` bằng thông tin run/job/schedule thật để `/api/backups` trả đủ dữ liệu cho UI. Frontend thêm helper format lịch/ghi chú dùng chung, sau đó cập nhật `BackupFilesTab` và `ScheduledJobsTab` để render cell ngắn gọn, tooltip chi tiết, icon Tabler stroke `1.5`, và tên lịch không còn hậu tố `#1`.

**Tech Stack:** Fastify, Zod, Vitest, React 19, TypeScript, Mantine v9, `@tabler/icons-react`, TanStack Query.

---

## Decisions Locked

- Có sửa backend/API metadata nhỏ để UI không phải suy diễn thiếu dữ liệu.
- Không migration dữ liệu cũ trong `backup-scheduled-jobs.json`.
- Không đổi file dữ liệu lịch cũ chỉ để xóa `#1`; UI render tên lịch mới từ `database + schedule`.
- Backend tiếp tục không cho tạo lịch trùng database + schedule. Cơ chế này đã có trong `createScheduledBackupJob` và `updateScheduledBackupJob`.
- Button trong cột `Thao tác` của bảng dùng icon-only + tooltip.
- Button ngoài bảng dùng icon + text ở desktop/tablet, ẩn text ở mobile.
- Icon dùng `@tabler/icons-react`, prop `stroke={1.5}`.
- Cột `Ghi chú` hiển thị 1-2 dòng ngắn; tooltip chứa chi tiết đầy đủ.

## File Structure

- Modify: `apps/api/src/backups/backupMetadata.ts`
  - Mở rộng schema metadata `generatedBy`.
  - Field mới phải optional/null-friendly để đọc metadata cũ không bị reset.
- Modify: `apps/api/src/backups/backupFiles.ts`
  - Mở rộng `BackupFileView.generatedBy`.
  - Trả dữ liệu mới từ metadata ra `/api/backups`.
- Modify: `apps/api/src/backups/mysqlBackup.ts`
  - Nhận context run/job/schedule đầy đủ.
  - Ghi note tiếng Việt ngắn và metadata `generatedBy` chi tiết.
- Modify: `apps/api/src/backups/mssqlBackup.ts`
  - Tương tự `mysqlBackup.ts`.
- Modify: `apps/api/src/scheduledBackups/scheduledBackupWorker.ts`
  - Truyền `jobId`, `jobDisplayName`, `scheduleSnapshot`, `scheduledFor`, `batchId` từ run vào backup context.
- Modify: `apps/api/src/scheduledBackups/scheduledBackupScheduler.ts`
  - Cập nhật type của callback `runBackup` để nhận context mới.
- Modify: `apps/ui/src/services/types.ts`
  - Đồng bộ type `BackupFile.generatedBy` với backend.
- Create: `apps/ui/src/views/backup/utils/backupDisplay.ts`
  - Format database label, schedule detail, schedule display name, backup note summary, backup note tooltip, và datetime đầy đủ.
- Create: `apps/ui/src/views/backup/utils/backupDisplay.test.ts`
  - Unit test format tên lịch và ghi chú.
- Modify: `apps/ui/src/views/backup/components/BackupFilesTab.tsx`
  - Dùng helper ghi chú.
  - Button thao tác icon-only + tooltip.
  - Button top action icon + text desktop, icon-only mobile.
- Modify: `apps/ui/src/views/backup/components/ScheduledJobsTab.tsx`
  - Render tên lịch từ schedule, bỏ `#1`.
  - Button thao tác icon-only + tooltip.
  - Button thêm lịch icon + text desktop, icon-only mobile.
- Modify: `apps/ui/src/views/backup/components/BackupPanel.test.tsx`
  - Cập nhật accessible name của action button nếu cần.
  - Thêm case hiển thị note/tên lịch/icon tooltip.
- Modify: `apps/api/src/backups/backupMetadata.test.ts`
  - Test metadata mới đọc/ghi đúng.
- Modify: `apps/api/src/scheduledBackups/scheduledBackupWorker.test.ts`
  - Test worker truyền context đầy đủ vào backup.

---

### Task 1: Backend Metadata For Detailed Backup Source

**Files:**
- Modify: `apps/api/src/backups/backupMetadata.ts`
- Modify: `apps/api/src/backups/backupFiles.ts`
- Modify: `apps/api/src/backups/backupMetadata.test.ts`

- [ ] **Step 1: Write failing metadata test**

Add this assertion block to `apps/api/src/backups/backupMetadata.test.ts` inside `it('writes, updates, and removes metadata immutably', ...)`, replacing the existing `generatedBy` object in the first `upsertBackupMetadata` call and matching expectation.

```ts
generatedBy: {
  runId: 'run_123',
  jobId: 'job_456',
  jobDisplayName: 'MySQL · Hàng giờ #1',
  trigger: 'schedule',
  batchId: 'batch_789',
  scheduledFor: '2026-06-10T03:00:00.000Z',
  generatedAt: '2026-06-10T03:00:30.000Z',
  scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 }
}
```

Expected assertion:

```ts
expect(index.files['mysql/mysql-20260610-030000.sql.gz']?.generatedBy).toEqual({
  runId: 'run_123',
  jobId: 'job_456',
  jobDisplayName: 'MySQL · Hàng giờ #1',
  trigger: 'schedule',
  batchId: 'batch_789',
  scheduledFor: '2026-06-10T03:00:00.000Z',
  generatedAt: '2026-06-10T03:00:30.000Z',
  scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 }
});
```

- [ ] **Step 2: Run API test to verify it fails**

Run:

```bash
npm --workspace apps/api run test -- src/backups/backupMetadata.test.ts
```

Expected: FAIL because `generatedBy.jobDisplayName`, `generatedBy.scheduledFor`, `generatedBy.generatedAt`, and `generatedBy.scheduleSnapshot` are not accepted by the current Zod schema.

- [ ] **Step 3: Extend metadata schema**

In `apps/api/src/backups/backupMetadata.ts`, import the schedule schema and change `generatedBy` schema to this shape:

```ts
import { backupScheduleRuleSchema } from '../scheduledBackups/scheduledBackupTypes.js';
```

```ts
generatedBy: z
  .object({
    runId: z.string().nullable(),
    jobId: z.string().nullable(),
    jobDisplayName: z.string().nullable().optional(),
    trigger: z.enum(['schedule', 'manual', 'retry']),
    batchId: z.string().nullable(),
    scheduledFor: z.string().nullable().optional(),
    generatedAt: z.string().nullable().optional(),
    scheduleSnapshot: backupScheduleRuleSchema.nullable().optional()
  })
  .nullable()
  .optional()
```

Keep `jobDisplayName`, `scheduledFor`, `generatedAt`, and `scheduleSnapshot` optional so old `backup-metadata.json` files remain valid.

- [ ] **Step 4: Extend `BackupFileView.generatedBy`**

In `apps/api/src/backups/backupFiles.ts`, update both `BackupFileView` and the local `metadataFiles` type to:

```ts
generatedBy?: {
  runId: string | null;
  jobId: string | null;
  jobDisplayName?: string | null;
  trigger: 'schedule' | 'manual' | 'retry';
  batchId: string | null;
  scheduledFor?: string | null;
  generatedAt?: string | null;
  scheduleSnapshot?: {
    type: 'hourly';
    everyHours: number;
    minute: number;
  } | {
    type: 'daily';
    time: string;
  } | {
    type: 'weekly';
    daysOfWeek: number[];
    time: string;
  } | null;
} | null;
```

- [ ] **Step 5: Run metadata test to verify it passes**

Run:

```bash
npm --workspace apps/api run test -- src/backups/backupMetadata.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit backend metadata schema**

```bash
git add apps/api/src/backups/backupMetadata.ts apps/api/src/backups/backupFiles.ts apps/api/src/backups/backupMetadata.test.ts
git commit -m "feat: enrich backup metadata source details"
```

---

### Task 2: Worker Context Propagation

**Files:**
- Modify: `apps/api/src/scheduledBackups/scheduledBackupWorker.ts`
- Modify: `apps/api/src/scheduledBackups/scheduledBackupScheduler.ts`
- Modify: `apps/api/src/backups/mysqlBackup.ts`
- Modify: `apps/api/src/backups/mssqlBackup.ts`
- Modify: `apps/api/src/scheduledBackups/scheduledBackupWorker.test.ts`

- [ ] **Step 1: Write failing worker context assertion**

In `apps/api/src/scheduledBackups/scheduledBackupWorker.test.ts`, update the successful run setup to include a schedule snapshot:

```ts
enqueueScheduledBackupRun(config.scheduledBackupRunsFile, {
  jobId: 'job_1',
  jobDisplayName: 'MySQL · Hàng giờ #1',
  database: 'mysql',
  trigger: 'schedule',
  scheduledFor: '2026-06-12T03:00:00.000Z',
  scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 }
});
```

Then replace `expect(runBackup).toHaveBeenCalled();` with:

```ts
expect(runBackup).toHaveBeenCalledWith('mysql', {
  trigger: 'schedule',
  runId: result!.runId,
  jobId: 'job_1',
  jobDisplayName: 'MySQL · Hàng giờ #1',
  batchId: null,
  scheduledFor: '2026-06-12T03:00:00.000Z',
  scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 }
});
```

- [ ] **Step 2: Run worker test to verify it fails**

Run:

```bash
npm --workspace apps/api run test -- src/scheduledBackups/scheduledBackupWorker.test.ts
```

Expected: FAIL because `processNextScheduledBackupRun` currently passes only `trigger` and `runId`.

- [ ] **Step 3: Add shared backup context type**

In `apps/api/src/scheduledBackups/scheduledBackupWorker.ts`, import `BackupScheduleRule` and define:

```ts
import type { BackupScheduleRule } from './scheduledBackupTypes.js';
```

```ts
export type BackupRunContext = {
  trigger: 'schedule' | 'manual' | 'retry';
  runId: string;
  jobId: string | null;
  jobDisplayName: string | null;
  batchId: string | null;
  scheduledFor: string;
  scheduleSnapshot: BackupScheduleRule | null;
};
```

Change `WorkerDeps.runBackup` to:

```ts
runBackup: (
  database: 'mysql' | 'mssql',
  context: BackupRunContext
) => Promise<{ filename: string | null }>;
```

In `processNextScheduledBackupRun`, call:

```ts
const result = await runBackup(database, {
  trigger: run.trigger,
  runId: run.runId,
  jobId: run.jobId,
  jobDisplayName: run.jobDisplayName,
  batchId: run.batchId,
  scheduledFor: run.scheduledFor,
  scheduleSnapshot: run.scheduleSnapshot
});
```

- [ ] **Step 4: Update scheduler callback type**

In `apps/api/src/scheduledBackups/scheduledBackupScheduler.ts`, import `BackupRunContext`:

```ts
import { processNextScheduledBackupRun, type BackupRunContext } from './scheduledBackupWorker.js';
```

Change `runBackup` to:

```ts
const runBackup = async (
  database: 'mysql' | 'mssql',
  context: BackupRunContext
) => {
  if (database === 'mysql') {
    return backupMysql(deps, context);
  }
  return backupMssql(deps, context);
};
```

- [ ] **Step 5: Update backup writers to persist detailed metadata**

In `apps/api/src/backups/mysqlBackup.ts`, import the context type:

```ts
import type { BackupRunContext } from '../scheduledBackups/scheduledBackupWorker.js';
```

Change the signature:

```ts
export async function backupMysql(deps: AppDeps, context?: BackupRunContext) {
```

Change `note` and `generatedBy` in `upsertBackupMetadata`:

```ts
note: context
  ? context.trigger === 'schedule'
    ? `Tự động từ lịch ${context.jobDisplayName ?? context.jobId ?? context.runId}`
    : `Tạo thủ công từ lượt chạy ${context.runId}`
  : null,
createdByUpload: false,
uploadedAt: null,
updatedAt: now.toISOString(),
generatedBy: context
  ? {
      runId: context.runId,
      jobId: context.jobId,
      jobDisplayName: context.jobDisplayName,
      trigger: context.trigger,
      batchId: context.batchId,
      scheduledFor: context.scheduledFor,
      generatedAt: now.toISOString(),
      scheduleSnapshot: context.scheduleSnapshot
    }
  : null
```

Apply the same signature and metadata block in `apps/api/src/backups/mssqlBackup.ts`.

- [ ] **Step 6: Run worker test to verify it passes**

Run:

```bash
npm --workspace apps/api run test -- src/scheduledBackups/scheduledBackupWorker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run targeted API tests**

Run:

```bash
npm --workspace apps/api run test -- src/backups/backupMetadata.test.ts src/scheduledBackups/scheduledBackupWorker.test.ts src/scheduledBackups/scheduledBackupScheduler.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit worker propagation**

```bash
git add apps/api/src/scheduledBackups/scheduledBackupWorker.ts apps/api/src/scheduledBackups/scheduledBackupScheduler.ts apps/api/src/backups/mysqlBackup.ts apps/api/src/backups/mssqlBackup.ts apps/api/src/scheduledBackups/scheduledBackupWorker.test.ts
git commit -m "feat: persist scheduled backup run context"
```

---

### Task 3: Frontend Backup Display Helpers

**Files:**
- Create: `apps/ui/src/views/backup/utils/backupDisplay.ts`
- Create: `apps/ui/src/views/backup/utils/backupDisplay.test.ts`
- Modify: `apps/ui/src/services/types.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/ui/src/views/backup/utils/backupDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BackupFile, ScheduledBackupJob } from '@/services/types';
import {
  formatBackupNoteSummary,
  formatBackupNoteTooltip,
  formatScheduleDetailVi,
  formatScheduleDisplayName,
} from './backupDisplay';

describe('backupDisplay', () => {
  it('formats schedule display names without sequence suffixes', () => {
    const job: ScheduledBackupJob = {
      id: 'job_1',
      displayName: 'MySQL · Hàng giờ #1',
      enabled: true,
      taskType: 'backup',
      database: 'mysql',
      schedule: { type: 'hourly', everyHours: 2, minute: 0 },
      createdAt: '2026-06-12T03:00:00.000Z',
      updatedAt: '2026-06-12T03:00:00.000Z',
    };

    expect(formatScheduleDisplayName(job)).toBe('MySQL · Hàng giờ · Mỗi 2 giờ, phút 00');
    expect(formatScheduleDetailVi(job.schedule)).toBe('Mỗi 2 giờ, phút 00');
  });

  it('formats weekly schedule details in Vietnamese', () => {
    expect(formatScheduleDetailVi({ type: 'weekly', daysOfWeek: [1, 4, 6], time: '03:00' })).toBe(
      'Thứ 2, Thứ 5, Thứ 7 lúc 03:00'
    );
  });

  it('formats generated backup notes with a compact summary and detailed tooltip', () => {
    const file: BackupFile = {
      kind: 'mysql',
      filename: 'mysql-20260612-030000.sql.gz',
      size: 1024,
      modifiedAt: '2026-06-12T03:00:30.000Z',
      note: 'Tự động từ lịch MySQL · Hàng giờ #1',
      source: 'generated',
      uploadedAt: null,
      isLatest: true,
      generatedBy: {
        runId: 'run_123',
        jobId: 'job_456',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        trigger: 'schedule',
        batchId: null,
        scheduledFor: '2026-06-12T03:00:00.000Z',
        generatedAt: '2026-06-12T03:00:30.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 },
      },
    };

    expect(formatBackupNoteSummary(file)).toEqual([
      'Tự động: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00',
      'Run: run_123',
    ]);
    expect(formatBackupNoteTooltip(file)).toContain('Nguồn: Sao lưu tự động');
    expect(formatBackupNoteTooltip(file)).toContain('Job ID: job_456');
    expect(formatBackupNoteTooltip(file)).toContain('Lịch: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00');
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/utils/backupDisplay.test.ts
```

Expected: FAIL because `backupDisplay.ts` does not exist.

- [ ] **Step 3: Update frontend types**

In `apps/ui/src/services/types.ts`, change `BackupFile.generatedBy` to:

```ts
generatedBy?: {
  runId: string | null;
  jobId: string | null;
  jobDisplayName?: string | null;
  trigger: 'schedule' | 'manual' | 'retry';
  batchId: string | null;
  scheduledFor?: string | null;
  generatedAt?: string | null;
  scheduleSnapshot?: BackupScheduleRule | null;
} | null;
```

Change `ScheduledBackupRun.trigger` to include retry:

```ts
trigger: 'schedule' | 'manual' | 'retry';
```

Change `ScheduledBackupRun.scheduleSnapshot` to:

```ts
scheduleSnapshot: BackupScheduleRule | null;
```

- [ ] **Step 4: Create helper implementation**

Create `apps/ui/src/views/backup/utils/backupDisplay.ts`:

```ts
import type { BackupFile, BackupKind, BackupScheduleRule, ScheduledBackupJob } from '@/services/types';

const dayLabels = new Map<number, string>([
  [0, 'Chủ Nhật'],
  [1, 'Thứ 2'],
  [2, 'Thứ 3'],
  [3, 'Thứ 4'],
  [4, 'Thứ 5'],
  [5, 'Thứ 6'],
  [6, 'Thứ 7'],
]);

export function formatDatabaseLabel(kind: BackupKind) {
  return kind === 'mysql' ? 'MySQL' : 'MSSQL';
}

export function formatScheduleKindVi(schedule: BackupScheduleRule) {
  if (schedule.type === 'hourly') {
    return 'Hàng giờ';
  }
  if (schedule.type === 'daily') {
    return 'Hằng ngày';
  }
  return 'Hằng tuần';
}

export function formatScheduleDetailVi(schedule: BackupScheduleRule) {
  if (schedule.type === 'hourly') {
    return `Mỗi ${schedule.everyHours} giờ, phút ${String(schedule.minute).padStart(2, '0')}`;
  }
  if (schedule.type === 'daily') {
    return `Lúc ${schedule.time}`;
  }

  const days = schedule.daysOfWeek
    .map((day) => dayLabels.get(day) ?? String(day))
    .join(', ');
  return `${days} lúc ${schedule.time}`;
}

export function formatScheduleDisplayName(job: ScheduledBackupJob) {
  return `${formatDatabaseLabel(job.database)} · ${formatScheduleKindVi(job.schedule)} · ${formatScheduleDetailVi(job.schedule)}`;
}

export function formatScheduleDisplayNameFromParts(
  database: BackupKind,
  schedule: BackupScheduleRule | null | undefined,
  fallbackName: string | null | undefined
) {
  if (!schedule) {
    return fallbackName ?? formatDatabaseLabel(database);
  }

  return `${formatDatabaseLabel(database)} · ${formatScheduleKindVi(schedule)} · ${formatScheduleDetailVi(schedule)}`;
}

export function formatFullDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(new Date(value));
}

export function formatBackupNoteSummary(file: BackupFile) {
  if (file.source === 'uploaded') {
    return [file.note?.trim() || 'Tải lên thủ công'];
  }

  if (!file.generatedBy) {
    return [file.note?.trim() || 'File backup được tạo bởi hệ thống'];
  }

  const scheduleName = formatScheduleDisplayNameFromParts(
    file.kind,
    file.generatedBy.scheduleSnapshot,
    file.generatedBy.jobDisplayName
  );
  const sourceLabel = file.generatedBy.trigger === 'schedule' ? 'Tự động' : 'Thủ công';
  const runLine = file.generatedBy.runId ? `Run: ${file.generatedBy.runId}` : 'Run: -';

  return [`${sourceLabel}: ${scheduleName}`, runLine];
}

export function formatBackupNoteTooltip(file: BackupFile) {
  if (file.source === 'uploaded') {
    return [
      'Nguồn: Tải lên thủ công',
      `Ghi chú: ${file.note?.trim() || '-'}`,
      `Thời điểm cập nhật: ${formatFullDateTime(file.modifiedAt)}`,
    ].join('\n');
  }

  if (!file.generatedBy) {
    return [
      'Nguồn: File được tạo bởi hệ thống',
      `Ghi chú: ${file.note?.trim() || '-'}`,
      `Thời điểm cập nhật: ${formatFullDateTime(file.modifiedAt)}`,
    ].join('\n');
  }

  const scheduleName = formatScheduleDisplayNameFromParts(
    file.kind,
    file.generatedBy.scheduleSnapshot,
    file.generatedBy.jobDisplayName
  );
  const source =
    file.generatedBy.trigger === 'schedule'
      ? 'Sao lưu tự động'
      : file.generatedBy.trigger === 'retry'
        ? 'Chạy lại'
        : 'Sao lưu thủ công';

  return [
    `Nguồn: ${source}`,
    `Lịch: ${scheduleName}`,
    `Run ID: ${file.generatedBy.runId ?? '-'}`,
    `Job ID: ${file.generatedBy.jobId ?? '-'}`,
    `Thời điểm hẹn: ${formatFullDateTime(file.generatedBy.scheduledFor)}`,
    `Thời điểm tạo: ${formatFullDateTime(file.generatedBy.generatedAt ?? file.modifiedAt)}`,
    `Batch ID: ${file.generatedBy.batchId ?? '-'}`,
  ].join('\n');
}
```

- [ ] **Step 5: Run helper test to verify it passes**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/utils/backupDisplay.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit helper**

```bash
git add apps/ui/src/services/types.ts apps/ui/src/views/backup/utils/backupDisplay.ts apps/ui/src/views/backup/utils/backupDisplay.test.ts
git commit -m "feat: add backup display formatting helpers"
```

---

### Task 4: Backup Files Tab Notes And Icon Actions

**Files:**
- Modify: `apps/ui/src/views/backup/components/BackupFilesTab.tsx`
- Modify: `apps/ui/src/views/backup/components/BackupPanel.test.tsx`

- [ ] **Step 1: Write failing UI test for detailed notes and icon action names**

In `apps/ui/src/views/backup/components/BackupPanel.test.tsx`, change the mocked `useBackups` return so `backups` can be controlled:

```ts
const mockBackups = vi.fn(() => []);
const mockScheduledJobs = vi.fn(() => []);
```

Inside `vi.mock('@/hooks/useBackups', ...)`, use:

```ts
backups: mockBackups(),
scheduledJobs: mockScheduledJobs(),
```

Add this test:

```ts
it('shows detailed generated backup notes and icon-only row actions', async () => {
  mockBackups.mockReturnValue([
    {
      kind: 'mysql',
      filename: 'mysql-20260612-030000.sql.gz',
      size: 1024,
      modifiedAt: '2026-06-12T03:00:30.000Z',
      note: 'Tự động từ lịch MySQL · Hàng giờ #1',
      source: 'generated',
      uploadedAt: null,
      isLatest: false,
      generatedBy: {
        runId: 'run_123',
        jobId: 'job_456',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        trigger: 'schedule',
        batchId: null,
        scheduledFor: '2026-06-12T03:00:00.000Z',
        generatedAt: '2026-06-12T03:00:30.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 },
      },
    },
  ]);

  renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
    route: '/backup/files',
  });

  expect(await screen.findByText('Tự động: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00')).toBeTruthy();
  expect(screen.getByText('Run: run_123')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Khôi phục file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sửa ghi chú file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Tải xuống file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Xóa file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
});
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/components/BackupPanel.test.tsx
```

Expected: FAIL because `BackupFilesTab` still renders raw `file.note` and text buttons.

- [ ] **Step 3: Import icons, media query, and display helpers**

In `apps/ui/src/views/backup/components/BackupFilesTab.tsx`, add imports:

```ts
import {
  IconDatabase,
  IconDatabaseExport,
  IconDownload,
  IconPencil,
  IconRefresh,
  IconRestore,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { formatBackupNoteSummary, formatBackupNoteTooltip } from '../utils/backupDisplay';
```

Inside component:

```ts
const isMobile = useMediaQuery('(max-width: 48em)');
const iconProps = { size: 16, stroke: 1.5 } as const;
```

- [ ] **Step 4: Add helper for responsive action button label**

Inside `BackupFilesTab`, add:

```tsx
const renderResponsiveLabel = useCallback(
  (label: string) => (isMobile ? null : label),
  [isMobile]
);
```

- [ ] **Step 5: Update top action buttons to icon + desktop text**

Replace top action button children with left icons and responsive labels:

```tsx
<Button disabled={isBackupAllDisabled} leftSection={<IconDatabaseExport {...iconProps} />} onClick={handleBackupAll}>
  {renderResponsiveLabel('Sao lưu tất cả')}
</Button>
```

```tsx
<Button
  disabled={!databaseReadiness.mysql}
  variant="light"
  leftSection={<IconDatabase {...iconProps} />}
  onClick={handleBackupMysql}
>
  {renderResponsiveLabel('Sao lưu MySQL')}
</Button>
```

```tsx
<Button
  disabled={!databaseReadiness.mssql}
  variant="light"
  leftSection={<IconDatabase {...iconProps} />}
  onClick={handleBackupMssql}
>
  {renderResponsiveLabel('Sao lưu MSSQL')}
</Button>
```

```tsx
<Button variant="light" leftSection={<IconUpload {...iconProps} />} onClick={() => setUploadOpened(true)}>
  {renderResponsiveLabel('Tải file backup lên')}
</Button>
```

```tsx
<Button variant="default" leftSection={<IconRefresh {...iconProps} />} onClick={handleRefresh}>
  {renderResponsiveLabel('Làm mới')}
</Button>
```

- [ ] **Step 6: Render compact note with tooltip**

Replace:

```tsx
<Table.Td>{file.note ?? '-'}</Table.Td>
```

With:

```tsx
<Table.Td>
  <Tooltip label={<Text style={{ whiteSpace: 'pre-line' }}>{formatBackupNoteTooltip(file)}</Text>} withArrow multiline>
    <Stack gap={2}>
      {formatBackupNoteSummary(file).map((line) => (
        <Text key={line} size="sm" lineClamp={1}>
          {line}
        </Text>
      ))}
    </Stack>
  </Tooltip>
</Table.Td>
```

- [ ] **Step 7: Replace row action text buttons with icon-only buttons**

Replace row action group with this structure:

```tsx
<Group gap="xs">
  {wrapDisabled(
    <Tooltip label="Khôi phục file backup này" withArrow>
      <Button
        aria-label={`Khôi phục file backup ${file.filename}`}
        size="xs"
        variant="light"
        px="xs"
        disabled={!databaseReadiness[file.kind]}
        onClick={() => setRestoringFile(file)}
      >
        <IconRestore {...iconProps} />
      </Button>
    </Tooltip>,
    !databaseReadiness[file.kind],
    getDatabaseDisabledReason(file.kind)
  )}
  <Tooltip label="Sửa tên file hoặc ghi chú" withArrow>
    <Button
      aria-label={`Sửa ghi chú file backup ${file.filename}`}
      size="xs"
      variant="default"
      px="xs"
      onClick={() => setEditingFile(file)}
    >
      <IconPencil {...iconProps} />
    </Button>
  </Tooltip>
  <Tooltip label="Tải file backup xuống máy" withArrow>
    <Button
      aria-label={`Tải xuống file backup ${file.filename}`}
      size="xs"
      variant="light"
      component="a"
      px="xs"
      href={`/api/backups/${file.kind}/${encodeURIComponent(file.filename)}/download`}
      download
    >
      <IconDownload {...iconProps} />
    </Button>
  </Tooltip>
  <Tooltip label={file.isLatest ? 'Không thể xóa backup mới nhất' : 'Xóa file backup'} withArrow>
    <Button
      aria-label={`Xóa file backup ${file.filename}`}
      size="xs"
      color="red"
      variant="light"
      px="xs"
      disabled={file.isLatest}
      onClick={() => setDeletingFile(file)}
    >
      <IconTrash {...iconProps} />
    </Button>
  </Tooltip>
</Group>
```

- [ ] **Step 8: Run UI test to verify it passes**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/components/BackupPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit backup files UI**

```bash
git add apps/ui/src/views/backup/components/BackupFilesTab.tsx apps/ui/src/views/backup/components/BackupPanel.test.tsx
git commit -m "feat: improve backup file notes and actions"
```

---

### Task 5: Scheduled Jobs Tab Display Names And Icon Actions

**Files:**
- Modify: `apps/ui/src/views/backup/components/ScheduledJobsTab.tsx`
- Modify: `apps/ui/src/views/backup/components/BackupPanel.test.tsx`

- [ ] **Step 1: Write failing scheduled jobs UI test**

Add this test to `apps/ui/src/views/backup/components/BackupPanel.test.tsx`:

```ts
it('shows detailed schedule names without sequence suffixes and icon-only schedule actions', async () => {
  mockScheduledJobs.mockReturnValue([
    {
      id: 'job_1',
      displayName: 'MySQL · Hàng giờ #1',
      enabled: true,
      taskType: 'backup',
      database: 'mysql',
      schedule: { type: 'hourly', everyHours: 2, minute: 0 },
      nextRunPreviewAt: '2026-06-12T05:00:00.000Z',
      createdAt: '2026-06-12T03:00:00.000Z',
      updatedAt: '2026-06-12T03:00:00.000Z',
    },
  ]);

  renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
    route: '/backup/schedule',
  });

  expect(await screen.findByText('MySQL · Hàng giờ · Mỗi 2 giờ, phút 00')).toBeTruthy();
  expect(screen.queryByText('MySQL · Hàng giờ #1')).toBeNull();
  expect(screen.getByRole('button', { name: 'Chạy ngay lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sửa lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Xóa lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
});
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/components/BackupPanel.test.tsx
```

Expected: FAIL because `ScheduledJobsTab` currently renders `job.displayName` and text buttons.

- [ ] **Step 3: Import icons, media query, and display helper**

In `apps/ui/src/views/backup/components/ScheduledJobsTab.tsx`, add:

```ts
import {
  IconCalendarPlus,
  IconPencil,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { formatScheduleDisplayName } from '../utils/backupDisplay';
```

Inside component:

```ts
const isMobile = useMediaQuery('(max-width: 48em)');
const iconProps = { size: 16, stroke: 1.5 } as const;
```

- [ ] **Step 4: Update create button to icon + desktop text**

Replace:

```tsx
<Button onClick={handleCreate}>Thêm lịch hẹn giờ</Button>
```

With:

```tsx
<Button leftSection={<IconCalendarPlus {...iconProps} />} onClick={handleCreate}>
  {isMobile ? null : 'Thêm lịch hẹn giờ'}
</Button>
```

- [ ] **Step 5: Render detailed schedule display name**

Inside `scheduledJobs.map`, define:

```tsx
const scheduleDisplayName = formatScheduleDisplayName(job);
```

Change the row map body to use block syntax:

```tsx
scheduledJobs.map((job) => {
  const scheduleDisplayName = formatScheduleDisplayName(job);

  return (
    <Table.Tr key={job.id}>
      ...
    </Table.Tr>
  );
})
```

Replace:

```tsx
<Text fw={600}>{job.displayName}</Text>
```

With:

```tsx
<Text fw={600}>{scheduleDisplayName}</Text>
```

- [ ] **Step 6: Replace schedule row action buttons with icon-only buttons**

Replace the action group with:

```tsx
<Group gap="xs">
  <Tooltip label="Chạy lịch này ngay lập tức" withArrow>
    <Button
      aria-label={`Chạy ngay lịch ${scheduleDisplayName}`}
      size="xs"
      variant="light"
      px="xs"
      disabled={!databaseReadiness[job.database] || isActionLoading}
      onClick={() => handleRunNow(job.id)}
    >
      <IconPlayerPlay {...iconProps} />
    </Button>
  </Tooltip>
  <Tooltip label="Sửa cấu hình lịch hẹn giờ" withArrow>
    <Button
      aria-label={`Sửa lịch ${scheduleDisplayName}`}
      size="xs"
      variant="default"
      px="xs"
      disabled={isActionLoading}
      onClick={() => handleEdit(job)}
    >
      <IconPencil {...iconProps} />
    </Button>
  </Tooltip>
  <Tooltip label="Xóa lịch hẹn giờ" withArrow>
    <Button
      aria-label={`Xóa lịch ${scheduleDisplayName}`}
      size="xs"
      color="red"
      variant="light"
      px="xs"
      disabled={isActionLoading}
      onClick={() => handleDelete(job.id)}
    >
      <IconTrash {...iconProps} />
    </Button>
  </Tooltip>
</Group>
```

- [ ] **Step 7: Run UI test to verify it passes**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/components/BackupPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit scheduled jobs UI**

```bash
git add apps/ui/src/views/backup/components/ScheduledJobsTab.tsx apps/ui/src/views/backup/components/BackupPanel.test.tsx
git commit -m "feat: clarify scheduled backup job actions"
```

---

### Task 6: Verification And Regression Sweep

**Files:**
- Review only unless tests fail:
  - `apps/api/src/routes/scheduledBackupRoutes.test.ts`
  - `apps/api/src/scheduledBackups/scheduledBackupJobs.test.ts`
  - `tests/e2e/manager-dashboard.spec.ts`

- [ ] **Step 1: Run targeted API test suite**

Run:

```bash
npm --workspace apps/api run test -- src/backups/backupMetadata.test.ts src/scheduledBackups/scheduledBackupWorker.test.ts src/scheduledBackups/scheduledBackupScheduler.test.ts src/scheduledBackups/scheduledBackupJobs.test.ts src/routes/scheduledBackupRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted UI tests**

Run:

```bash
npm --workspace apps/ui run vitest -- src/views/backup/utils/backupDisplay.test.ts src/views/backup/components/BackupPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run workspace typecheck**

Run:

```bash
npm --workspaces run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint if typecheck passes**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Run backup E2E smoke if local stack is available**

Run:

```bash
npm run e2e -- manager-dashboard.spec.ts
```

Expected: PASS for:

- `/backup/files` route shows backup workspace.
- `/backup/schedule` opens schedule tab.
- Backup tab clicks update URL.

If the local Docker/Nginx stack is not running, record that E2E was not run and include the reason in the handoff.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff -- apps/api/src apps/ui/src tests/e2e/manager-dashboard.spec.ts
```

Expected:

- Backend changes are limited to backup metadata/context propagation.
- Frontend changes are limited to backup display helpers and backup components/tests.
- No unrelated `.env`, Docker, or generated backup data changes.

- [ ] **Step 7: Final commit**

```bash
git add apps/api/src apps/ui/src
git commit -m "test: verify backup ui detail improvements"
```

Skip this commit if Step 6 shows no new changes since the previous task commits.

---

## Self-Review

**Spec coverage:** Covered backup file note detail, scheduled job display name detail, duplicate schedule behavior, row action icon-only buttons, non-table icon+text buttons with mobile text hidden, tooltip details, and Tabler icon rule.

**Placeholder scan:** No `TBD`, `TODO`, or unspecified implementation steps remain. Each code-changing step includes exact code or exact replacement snippets.

**Type consistency:** Backend `generatedBy` fields match frontend `BackupFile.generatedBy`. `scheduleSnapshot` uses the existing `BackupScheduleRule` shape on both sides. UI schedule display uses the same helper for jobs and generated backup notes.
