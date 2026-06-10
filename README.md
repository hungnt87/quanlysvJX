# Hướng Dẫn Cài Đặt & Chạy Trình Quản Lý JX (Dành Cho Người Mới)

Tài liệu này hướng dẫn chi tiết từng bước để bạn tải mã nguồn, cấu hình môi trường và khởi chạy hệ thống quản lý tài khoản/dịch vụ game JX bằng Docker. Hướng dẫn được thiết kế dễ hiểu cho người ít am hiểu về IT.

---

## Các Bước Chuẩn Bị & Cài Đặt

### Bước 1: Tải mã nguồn về máy (Git Clone)
Mở cửa sổ Terminal/Command Line trên máy tính của bạn và chạy lệnh sau để tải dự án về:
```bash
git clone https://github.com/hungnt87/quanlysvJX.git
cd quanlysvJX
```

---

### Bước 2: Tạo các thư mục cần thiết và phân quyền
Hệ thống cần một số thư mục để chứa cơ sở dữ liệu và chứng chỉ bảo mật. Hãy chạy các dòng lệnh dưới đây để tự động tạo thư mục và cấp quyền truy cập chính xác (tránh lỗi Permission Denied khi Docker chạy):

```bash
# 1. Tạo các thư mục chứa dữ liệu và cấu hình
mkdir -p apps/jx-services/mount/database/mysql_server1/data
mkdir -p apps/jx-services/mount/database/backups/mysql
mkdir -p apps/jx-services/mount/database/mssql/data
mkdir -p apps/jx-services/mount/database/mssql/seed
mkdir -p apps/jx-services/mount/database/mssql/certs
mkdir -p apps/jx-services/mount/logs

# 2. Phân quyền đọc/ghi để Docker có thể ghi dữ liệu cơ sở dữ liệu và đọc chứng chỉ
chmod -R 777 apps/jx-services/mount/database/mysql_server1/data
chmod -R 777 apps/jx-services/mount/database/backups/mysql
chmod -R 777 apps/jx-services/mount/database/mssql/data
chmod -R 755 apps/jx-services/mount/database/mssql/certs
chmod -R 755 apps/jx-services/mount/database/mssql/seed
chmod 644 apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak

```

---

### Bước 3: Lấy IP của máy chủ (Host IP)
Để các dịch vụ trong Docker và máy chủ giao tiếp được với nhau, bạn cần biết IP mạng LAN của máy mình.
* Chạy lệnh sau trong Terminal để tìm IP:
  ```bash
  hostname -I
  ```
* Hệ thống sẽ trả về danh sách các địa chỉ IP (ví dụ: `192.168.10.4`). Hãy ghi nhớ địa chỉ IP đầu tiên này để điền vào cấu hình ở Bước 4.

---

### Bước 4: Tạo và điền file cấu hình môi trường (.env)
1. Tạo một file mới tên là `.env` ở ngay thư mục gốc của dự án (nằm cùng thư mục với file `docker-compose.yaml`).
2. Sao chép nội dung bên dưới, dán vào file `.env` và chỉnh sửa các dòng tương ứng:

```env
# 1. Đường dẫn thư mục chứa server JX trên máy của bạn (Hãy đổi sang đường dẫn thực tế của bạn)
SERVER_PATH=/home/hungnt/dev/jxser_vozer/server/

# 2. IP của máy chạy dịch vụ JX (Đặt 'auto' để tự động nhận dạng hoặc điền IP ở Bước 3)
JX_IP=auto

# 3. IP kết nối của các dịch vụ database (mặc định là auto -> tự nhận diện 127.0.0.1)
JX_MYSQL_IP=auto
JX_PAYSYS_IP=auto
JX_MSSQL_IP=auto

# 4. Cấu hình Database kết nối MSSQL dạng mã hóa (Dùng để chạy dịch vụ Paysys)
JX_MSSQL_IP_ENCRYPTED=v0vee0yAi0HkrLNs0SAM0AwAXCDdfo0y
JX_MSSQL_DB_ENCRYPTED=q0n8oitJqQQsfARc__0UCLAbwKw1FwNH
JX_MSSQL_USER_ENCRYPTED=q5wdvorvzRYp5dfxjDEjLRylzTRh9vpY
JX_MSSQL_PASS_ENCRYPTED=Zn0A_X0BcQBettvBSfzG5vXiBfwJXihZ

# 5. Cấu hình kết nối cơ sở dữ liệu MSSQL cho Trình quản lý (Manager API)
# IP kết nối từ trong Docker ra ngoài host
MSSQL_HOST=host.docker.internal
MSSQL_PORT=1433
MSSQL_DATABASE=account_tong
MSSQL_USER=sa
MSSQL_PASSWORD=SAJx123456
```

---

### Bước 5: Khởi chạy hệ thống bằng Docker

Hệ thống được thiết kế tối giản và dễ sử dụng nhất. Bạn chỉ cần khởi chạy **Trình Quản trị (Web Manager)** tại thư mục gốc của dự án. Tất cả các dịch vụ game JX (Paysys, Bishop, Goddess, Gameserver, Database...) sau đó sẽ được quản lý và khởi chạy trực tiếp trên giao diện Web mà bạn không cần phải vào thư mục `apps/jx-services` để chạy lệnh nữa.

Chạy lệnh duy nhất sau tại thư mục gốc:
```bash
docker compose up -d --build
```

---

### Bước 6: Truy cập giao diện quản trị và sử dụng
Mở trình duyệt web (Chrome, Edge, Firefox, v.v.) và truy cập vào một trong hai địa chỉ:
* **`http://localhost`** (nếu dùng trực tiếp trên máy chạy server).
* **`http://<IP-may-host>`** (ví dụ: `http://192.168.10.4` lấy ở Bước 3 nếu bạn truy cập từ máy khác trong cùng mạng LAN).

Giao diện Web cung cấp đầy đủ các tính năng:
1. **Bảng điều khiển & Logs**: Bật/tắt dịch vụ JX trực tiếp trên Web và theo dõi logs thời gian thực.
2. **Quản lý Tài khoản game**: Thêm tài khoản mới, thay đổi mật khẩu/hạn dùng hoặc xóa tài khoản vĩnh viễn khỏi Database một cách trực quan mà không cần gõ lệnh SQL.
3. **Sao lưu (Backup)**: Quản lý sao lưu cơ sở dữ liệu (xem chi tiết bên dưới).

---

## Tính Năng Sao Lưu (Backup) & Phục Hồi

Trình quản trị tích hợp sẵn công cụ quản lý Sao lưu tự động và thủ công cho cả MySQL (chứa dữ liệu game) và MSSQL (chứa tài khoản):

### 1. Sao lưu tự động (Scheduled Backup)
* Mặc định hệ thống tự động chạy tác vụ sao lưu vào lúc **3:00 sáng mỗi ngày** (cấu hình qua biến `BACKUP_SCHEDULE` trong file `.env` nếu cần đổi).
* Hệ thống sẽ tự động dọn dẹp và chỉ lưu giữ bản sao lưu trong vòng **14 ngày gần nhất** (`BACKUP_RETENTION_DAYS`) để tránh làm đầy ổ cứng.

### 2. Các thư mục lưu trữ bản sao lưu trên máy Host:
* Dữ liệu MySQL: `apps/jx-services/mount/database/backups/mysql/`
* Dữ liệu MSSQL: `apps/jx-services/mount/database/mssql/data/database_backups/`

### 3. Thao tác trên Web:
Tại tab **Sao lưu** trên giao diện quản trị:
* **Tạo bản sao lưu ngay lập tức**: Nhấn nút "Tạo sao lưu" để hệ thống chụp nhanh dữ liệu hiện tại của game.
* **Phục hồi (Restore)**: Chọn một bản sao lưu trong danh sách lịch sử và nhấn nút "Phục hồi" để đưa dữ liệu game quay về thời điểm sao lưu đó chỉ trong vài giây.

---

## Một Số Lưu Ý Quan Trọng
* **Khôi phục dữ liệu mẫu**: Ở lần chạy đầu tiên, hệ thống sẽ tự động khôi phục (Restore) dữ liệu từ file backup mẫu [account_tong_seed.bak](file:///home/hungnt/dev/quanlysvJX/apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak) nằm trong thư mục `seed`.
* **Bảo mật**: Hệ thống này hiện tại chưa tích hợp trang đăng nhập bảo mật và có gắn trực tiếp quyền điều khiển Docker của máy chủ qua socket. **Chỉ sử dụng dự án này trong mạng LAN gia đình tin cậy, tuyệt đối không mở cổng (Public Port) hoặc đưa trang quản trị này lên Internet công cộng.**
