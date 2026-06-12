---
trigger: always_on
---

# 04. Frontend Architecture & Orchestration

Quy chuẩn tổ chức mã nguồn Frontend, quản lý luồng dữ liệu và thiết kế component có thể tái sử dụng.

### 1. Modular Directory Structure
Mỗi mô-đun chức năng (ví dụ: `donvi`, `he-thong`, `user`) phải được đóng gói gọn gàng trong thư mục riêng biệt với cấu trúc:
- `hooks/`: Quản lý trạng thái cục bộ, logic lấy dữ liệu (TanStack Query) và các actions.
- `components/`: Chia nhỏ thành `manager/` (quản lý bảng/danh sách), `detail/` (chi tiết), `modals/` (hộp thoại nhập liệu), `shared/` (dùng chung trong mô-đun).
- `services/`: Khai báo API endpoints và logic tương tác cụ thể của mô-đun.
- `utils/`: Các hàm bổ trợ chuyên biệt.
- `types.ts`: Định nghĩa TypeScript interfaces và Enums cho mô-đun.
- `index.ts`: Điểm xuất khẩu (export) duy nhất của mô-đun.

### 2. State Management & Data Fetching
- **Server State**: Sử dụng `TanStack Query` (`@tanstack/react-query`) để thực hiện cache, đồng bộ và tải dữ liệu từ API.
- **Tables**: Sử dụng `TanStack Table` cho các bảng danh sách phức tạp để hỗ trợ phân trang, sắp xếp và lọc hiệu quả.

### 3. Naming Conventions (Quy tắc đặt tên)
- **Thư mục chung**: kebab-case (ví dụ: `components/`, `custom-hooks/`).
- **Thư mục Component**: PascalCase (ví dụ: `components/HeaderNavigation/`).
- **Tệp Component**: PascalCase + `.tsx` (ví dụ: `Button.tsx`, `Header.tsx`).
- **Tệp Hook**: `use` + camelCase (ví dụ: `useAuth.ts`, `useWindowSize.ts`).
- **Tệp Service / Utility**: camelCase + suffix (ví dụ: `authService.ts`, `stringUtils.ts`).
- **Biến & Hàm**: camelCase (ví dụ: `isLoggedIn`, `getUserData()`).
- **Hằng số**: UPPER_SNAKE_CASE (ví dụ: `ITEMS_PER_PAGE`, `THEME_COLOR`).