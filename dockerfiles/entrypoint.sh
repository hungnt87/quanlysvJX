#!/bin/bash
set -e

# 1. Xác định IP máy chạy JX
if [ -z "$JX_IP" ] || [ "$JX_IP" = "auto" ]; then
    JX_IP=$(hostname -I | awk '{print $1}')
fi

# Mặc định IP MySQL là 127.0.0.1 nếu để auto hoặc trống
if [ -z "$JX_MYSQL_IP" ] || [ "$JX_MYSQL_IP" = "auto" ]; then
    JX_MYSQL_IP="127.0.0.1"
fi

# Mặc định IP Paysys là 127.0.0.1 nếu để auto hoặc trống
if [ -z "$JX_PAYSYS_IP" ] || [ "$JX_PAYSYS_IP" = "auto" ]; then
    JX_PAYSYS_IP="127.0.0.1"
fi

echo "=========================================="
echo " JX Auto IP Detection & Config Updater"
echo " Active IP JX : $JX_IP"
echo " Active IP SQL: $JX_MYSQL_IP"
echo " Active IP Pay: $JX_PAYSYS_IP"
echo "=========================================="

# 2. Tự động đoán file cấu hình nếu không khai báo CONFIG_FILE
if [ -z "$CONFIG_FILE" ]; then
    case "$APP_CMD" in
        "goddess_y") CONFIG_FILE="goddess.cfg" ;;
        "bishop_y")  CONFIG_FILE="bishop.cfg" ;;
        "s3relay_y") CONFIG_FILE="s3relay/relay_config.ini" ;;
        "jx_linux_y") CONFIG_FILE="servercf0.ini" ;;
    esac
fi

# 3. Cập nhật IP vào file cấu hình
if [ -n "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ]; then
    echo "-> Updating IP in: $CONFIG_FILE"
    
    # Copy file ra một file tạm trong /tmp để sửa đổi (tránh lỗi mount point busy)
    TEMP_FILE="/tmp/$(basename "$CONFIG_FILE").tmp"
    cp "$CONFIG_FILE" "$TEMP_FILE"
    
    # Cập nhật InternetIp (cho tất cả các file)
    sed -i -E "s/^([[:space:]]*InternetIp[[:space:]]*=[[:space:]]*).*/\1$JX_IP/g" "$TEMP_FILE"
    
    if [[ "$CONFIG_FILE" == *"goddess.cfg"* ]]; then
        # Cập nhật IntranetIp
        sed -i -E "s/^([[:space:]]*IntranetIp[[:space:]]*=[[:space:]]*).*/\1$JX_IP/g" "$TEMP_FILE"
        # Cập nhật IP kết nối MySQL
        sed -i -E "s/^([[:space:]]*Ip[[:space:]]*=[[:space:]]*).*/\1$JX_MYSQL_IP/g" "$TEMP_FILE"
        
    elif [[ "$CONFIG_FILE" == *"bishop.cfg"* ]]; then
        # Cập nhật IntranetIp
        sed -i -E "s/^([[:space:]]*IntranetIp[[:space:]]*=[[:space:]]*).*/\1$JX_IP/g" "$TEMP_FILE"
        # Cập nhật IP kết nối Paysys
        sed -i -E "s/^([[:space:]]*AccSvrIP[[:space:]]*=[[:space:]]*).*/\1$JX_PAYSYS_IP/g" "$TEMP_FILE"
        
    elif [[ "$CONFIG_FILE" == *"relay_config.ini"* ]]; then
        # Cập nhật IP kết nối MySQL
        sed -i -E "s/^([[:space:]]*Ip[[:space:]]*=[[:space:]]*).*/\1$JX_MYSQL_IP/g" "$TEMP_FILE"
    fi
    
    # Ghi đè nội dung file tạm ngược lại vào file config gốc mà không thay đổi inode (tránh lỗi busy)
    cat "$TEMP_FILE" > "$CONFIG_FILE"
    rm -f "$TEMP_FILE"
else
    echo "-> [Warning] Config file '$CONFIG_FILE' not found or not defined!"
fi

# 4. Khởi chạy
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec "./${APP_CMD}"
fi
