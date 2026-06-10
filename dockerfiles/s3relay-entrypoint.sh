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

DATABASE_INI="/src/paysys/database.ini"
if [ -f "$DATABASE_INI" ]; then
    echo "[S3Relay] Checking encrypted database settings..."
    
    # Tạo file tạm để sửa đổi tránh lỗi busy
    TEMP_INI="/tmp/database.ini.tmp"
    cp "$DATABASE_INI" "$TEMP_INI"
    
    # Chỉ cập nhật khi người dùng điền giá trị cụ thể và khác 'auto' hoặc rỗng
    # Nếu là 'auto' hoặc rỗng, giữ nguyên giá trị sẵn có trong database.ini
    UPDATED=0
    
    if [ -n "${JX_MSSQL_IP_ENCRYPTED:-}" ] && [ "$JX_MSSQL_IP_ENCRYPTED" != "auto" ]; then
        echo "-> Updating Server IP in database.ini"
        sed -i -E "s/^([[:space:]]*Server[[:space:]]*=[[:space:]]*).*/\1$JX_MSSQL_IP_ENCRYPTED/g" "$TEMP_INI"
        UPDATED=1
    fi
    
    if [ -n "${JX_MSSQL_DB_ENCRYPTED:-}" ] && [ "$JX_MSSQL_DB_ENCRYPTED" != "auto" ]; then
        echo "-> Updating Database Name in database.ini"
        sed -i -E "s/^([[:space:]]*DataBase[[:space:]]*=[[:space:]]*).*/\1$JX_MSSQL_DB_ENCRYPTED/g" "$TEMP_INI"
        UPDATED=1
    fi

    if [ -n "${JX_MSSQL_USER_ENCRYPTED:-}" ] && [ "$JX_MSSQL_USER_ENCRYPTED" != "auto" ]; then
        echo "-> Updating User in database.ini"
        sed -i -E "s/^([[:space:]]*User[[:space:]]*=[[:space:]]*).*/\1$JX_MSSQL_USER_ENCRYPTED/g" "$TEMP_INI"
        UPDATED=1
    fi

    if [ -n "${JX_MSSQL_PASS_ENCRYPTED:-}" ] && [ "$JX_MSSQL_PASS_ENCRYPTED" != "auto" ]; then
        echo "-> Updating PassWord in database.ini"
        sed -i -E "s/^([[:space:]]*PassWord[[:space:]]*=[[:space:]]*).*/\1$JX_MSSQL_PASS_ENCRYPTED/g" "$TEMP_INI"
        UPDATED=1
    fi

    # Chỉ ghi đè lại file gốc nếu có cập nhật
    if [ "$UPDATED" -eq 1 ]; then
        cat "$TEMP_INI" > "$DATABASE_INI"
    fi
    rm -f "$TEMP_INI"
fi

echo "[S3Relay] Starting S3RelayServer.exe..."
exec wine S3RelayServer.exe
