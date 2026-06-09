#!/bin/sh
set -eu

WINE_PREFIX="${WINEPREFIX:-/home/appuser/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"

mkdir -p /src/paysys/relayserver_log

# Xóa lock file của Xvfb cũ nếu có
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 || true
if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp &
    sleep 1
fi

if [ -f "${READY_MARKER}" ]; then
    echo "[INFO] Using baked MDAC/SQLOLEDB Wine prefix: ${READY_MARKER}"
else
    echo "[WARN] Baked MDAC/SQLOLEDB marker not found: ${READY_MARKER}"
fi

# Vô hiệu hóa Mono và Gecko để tránh treo hộp thoại GUI khi chạy Wine
export WINEDLLOVERRIDES="mscoree,mshtml=d"

echo "[S3Relay] Starting S3RelayServer.exe..."
exec wine S3RelayServer.exe
