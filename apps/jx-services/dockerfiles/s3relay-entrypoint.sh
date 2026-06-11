#!/bin/sh
set -eu

WINE_PREFIX="${S3RELAY_WINEPREFIX:-/home/appuser/.win32}"
export WINEPREFIX="${WINE_PREFIX}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"

mkdir -p /src/paysys/relayserver_log

# Xóa lock file của Xvfb cũ nếu có
DISPLAY_NUM=$(echo "${DISPLAY}" | sed 's/://g')
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" || true
if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb-${DISPLAY_NUM}.log 2>&1 &
    sleep 1
fi

if [ -f "${READY_MARKER}" ]; then
    echo "[INFO] Using baked MDAC/SQLOLEDB Wine prefix: ${READY_MARKER}"
else
    echo "[WARN] Baked MDAC/SQLOLEDB marker not found: ${READY_MARKER}"
fi

# Vô hiệu hóa Mono/Gecko/Vulkan và ẩn các kênh Wine không fatal trong container.
export WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-mscoree,mshtml,winevulkan=d}"
export WINEDEBUG="${WINEDEBUG:--vulkan,-ntoskrnl,-service,-ole,-ntdll,-sync}"

update_ini_key() {
    file="$1"
    section="$2"
    key="$3"
    value="$4"
    temp_update="/tmp/$(basename "$file").update"

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
                        match(right, /^[ \t]*/)
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

update_database_key() {
    encrypted_value="$1"
    database_key="$2"
    label="$3"

    if [ -n "$encrypted_value" ] && [ "$encrypted_value" != "auto" ]; then
        echo "-> Updating ${label} in database.ini"
        update_ini_key "$TEMP_INI" "card" "$database_key" "$encrypted_value"
        update_ini_key "$TEMP_INI" "account" "$database_key" "$encrypted_value"
        UPDATED=1
    fi
}

clear_database_role_settings() {
    update_ini_key "$TEMP_INI" "role" "Server" ""
    update_ini_key "$TEMP_INI" "role" "DataBase" ""
    update_ini_key "$TEMP_INI" "role" "User" ""
    update_ini_key "$TEMP_INI" "role" "PassWord" ""
    UPDATED=1
}

DATABASE_INI="/src/paysys/database.ini"
if [ -f "$DATABASE_INI" ]; then
    echo "[S3Relay] Checking encrypted database settings..."
    
    # Tạo file tạm để sửa đổi tránh lỗi busy
    TEMP_INI="/tmp/database.ini.tmp"
    cp "$DATABASE_INI" "$TEMP_INI"
    
    # Chỉ cập nhật khi người dùng điền giá trị cụ thể và khác 'auto' hoặc rỗng
    # Nếu là 'auto' hoặc rỗng, giữ nguyên giá trị sẵn có trong database.ini
    UPDATED=0
    
    update_database_key "${JX_MSSQL_IP_ENCRYPTED:-}" "Server" "Server IP"
    update_database_key "${JX_MSSQL_DB_ENCRYPTED:-}" "DataBase" "Database Name"
    update_database_key "${JX_MSSQL_USER_ENCRYPTED:-}" "User" "User"
    update_database_key "${JX_MSSQL_PASS_ENCRYPTED:-}" "PassWord" "PassWord"
    clear_database_role_settings

    # Chỉ ghi đè lại file gốc nếu có cập nhật
    if [ "$UPDATED" -eq 1 ]; then
        cat "$TEMP_INI" > "$DATABASE_INI"
    fi
    rm -f "$TEMP_INI"
fi

echo "[S3Relay] Starting S3RelayServer.exe..."
exec wine S3RelayServer.exe
