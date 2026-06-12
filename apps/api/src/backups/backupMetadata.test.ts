import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createEmptyMetadataIndex,
  getMetadataKey,
  readMetadataIndex,
  removeBackupMetadata,
  upsertBackupMetadata
} from './backupMetadata.js';

describe('backup metadata', () => {
  it('creates stable keys using kind and filename', () => {
    expect(getMetadataKey('mysql', 'backup.sql.gz')).toBe('mysql/backup.sql.gz');
    expect(getMetadataKey('mssql', 'backup.bak')).toBe('mssql/backup.bak');
  });

  it('returns an empty index when the metadata file is missing', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');

    expect(readMetadataIndex(file)).toEqual(createEmptyMetadataIndex());
  });

  it('writes, updates, and removes metadata immutably', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');

    upsertBackupMetadata(file, {
      kind: 'mysql',
      filename: 'mysql-20260610-030000.sql.gz',
      note: 'Before maintenance',
      createdByUpload: true,
      uploadedAt: '2026-06-10T03:00:00.000Z',
      updatedAt: '2026-06-10T03:00:00.000Z',
      generatedBy: {
        runId: 'run_123',
        jobId: 'job_456',
        trigger: 'schedule',
        batchId: 'batch_789'
      }
    });

    const index = readMetadataIndex(file);
    expect(index.files['mysql/mysql-20260610-030000.sql.gz']?.note).toBe('Before maintenance');
    expect(index.files['mysql/mysql-20260610-030000.sql.gz']?.generatedBy).toEqual({
      runId: 'run_123',
      jobId: 'job_456',
      trigger: 'schedule',
      batchId: 'batch_789'
    });

    upsertBackupMetadata(file, {
      kind: 'mysql',
      filename: 'mysql-20260610-030000.sql.gz',
      note: 'After maintenance',
      createdByUpload: true,
      uploadedAt: '2026-06-10T03:00:00.000Z',
      updatedAt: '2026-06-10T04:00:00.000Z'
    });

    expect(JSON.parse(readFileSync(file, 'utf8')).files['mysql/mysql-20260610-030000.sql.gz'].note).toBe('After maintenance');

    removeBackupMetadata(file, 'mysql', 'mysql-20260610-030000.sql.gz');

    expect(readMetadataIndex(file).files).toEqual({});
  });

  it('falls back to an empty index for corrupt JSON', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');
    writeFileSync(file, '{broken', 'utf8');

    expect(readMetadataIndex(file)).toEqual(createEmptyMetadataIndex());
  });
});
