import path from 'node:path';
import { ValidationError } from '../utils/errors.js';

export type BackupKind = 'mysql' | 'mssql';

export function buildBackupFilename(kind: BackupKind, date = new Date()) {
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');

  return kind === 'mysql' ? `mysql-${stamp}.sql.gz` : `mssql-${stamp}.bak`;
}

export function assertBackupFile(directory: string, filename: string) {
  const safeFilenamePattern = /^[A-Za-z0-9._-]+$/;
  if (filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    throw new ValidationError('Invalid backup filename');
  }
  if (!safeFilenamePattern.test(filename)) {
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

export function getBackupDirectory(kind: BackupKind, directories: { mysqlBackupDir: string; mssqlBackupDir: string }) {
  return kind === 'mysql' ? directories.mysqlBackupDir : directories.mssqlBackupDir;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
