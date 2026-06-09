import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertBackupFile, buildBackupFilename } from './backupPaths.js';

describe('backup paths', () => {
  const root = path.resolve('/srv/app/database/backups/mysql');

  it('builds timestamped mysql backup filenames', () => {
    expect(buildBackupFilename('mysql', new Date('2026-06-09T03:04:05Z'))).toBe('mysql-20260609-030405.sql.gz');
  });

  it('builds timestamped mssql backup filenames', () => {
    expect(buildBackupFilename('mssql', new Date('2026-06-09T03:04:05Z'))).toBe('mssql-20260609-030405.bak');
  });

  it('accepts files inside the managed backup directory', () => {
    expect(assertBackupFile(root, 'mysql-20260609-030405.sql.gz')).toBe(
      path.join(root, 'mysql-20260609-030405.sql.gz')
    );
  });

  it('rejects path traversal', () => {
    expect(() => assertBackupFile(root, '../mysql.sql.gz')).toThrow('Invalid backup filename');
  });
});
