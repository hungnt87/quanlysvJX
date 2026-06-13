# Thiết kế refactor Fastify API theo Layered Architecture

## Mục tiêu

Refactor toàn bộ API Fastify sang Pattern 1: Layered Architecture theo `nodejs-backend-patterns`, đồng thời chuẩn hóa error handling, validation middleware và API response format. Thay đổi này là breaking change có chủ đích: API sẽ đổi schema response trước, sau đó UI sẽ được cập nhật để đọc schema mới.

## Phạm vi

Refactor toàn bộ API trong `apps/api/src`, bao gồm:

- Fastify route registration.
- Controller layer cho HTTP mapping.
- Service layer cho business logic.
- Repository/data-access layer khi có truy cập file, database hoặc external process.
- Global error handler.
- Zod validation middleware.
- API response helper.
- UI API client trong `apps/ui/src/services/base/baseService.ts` để tương thích response schema mới.

Không ép response envelope cho các luồng không phải JSON API thông thường:

- Server-Sent Events.
- File download.
- Multipart upload stream internals.

Các endpoint này vẫn phải trả message lỗi rõ ràng theo cơ chế phù hợp với transport.

## Kiến trúc

Sử dụng đúng folder shape của Pattern 1: Layered Architecture:

```txt
apps/api/src/
  controllers/
  services/
  repositories/
  routes/
  middleware/
  utils/
  config/
  types/
```

Luồng xử lý chuẩn:

```txt
Fastify route
  -> validate middleware bằng Zod
  -> controller
  -> service
  -> repository hoặc domain utility
  -> response helper
```

Trách nhiệm từng layer:

- `routes/`: khai báo Fastify route, gắn validation, gọi controller.
- `controllers/`: đọc request đã được validate, gọi service, trả response helper.
- `services/`: chứa business logic, orchestration Docker/env/version/backup/game account.
- `repositories/`: chứa truy cập dữ liệu như file system, registry file, database, hoặc external storage.
- `middleware/`: validation middleware và global error handler.
- `utils/`: response helper, error classes, helper thuần.
- `types/`: shared API/domain types.

Các domain utility hiện tại như `backups/`, `versions/`, `gameAccounts/`, `services/`, `system/`, `env/` chưa cần move toàn bộ ngay trong bước đầu. Service layer mới có thể gọi lại các utility này để giữ diff nhỏ và giảm rủi ro. Sau khi các phase chính xanh test, những phần thực sự là data access sẽ được move dần vào `repositories/`.

## API Response Format

Schema mới theo `nodejs-backend-patterns`.

Success response:

```ts
{
  status: 'success',
  message?: string,
  data: T
}
```

Error response:

```ts
{
  status: 'error',
  message: string,
  errors?: Array<{ field: string; message: string }>
}
```

Paginated response:

```ts
{
  status: 'success',
  data: T[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number
  }
}
```

`success`, `error` và `data: null` theo envelope cũ sẽ bị loại bỏ. UI phải đọc `status` và `message`.

## Error Handling

Global error handler xử lý tập trung:

- `AppError`: trả status code và message từ error.
- `ValidationError`: trả HTTP 400, message `"Validation failed"` và danh sách `errors`.
- Fastify hoặc HTTP client error có `statusCode`: trả status code và message phù hợp.
- Unexpected error: log chi tiết ở server, client nhận `"Internal server error"`.

Không để route tự format lỗi JSON. Route/controller/service chỉ throw error có nghĩa. Error handler chịu trách nhiệm response.

Các error class cần có:

- `AppError`.
- `ValidationError`.
- `NotFoundError`.
- `ConflictError`.
- `CommandError` cho lỗi Docker/command hiện có.

Không thêm `UnauthorizedError` hoặc `ForbiddenError` trong đợt này vì API hiện chưa có auth flow. Khi thêm auth, bổ sung hai class đó theo cùng pattern.

## Validation Middleware

Dùng Zod cho validation body/query/params:

```ts
validate({
  body?: z.ZodType,
  query?: z.ZodType,
  params?: z.ZodType
})
```

Middleware parse dữ liệu, map lỗi Zod thành:

```ts
{ field: 'body.name', message: '...' }
```

Controller chỉ nhận request đã validate. Không thêm validation ad hoc trong route nếu có thể mô tả bằng schema. Những kiểm tra phụ thuộc runtime/business state vẫn nằm trong service và throw `ValidationError` hoặc error phù hợp.

## Kế hoạch triển khai theo phase

### Phase 1: Foundation

Tạo nền dùng chung:

- `utils/response.ts`.
- `utils/errors.ts`.
- `middleware/errorHandler.ts`.
- `middleware/validate.ts`.
- Test cho response helper, error handler, validation middleware.
- Wire global error handler trong `app.ts`.

### Phase 2: Simple routes

Refactor các route ít rủi ro:

- Health.
- Env.
- System.

Mục tiêu là chứng minh route/controller/service/schema flow mới hoạt động trước khi đụng phần stream/upload.

### Phase 3: Version và service routes

Refactor:

- Version routes.
- Service routes.
- Log routes.
- SSE start/prepare image flow.

SSE không dùng JSON envelope, nhưng phải dùng cùng error classes và message rõ ràng.

### Phase 4: Backup và scheduled backup

Refactor:

- Backup file/list/update/delete/restore.
- Upload backup.
- Scheduled backup jobs.
- Scheduled backup runs.

Upload và download giữ transport riêng. JSON endpoints dùng response schema mới.

### Phase 5: Game accounts

Refactor game account routes sang controller/service/schema mới, tái sử dụng repository/service hiện có cho MSSQL.

### Phase 6: UI compatibility

Cập nhật UI:

- `ApiResponse` type trong `apps/ui/src/services/types.ts`.
- `baseService.ts` đọc `status`.
- `status: 'error'` hiển thị toast đỏ bằng `message`, sau đó throw `Error(message)`.
- Non-GET `status: 'success'` có `message` hiển thị toast xanh.
- Các service method không còn giả định envelope cũ.
- Tests UI cập nhật theo schema mới.

### Phase 7: Cleanup và verification

- Xóa hoặc thay thế `apps/api/src/api/envelope.ts`.
- Xóa imports envelope cũ.
- Đảm bảo không còn route trả `{ success, error }`.
- Chạy typecheck, lint và test cho API/UI.

## Chiến lược kiểm thử

Mỗi phase phải có test trước hoặc test cập nhật trước khi đổi implementation:

- Unit tests cho response helper, errors, validation middleware.
- Integration tests cho route group sau refactor.
- Tests đảm bảo error response dùng schema mới.
- Tests đảm bảo validation error có `errors`.
- UI tests cho toast error/success theo response schema mới.
- Regression tests cho SSE/upload/download không bị ép envelope sai.

Lệnh kiểm tra tối thiểu:

```sh
npm --workspace apps/api run typecheck
npm --workspace apps/api test
npm --workspace apps/ui run typecheck
npm --workspace apps/ui run vitest
npm --workspace apps/ui run oxlint
npm --workspace apps/ui run format:test
```

## Rủi ro và giảm thiểu

- Breaking API schema có thể làm UI lỗi hàng loạt. Giảm thiểu bằng cách triển khai UI compatibility trong phase riêng và chạy test UI ngay sau khi API đổi.
- SSE/upload/download có transport khác JSON. Giảm thiểu bằng cách không ép envelope cho các endpoint này, chỉ chuẩn hóa message/error behavior.
- Big bang refactor dễ khó review. Giảm thiểu bằng phase nhỏ, mỗi phase test được độc lập.
- Move file quá nhiều làm diff lớn. Giảm thiểu bằng cách giữ domain utility cũ trong phase đầu, chỉ tạo layer mới ở boundary route/controller/service.

## Tiêu chí hoàn thành

- Tất cả JSON API trả schema mới.
- Không còn route trả envelope cũ `{ success, data, error }`.
- Global error handler xử lý lỗi tập trung.
- Zod validation middleware được dùng cho body/query/params ở route đã refactor.
- Route layer không chứa business logic chính.
- UI đọc schema mới và hiển thị toast từ `message`.
- API/UI typecheck và tests pass.
