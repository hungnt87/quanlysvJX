#!/usr/bin/env sh
set -eu

BASE_URL="${E2E_NGINX_BASE_URL:-http://127.0.0.1}"

echo "Starting Docker services for nginx E2E..."
docker compose up -d api ui proxy

echo "Waiting for nginx at ${BASE_URL}..."
ready=0
for _ in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/" >/dev/null; then
    ready=1
    break
  fi

  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "nginx did not become ready at ${BASE_URL}" >&2
  exit 1
fi

main_module="$(curl -fsS "${BASE_URL}/src/main.tsx")"
if printf '%s' "$main_module" | grep -q 'Failed to resolve import'; then
  echo "Vite failed to resolve imports through nginx." >&2
  printf '%s\n' "$main_module" >&2
  exit 1
fi

echo "Running Playwright through nginx at ${BASE_URL}..."
E2E_BASE_URL="$BASE_URL" playwright test
