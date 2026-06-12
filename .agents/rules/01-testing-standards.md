---
trigger: always_on
---

# 01. Testing & Quality Standards

Quy chuẩn bắt buộc về viết kiểm thử để đảm bảo tính ổn định và ngăn ngừa lỗi hệ thống (Regression).

> [!NOTE]
> Quy trình TDD (RED - GREEN - REFACTOR) và cấu trúc Arrange-Act-Assert (AAA Pattern) cơ bản tuân thủ hoàn toàn theo tiêu chuẩn chung tại [common/testing.md](../.claude/rules/ecc/common/testing.md).

### 1. Các Kịch Bản Kiểm Thử Bắt Buộc (Mandatory Test Cases)
Mỗi API hoặc Service khi xây dựng mới hoặc sửa đổi phải có đầy đủ các ca kiểm thử sau:
- **Happy Path**: Dữ liệu hợp lệ, thực thi thành công và trả về đúng kết quả.
- **Validation & Error Handling**: Dữ liệu không hợp lệ (sai định dạng, trống trường bắt buộc) phải trả về lỗi `400 Bad Request` hoặc mã lỗi tương ứng.
- **Security & Scoping (Anti-IDOR)**: Kiểm tra phân quyền đa đơn vị (Multi-unit scoping). Chặn truy cập và trả về `403 Forbidden` khi người dùng cố tình đọc/ghi dữ liệu của đơn vị ngoài phạm vi quản lý.
- **Cache Invalidation**: Xác minh bộ nhớ đệm (Cache) được giải phóng hoặc cập nhật chính xác sau các thao tác ghi dữ liệu (Create, Update, Delete).

### 2. Quy trình xác minh tự động dành cho AI Agent
- **Bắt buộc chạy test lại**: Sau khi thực hiện bất kỳ thay đổi nào đối với mã nguồn (sửa code, sửa UI, refactor), AI Agent bắt buộc phải chạy các câu lệnh test toàn diện của dự án (ví dụ: `pnpm test` cho UI, `dotnet test` cho API) để xác minh các thay đổi.
- **Bắt buộc build + test cho API**: Sau mỗi lần chỉnh sửa mã nguồn backend trong `API/` hoặc `API.Tests/`, AI Agent phải chạy cả `dotnet build API/QLHT.csproj` và `dotnet test API.Tests/API.Tests.csproj` trước khi kết luận.
- **Không báo cáo hoàn thành khi chưa test**: Nghiêm cấm AI Agent phản hồi báo cáo hoàn thành công việc cho người dùng nếu chưa chạy thành công toàn bộ bộ công cụ kiểm tra tĩnh (linter, format, typecheck) và unit test. Nếu có lỗi phát sinh trong quá trình chạy test, AI Agent phải tự động sửa lỗi và chạy lại test cho đến khi vượt qua hoàn toàn.
- **Báo cáo kết quả xác minh**: Khi kết luận, AI Agent phải nêu rõ các lệnh đã chạy và kết quả. Nếu build/test bị chặn bởi môi trường hoặc sandbox, phải báo rõ lệnh bị chặn và nguyên nhân.
