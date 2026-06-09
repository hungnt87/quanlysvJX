#!/bin/sh
set -eu

MDAC_EXE="${1:-/src/paysys/MDAC_TYP.EXE}"
WINE_PREFIX="${WINEPREFIX:-/home/appuser/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"
EXTRACT_DIR="/tmp/mdac-extract"
SQL_OLEDB_DIR="/tmp/sqloldb"
SQL_NET_DIR="/tmp/sqlnet"
SQL_ODBC_DIR="/tmp/sqlodbc"
WDSETUP_DIR="/tmp/wdsetup"
MDAC_XPAK_DIR="/tmp/mdacxpak"

if [ ! -f "${MDAC_EXE}" ]; then
    echo "[ERROR] ${MDAC_EXE} not found; cannot prepare MDAC/SQLOLEDB."
    exit 1
fi

echo "[INFO] Initializing Wine prefix at ${WINE_PREFIX}..."
mkdir -p "${WINE_PREFIX}"
export WINEDLLOVERRIDES="mscoree,mshtml=d"
wineboot --init
wineserver -w || true


echo "[INFO] Extracting MDAC_TYP.EXE CAB payloads..."
rm -rf "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"
mkdir -p "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"

cabextract -q -d "${EXTRACT_DIR}" "${MDAC_EXE}"
cabextract -q -d "${SQL_OLEDB_DIR}" "${EXTRACT_DIR}/sqloldb.cab"
cabextract -q -d "${SQL_NET_DIR}" "${EXTRACT_DIR}/sqlnet.cab"
cabextract -q -d "${SQL_ODBC_DIR}" "${EXTRACT_DIR}/sqlodbc.cab"
cabextract -q -d "${WDSETUP_DIR}" "${EXTRACT_DIR}/wdsetup.cab"
cabextract -q -d "${MDAC_XPAK_DIR}" "${EXTRACT_DIR}/mdacxpak.cab"

OLEDB_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/OLE DB"
ADO_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/ADO"
MSADC_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/MSADC"
SYS32_DIR="${WINE_PREFIX}/drive_c/windows/system32"
mkdir -p "${OLEDB_DIR}" "${ADO_DIR}" "${MSADC_DIR}" "${SYS32_DIR}"

echo "[INFO] Copying MDAC, SQLOLEDB, SQL Network and ODBC files..."
for file in msado15.dll msador15.dll msadox.dll msadomd.dll msjro.dll; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${ADO_DIR}/${file}"
        cp -f "${MDAC_XPAK_DIR}/${file}" "${SYS32_DIR}/${file}"
    fi
done

for file in msadce.dll msadcer.dll msadcf.dll msadcfr.dll msadco.dll msadcor.dll msadcs.dll msadds.dll msaddsr.dll msdaprst.dll msdaprsr.dll msdarem.dll msdaremr.dll msdfmap.dll handler.reg handsafe.reg adcvbs.inc adcjavas.inc; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${MSADC_DIR}/${file}"
    fi
done

for file in sqloledb.dll sqloledb.rll sqlsoldb.chm; do
    if [ -f "${SQL_OLEDB_DIR}/${file}" ]; then
        cp -f "${SQL_OLEDB_DIR}/${file}" "${OLEDB_DIR}/${file}"
        cp -f "${SQL_OLEDB_DIR}/${file}" "${SYS32_DIR}/${file}"
    fi
done

if [ -f "${SQL_OLEDB_DIR}/msdart.dll" ]; then
    cp -f "${SQL_OLEDB_DIR}/msdart.dll" "${SYS32_DIR}/msdart.dll"
fi

for dir in "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}"; do
    find "${dir}" -maxdepth 1 -type f | while IFS= read -r file; do
        cp -f "${file}" "${SYS32_DIR}/$(basename "${file}")"
    done
done

find "${MDAC_XPAK_DIR}" -maxdepth 1 -type f | while IFS= read -r file; do
    base="$(basename "${file}")"
    case "${base}" in
        *.dll|*.DLL|*.exe|*.EXE|*.cpl|*.CPL|*.tlb|*.TLB|*.rsp|*.RSP)
            cp -f "${file}" "${SYS32_DIR}/${base}"
            ;;
    esac
done

for dll in msdatl3.dll msdaps.dll msdadc.dll msdaenum.dll; do
    cp -f "${MDAC_XPAK_DIR}/${dll}" "${OLEDB_DIR}/${dll}" 2>/dev/null || true
    cp -f "${MDAC_XPAK_DIR}/${dll}" "${SYS32_DIR}/${dll}" 2>/dev/null || true
done

for file in oledb32.dll oledb32r.dll msdasql.dll msdasqlr.dll msdasc.dll msdaer.dll msdatt.dll msdaora.dll msdaorar.dll msdaosp.dll msdaurl.dll msxactps.dll; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${OLEDB_DIR}/${file}"
        cp -f "${MDAC_XPAK_DIR}/${file}" "${SYS32_DIR}/${file}"
    fi
done

echo "[INFO] Creating temporary registry file..."
REG_FILE="/tmp/mdac.reg"
cat >"${REG_FILE}" <<'EOF_REG'
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Wine\DllOverrides]
"msado15"="native,builtin"
"msdatl3"="native,builtin"
"sqloledb"="native"
"oledb32"="native"
"msdaps"="native"
"msdaenum"="native"
"msdasql"="native,builtin"

[HKEY_CLASSES_ROOT\ADODB.Connection]
@="Connection"

[HKEY_CLASSES_ROOT\ADODB.Connection\CLSID]
@="{00000514-0000-0010-8000-00AA006D2EA4}"

[HKEY_CLASSES_ROOT\ADODB.Connection\CurVer]
@="ADODB.Connection.6.0"

[HKEY_CLASSES_ROOT\ADODB.Connection.6.0]
@="Connection"

[HKEY_CLASSES_ROOT\ADODB.Connection.6.0\CLSID]
@="{00000514-0000-0010-8000-00AA006D2EA4}"

[HKEY_CLASSES_ROOT\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}]
@="Connection"

[HKEY_CLASSES_ROOT\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\InprocServer32]
@="C:\\Program Files\\Common Files\\System\\ADO\\msado15.dll"
"ThreadingModel"="Apartment"

[HKEY_CLASSES_ROOT\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\ProgId]
@="ADODB.Connection.6.0"

[HKEY_CLASSES_ROOT\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\VersionIndependentProgId]
@="ADODB.Connection"

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}]
@="SQLOLEDB"
"OLEDB_SERVICES"=dword:ffffffff

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ExtendedErrors]

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ExtendedErrors\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}]
@="SQLOLEDB Error Lookup"

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\Implemented Categories\{D267E19A-0B97-11D2-BB1C-00C04FC9B532}]

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\InprocServer32]
@="C:\\windows\\system32\\sqloledb.dll"
"ThreadingModel"="Both"

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\OLE DB Provider]

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ProgID]
@="SQLOLEDB.1"

[HKEY_CLASSES_ROOT\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\VersionIndependentProgID]
@="SQLOLEDB"

[HKEY_CLASSES_ROOT\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}]
@="FoxOLEDB 1.0 Object"

[HKEY_CLASSES_ROOT\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\InprocServer32]
@="C:\\Program Files\\Common Files\\System\\MSADC\\msadce.dll"
"ThreadingModel"="both"

[HKEY_CLASSES_ROOT\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\ProgID]
@="FX.Rowset.1"

[HKEY_CLASSES_ROOT\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\VersionIndependentProgID]
@="FX.Rowset"

[HKEY_CLASSES_ROOT\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}]
@="FoxOLEDB 1.0 Object"

[HKEY_CLASSES_ROOT\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\InprocServer32]
@="C:\\Program Files\\Common Files\\System\\MSADC\\msadce.dll"
"ThreadingModel"="both"

[HKEY_CLASSES_ROOT\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\ProgID]
@="FX.Rowset.1"

[HKEY_CLASSES_ROOT\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\VersionIndependentProgID]
@="FX.Rowset"

[HKEY_CLASSES_ROOT\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}]
@="SQLOLEDB Error Lookup"

[HKEY_CLASSES_ROOT\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\InprocServer32]
@="C:\\windows\\system32\\sqloledb.dll"
"ThreadingModel"="Both"

[HKEY_CLASSES_ROOT\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\ProgID]
@="SQLOLEDB ErrorLookup.1"

[HKEY_CLASSES_ROOT\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\VersionIndependentProgID]
@="SQLOLEDB ErrorLookup"

[HKEY_CLASSES_ROOT\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}]
@="SQLOLEDB Enumerator"

[HKEY_CLASSES_ROOT\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\InprocServer32]
@="C:\\windows\\system32\\sqloledb.dll"
"ThreadingModel"="Both"

[HKEY_CLASSES_ROOT\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\OLE DB Enumerator]

[HKEY_CLASSES_ROOT\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\ProgID]
@="SQLOLEDB Enumerator.1"

[HKEY_CLASSES_ROOT\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\VersionIndependentProgID]
@="SQLOLEDB Enumerator"

[HKEY_CLASSES_ROOT\FX.Rowset]
@="FoxOLEDB 1.0 Object"

[HKEY_CLASSES_ROOT\FX.Rowset\CLSID]
@="{58ECEE30-E715-11CF-B0E3-00AA003F000F}"

[HKEY_CLASSES_ROOT\FX.Rowset.1]
@="FoxOLEDB 1.0 Object"

[HKEY_CLASSES_ROOT\FX.Rowset.1\CLSID]
@="{58ECEE30-E715-11CF-B0E3-00AA003F000F}"

[HKEY_CLASSES_ROOT\SQLOLEDB]
@="Microsoft OLE DB Provider for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB\Clsid]
@="{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\SQLOLEDB Enumerator]
@="Microsoft OLE DB Enumerator for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB Enumerator\Clsid]
@="{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\SQLOLEDB Enumerator.1]
@="Microsoft OLE DB Enumerator for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB Enumerator.1\Clsid]
@="{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\SQLOLEDB ErrorLookup]
@="Microsoft OLE DB Error Lookup for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB ErrorLookup\Clsid]
@="{C0932C62-38E5-11d0-97AB-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\SQLOLEDB ErrorLookup.1]
@="Microsoft OLE DB Error Lookup for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB ErrorLookup.1\Clsid]
@="{C0932C62-38E5-11d0-97AB-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\SQLOLEDB.1]
@="Microsoft OLE DB Provider for SQL Server"

[HKEY_CLASSES_ROOT\SQLOLEDB.1\Clsid]
@="{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}"

[HKEY_CLASSES_ROOT\TypeLib\{2A75196C-D9EB-4129-B803-931327F72D5C}\2.8\0\win32]
@="C:\\Program Files\\Common Files\\System\\ADO\\msado15.dll"

[HKEY_CLASSES_ROOT\CLSID\{6c736db1-bd94-11d0-8a23-00aa00b58e10}]
@="OLE DB Root Binder"

[HKEY_CLASSES_ROOT\CLSID\{6c736db1-bd94-11d0-8a23-00aa00b58e10}\InprocServer32]
@="C:\\windows\\system32\\oledb32.dll"
"ThreadingModel"="Both"

[HKEY_CLASSES_ROOT\CLSID\{6c736db1-bd94-11d0-8a23-00aa00b58e10}\ProgID]
@="MSDAINITIALIZE.1"

[HKEY_CLASSES_ROOT\MSDAINITIALIZE]
@="OLE DB Root Binder"

[HKEY_CLASSES_ROOT\MSDAINITIALIZE\CLSID]
@="{6c736db1-bd94-11d0-8a23-00aa00b58e10}"

[HKEY_CLASSES_ROOT\MSDAINITIALIZE.1]
@="OLE DB Root Binder"

[HKEY_CLASSES_ROOT\MSDAINITIALIZE.1\CLSID]
@="{6c736db1-bd94-11d0-8a23-00aa00b58e10}"
EOF_REG

echo "[INFO] Importing registry entries via wine regedit..."
wine regedit /S "${REG_FILE}"
wineserver -w || true
rm -f "${REG_FILE}"

echo "[INFO] Registering OLE DB and ADO DLLs via regsvr32..."
# Đăng ký tự động các DLL qua regsvr32
wine regsvr32 /s oledb32.dll || echo "[WARN] Failed to register oledb32.dll via regsvr32"
wine regsvr32 /s msdaps.dll || echo "[WARN] Failed to register msdaps.dll via regsvr32"
wine regsvr32 /s msdaenum.dll || echo "[WARN] Failed to register msdaenum.dll via regsvr32"
wine regsvr32 /s sqloledb.dll || echo "[WARN] Failed to register sqloledb.dll via regsvr32"
wine regsvr32 /s msado15.dll || echo "[WARN] Failed to register msado15.dll via regsvr32"
wineserver -w || true

printf '%s\n' "$(date -Is)" >"${READY_MARKER}"
echo "[INFO] MDAC/SQLOLEDB Wine prefix is ready: ${READY_MARKER}"

rm -rf "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"
