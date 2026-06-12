---
trigger: always_on
---

# 05. UI/UX & Design Standards

Tiêu chuẩn xây dựng giao diện người dùng (UI) cao cấp, dễ tiếp cận và nhất quán bằng Mantine UI và Vercel Design.

### 1. Visual & Styling
- **Core Stack**: React 19, TypeScript, Vite.
- **UI Library**: Mantine UI v9. ưu tiên sử dụng công cụ MCP mantine (như search_docs, get_item_doc, get_item_props) 
- **Styling**: Sử dụng Mantine Styles API kết hợp với CSS Modules. Tránh dùng Tailwind CSS trừ khi có yêu cầu cụ thể.
- **Icons**: Sử dụng `@tabler/icons-react` (Stroke cố định ở mức `1.5`).
### 2. Datetime Formatting
- **Thư viện**: Sử dụng `dayjs` thiết lập ngôn ngữ Tiếng Việt (`vi`).
- **Danh sách/Bảng**: Hiển thị thời gian tương đối (ví dụ: "2 giờ trước") cho các bản ghi mới.
- **Tooltip**: Khi di chuột qua (hover), bắt buộc hiển thị tooltip với định dạng đầy đủ `HH:mm:ss DD/MM/YYYY`.