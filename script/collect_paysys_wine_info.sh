#!/usr/bin/env bash
set -u

usage() {
  cat <<'EOF'
Usage:
  ./collect_paysys_wine_info.sh [options]

Options:
  --paysys-dir PATH       Directory containing Sword3PaySys.exe. Default: current directory
  --wineprefix PATH       Wine prefix path. Default: $WINEPREFIX, then ~/.win32, then ~/.wine
  --out PATH              Output tar.gz path. Default: ./paysys-wine-info-YYYYmmdd-HHMMSS.tar.gz
  --include-prefix        Include full Wine prefix in the archive. This can be large, but is best for Docker cloning
  --no-logs               Do not include payserver_log files
  -h, --help              Show this help

Examples:
  cd /path/to/paysyswin
  ./collect_paysys_wine_info.sh

  ./collect_paysys_wine_info.sh --paysys-dir /root/serversetup/paysyswin --wineprefix ~/.win32 --include-prefix
EOF
}

timestamp() {
  date +%Y%m%d-%H%M%S
}

abs_path() {
  local path="$1"
  if [ -d "$path" ]; then
    (cd "$path" 2>/dev/null && pwd -P) || return 1
  else
    local dir base
    dir=$(dirname "$path")
    base=$(basename "$path")
    (cd "$dir" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$base") || return 1
  fi
}

pick_default_prefix() {
  if [ -n "${WINEPREFIX:-}" ]; then
    printf '%s\n' "$WINEPREFIX"
  elif [ -d "$HOME/.win32" ]; then
    printf '%s\n' "$HOME/.win32"
  else
    printf '%s\n' "$HOME/.wine"
  fi
}

write_cmd() {
  local outfile="$1"
  shift
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@"
    local status=$?
    printf '\n[exit=%s]\n' "$status"
  } >"$outfile" 2>&1
}

append_cmd() {
  local outfile="$1"
  shift
  {
    printf '\n$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@"
    local status=$?
    printf '\n[exit=%s]\n' "$status"
  } >>"$outfile" 2>&1
}

PAYSYS_DIR="$(pwd)"
WINE_PREFIX="$(pick_default_prefix)"
OUT_FILE=""
INCLUDE_PREFIX=0
INCLUDE_LOGS=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --paysys-dir)
      PAYSYS_DIR="${2:-}"
      shift 2
      ;;
    --wineprefix)
      WINE_PREFIX="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    --include-prefix)
      INCLUDE_PREFIX=1
      shift
      ;;
    --no-logs)
      INCLUDE_LOGS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

PAYSYS_DIR="$(abs_path "$PAYSYS_DIR")" || {
  echo "Cannot resolve paysys dir: $PAYSYS_DIR" >&2
  exit 1
}

WINE_PREFIX="$(abs_path "$WINE_PREFIX")" || {
  echo "Cannot resolve wine prefix: $WINE_PREFIX" >&2
  exit 1
}

if [ -z "$OUT_FILE" ]; then
  OUT_FILE="$(pwd)/paysys-wine-info-$(timestamp).tar.gz"
fi
OUT_FILE="$(abs_path "$OUT_FILE")" || exit 1

WORK_DIR="$(mktemp -d -t paysys-wine-info.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

INFO_DIR="$WORK_DIR/paysys-wine-info"
mkdir -p "$INFO_DIR"/registry "$INFO_DIR"/paysys "$INFO_DIR"/wine "$INFO_DIR"/system

{
  echo "CollectedAt=$(date -Is)"
  echo "Hostname=$(hostname 2>/dev/null || true)"
  echo "User=$(id 2>/dev/null || true)"
  echo "PaysysDir=$PAYSYS_DIR"
  echo "WinePrefix=$WINE_PREFIX"
  echo "IncludePrefix=$INCLUDE_PREFIX"
  echo "IncludeLogs=$INCLUDE_LOGS"
} >"$INFO_DIR/summary.txt"

write_cmd "$INFO_DIR/system/os.txt" uname -a
append_cmd "$INFO_DIR/system/os.txt" bash -lc 'command -v lsb_release >/dev/null && lsb_release -a || true'
append_cmd "$INFO_DIR/system/os.txt" bash -lc 'cat /etc/os-release 2>/dev/null || true'
append_cmd "$INFO_DIR/system/os.txt" bash -lc 'dpkg --print-architecture 2>/dev/null; dpkg --print-foreign-architectures 2>/dev/null || true'

write_cmd "$INFO_DIR/system/packages.txt" bash -lc 'dpkg -l | grep -Ei "wine|winetricks|winbind|samba|odbc|mssql|gnutls|freetds|unixodbc" || true'
write_cmd "$INFO_DIR/system/env.txt" bash -lc 'env | grep -E "^(WINE|GNUTLS|DISPLAY|LANG|LC_|PATH=)" | sort || true'
write_cmd "$INFO_DIR/system/processes.txt" bash -lc 'ps auxww | grep -Ei "Sword3PaySys|wine|wineserver|Xvfb|sqlservr" | grep -v grep || true'
write_cmd "$INFO_DIR/system/ports.txt" bash -lc 'ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null || true'
write_cmd "$INFO_DIR/system/tools.txt" bash -lc 'for c in wine wineserver winetricks regedit regsvr32 sqlcmd bcp isql odbcinst ntlm_auth; do printf "%-12s" "$c"; command -v "$c" || true; done'
append_cmd "$INFO_DIR/system/tools.txt" bash -lc 'wine --version 2>&1 || true; winetricks --version 2>&1 || true; ntlm_auth --version 2>&1 || true'

write_cmd "$INFO_DIR/wine/prefix-tree.txt" bash -lc "find '$WINE_PREFIX' -maxdepth 3 -printf '%M %s %p\n' 2>/dev/null | sort | sed -n '1,2000p'"
write_cmd "$INFO_DIR/wine/data-access-files.txt" bash -lc "find '$WINE_PREFIX/drive_c/Program Files/Common Files/System' '$WINE_PREFIX/drive_c/windows/system32' -maxdepth 5 -type f 2>/dev/null | grep -Ei 'ado|oledb|odbc|sql|msda|msado|sqloledb|msdasql' | sort"
write_cmd "$INFO_DIR/wine/data-access-sha256.txt" bash -lc "find '$WINE_PREFIX/drive_c/Program Files/Common Files/System' '$WINE_PREFIX/drive_c/windows/system32' -maxdepth 5 -type f 2>/dev/null | grep -Ei 'ado|oledb|odbc|sql|msda|msado|sqloledb|msdasql' | sort | xargs -r sha256sum"

export WINEPREFIX="$WINE_PREFIX"

REG_QUERIES="$INFO_DIR/registry/queries.txt"
: >"$REG_QUERIES"
for key in \
  'HKCR\SQLOLEDB' \
  'HKCR\SQLOLEDB.1' \
  'HKCR\ADODB.Connection' \
  'HKCR\ADODB.Command' \
  'HKCR\ADODB.Recordset' \
  'HKCR\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}' \
  'HKCR\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}' \
  'HKCR\CLSID\{00000507-0000-0010-8000-00AA006D2EA4}' \
  'HKCR\CLSID\{00000535-0000-0010-8000-00AA006D2EA4}' \
  'HKCR\CLSID\{6c736db1-bd94-11d0-8a23-00aa00b58e10}' \
  'HKCU\Software\Wine\DllOverrides' \
  'HKCU\Software\Wine\Drivers' \
  'HKLM\Software\Microsoft\DataAccess' \
  'HKLM\Software\ODBC\ODBCINST.INI'; do
  {
    printf '\n===== %s =====\n' "$key"
    wine reg query "$key" /s
    printf '[exit=%s]\n' "$?"
  } >>"$REG_QUERIES" 2>&1 || true
done

write_cmd "$INFO_DIR/registry/export-hkcu-wine.reg.txt" wine reg export 'HKCU\Software\Wine' /tmp/hkcu-wine.reg /y
cp /tmp/hkcu-wine.reg "$INFO_DIR/registry/hkcu-wine.reg" 2>/dev/null || true
write_cmd "$INFO_DIR/registry/export-dataaccess.reg.txt" wine reg export 'HKLM\Software\Microsoft\DataAccess' /tmp/dataaccess.reg /y
cp /tmp/dataaccess.reg "$INFO_DIR/registry/dataaccess.reg" 2>/dev/null || true

write_cmd "$INFO_DIR/wine/ado-test.txt" bash -lc "cat > /tmp/paysys-ado-test.vbs <<'VBS'
On Error Resume Next
Set cn = CreateObject(\"ADODB.Connection\")
If Err.Number <> 0 Then
  WScript.Echo \"CreateObject ADODB.Connection failed: \" & Hex(Err.Number) & \" \" & Err.Description
  WScript.Quit 1
End If
WScript.Echo \"CreateObject ADODB.Connection OK\"
WScript.Echo \"Provider before open: \" & cn.Provider
VBS
wine cscript //nologo Z:\\\\tmp\\\\paysys-ado-test.vbs 2>&1 || true"

if [ -d "$PAYSYS_DIR" ]; then
  write_cmd "$INFO_DIR/paysys/files.txt" bash -lc "find '$PAYSYS_DIR' -maxdepth 3 -printf '%M %s %TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort"
  for file in database.ini Acc_Setup.ini Relay_Setup.ini FeeType.ini priorityGNU startPaysys.sh startS3RelayServer.sh; do
    if [ -f "$PAYSYS_DIR/$file" ]; then
      cp "$PAYSYS_DIR/$file" "$INFO_DIR/paysys/$file"
    fi
  done

  if [ -f "$PAYSYS_DIR/Sword3PaySys.exe" ]; then
    sha256sum "$PAYSYS_DIR/Sword3PaySys.exe" >"$INFO_DIR/paysys/Sword3PaySys.exe.sha256" 2>/dev/null || true
    strings -a "$PAYSYS_DIR/Sword3PaySys.exe" \
      | grep -Ei 'SQLOLEDB|ADODB|Provider|DataBase|Server|Port|Gateway|Account|Role|CIOCP|CSocket|error' \
      >"$INFO_DIR/paysys/Sword3PaySys.strings.txt" 2>/dev/null || true
  fi

  if [ "$INCLUDE_LOGS" -eq 1 ] && [ -d "$PAYSYS_DIR/payserver_log" ]; then
    mkdir -p "$INFO_DIR/paysys/payserver_log"
    find "$PAYSYS_DIR/payserver_log" -type f -printf '%T@ %p\n' 2>/dev/null \
      | sort -nr \
      | head -30 \
      | cut -d' ' -f2- \
      | while IFS= read -r log_file; do
          rel="${log_file#$PAYSYS_DIR/payserver_log/}"
          mkdir -p "$INFO_DIR/paysys/payserver_log/$(dirname "$rel")"
          cp "$log_file" "$INFO_DIR/paysys/payserver_log/$rel" 2>/dev/null || true
        done
  fi
fi

if [ "$INCLUDE_PREFIX" -eq 1 ]; then
  mkdir -p "$INFO_DIR/wineprefix"
  tar -C "$(dirname "$WINE_PREFIX")" -czf "$INFO_DIR/wineprefix/$(basename "$WINE_PREFIX").tar.gz" "$(basename "$WINE_PREFIX")"
fi

tar -C "$WORK_DIR" -czf "$OUT_FILE" paysys-wine-info

echo "Created: $OUT_FILE"
echo "Send this archive back for Docker/Wine comparison."
if [ "$INCLUDE_PREFIX" -ne 1 ]; then
  echo "Tip: rerun with --include-prefix if we need the exact working Wine prefix."
fi
