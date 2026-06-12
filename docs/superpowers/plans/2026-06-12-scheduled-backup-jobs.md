# Scheduled Backup Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay cơ chế lịch sao lưu cố định bằng hệ thống scheduled backup jobs dạng bảng, có nhiều lịch theo database, queue bền vững, lịch sử hoạt động và UI tiếng Việt.

**Architecture:** Backend chuyển từ `backup-schedules.json` version 1 sang hai file JSON mới: `backup-scheduled-jobs.json` và `backup-scheduled-job-runs.json`. Scheduler API vẫn quét mỗi phút trong process hiện tại, nhưng tách rõ phần enqueue lịch và worker xử lý queue theo từng database. UI thay tab `Schedule/Jobs` bằng `Lịch hẹn giờ`, `Lịch sử`, `Cài đặt`, dùng modal thêm/sửa lịch và icon actions có tooltip.

**Tech Stack:** TypeScript, Fastify, Zod, React, Mantine, TanStack Query, Vitest, Testing Library, Docker Compose.

---

## Source Spec

Spec: `docs/superpowers/specs/2026-06-12-scheduled-backup-jobs-design.md`

## File Structure

### Backend

- Modify: `apps/api/src/config.ts` để thêm paths mới và retention theo database.
- Modify: `apps/api/src/app.ts` để khởi động scheduler mới và chạy startup cleanup/recovery.
- Modify: `apps/api/src/routes/backupRoutes.ts` để xóa routes lịch cũ, đưa manual backup qua queue, thêm settings retention.
- Create: `apps/api/src/scheduledBackups/scheduledBackupTypes.ts` định nghĩa Zod schemas và types.
- Create: `apps/api/src/scheduledBackups/scheduledBackupJobs.ts` quản lý file jobs, validate trùng lịch, tự sinh tên.
- Create: `apps/api/src/scheduledBackups/scheduledBackupRuns.ts` quản lý run history, queue limit, prune history.
- Create: `apps/api/src/scheduledBackups/scheduledBackupTime.ts` tính due/next run cho hourly/daily/weekly.
- Create: `apps/api/src/scheduledBackups/scheduledBackupWorker.ts` xử lý queue theo database.
- Create: `apps/api/src/scheduledBackups/scheduledBackupScheduler.ts` enqueue run khi đến lịch, xử lý startup recovery và legacy cleanup.
- Create: `apps/api/src/routes/scheduledBackupRoutes.ts` expose API jobs/runs/retry.
- Modify: `apps/api/src/backups/backupMetadata.ts` thêm `generatedBy` cho file backup.
- Modify: `apps/api/src/backups/mysqlBackup.ts` và `apps/api/src/backups/mssqlBackup.ts` nếu cần trả filename cho run history.
- Tests: tạo `*.test.ts` tương ứng cho modules scheduledBackups và routes.

### Frontend

- Modify: `apps/ui/src/services/types.ts` thêm scheduled job/run/settings types.
- Modify: `apps/ui/src/services/backupService.ts` thêm API calls mới.
- Modify: `apps/ui/src/hooks/useBackups.ts` thêm query/mutation jobs/runs/settings.
- Modify: `apps/ui/src/views/backup/components/BackupPanel.tsx` đổi tabs sang tiếng Việt.
- Create: `apps/ui/src/views/backup/components/ScheduledJobsTab.tsx` table lịch hẹn giờ.
- Create: `apps/ui/src/views/backup/components/ScheduledJobModal.tsx` modal thêm/sửa lịch.
- Create: `apps/ui/src/views/backup/components/ScheduledRunsTab.tsx` table lịch sử.
- Modify: `apps/ui/src/views/backup/components/BackupSettingsTab.tsx` thêm retention theo database.
- Modify: `apps/ui/src/views/backup/components/BackupFilesTab.tsx` đưa backup thủ công qua queue và hiển thị metadata generatedBy.
- Tests: thêm component tests cho tab lịch hẹn giờ, modal, lịch sử, settings.

---

## Task 1: Backend Types, Config Và Legacy Cleanup

**Files:**
- Create: `apps/api/src/scheduledBackups/scheduledBackupTypes.ts`
- Modify: `apps/api/src/config.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupTypes.test.ts`

- [ ] **Step 1: Viết test schema cho job và run**

Tạo test kiểm tra các rule chính:

```ts
import { describe, expect, it } from 'vitest';
import { scheduledBackupJobSchema, scheduledBackupRunSchema } from './scheduledBackupTypes.js';

describe('scheduled backup schemas', () => {
  it('accepts hourly, daily, and weekly schedules', () => {
    expect(scheduledBackupJobSchema.parse({
      id: 'job_1', displayName: 'MySQL · Hàng giờ #1', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'hourly', everyHours: 2, minute: 30 }
    }).schedule.type).toBe('hourly');
    expect(scheduledBackupJobSchema.parse({
      id: 'job_2', displayName: 'MSSQL · Hằng ngày #1', enabled: true,
      taskType: 'backup', database: 'mssql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'daily', time: '03:00' }
    }).schedule.type).toBe('daily');
    expect(scheduledBackupJobSchema.parse({
      id: 'job_3', displayName: 'MySQL · Hằng tuần #1', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'weekly', daysOfWeek: [1, 3, 5], time: '03:00' }
    }).schedule.type).toBe('weekly');
  });

  it('rejects invalid weekly schedules and invalid hourly ranges', () => {
    expect(() => scheduledBackupJobSchema.parse({
      id: 'job_bad', displayName: 'Bad', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'weekly', daysOfWeek: [], time: '03:00' }
    })).toThrow();
    expect(() => scheduledBackupJobSchema.parse({
      id: 'job_bad2', displayName: 'Bad', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'hourly', everyHours: 25, minute: 0 }
    })).toThrow();
  });

  it('accepts queued run history records', () => {
    expect(scheduledBackupRunSchema.parse({
      runId: 'run_1', batchId: null, jobId: 'job_1', jobDisplayName: 'MySQL · Hàng giờ #1',
      database: 'mysql', trigger: 'schedule', scheduledFor: '2026-06-12T01:00:00.000Z',
      queuedAt: '2026-06-12T01:00:00.000Z', startedAt: null, finishedAt: null,
      status: 'queued', error: null, backupFilename: null,
      scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
    }).status).toBe('queued');
  });
});
```

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `npm --workspace apps/api run test -- scheduledBackupTypes.test.ts`

Expected: fail vì module chưa tồn tại.

- [ ] **Step 3: Implement schemas và types**

Tạo `scheduledBackupTypes.ts` với các schema từ spec. Export types `ScheduledBackupJob`, `ScheduledBackupRun`, `BackupScheduleRule`, `ScheduledBackupJobsFile`, `ScheduledBackupRunsFile`.

- [ ] **Step 4: Thêm config paths mới**

Trong `config.ts`, thêm:

```ts
scheduledBackupJobsFile: string;
scheduledBackupRunsFile: string;
mysqlRetentionDays: number;
mssqlRetentionDays: number;
maxQueuedRunsPerJob: number;
maxFinishedScheduledRuns: number;
```

Default:

```ts
scheduledBackupJobsFile = apps/jx-services/mount/database/backups/backup-scheduled-jobs.json
scheduledBackupRunsFile = apps/jx-services/mount/database/backups/backup-scheduled-job-runs.json
mysqlRetentionDays = 14
mssqlRetentionDays = 14
maxQueuedRunsPerJob = 100
maxFinishedScheduledRuns = 1000
```

- [ ] **Step 5: Chạy typecheck/test**

Run: `npm --workspace apps/api run typecheck`

Run: `npm --workspace apps/api run test -- scheduledBackupTypes.test.ts`

Expected: pass.

---

## Task 2: Job Store Và Validate Trùng Lịch

**Files:**
- Create: `apps/api/src/scheduledBackups/scheduledBackupJobs.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupJobs.test.ts`

- [ ] **Step 1: Viết test store jobs**

Test cần cover:

- File chưa tồn tại trả `{ version: 2, jobs: [] }`.
- Tạo job tự sinh `displayName` có số thứ tự ổn định.
- Không cho tạo lịch trùng hoàn toàn cùng database.
- Sửa job không cho đổi database.
- Xóa job set `deletedAt`, không xóa khỏi file.

- [ ] **Step 2: Chạy test fail**

Run: `npm --workspace apps/api run test -- scheduledBackupJobs.test.ts`

- [ ] **Step 3: Implement job store**

API nội bộ cần có:

```ts
readScheduledBackupJobs(file: string): ScheduledBackupJobsFile
writeScheduledBackupJobs(file: string, data: ScheduledBackupJobsFile): void
createScheduledBackupJob(file: string, input: CreateScheduledBackupJobInput, now?: Date): ScheduledBackupJob
updateScheduledBackupJob(file: string, id: string, input: UpdateScheduledBackupJobInput, now?: Date): ScheduledBackupJob
softDeleteScheduledBackupJob(file: string, id: string, now?: Date): ScheduledBackupJob
```

Tên tự sinh:

- `MySQL · Hàng giờ #N`
- `MySQL · Hằng ngày #N`
- `MySQL · Hằng tuần #N`
- tương tự MSSQL.

- [ ] **Step 4: Verify**

Run: `npm --workspace apps/api run test -- scheduledBackupJobs.test.ts`

---

## Task 3: Run Store, Queue Limit Và Prune History

**Files:**
- Create: `apps/api/src/scheduledBackups/scheduledBackupRuns.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupRuns.test.ts`

- [ ] **Step 1: Viết test run store**

Test cần cover:

- File chưa tồn tại trả `{ version: 1, runs: [] }`.
- Enqueue run thành `queued`.
- Mỗi job tối đa 100 queued; vượt thì tạo `skipped` với error hàng đợi đầy.
- Không prune `queued` và `running`.
- Chỉ giữ 1000 finished runs mới nhất.
- Cancel queued runs theo job khi tắt/sửa/xóa.
- Startup recovery chuyển running cũ thành failed.

- [ ] **Step 2: Implement run store**

API nội bộ cần có:

```ts
enqueueScheduledBackupRun(...): ScheduledBackupRun
cancelQueuedRunsForJob(...): ScheduledBackupRun[]
markStaleRunningRunsFailed(...): ScheduledBackupRun[]
startNextQueuedRunForDatabase(...): ScheduledBackupRun | null
finishScheduledBackupRun(...): ScheduledBackupRun
listScheduledBackupRuns(...): ScheduledBackupRun[]
```

- [ ] **Step 3: Verify**

Run: `npm --workspace apps/api run test -- scheduledBackupRuns.test.ts`

---

## Task 4: Time Rules Cho Hourly/Daily/Weekly

**Files:**
- Create: `apps/api/src/scheduledBackups/scheduledBackupTime.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupTime.test.ts`

- [ ] **Step 1: Viết test tính lịch**

Test cần cover:

- Hourly mỗi 2 giờ phút 30 chạy tại `00:30, 02:30, 04:30` theo giờ server.
- Daily chạy đúng `HH:mm`.
- Weekly yêu cầu đúng ngày trong tuần.
- Lịch tắt vẫn tính `nextRunPreviewAt` nếu bật lại.
- Không tạo due run cho thời gian API đã tắt.

- [ ] **Step 2: Implement helper**

API nội bộ:

```ts
isScheduleDue(rule: BackupScheduleRule, now: Date): boolean
getNextRunAt(rule: BackupScheduleRule, now: Date): string | null
getNextRunPreviewAt(rule: BackupScheduleRule, now: Date): string | null
getScheduleSummaryVi(rule: BackupScheduleRule): string
```

- [ ] **Step 3: Verify**

Run: `npm --workspace apps/api run test -- scheduledBackupTime.test.ts`

---

## Task 5: Scheduler Enqueue Và Worker Theo Database

**Files:**
- Create: `apps/api/src/scheduledBackups/scheduledBackupScheduler.ts`
- Create: `apps/api/src/scheduledBackups/scheduledBackupWorker.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupScheduler.test.ts`
- Test: `apps/api/src/scheduledBackups/scheduledBackupWorker.test.ts`

- [ ] **Step 1: Viết test scheduler enqueue**

Test cần cover:

- Đến giờ job enabled thì enqueue run.
- Không enqueue job disabled/deleted.
- Không enqueue duplicate cùng `jobId + scheduledFor`.
- Xóa legacy `backup-schedules.json` nếu file jobs mới chưa tồn tại.

- [ ] **Step 2: Viết test worker**

Test cần cover:

- MySQL worker chỉ chạy MySQL, MSSQL worker chỉ chạy MSSQL.
- DB chưa healthy thì run giữ `queued`.
- Backup lỗi thật thì run `failed` và worker chạy tiếp run sau.
- Backup thành công thì run `succeeded`, có `backupFilename`.

- [ ] **Step 3: Implement scheduler/worker**

Scheduler vẫn chạy mỗi phút khi `schedulerEnabled = true`.

Worker cần nhận dependencies để test được:

```ts
isDatabaseHealthy(database): Promise<boolean>
runBackup(database, context): Promise<{ filename: string | null }>
logger
```

- [ ] **Step 4: Nối vào app startup**

Trong `app.ts`:

- chạy startup cleanup/recovery.
- start scheduler enqueue timer.
- start 2 worker loops MySQL/MSSQL.
- stop timers trong `onClose`.

- [ ] **Step 5: Verify**

Run: `npm --workspace apps/api run test -- scheduledBackupScheduler.test.ts scheduledBackupWorker.test.ts`

---

## Task 6: API Routes Mới Và Xóa Routes Cũ

**Files:**
- Create: `apps/api/src/routes/scheduledBackupRoutes.ts`
- Modify: `apps/api/src/routes/backupRoutes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/scheduledBackupRoutes.test.ts`
- Test: `apps/api/src/routes/backupRoutes.test.ts`

- [ ] **Step 1: Viết route tests**

Cover endpoints:

- `GET /api/scheduled-jobs`
- `POST /api/scheduled-jobs`
- `PUT /api/scheduled-jobs/:id`
- `DELETE /api/scheduled-jobs/:id`
- `POST /api/scheduled-jobs/:id/run`
- `GET /api/scheduled-job-runs`
- `POST /api/scheduled-job-runs/:runId/retry`

Cover xóa routes cũ:

- `GET /api/backup-schedules` trả 404.
- `PUT /api/backup-schedules/mysql` trả 404.

- [ ] **Step 2: Implement routes mới**

Routes dùng envelope hiện tại. Validate body bằng Zod. Error message bằng tiếng Việt cho validation nghiệp vụ.

- [ ] **Step 3: Đưa manual backup qua queue**

`POST /api/backups/mysql`, `/mssql`, `/all` không chạy backup trực tiếp nữa. Chúng enqueue manual runs và trả danh sách run đã tạo.

- [ ] **Step 4: Verify**

Run: `npm --workspace apps/api run test -- scheduledBackupRoutes.test.ts backupRoutes.test.ts`

---

## Task 7: Backup Metadata Liên Kết Run/Job

**Files:**
- Modify: `apps/api/src/backups/backupMetadata.ts`
- Modify: `apps/api/src/backups/backupFiles.ts`
- Test: `apps/api/src/backups/backupMetadata.test.ts`
- Test: `apps/api/src/backups/backupFiles.test.ts`

- [ ] **Step 1: Viết test metadata generatedBy**

Test file generated có `generatedBy.runId`, `jobId`, `trigger`, `batchId`.

- [ ] **Step 2: Implement metadata mở rộng**

Metadata vẫn backward-compatible với file cũ không có `generatedBy`.

- [ ] **Step 3: UI/API list backup trả generatedBy**

`GET /api/backups` trả thêm metadata để UI hiện badge `Từ lịch hẹn giờ`, `Thủ công`, `Upload`.

- [ ] **Step 4: Verify**

Run: `npm --workspace apps/api run test -- backupMetadata.test.ts backupFiles.test.ts`

---

## Task 8: UI Types, Service Và Hook

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Modify: `apps/ui/src/services/backupService.ts`
- Modify: `apps/ui/src/hooks/useBackups.ts`

- [ ] **Step 1: Thêm types**

Thêm `ScheduledBackupJob`, `BackupScheduleRule`, `ScheduledBackupRun`, `ScheduledJobListResponse`, `ScheduledRunListResponse`, retention settings.

- [ ] **Step 2: Thêm service calls**

Thêm methods tương ứng API mới:

```ts
getScheduledJobs()
createScheduledJob(payload)
updateScheduledJob(id, payload)
deleteScheduledJob(id)
runScheduledJobNow(id)
getScheduledRuns(filters)
retryScheduledRun(runId)
saveBackupSettings(payload)
```

- [ ] **Step 3: Thêm TanStack Query keys/mutations**

Invalidate đúng keys sau create/update/delete/run/retry/settings.

- [ ] **Step 4: Verify**

Run: `npm --workspace apps/ui run typecheck`

---

## Task 9: UI Tab Lịch Hẹn Giờ Và Modal

**Files:**
- Create: `apps/ui/src/views/backup/components/ScheduledJobsTab.tsx`
- Create: `apps/ui/src/views/backup/components/ScheduledJobModal.tsx`
- Modify: `apps/ui/src/views/backup/components/BackupPanel.tsx`
- Test: `apps/ui/src/views/backup/components/ScheduledJobsTab.test.tsx`
- Test: `apps/ui/src/views/backup/components/ScheduledJobModal.test.tsx`

- [ ] **Step 1: Viết component tests**

Cover:

- Render table cột tiếng Việt.
- Filter database/trạng thái.
- Badge trạng thái có queue count.
- Icon actions có tooltip.
- Modal validate weekly phải chọn ngày.
- Modal không có trường tên và retention.

- [ ] **Step 2: Implement tab và modal**

Actions icon dùng lucide icons nếu project đã dùng icon library; nếu chưa có, dùng Mantine ActionIcon với nhãn tooltip rõ.

- [ ] **Step 3: Confirm modal thao tác nguy hiểm**

Confirm cho xóa job và tắt job khi có queued runs.

- [ ] **Step 4: Verify**

Run: `npm --workspace apps/ui run vitest -- ScheduledJobsTab.test.tsx ScheduledJobModal.test.tsx`

---

## Task 10: UI Tab Lịch Sử

**Files:**
- Create: `apps/ui/src/views/backup/components/ScheduledRunsTab.tsx`
- Modify: `apps/ui/src/views/backup/components/BackupPanel.tsx`
- Test: `apps/ui/src/views/backup/components/ScheduledRunsTab.test.tsx`

- [ ] **Step 1: Viết component tests**

Cover:

- Filter database, trạng thái, nguồn, thời gian.
- Icon lịch sử từ job set filter `jobId`.
- File còn tồn tại hiển thị link/tên file.
- File không còn tồn tại hiển thị `File đã bị xóa`.
- Run failed có icon `Chạy lại`.

- [ ] **Step 2: Implement tab lịch sử**

Table không lồng card. Dùng badge trạng thái tiếng Việt.

- [ ] **Step 3: Verify**

Run: `npm --workspace apps/ui run vitest -- ScheduledRunsTab.test.tsx`

---

## Task 11: UI File Backup Và Cài Đặt Retention

**Files:**
- Modify: `apps/ui/src/views/backup/components/BackupFilesTab.tsx`
- Modify: `apps/ui/src/views/backup/components/BackupSettingsTab.tsx`
- Test: `apps/ui/src/views/backup/components/BackupPanel.test.tsx`

- [ ] **Step 1: Viết tests**

Cover:

- `Sao lưu tất cả` tạo 2 run manual qua service mới.
- Badge file backup phân biệt `Upload`, `Thủ công`, `Từ lịch hẹn giờ`.
- Settings có input retention cho MySQL/MSSQL.

- [ ] **Step 2: Implement UI**

Tab names đổi sang:

- `File backup`
- `Lịch hẹn giờ`
- `Lịch sử`
- `Cài đặt`

- [ ] **Step 3: Verify**

Run: `npm --workspace apps/ui run vitest -- BackupPanel.test.tsx`

---

## Task 12: Full Verification Và Container Rebuild

**Files:**
- Modify tests nếu cần theo API mới.
- Không thêm feature mới trong task này.

- [ ] **Step 1: Chạy API checks**

Run:

```bash
npm --workspace apps/api run typecheck
npm --workspace apps/api run test
```

Expected: pass.

- [ ] **Step 2: Chạy UI checks**

Run:

```bash
npm --workspace apps/ui run typecheck
npm --workspace apps/ui run format:test
npm --workspace apps/ui run lint
npm --workspace apps/ui run vitest
npm --workspace apps/ui run build
```

Expected: pass. Warning kích thước bundle hoặc warning cũ không liên quan cần ghi rõ nếu còn.

- [ ] **Step 3: Rebuild containers**

Run:

```bash
docker compose up -d --build api ui
docker ps --filter name=quanlysvjx-manager --format '{{.Names}}\t{{.Status}}'
```

Expected: `api` và `ui` healthy.

- [ ] **Step 4: Smoke test API runtime**

Run:

```bash
docker exec quanlysvjx-manager-api-1 wget -qO- http://127.0.0.1:3001/api/scheduled-jobs
docker exec quanlysvjx-manager-api-1 wget -qO- http://127.0.0.1:3001/api/scheduled-job-runs
```

Expected: envelope success, danh sách ban đầu có thể rỗng.

---

## Self-Review

- Spec coverage: plan có task cho schema, job store, run store, time rules, scheduler, worker, API, metadata, UI table, modal, history, settings, verification.
- Scope check: restore history, cron UI, monthly/one-time schedules, auth/roles và worker container riêng nằm ngoài phạm vi đúng theo spec.
- Risk lớn nhất: đổi manual backup qua queue sẽ ảnh hưởng tests/UI cũ. Task 6 và Task 11 tách riêng để kiểm soát blast radius.
- Migration decision: không migration, legacy file cũ bị xóa khi scheduler mới khởi động lần đầu và file jobs mới chưa tồn tại.
