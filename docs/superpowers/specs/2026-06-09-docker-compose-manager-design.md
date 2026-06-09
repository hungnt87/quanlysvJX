# Docker Compose Manager Web App Design

## Mục tiêu

Xây dựng một web app chạy bằng React để quản lý `docker-compose.yaml` hiện tại của repo `quanlysvJX`. App phục vụ vận hành local/VPS: xem trạng thái service, start/stop/restart service, xem Docker logs từng service, backup và restore database MySQL/MSSQL.

Phạm vi đã chốt:

- Chỉ quản lý compose project hiện tại của repo này.
- Chạy dev ở port `80`, truy cập được qua `localhost` và IP máy dev.
- Production mặc định bind `127.0.0.1:80` nếu không bật đăng nhập.
- UI dùng React, Vite, TypeScript và Mantine từ `mantine.dev`.
- Backend dùng Node.js API, gọi Docker Compose CLI qua allowlist.
- Log viewer dùng Docker logs, không đọc file logs trong thư mục `logs/` ở bản đầu.
- Backup/restore hỗ trợ cả `jxmysql` và `jxmssql`.
- Không có đăng nhập ở bản đầu; phạm vi sử dụng là máy local/VPS hoặc mạng dev tin cậy.

## Ngoài phạm vi bản đầu

- Không quản lý nhiều compose project.
- Không expose Docker API trực tiếp cho frontend.
- Không upload backup từ UI.
- Không chỉnh lịch backup từ UI; lịch được cấu hình qua biến môi trường.
- Không phân quyền nhiều user/role.
- Không đọc file log nghiệp vụ trong `logs/`.

## Kiến trúc

App gồm ba khối khi chạy đầy đủ:

- `manager-web`: React + Vite + TypeScript + Mantine, build thành static assets.
- `manager-api`: Node.js API, là lớp duy nhất được phép gọi Docker/Compose và thao tác backup/restore.
- Reverse proxy local: phục vụ web ở port `80` và route `/api/*` về `manager-api`.

Môi trường dev:

- Web truy cập ở `http://localhost:80` và `http://<ip-may-dev>:80`.
- Reverse proxy bind `0.0.0.0:80` trong chế độ dev để đáp ứng yêu cầu truy cập qua IP.
- API không cần gọi trực tiếp từ browser bằng port riêng; frontend gọi cùng origin qua `/api`.

Môi trường production:

- Mặc định bind `127.0.0.1:80` vì bản đầu không có auth.
- Nếu cần truy cập từ máy khác, dùng SSH tunnel hoặc reverse proxy riêng có auth/HTTPS do người vận hành cấu hình.
- `manager-api` có quyền Docker/Compose; `manager-web` không có quyền Docker socket hay shell.

## Service Allowlist

Backend chỉ chấp nhận service nằm trong compose hiện tại:

- `jxmysql`
- `jxmssql`
- `paysys`
- `s3relayserver`
- `goddess`
- `bishop`
- `s3relay`
- `jxserver`

Không endpoint nào nhận shell command tuỳ ý từ client. Mọi input như service name, action, backup filename, tail size đều được validate bằng schema và kiểm tra allowlist.

## API Dự Kiến

API trả envelope thống nhất:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Endpoint service:

- `GET /api/services`: trả danh sách service, container, state, health, image, ports, startedAt.
- `POST /api/services/:name/start`: chạy `docker compose up -d <service>`.
- `POST /api/services/:name/stop`: chạy `docker compose stop <service>`.
- `POST /api/services/:name/restart`: chạy `docker compose restart <service>`.

Endpoint logs:

- `GET /api/services/:name/logs?tail=300`: trả Docker logs gần nhất.
- `GET /api/services/:name/logs/stream?tail=100`: stream log realtime bằng SSE nếu triển khai realtime trong bản đầu.

Endpoint backup/restore:

- `GET /api/backups`: liệt kê backup MySQL và MSSQL do app quản lý.
- `POST /api/backups/mysql`: tạo backup MySQL ngay.
- `POST /api/backups/mssql`: tạo backup MSSQL ngay.
- `POST /api/backups/all`: tạo backup cả hai database.
- `POST /api/restores/mysql`: restore MySQL từ backup đã chọn.
- `POST /api/restores/mssql`: restore MSSQL từ backup đã chọn.

Endpoint job/audit:

- `GET /api/jobs`: trạng thái thao tác dài như backup/restore.
- `GET /api/audit`: lịch sử service actions, backup, restore ở mức vận hành.

## UI Design

UI dùng Mantine từ `mantine.dev`, không tạo design system riêng nếu Mantine đã có component phù hợp.

Component Mantine dự kiến:

- `AppShell` cho khung app.
- `Table` cho danh sách service.
- `Badge` cho state/health.
- `Button`, `ActionIcon`, `Menu`, `Group`, `Stack` cho thao tác.
- `Tabs` hoặc segmented control cho log/backup panel nếu màn hình hẹp.
- `Modal` cho xác nhận stop/restart/restore.
- `Notifications` cho kết quả thao tác.
- `Select`, `NumberInput`, `Switch` cho chọn service, tail size, auto-follow.
- `Code`/vùng monospace có scroll cho log output.

Dashboard đã duyệt:

- Header hiển thị tên app, compose project và nút refresh/backup nhanh.
- Khu chính gồm service table ở bên trái.
- Panel bên phải gồm Docker logs và database backup/restore.
- Mỗi service có trạng thái, health và nút `Log`, `Start`, `Stop`, `Restart` phù hợp trạng thái hiện tại.
- Restore luôn mở modal xác nhận nguy hiểm, yêu cầu nhập lại filename hoặc database target.

## Luồng Service Actions

1. Frontend gọi `GET /api/services` khi mở dashboard và theo chu kỳ refresh ngắn.
2. Người dùng chọn `Start`, `Stop` hoặc `Restart`.
3. UI mở modal xác nhận với action nguy hiểm như `Stop`, `Restart`.
4. Backend validate service name theo allowlist.
5. Backend chạy Docker Compose CLI trong working directory repo.
6. Backend trả kết quả chuẩn hoá.
7. Frontend hiển thị notification và refetch service list.

Với logs:

1. Người dùng chọn service và tail size.
2. UI gọi logs API hoặc mở SSE stream.
3. Backend chạy `docker compose logs` với service đã validate.
4. Nếu stream realtime, backend dọn process khi client disconnect.
5. Nút clear chỉ xoá nội dung log trên client, không xoá Docker logs.

## Backup Và Restore

### MySQL

- Backup chạy qua container `jxmysql` bằng `mysqldump`.
- File lưu dưới thư mục app quản lý, ví dụ `database/backups/mysql/mysql-YYYYMMDD-HHmmss.sql.gz`.
- Restore chỉ nhận filename thuộc danh sách backup hợp lệ.
- Backend kiểm tra container `jxmysql` đang chạy trước khi backup/restore.
- Restore stream file `.sql.gz` vào `mysql`; không nhận path tuỳ ý từ client.

### MSSQL

- Backup chạy qua `sqlcmd` trong container `jxmssql` bằng lệnh `BACKUP DATABASE ... TO DISK`.
- File lưu ở thư mục mount phù hợp, ví dụ `database/mssql/data/database_backups/mssql-YYYYMMDD-HHmmss.bak`.
- Restore kiểm tra connection, backup file, database target và trạng thái container.
- Restore có thể đưa database về single-user, chạy `RESTORE DATABASE ... WITH REPLACE`, rồi đưa về multi-user nếu cần.
- UI cảnh báo rõ restore sẽ ghi đè dữ liệu hiện tại.

### Lịch Backup

- Scheduler nội bộ trong API đọc env như `BACKUP_SCHEDULE=0 3 * * *` và `BACKUP_RETENTION_DAYS=14`.
- Bản đầu hiển thị schedule hiện tại và lịch sử backup.
- Chỉnh schedule qua env để tránh UI thay đổi lịch nhầm.
- Retention job chỉ xoá file nằm trong thư mục backup do app quản lý.

## Error Handling

- Backend map lỗi Docker/DB thành thông báo rõ: service không tồn tại, container chưa chạy, backup thất bại, restore bị từ chối, file backup không hợp lệ.
- Server log giữ command name, exit code và stderr đã lọc thông tin nhạy cảm.
- UI không hiển thị raw command hoặc secret.
- Backup/restore là thao tác dài, được theo dõi bằng job state `running`, `succeeded`, `failed`.
- Nếu action đang chạy, UI disable nút liên quan để tránh thao tác trùng.

## Security

- Bản đầu không có login, nên production mặc định bind `127.0.0.1:80`.
- Dev có chế độ bind `0.0.0.0:80` để truy cập qua IP trong mạng tin cậy.
- Không expose Docker socket cho frontend.
- Không nhận shell command từ client.
- Validate mọi input ở API boundary.
- Backup filename phải nằm trong thư mục backup được quản lý, chống path traversal.
- Restore yêu cầu xác nhận kép trong UI.
- Không hardcode secret mới trong app; dùng env hoặc cấu hình được chỉ định.
- Trước khi expose ra mạng rộng hơn, cần bổ sung auth, HTTPS và rate limiting.

## Testing

Unit tests:

- Parse output `docker compose ps`.
- Validate service allowlist.
- Validate backup filename/path guard.
- Build command arguments an toàn, không dùng shell interpolation từ input client.
- Map lỗi command sang API error.

Integration tests:

- API service actions với Docker runner fake/mock.
- API logs với process stream fake.
- Backup/restore path validation và job state.

E2E tests:

- Mở dashboard và xem service list.
- Chọn service và xem Docker logs.
- Xác nhận stop/restart modal.
- Chạy backup now.
- Mở restore modal và kiểm tra xác nhận kép.

Manual verification trước khi dùng restore thật:

- Backup MySQL và MSSQL trên dữ liệu test.
- Restore MySQL và MSSQL trên môi trường test.
- Kiểm tra app không restore từ file ngoài thư mục backup quản lý.

## MCP Mantine

Khi triển khai UI, cấu hình MCP Mantine để tra component/API từ Mantine:

```json
{
  "mcpServers": {
    "mantine": {
      "command": "npx",
      "args": ["-y", "@mantine/mcp-server"]
    }
  }
}
```

Nguồn tham chiếu UI chính là `mantine.dev`.

## Tiêu Chí Hoàn Thành

- Dashboard chạy được ở port `80` trong dev qua `localhost` và IP máy dev.
- Service table hiển thị đúng trạng thái các service trong compose hiện tại.
- Start/stop/restart hoạt động qua API allowlist.
- Docker logs xem được theo từng service.
- Backup MySQL và MSSQL tạo file trong thư mục quản lý.
- Restore MySQL và MSSQL chỉ chạy sau xác nhận kép và chỉ từ file hợp lệ.
- API không nhận command/path tuỳ ý từ client.
- Test unit/integration/E2E chính chạy được trong pipeline hoặc local script.
