#!/bin/sh
set -eu

mkdir -p /src/paysys/payserver_log

if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp &
    sleep 1
fi

wineboot --init >/tmp/paysys-wineboot.log 2>&1 || true
wineserver -w || true

if ! wine reg query 'HKCR\SQLOLEDB' >/dev/null 2>&1; then
    echo "[WARN] Wine provider SQLOLEDB is not registered. PaySys may not connect to MSSQL."

    if [ "${INSTALL_MDAC:-auto}" != "0" ]; then
        if [ -f /src/paysys/MDAC_TYP.EXE ]; then
            mkdir -p /root/.cache/winetricks/mdac28
            cp /src/paysys/MDAC_TYP.EXE /root/.cache/winetricks/mdac28/MDAC_TYP.EXE
        fi

        winetricks --force -q mdac28 || echo "[WARN] MDAC install failed. Put MDAC_TYP.EXE in paysyswin/ or set INSTALL_MDAC=0 to skip."
        wineserver -w || true
    fi
fi

exec wine Sword3PaySys.exe
