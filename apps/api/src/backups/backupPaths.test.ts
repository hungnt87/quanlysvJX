import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertBackupFile, buildBackupFilename } from './backupPaths.js';

describe('backup paths', () => {
  const root = path.resolve('/srv/app/database/backups/mysql');

  it('builds timestamped mysql backup filenames', () => {
    const testDate = new Date('2026-06-09T03:04:05Z');
    const expectedStamp = [
      testDate.getFullYear(),
      String(testDate.getMonth() + 1).padStart(2, '0'),
      String(testDate.getDate()).padStart(2, '0'),
      '-',
      String(testDate.getHours()).padStart(2, '0'),
      String(testDate.getMinutes()).padStart(2, '0'),
      String(testDate.getSeconds()).padStart(2, '0')
    ].join('');
    expect(buildBackupFilename('mysql', testDate)).toBe(`mysql-${expectedStamp}.sql.gz`);
  });

  it('builds timestamped mssql backup filenames', () => {
    const testDate = new Date('2026-06-09T03:04:05Z');
    const expectedStamp = [
      testDate.getFullYear(),
      String(testDate.getMonth() + 1).padStart(2, '0'),
      String(testDate.getDate()).padStart(2, '0'),
      '-',
      String(testDate.getHours()).padStart(2, '0'),
      String(testDate.getMinutes()).padStart(2, '0'),
      String(testDate.getSeconds()).padStart(2, '0')
    ].join('');
    expect(buildBackupFilename('mssql', testDate)).toBe(`mssql-${expectedStamp}.bak`);
  });

  it('accepts files inside the managed backup directory', () => {
    expect(assertBackupFile(root, 'mysql-20260609-030405.sql.gz')).toBe(
      path.join(root, 'mysql-20260609-030405.sql.gz')
    );
  });

  it('rejects path traversal', () => {
    expect(() => assertBackupFile(root, '../mysql.sql.gz')).toThrow('Invalid backup filename');
  });

  it('rejects shell metacharacters in filenames', () => {
    expect(() => assertBackupFile(root, 'mysql-20260609-030405.sql.gz;rm')).toThrow('Invalid backup filename');
  });
});
