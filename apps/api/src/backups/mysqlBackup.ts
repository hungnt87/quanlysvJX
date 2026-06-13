import { chmodSync, chownSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CommandError } from '../utils/errors.js';
import type { AppDeps } from '../app.js';
import { assertBackupFile, buildBackupFilename } from './backupPaths.js';
import { upsertBackupMetadata } from './backupMetadata.js';

import type { BackupRunContext } from '../scheduledBackups/scheduledBackupWorker.js';

export async function backupMysql(
  deps: AppDeps,
  context?: BackupRunContext
) {
  mkdirSync(deps.config.mysqlBackupDir, { recursive: true });
  try { chmodSync(deps.config.mysqlBackupDir, 0o777); } catch { void 0; }
  try { chownSync(deps.config.mysqlBackupDir, 1000, 1000); } catch { void 0; }
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
  try { chmodSync(hostPath, 0o777); } catch { void 0; }
  try { chownSync(hostPath, 1000, 1000); } catch { void 0; }

  // Ghi nhận metadata
  const now = new Date();
  upsertBackupMetadata(deps.config.backupMetadataFile, {
    kind: 'mysql',
    filename,
    note: context
      ? context.trigger === 'schedule'
        ? `Tự động từ lịch ${context.jobDisplayName ?? context.jobId ?? context.runId}`
        : `Tạo thủ công từ lượt chạy ${context.runId}`
      : null,
    createdByUpload: false,
    uploadedAt: null,
    updatedAt: now.toISOString(),
    generatedBy: context
      ? {
          runId: context.runId,
          jobId: context.jobId,
          jobDisplayName: context.jobDisplayName,
          trigger: context.trigger,
          batchId: context.batchId,
          scheduledFor: context.scheduledFor,
          generatedAt: now.toISOString(),
          scheduleSnapshot: context.scheduleSnapshot
        }
      : null
  });

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
