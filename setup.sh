#!/usr/bin/env bash
# Script tự động tạo các thư mục cần thiết và phân quyền cho dự án quản lý JX

set -euo pipefail

echo "=========================================================="
echo " Đang tạo các thư mục lưu trữ dữ liệu cho JX..."
echo "=========================================================="

# 1. Tạo các thư mục chứa dữ liệu và cấu hình
mkdir -p apps/jx-services/mount/config
mkdir -p apps/jx-services/mount/database/mysql_server1/data
mkdir -p apps/jx-services/mount/database/backups/mysql
mkdir -p apps/jx-services/mount/database/mssql/data
mkdir -p apps/jx-services/mount/database/mssql/seed
mkdir -p apps/jx-services/mount/database/mssql/certs
mkdir -p apps/jx-services/mount/logs
mkdir -p apps/jx-services/versions

echo "✓ Đã tạo các thư mục cần thiết thành công."
echo ""
echo "=========================================================="
echo " Đang phân quyền cho các thư mục (chmod)..."
echo "=========================================================="

# 2. Phân quyền đọc/ghi để Docker vận hành ổn định
chmod -R 777 apps/jx-services/mount/database/mysql_server1/data || echo "Lưu ý: Có file/thư mục mysql thuộc quyền root/docker, việc đổi quyền một số file cũ có thể bị bỏ qua."
chmod -R 777 apps/jx-services/mount/database/backups/mysql || echo "Lưu ý: Có file/thư mục backup thuộc quyền root/docker, việc đổi quyền một số file cũ có thể bị bỏ qua."
chmod -R 777 apps/jx-services/mount/database/mssql/data || echo "Lưu ý: Có file/thư mục mssql thuộc quyền root/docker, việc đổi quyền một số file cũ có thể bị bỏ qua."
chmod -R 755 apps/jx-services/mount/database/mssql/certs
chmod -R 755 apps/jx-services/mount/database/mssql/seed
chmod -R 777 apps/jx-services/versions
chmod -R 777 apps/jx-services/mount/paysyswin
chmod -R 777 apps/jx-services/mount/logs

if [ -f "apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak" ]; then
  chmod 644 apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak
fi

echo "✓ Đã thiết lập phân quyền thành công."
echo "=========================================================="
echo " Hoàn tất! Bây giờ bạn có thể khởi chạy Docker."
echo "=========================================================="
