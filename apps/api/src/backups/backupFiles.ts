import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../api/errors.js';
import { getMetadataKey, readMetadataIndex, removeBackupMetadata, upsertBackupMetadata } from './backupMetadata.js';
import { assertBackupFile, getBackupDirectory, type BackupKind } from './backupPaths.js';

export type BackupFileView = {
  kind: BackupKind;
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
  generatedBy?: {
    runId: string | null;
    jobId: string | null;
    jobDisplayName?: string | null;
    trigger: 'schedule' | 'manual' | 'retry';
    batchId: string | null;
    scheduledFor?: string | null;
    generatedAt?: string | null;
    scheduleSnapshot?: {
      type: 'hourly';
      everyHours: number;
      minute: number;
    } | {
      type: 'daily';
      time: string;
    } | {
      type: 'weekly';
      daysOfWeek: number[];
      time: string;
    } | null;
  } | null;
};

type FileDeps = {
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupMetadataFile: string;
};

export function validateBackupExtension(kind: BackupKind, filename: string) {
  const valid = kind === 'mysql' ? filename.endsWith('.sql') || filename.endsWith('.sql.gz') : filename.endsWith('.bak');
  if (!valid) {
    throw new ValidationError(`Invalid ${kind} backup extension`);
  }

  return true;
}

export function listBackupFiles(deps: FileDeps): BackupFileView[] {
  const metadata = readMetadataIndex(deps.backupMetadataFile);
  return (['mysql', 'mssql'] as const).flatMap((kind) => listKindFiles(kind, deps, metadata.files));
}

export function writeUploadedBackupFile(
  args: FileDeps & { kind: BackupKind; filename: string; note: string | null; data: Buffer; now?: () => Date }
) {
  validateBackupExtension(args.kind, args.filename);
  const directory = getBackupDirectory(args.kind, args);
  mkdirSync(directory, { recursive: true });
  try { chmodSync(directory, 0o777); } catch { void 0; }
  try { chownSync(directory, 1000, 1000); } catch { void 0; }
  const target = assertBackupFile(directory, args.filename);
  if (existsSync(target)) {
    throw new ValidationError('Backup file already exists');
  }

  writeFileSync(target, args.data);
  try { chmodSync(target, 0o777); } catch { void 0; }
  try { chownSync(target, 1000, 1000); } catch { void 0; }
  const now = args.now?.() ?? new Date();
  upsertBackupMetadata(args.backupMetadataFile, {
    kind: args.kind,
    filename: args.filename,
    note: args.note,
    createdByUpload: true,
    uploadedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  return listBackupFiles(args).find((file) => file.kind === args.kind && file.filename === args.filename);
}

export function renameBackupFile(
  args: FileDeps & { kind: BackupKind; filename: string; nextFilename: string; note: string | null; now?: () => Date }
) {
  validateBackupExtension(args.kind, args.nextFilename);
  const directory = getBackupDirectory(args.kind, args);
  const currentPath = assertBackupFile(directory, args.filename);
  const nextPath = assertBackupFile(directory, args.nextFilename);
  if (!existsSync(currentPath)) {
    throw new ValidationError('Backup file not found');
  }
  if (args.filename !== args.nextFilename && existsSync(nextPath)) {
    throw new ValidationError('Backup file already exists');
  }

  const previous = readMetadataIndex(args.backupMetadataFile).files[getMetadataKey(args.kind, args.filename)];
  if (args.filename !== args.nextFilename) {
    renameSync(currentPath, nextPath);
    removeBackupMetadata(args.backupMetadataFile, args.kind, args.filename);
  }

  const now = args.now?.() ?? new Date();
  upsertBackupMetadata(args.backupMetadataFile, {
    kind: args.kind,
    filename: args.nextFilename,
    note: args.note,
    createdByUpload: previous?.createdByUpload ?? false,
    uploadedAt: previous?.uploadedAt ?? null,
    updatedAt: now.toISOString()
  });

  return listBackupFiles(args).find((file) => file.kind === args.kind && file.filename === args.nextFilename);
}

export function deleteBackupFile(args: FileDeps & { kind: BackupKind; filename: string }) {
  const files = listBackupFiles(args).filter((file) => file.kind === args.kind);
  const target = files.find((file) => file.filename === args.filename);
  if (!target) {
    throw new ValidationError('Backup file not found');
  }
  if (target.isLatest) {
    throw new ValidationError(`Cannot delete the newest ${args.kind} backup`);
  }

  const directory = getBackupDirectory(args.kind, args);
  unlinkSync(assertBackupFile(directory, args.filename));
  removeBackupMetadata(args.backupMetadataFile, args.kind, args.filename);

  return { filename: args.filename };
}

function listKindFiles(
  kind: BackupKind,
  deps: FileDeps,
  metadataFiles: Record<
    string,
    {
      note: string | null;
      createdByUpload: boolean;
      uploadedAt: string | null;
      generatedBy?: {
        runId: string | null;
        jobId: string | null;
        jobDisplayName?: string | null;
        trigger: 'schedule' | 'manual' | 'retry';
        batchId: string | null;
        scheduledFor?: string | null;
        generatedAt?: string | null;
        scheduleSnapshot?: {
          type: 'hourly';
          everyHours: number;
          minute: number;
        } | {
          type: 'daily';
          time: string;
        } | {
          type: 'weekly';
          daysOfWeek: number[];
          time: string;
        } | null;
      } | null;
    }
  >
) {
  const directory = getBackupDirectory(kind, deps);
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory)
    .filter((filename) => {
      try {
        validateBackupExtension(kind, filename);
        return true;
      } catch {
        return false;
      }
    })
    .map((filename) => {
      const stat = statSync(path.join(directory, filename));
      const metadata = metadataFiles[getMetadataKey(kind, filename)];
      return {
        kind,
        filename,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        note: metadata?.note ?? null,
        source: metadata?.createdByUpload ? 'uploaded' : 'generated',
        uploadedAt: metadata?.uploadedAt ?? null,
        generatedBy: metadata?.generatedBy ?? null,
        isLatest: false
      } satisfies BackupFileView;
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  const latest = entries[0]?.filename;
  return entries.map((entry) => ({ ...entry, isLatest: entry.filename === latest }));
}
