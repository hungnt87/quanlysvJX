import path from 'node:path';
import { ValidationError } from '../api/errors.js';

export type BackupKind = 'mysql' | 'mssql';

export function buildBackupFilename(kind: BackupKind, date = new Date()) {
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('');

  return kind === 'mysql' ? `mysql-${stamp}.sql.gz` : `mssql-${stamp}.bak`;
}

export function assertBackupFile(directory: string, filename: string) {
  if (filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    throw new ValidationError('Invalid backup filename');
  }

  const resolvedDir = path.resolve(directory);
  const resolvedFile = path.resolve(resolvedDir, filename);
  const relative = path.relative(resolvedDir, resolvedFile);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ValidationError('Invalid backup filename');
  }

  return resolvedFile;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
