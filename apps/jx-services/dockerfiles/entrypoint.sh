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

update_ini_key() {
    local file="$1"
    local section="$2"
    local key="$3"
    local value="$4"
    local temp_update="/tmp/$(basename "$file").update"

    awk -v target_section="$section" -v target_key="$key" -v replacement="$value" '
        function trim(value) {
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            return value
        }
        BEGIN {
            active = 0
            target_section = tolower(target_section)
            target_key = tolower(target_key)
        }
        /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
            section_name = $0
            sub(/^[[:space:]]*\[/, "", section_name)
            sub(/\][[:space:]]*$/, "", section_name)
            active = (tolower(trim(section_name)) == target_section)
        }
        {
            if (active) {
                separator_index = index($0, "=")
                if (separator_index > 0) {
                    left = substr($0, 1, separator_index - 1)
                    right = substr($0, separator_index + 1)
                    key_name = tolower(trim(left))
                    if (key_name == target_key && left !~ /^[[:space:]]*[;#]/) {
                        match(right, /^[[:space:]]*/)
                        print left "=" substr(right, RSTART, RLENGTH) replacement
                        next
                    }
                }
            }
            print
        }
    ' "$file" > "$temp_update"
    cat "$temp_update" > "$file"
    rm -f "$temp_update"
}

# 2. Tự động đoán file cấu hình nếu không khai báo CONFIG_FILE
if [ -z "$CONFIG_FILE" ]; then
    case "$APP_CMD" in
        "goddess_y") CONFIG_FILE="goddess.cfg" ;;
        "bishop_y")  CONFIG_FILE="bishop.cfg" ;;
        "s3relay_y") 
            if [ -f "relay_config.ini" ]; then
                CONFIG_FILE="relay_config.ini"
            else
                CONFIG_FILE="s3relay/relay_config.ini"
            fi
            ;;
        "jx_linux_y") CONFIG_FILE="servercf0.ini" ;;
    esac
fi

# 3. Cập nhật IP vào file cấu hình
if [ -n "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ]; then
    echo "-> Updating IP in: $CONFIG_FILE"
    
    # Copy file ra một file tạm trong /tmp để sửa đổi (tránh lỗi mount point busy)
    TEMP_FILE="/tmp/$(basename "$CONFIG_FILE").tmp"
    cp "$CONFIG_FILE" "$TEMP_FILE"
    
    if [[ "$CONFIG_FILE" == *"goddess.cfg"* ]]; then
        update_ini_key "$TEMP_FILE" "Database" "Ip" "$JX_MYSQL_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "IntranetIp" "$JX_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
        
    elif [[ "$CONFIG_FILE" == *"bishop.cfg"* ]]; then
        update_ini_key "$TEMP_FILE" "Network" "AccSvrIP" "$JX_PAYSYS_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "IntranetIp" "$JX_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
        
    elif [[ "$CONFIG_FILE" == *"relay_config.ini"* ]]; then
        update_ini_key "$TEMP_FILE" "Database" "Ip" "$JX_MYSQL_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"

    elif [[ "$CONFIG_FILE" == *"servercf0.ini"* ]]; then
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
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
