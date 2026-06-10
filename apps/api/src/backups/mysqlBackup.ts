import { chmodSync, chownSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CommandError } from '../api/errors.js';
import type { AppDeps } from '../app.js';
import { assertBackupFile, buildBackupFilename } from './backupPaths.js';

export async function backupMysql(deps: AppDeps) {
  mkdirSync(deps.config.mysqlBackupDir, { recursive: true });
  try { chmodSync(deps.config.mysqlBackupDir, 0o777); } catch {}
  try { chownSync(deps.config.mysqlBackupDir, 1000, 1000); } catch {}
  const filename = buildBackupFilename('mysql');
  const hostPath = path.join(deps.config.mysqlBackupDir, filename);
  const result = await deps.runCompose([
    'exec',
    '-T',
    'jxmysql',
    'sh',
    '-lc',
    'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --all-databases'
  ]);

  if (result.exitCode !== 0) {
    throw new CommandError('MySQL backup failed');
  }

  await writeFile(hostPath, gzipSync(Buffer.from(result.stdout, 'utf8')));
  try { chmodSync(hostPath, 0o777); } catch {}
  try { chownSync(hostPath, 1000, 1000); } catch {}
  return { kind: 'mysql' as const, filename, path: hostPath };
}

export async function restoreMysql(deps: AppDeps, filename: string) {
  const hostPath = assertBackupFile(deps.config.mysqlBackupDir, filename);
  const compressedBuffer = readFileSync(hostPath);
  const decompressedSql = gunzipSync(compressedBuffer);

  const result = await deps.runCompose(
    ['exec', '-T', 'jxmysql', 'sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'],
    { stdin: decompressedSql }
  );

  if (result.exitCode !== 0) {
    throw new CommandError('MySQL restore failed');
  }

  return { kind: 'mysql' as const, filename };
}
