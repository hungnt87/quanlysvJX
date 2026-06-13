import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../utils/errors.js';
import { deleteBackupFile, listBackupFiles, renameBackupFile, validateBackupExtension, writeUploadedBackupFile } from './backupFiles.js';

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'backup-files-'));
  const mysql = path.join(root, 'mysql');
  const mssql = path.join(root, 'mssql');
  mkdirSync(mysql, { recursive: true });
  mkdirSync(mssql, { recursive: true });
  return { root, mysql, mssql, metadata: path.join(root, 'backup-metadata.json') };
}

function writeBackup(file: string, contents: string, modifiedAt: string) {
  writeFileSync(file, contents);
  const date = new Date(modifiedAt);
  utimesSync(file, date, date);
}

describe('backup files', () => {
  it('validates extensions by database kind', () => {
    expect(validateBackupExtension('mysql', 'a.sql')).toBe(true);
    expect(validateBackupExtension('mysql', 'a.sql.gz')).toBe(true);
    expect(validateBackupExtension('mssql', 'a.bak')).toBe(true);
    expect(() => validateBackupExtension('mysql', 'a.bak')).toThrow(ValidationError);
    expect(() => validateBackupExtension('mssql', 'a.sql.gz')).toThrow(ValidationError);
  });

  it('lists files with latest marker and generated source', () => {
    const root = makeRoot();
    writeBackup(path.join(root.mysql, 'old.sql.gz'), 'old', '2026-06-09T03:00:00.000Z');
    writeBackup(path.join(root.mysql, 'new.sql.gz'), 'new', '2026-06-10T03:00:00.000Z');

    const files = listBackupFiles({ mysqlBackupDir: root.mysql, mssqlBackupDir: root.mssql, backupMetadataFile: root.metadata });

    expect(files.filter((file) => file.kind === 'mysql')).toHaveLength(2);
    expect(files.find((file) => file.filename === 'new.sql.gz')?.source).toBe('generated');
    expect(files.find((file) => file.filename === 'new.sql.gz')?.isLatest).toBe(true);
    expect(files.find((file) => file.filename === 'old.sql.gz')?.isLatest).toBe(false);
  });

  it('renames a file and stores a note', () => {
    const root = makeRoot();
    writeBackup(path.join(root.mysql, 'old.sql.gz'), 'old', '2026-06-09T03:00:00.000Z');
    writeBackup(path.join(root.mysql, 'new.sql.gz'), 'new', '2026-06-10T03:00:00.000Z');

    const renamed = renameBackupFile({
      kind: 'mysql',
      filename: 'old.sql.gz',
      nextFilename: 'renamed.sql.gz',
      note: 'renamed file',
      mysqlBackupDir: root.mysql,
      mssqlBackupDir: root.mssql,
      backupMetadataFile: root.metadata,
      now: () => new Date('2026-06-10T04:00:00.000Z')
    });

    const files = listBackupFiles({ mysqlBackupDir: root.mysql, mssqlBackupDir: root.mssql, backupMetadataFile: root.metadata });
    if (!renamed) {
      throw new Error('Expected renamed backup file');
    }
    expect(renamed.filename).toBe('renamed.sql.gz');
    expect(renamed.note).toBe('renamed file');
    expect(files.some((file) => file.filename === 'old.sql.gz')).toBe(false);
  });

  it('stores uploaded backups with the requested server filename and note', () => {
    const root = makeRoot();

    const uploaded = writeUploadedBackupFile({
      kind: 'mysql',
      filename: 'uploaded-from-old-server.sql.gz',
      note: 'Data before migration',
      data: Buffer.from('backup'),
      mysqlBackupDir: root.mysql,
      mssqlBackupDir: root.mssql,
      backupMetadataFile: root.metadata,
      now: () => new Date('2026-06-12T01:00:00.000Z')
    });

    expect(uploaded?.filename).toBe('uploaded-from-old-server.sql.gz');
    expect(uploaded?.note).toBe('Data before migration');
    expect(uploaded?.source).toBe('uploaded');
    expect(uploaded?.uploadedAt).toBe('2026-06-12T01:00:00.000Z');
  });

  it('blocks deleting the latest backup', () => {
    const root = makeRoot();
    writeBackup(path.join(root.mysql, 'only.sql.gz'), 'only', '2026-06-10T03:00:00.000Z');

    expect(() =>
      deleteBackupFile({
        kind: 'mysql',
        filename: 'only.sql.gz',
        mysqlBackupDir: root.mysql,
        mssqlBackupDir: root.mssql,
        backupMetadataFile: root.metadata
      })
    ).toThrow('Cannot delete the newest mysql backup');
  });
});
