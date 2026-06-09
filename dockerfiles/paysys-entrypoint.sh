#!/bin/sh
set -eu

WINE_PREFIX="${WINEPREFIX:-/home/appuser/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"

mkdir -p /src/paysys/payserver_log

# Xóa lock file của Xvfb cũ nếu có
DISPLAY_NUM=$(echo "${DISPLAY}" | sed 's/://g')
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" || true
if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp &
    sleep 1
fi

if [ -f "${READY_MARKER}" ]; then
    echo "[INFO] Using baked MDAC/SQLOLEDB Wine prefix: ${READY_MARKER}"
else
    echo "[WARN] Baked MDAC/SQLOLEDB marker not found: ${READY_MARKER}"
    echo "[WARN] Initializing setup..."
    if [ -f "/src/paysys/MDAC_TYP.EXE" ]; then
        /usr/local/bin/paysys-setup-mdac.sh /src/paysys/MDAC_TYP.EXE
    else
        echo "[ERROR] MDAC_TYP.EXE not found; cannot setup MDAC."
    fi
fi

# Vô hiệu hóa Mono và Gecko để tránh treo hộp thoại GUI khi chạy Wine
export WINEDLLOVERRIDES="mscoree,mshtml=d"

echo "[Paysys] Starting Sword3PaySys.exe..."
exec wine Sword3PaySys.exe

