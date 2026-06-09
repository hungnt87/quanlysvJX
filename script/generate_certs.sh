#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="database/mssql/certs"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

echo "=== 1. Tạo Root CA ==="
openssl req -x509 \
  -nodes \
  -newkey rsa:2048 \
  -subj '/CN=MyMSSQL-CA' \
  -keyout ca.key \
  -out ca.crt \
  -days 3650

echo "=== 2. Tạo Private Key và CSR cho SQL Server ==="
openssl req \
  -nodes \
  -newkey rsa:2048 \
  -subj '/CN=localhost' \
  -keyout mssql.key \
  -out mssql.csr

echo "=== 3. Tạo file cấu hình SAN ==="
cat > openssl.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF

echo "=== 4. Ký chứng chỉ Server bằng Root CA ==="
openssl x509 -req \
  -in mssql.csr \
  -CA ca.crt \
  -CAkey ca.key \
  -CAcreateserial \
  -out mssql.pem \
  -days 3650 \
  -extfile openssl.ext

echo "=== 5. Thiết lập quyền truy cập cho file chứng chỉ ==="
# Cấp quyền đọc ghi cho owner, mssql chạy dưới dạng không root cần đọc các file này.
# Cần set quyền 600 hoặc 644 tùy driver, mssql yêu cầu khóa riêng phải bảo mật (thường là 600 hoặc 640).
chmod 600 mssql.key mssql.pem
chmod 644 ca.crt

echo "=== Hoàn thành tạo chứng chỉ SSL ==="
ls -l
