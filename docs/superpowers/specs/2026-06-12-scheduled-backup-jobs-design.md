# Thiết Kế Quản Lý Lịch Hẹn Giờ Sao Lưu

## Bối Cảnh

Hệ thống sao lưu hiện tại chỉ có 2 cấu hình cố định cho `mysql` và `mssql`. Mỗi database có một lịch duy nhất, lưu trong `backup-schedules.json`, scheduler quét mỗi phút và so khớp ngày trong tuần cộng giờ `HH:mm`. Cách này không đủ cho nhu cầu mới: quản lý nhiều công việc hẹn giờ, tạo nhiều lịch theo từng database, hỗ trợ lịch hàng giờ, có hàng đợi, có lịch sử hoạt động bền vững và có UI dạng bảng.

Thiết kế mới thay cơ chế lịch cố định bằng danh sách scheduled jobs. Mục tiêu là người vận hành nhìn được rõ: lịch nào đang bật, lần chạy kế tiếp, lần gần nhất, đang chờ hay đang chạy, lịch sử từng lượt chạy, và file backup nào được tạo bởi lượt chạy nào.

## Phạm Vi

Phiên bản này chỉ quản lý lịch hẹn giờ cho **backup database**. Không mở rộng sang restore, start/stop service, hoặc tác vụ hệ thống khác.

Database được hỗ trợ:

- MySQL
- MSSQL

Kiểu lịch được hỗ trợ:

- Hàng giờ
- Hằng ngày
- Hằng tuần

Không dùng cron trong UI hoặc model nghiệp vụ. Backend có thể tiếp tục dùng một vòng quét nội bộ mỗi phút, nhưng người dùng không nhập hoặc nhìn thấy cron expression.

## Quyết Định Chính

- Mỗi scheduled job chỉ gắn với đúng một database.
- Một database có thể có nhiều scheduled jobs.
- Job không có tên nhập tay. Hệ thống tự sinh tên có số thứ tự ổn định, ví dụ `MySQL · Hàng giờ #1`.
- Không cho tạo lịch trùng hoàn toàn trong cùng database.
- Database của job cố định sau khi tạo; muốn đổi database thì tạo job mới.
- Sửa lịch sẽ hủy các lượt đang chờ của job đó.
- Tắt lịch sẽ hủy các lượt đang chờ của job đó.
- Xóa lịch là xóa mềm job, giữ lịch sử, hủy các lượt đang chờ.
- Manual backup cũng đi qua queue và ghi lịch sử.
- `Sao lưu tất cả` tạo 2 run riêng, một MySQL và một MSSQL, cùng `batchId`.
- Restore không đưa vào lịch sử scheduler ở phiên bản này.
- Retention theo database, không theo từng job.
- Không migration lịch cũ. Khi API khởi động lần đầu với scheduler mới, nếu chưa có file jobs mới thì xóa file lịch cũ `backup-schedules.json`.
- Endpoint lịch cũ bị xóa hoàn toàn.
- Không có pause global từ UI; bật/tắt global vẫn dùng `BACKUP_SCHEDULER_ENABLED`.

## Model Dữ Liệu

### File scheduled jobs

File đề xuất: `apps/jx-services/mount/database/backups/backup-scheduled-jobs.json`.

```ts
type ScheduledBackupJobsFile = {
  version: 2;
  jobs: ScheduledBackupJob[];
};

type ScheduledBackupJob = {
  id: string;
  displayName: string;
  enabled: boolean;
  taskType: 'backup';
  database: 'mysql' | 'mssql';
  schedule: BackupScheduleRule;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type BackupScheduleRule =
  | {
      type: 'hourly';
      everyHours: number;
      minute: number;
    }
  | {
      type: 'daily';
      time: string;
    }
  | {
      type: 'weekly';
      daysOfWeek: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
      time: string;
    };
```

Quy tắc validate:

- `hourly.everyHours`: từ 1 đến 24.
- `hourly.minute`: từ 0 đến 59.
- `daily.time` và `weekly.time`: định dạng `HH:mm` theo giờ server.
- `weekly.daysOfWeek`: phải có ít nhất một ngày.
- Không tạo job trùng hoàn toàn cùng database và cùng tham số lịch.

### File run history

File đề xuất: `apps/jx-services/mount/database/backups/backup-scheduled-job-runs.json`.

```ts
type ScheduledBackupRunsFile = {
  version: 1;
  runs: ScheduledBackupRun[];
};

type ScheduledBackupRun = {
  runId: string;
  batchId: string | null;
  jobId: string | null;
  jobDisplayName: string | null;
  database: 'mysql' | 'mssql';
  trigger: 'schedule' | 'manual' | 'retry';
  scheduledFor: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  error: string | null;
  backupFilename: string | null;
  scheduleSnapshot: BackupScheduleRule | null;
};
```

Quy tắc lưu lịch sử:

- Lưu bền vững ra file JSON.
- Giữ tối đa 1000 run đã kết thúc mới nhất.
- Không tự xóa run `queued` hoặc `running`.
- Mỗi job được có tối đa 100 run `queued`.
- Khi vượt queue limit, lượt mới ghi `skipped` với lý do hàng đợi đã đầy.

### Metadata file backup

Metadata file backup cần liên kết ngược về run/job.

```ts
type BackupGeneratedBy = {
  trigger: 'schedule' | 'manual' | 'retry';
  jobId: string | null;
  runId: string;
  batchId: string | null;
};
```

Khi file backup bị xóa hoặc retention dọn, lịch sử không bị xóa. UI lịch sử hiển thị `File đã bị xóa` nếu filename không còn tồn tại.

## Scheduler Và Queue

Scheduler có 2 trách nhiệm riêng:

1. Tạo run `queued` khi đến mốc lịch.
2. Worker xử lý queue theo database.

Luồng quét lịch:

- Scheduler chạy mỗi phút khi `BACKUP_SCHEDULER_ENABLED=true`.
- Không chạy bù thời gian API đã tắt.
- Nếu API tắt trước một mốc lịch, mốc đó coi như bị lỡ và không tạo run.
- Nếu run đã được ghi `queued` trước khi API tắt, API bật lại sẽ tiếp tục xử lý.

Luồng worker:

- Có một worker riêng cho MySQL và một worker riêng cho MSSQL.
- Mỗi worker chỉ chạy một run tại một thời điểm.
- Worker lấy run `queued` theo thứ tự `scheduledFor`, sau đó `queuedAt`.
- MySQL bận không chặn MSSQL và ngược lại.
- Nếu database chưa healthy, run giữ nguyên `queued`, worker nghỉ một phút rồi thử lại.
- Nếu backup process chạy và lỗi thật, run chuyển `failed`, worker tiếp tục run sau.
- Không retry tự động. Run failed có nút `Chạy lại` tạo run mới với `trigger = 'retry'`.

Startup recovery:

- Khi API khởi động, mọi run `running` từ lần chạy trước chuyển thành `failed`.
- Lý do lỗi: `API khởi động lại trước khi job hoàn tất`.
- Run `queued` giữ nguyên.

Tắt/xóa/sửa job:

- Tắt job: không tạo run mới, hủy queued runs của job đó thành `cancelled`.
- Sửa lịch: hủy queued runs cũ của job đó thành `cancelled`, lịch mới chỉ áp dụng cho run mới.
- Xóa job: set `deletedAt`, hủy queued runs, giữ lịch sử.
- Running run không bị kill giữa chừng khi xóa job.

## API Mới

Tất cả response giữ envelope hiện tại `{ success, data, error }`.

Scheduled jobs:

- `GET /api/scheduled-jobs`
- `POST /api/scheduled-jobs`
- `PUT /api/scheduled-jobs/:id`
- `DELETE /api/scheduled-jobs/:id`
- `POST /api/scheduled-jobs/:id/run`

Run history:

- `GET /api/scheduled-job-runs`
- `POST /api/scheduled-job-runs/:runId/retry`

Backup thủ công:

- `POST /api/backups/mysql` tạo run manual MySQL.
- `POST /api/backups/mssql` tạo run manual MSSQL.
- `POST /api/backups/all` tạo 2 run manual cùng `batchId`.

Retention settings:

- `GET /api/backup-settings` trả retention theo database.
- `PUT /api/backup-settings` lưu retention theo database.

Endpoint cũ:

- Xóa `GET /api/backup-schedules`.
- Xóa `PUT /api/backup-schedules/:kind`.

## UI Mới

Tab trong khu vực sao lưu:

- `File backup`
- `Lịch hẹn giờ`
- `Lịch sử`
- `Cài đặt`

### Tab Lịch hẹn giờ

Phía trên table có thanh trạng thái gọn:

- Bộ lập lịch đang bật/tắt.
- Giờ server.
- Số run đang chạy.
- Số run đang chờ.
- Lỗi gần nhất nếu có.

Filter table:

- Database: `Tất cả | MySQL | MSSQL`.
- Trạng thái: `Tất cả | Đang bật | Đang tắt | Có lỗi | Đang chờ/đang chạy`.

Cột table:

- Tên lịch.
- Database.
- Kiểu lịch.
- Tóm tắt lịch.
- Trạng thái.
- Lần chạy gần nhất.
- Lần chạy kế tiếp.
- Kết quả gần nhất.
- Thao tác.

Không có cột hàng đợi riêng. Queue count hiển thị bằng badge trong cột trạng thái, ví dụ `Bật · 3 đang chờ`.

Thao tác dùng icon button có tooltip:

- Chạy ngay.
- Bật/tắt lịch.
- Sửa lịch.
- Xem lịch sử.
- Xóa lịch.

Confirm modal bắt buộc cho:

- Xóa lịch.
- Tắt lịch khi còn queued runs, vì thao tác này hủy queued runs.
- Chạy lại run failed nếu database đang có nhiều queued.

### Modal thêm/sửa lịch

Dùng modal một bước, không dùng drawer.

Trường trong modal:

- Database: MySQL/MSSQL, chỉ chọn khi thêm mới; khi sửa thì disabled.
- Kiểu lặp: `Hàng giờ | Hằng ngày | Hằng tuần`.
- Hàng giờ: `Lặp lại mỗi N giờ`, `Phút chạy`.
- Hằng ngày: `Giờ chạy`.
- Hằng tuần: `Ngày chạy`, `Giờ chạy`.
- `Bật lịch sau khi lưu`.

Không có trường tên lịch. Không có retention trong modal.

### Tab Lịch sử

Hiển thị toàn bộ run history, gồm:

- Run do scheduler tạo.
- Run do nút `Chạy ngay` tạo.
- Backup thủ công từ tab file.
- Run retry.

Filter:

- Database: `Tất cả | MySQL | MSSQL`.
- Trạng thái: `Tất cả | Chờ | Đang chạy | Thành công | Thất bại | Đã hủy | Bỏ qua`.
- Nguồn: `Tất cả | Lịch hẹn giờ | Chạy ngay | Thủ công | Chạy lại`.
- Thời gian: `24 giờ | 7 ngày | 30 ngày | Tất cả`.

Khi bấm icon lịch sử từ job row, chuyển sang tab `Lịch sử` với filter `jobId` và có chip xóa filter.

Cột lịch sử:

- Thời điểm hẹn.
- Bắt đầu.
- Kết thúc.
- Database.
- Nguồn.
- Trạng thái.
- File backup.
- Lỗi/Ghi chú.

### Tab Cài đặt

Retention đặt theo database:

- MySQL giữ file trong bao nhiêu ngày.
- MSSQL giữ file trong bao nhiêu ngày.

Retention không thuộc từng lịch hẹn giờ.

## Migration Và Tương Thích

Không migration lịch cũ.

Khi API khởi động lần đầu với scheduler mới:

- Nếu chưa có `backup-scheduled-jobs.json`, tạo file jobs rỗng.
- Nếu chưa có `backup-scheduled-job-runs.json`, tạo file runs rỗng.
- Nếu tồn tại `backup-schedules.json` cũ, xóa hẳn file này.
- Ghi log rõ việc xóa file lịch cũ.

Nếu file jobs mới đã tồn tại, không động vào file lịch cũ nữa để tránh xóa nhầm sau này.

## Kiểm Thử Bắt Buộc

Backend:

- Validate schedule rules.
- Không cho tạo lịch trùng.
- Tính next run cho hourly/daily/weekly.
- Không chạy bù thời gian API tắt.
- Queue limit 100/job.
- Worker chạy theo database độc lập.
- DB chưa healthy thì run giữ queued.
- Startup chuyển running cũ thành failed.
- Tắt/sửa/xóa job hủy queued runs.
- Manual backup tạo run history.
- `Sao lưu tất cả` tạo 2 run cùng batch.

Frontend:

- Render table lịch hẹn giờ.
- Filter theo database/trạng thái.
- Modal thêm/sửa validate đúng.
- Icon actions có tooltip.
- Confirm khi tắt lịch có queued runs.
- Tab lịch sử filter được và link từ job row.
- Tab cài đặt lưu retention theo database.

## Ngoài Phạm Vi

- Không thêm phân quyền/role.
- Không thêm pause global từ UI.
- Không hỗ trợ cron expression.
- Không hỗ trợ lịch một lần hoặc hằng tháng.
- Không đưa restore vào lịch sử scheduler.
- Không tạo worker service/container riêng.
