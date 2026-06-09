#!/bin/sh
set -eu

mkdir -p /src/paysys/payserver_log

PREFIX_ARCHIVE=""
if [ -f /src/paysys/wineprefix-paysys.tar.gz ]; then
    PREFIX_ARCHIVE="/src/paysys/wineprefix-paysys.tar.gz"
elif [ -f /src/paysys/wineprefix-paysys.tar ]; then
    PREFIX_ARCHIVE="/src/paysys/wineprefix-paysys.tar"
fi

PREFIX_MARKER="${WINEPREFIX:-/root/.win32}/.paysys-prefix-archive.sha256"
USING_ARCHIVE_PREFIX=0

if [ -n "${PREFIX_ARCHIVE}" ]; then
    archive_sha="$(sha256sum "${PREFIX_ARCHIVE}" | awk '{print $1}')"
    current_sha=""
    if [ -f "${PREFIX_MARKER}" ]; then
        current_sha="$(cat "${PREFIX_MARKER}" 2>/dev/null || true)"
    fi

    if [ "${archive_sha}" != "${current_sha}" ]; then
        echo "[INFO] Importing Wine prefix from ${PREFIX_ARCHIVE}..."
        rm -rf "${WINEPREFIX:-/root/.win32}"
        tar -C /root -xf "${PREFIX_ARCHIVE}"
        mkdir -p "$(dirname "${PREFIX_MARKER}")"
        printf '%s\n' "${archive_sha}" >"${PREFIX_MARKER}"
    else
        echo "[INFO] Wine prefix archive already imported."
    fi
    USING_ARCHIVE_PREFIX=1
fi

# Xóa lock file Xvfb cũ
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp &
    sleep 1
fi

if [ "${USING_ARCHIVE_PREFIX}" -eq 1 ]; then
    echo "[INFO] Skipping wineboot for imported Wine prefix."
else
    wineboot --init >/tmp/paysys-wineboot.log 2>&1 || true
    wineserver -w || true
fi

if [ "${USING_ARCHIVE_PREFIX}" -eq 1 ]; then
    echo "[INFO] Using imported Wine prefix; keeping its registry and DLL overrides."
else
    # Cài MDAC28 nếu SQLOLEDB chưa đăng ký
    if ! wine reg query 'HKCR\SQLOLEDB' >/dev/null 2>&1; then
        echo "[INFO] SQLOLEDB not registered. Installing MDAC28..."

        if [ "${INSTALL_MDAC:-auto}" != "0" ]; then
            if [ -f /src/paysys/MDAC_TYP.EXE ]; then
                mkdir -p /root/.cache/winetricks/mdac28
                cp /src/paysys/MDAC_TYP.EXE /root/.cache/winetricks/mdac28/MDAC_TYP.EXE
            fi

            winetricks --force -q mdac28 || echo "[WARN] MDAC install failed."
            wineserver -w || true
        fi
    fi

    # Copy native DLLs từ OLE DB folder vào system32
    OLEDB_DIR="/root/.win32/drive_c/Program Files/Common Files/System/OLE DB"
    SYS32_DIR="/root/.win32/drive_c/windows/system32"

    if [ -d "${OLEDB_DIR}" ]; then
        echo "[INFO] Copying native DLLs to system32..."
        # Chỉ copy sqloledb (native) và các DLL phụ thuộc
        # KHÔNG copy oledb32.dll - dùng bản builtin của Wine (hỗ trợ MSDAINITIALIZE)
        for dll in sqloledb.dll sqloledb.rll msdatl3.dll; do
            if [ -f "${OLEDB_DIR}/${dll}" ]; then
                cp -f "${OLEDB_DIR}/${dll}" "${SYS32_DIR}/${dll}"
            fi
        done
    fi

    # DLL overrides: sqloledb = native, oledb32 = builtin (Wine's built-in có MSDAINITIALIZE)
    echo "[INFO] Setting DLL overrides..."
    wine reg add 'HKCU\Software\Wine\DllOverrides' /v '*sqloledb' /t REG_SZ /d 'native' /f 2>/dev/null || true
    wine reg add 'HKCU\Software\Wine\DllOverrides' /v '*msdatl3' /t REG_SZ /d 'native,builtin' /f 2>/dev/null || true
    wine reg add 'HKCU\Software\Wine\DllOverrides' /v '*oledb32' /t REG_SZ /d 'builtin' /f 2>/dev/null || true
    wineserver -w || true

    # Đăng ký sqloledb native
    echo "[INFO] Registering sqloledb.dll..."
    wine regsvr32 sqloledb.dll 2>/dev/null || true
    wineserver -w || true
fi

echo "[Paysys] Starting Sword3PaySys.exe..."
exec wine Sword3PaySys.exe
