import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CommandError } from '../api/errors.js';
import type { AppDeps } from '../app.js';
import { buildBackupFilename } from './backupPaths.js';

const databaseName = 'account_tong';

export async function backupMssql(deps: AppDeps) {
  mkdirSync(deps.config.mssqlBackupDir, { recursive: true });
  try {
    chmodSync(deps.config.mssqlBackupDir, 0o777);
  } catch {
    // Ignore chmod failures
  }
  const filename = buildBackupFilename('mssql');
  const hostPath = path.join(deps.config.mssqlBackupDir, filename);
  const sql = `BACKUP DATABASE [${databaseName}] TO DISK = N'/var/opt/mssql/data/database_backups/${filename}' WITH INIT`;
  const result = await runSqlcmd(deps, sql);

  if (result.exitCode !== 0) {
    throw new CommandError('MSSQL backup failed');
  }

  return { kind: 'mssql' as const, filename, path: hostPath };
}

export async function restoreMssql(deps: AppDeps, filename: string) {
  const sql = `
    IF DB_ID('${databaseName}') IS NOT NULL
      ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    
    RESTORE DATABASE [${databaseName}] FROM DISK = N'/var/opt/mssql/data/database_backups/${filename}' WITH REPLACE;
    
    IF DB_ID('${databaseName}') IS NOT NULL
      ALTER DATABASE [${databaseName}] SET MULTI_USER;
  `;
  const result = await runSqlcmd(deps, sql);

  if (result.exitCode !== 0) {
    throw new CommandError('MSSQL restore failed');
  }

  return { kind: 'mssql' as const, filename };
}

function runSqlcmd(deps: AppDeps, sql: string) {
  const script = `SQLCMD=/opt/mssql-tools18/bin/sqlcmd; if [ ! -x "$SQLCMD" ]; then SQLCMD=/opt/mssql-tools/bin/sqlcmd; fi; "$SQLCMD" -C -b -S localhost -U sa -P "$SA_PASSWORD" -Q "${sql}"`;
  return deps.runCompose(['exec', '-T', 'jxmssql', 'bash', '-lc', script]);
}
