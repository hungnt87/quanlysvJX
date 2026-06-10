# quanlysvJX

## Docker Compose Manager

Dev LAN mode runs the manager UI on port `80` and allows access from `localhost` and the machine IP:

```bash
docker compose -f docker-compose.manager.yaml up --build
```

Open `http://localhost` or `http://<machine-ip>`.

The manager mounts the repo at the same absolute path inside `manager-api` as on the Docker host. This is required because `manager-api` controls the host Docker daemon through `/var/run/docker.sock`, and Docker bind mount paths in `docker-compose.yaml` are resolved on the host. Run the command from the repo root, or set the host path explicitly:

```bash
MANAGER_PROJECT_ROOT=/home/hungnt/dev/quanlysvJX docker compose -f docker-compose.manager.yaml up --build
```

This manager has no login in the first version. It mounts the Docker socket into `manager-api` so the API can run allowlisted `docker compose` commands for this repo. Use it only on a trusted local/VPS network. Do not expose it directly to the public internet.

For a localhost-only bind, run:

```bash
MANAGER_HTTP_BIND=127.0.0.1 docker compose -f docker-compose.manager.yaml up --build
```

## Game account management MSSQL settings

The account manager uses the `account_tong` MSSQL database. Configure credentials with environment variables:

```bash
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=account_tong
MSSQL_USER=sa
MSSQL_PASSWORD=<set locally>
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
```

The app does not hardcode MSSQL username or password. Account delete in the UI is a soft delete: it bans the account and keeps rows visible in the list.

