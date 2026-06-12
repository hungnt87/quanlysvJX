import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BackupKind } from './backupPaths.js';

const metadataSchema = z.object({
  version: z.literal(1),
  files: z.record(
    z.string(),
    z.object({
      kind: z.enum(['mysql', 'mssql']),
      filename: z.string(),
      note: z.string().nullable(),
      createdByUpload: z.boolean(),
      uploadedAt: z.string().nullable(),
      updatedAt: z.string(),
      generatedBy: z
        .object({
          runId: z.string().nullable(),
          jobId: z.string().nullable(),
          trigger: z.enum(['schedule', 'manual']),
          batchId: z.string().nullable()
        })
        .nullable()
        .optional()
    })
  )
});

export type BackupMetadata = z.infer<typeof metadataSchema>['files'][string];
export type BackupMetadataIndex = z.infer<typeof metadataSchema>;

export function createEmptyMetadataIndex(): BackupMetadataIndex {
  return { version: 1, files: {} };
}

export function getMetadataKey(kind: BackupKind, filename: string) {
  return `${kind}/${filename}`;
}

export function readMetadataIndex(file: string): BackupMetadataIndex {
  if (!existsSync(file)) {
    return createEmptyMetadataIndex();
  }

  try {
    return metadataSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return createEmptyMetadataIndex();
  }
}

export function writeMetadataIndex(file: string, index: BackupMetadataIndex) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export function upsertBackupMetadata(file: string, metadata: BackupMetadata) {
  const index = readMetadataIndex(file);
  const nextIndex: BackupMetadataIndex = {
    ...index,
    files: { ...index.files, [getMetadataKey(metadata.kind, metadata.filename)]: metadata }
  };
  writeMetadataIndex(file, nextIndex);
  return nextIndex;
}

export function removeBackupMetadata(file: string, kind: BackupKind, filename: string) {
  const index = readMetadataIndex(file);
  const key = getMetadataKey(kind, filename);
  const nextFiles = Object.fromEntries(Object.entries(index.files).filter(([entryKey]) => entryKey !== key));
  const nextIndex: BackupMetadataIndex = { ...index, files: nextFiles };
  writeMetadataIndex(file, nextIndex);
  return nextIndex;
}
