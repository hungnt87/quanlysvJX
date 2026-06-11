import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';
import { CommandError, ValidationError } from '../api/errors.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import {
  DuplicateVersionError,
  InvalidVersionPathError,
  VersionNotFoundError,
  assertVersionNameAvailable,
  createVersionRecord,
  deleteVersionRecord,
  ensureVersionRegistry,
  getVersionsDir,
  normalizeVersionName,
  renameVersion,
  selectVersion
} from '../versions/versionRegistry.js';

const coreGameServices = ['jxserver', 's3relay', 'bishop', 'goddess'] as const;

const selectVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  subPath: z.string().optional()
});

const cloneVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  url: z.string().url(),
  branch: z.string().trim().min(1).default('main')
});

const renameVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/).optional()
}).refine((value) => value.name !== undefined, 'Tên phiên bản mới là bắt buộc');

export async function registerVersionRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;
  const versionsDir = getVersionsDir(projectRoot);

  fs.mkdirSync(versionsDir, { recursive: true });
  try { fs.chmodSync(versionsDir, 0o777); } catch { void 0; }
  try { fs.chownSync(versionsDir, 1000, 1000); } catch { void 0; }

  app.get('/api/versions', async () => {
    try {
      const registry = ensureVersionRegistry(projectRoot);
      return ok({
        activeVersion: registry.activeVersion,
        versions: registry.versions.map((version) => ({
          ...version,
          isActive: version.name === registry.activeVersion
        }))
      });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot list versions');
    }
  });

  app.post('/api/versions/select', async (request) => {
    const { name, subPath } = selectVersionSchema.parse(request.body);

    try {
      return ok(selectVersion(projectRoot, name, subPath));
    } catch (error) {
      throwVersionHttpError(app, error, 'Cannot update active version');
    }
  });

  app.patch('/api/versions/:name', async (request) => {
    const currentName = normalizeVersionName((request.params as { name: string }).name);
    const payload = renameVersionSchema.parse(request.body);

    try {
      return ok(renameVersion(projectRoot, currentName, payload));
    } catch (error) {
      throwVersionHttpError(app, error, 'Cannot rename version');
    }
  });

  app.post('/api/versions/clone', async (request) => {
    const { name, url, branch } = cloneVersionSchema.parse(request.body);
    const targetName = normalizeVersionName(name);
    const targetDir = path.join(versionsDir, targetName);

    try {
      const registry = ensureVersionRegistry(projectRoot);
      assertVersionNameAvailable(projectRoot, registry, targetName);
      runCommand('git', ['clone', '--depth', '1', '-b', branch, url, targetDir]);
      applyVersionFolderPermissions(targetDir);
      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return ok(createVersionRecord(projectRoot, {
        name: targetName,
        source: 'clone',
        serverSubPath: hasServerDir ? 'server' : '',
        allowExistingDirectory: true
      }));
    } catch (error) {
      if (fs.existsSync(targetDir) && !(error instanceof DuplicateVersionError)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throwVersionHttpError(app, error, 'Git clone failed');
    }
  });

  app.post('/api/versions/upload', async (request) => {
    let name = '';
    let filename = '';
    let tempArchivePath = '';

    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'name' && typeof part.value === 'string') {
            name = part.value;
          }
          continue;
        }

        if (part.fieldname !== 'file') {
          continue;
        }

        filename = part.filename;
        tempArchivePath = path.join(versionsDir, `temp_${Date.now()}_${filename.replace(/[^A-Za-z0-9_.-]/g, '_')}`);
        const writeStream = fs.createWriteStream(tempArchivePath);
        for await (const chunk of part.file) {
          writeStream.write(chunk);
        }
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        try { fs.chmodSync(tempArchivePath, 0o777); } catch { void 0; }
        try { fs.chownSync(tempArchivePath, 1000, 1000); } catch { void 0; }
      }

      if (!name) {
        throw app.httpErrors.badRequest('Tên phiên bản là bắt buộc');
      }
      if (!tempArchivePath || !filename) {
        throw app.httpErrors.badRequest('File is required');
      }

      const targetName = normalizeVersionName(name);
      const registry = ensureVersionRegistry(projectRoot);
      assertVersionNameAvailable(projectRoot, registry, targetName);

      const targetDir = path.join(versionsDir, targetName);
      fs.mkdirSync(targetDir, { recursive: true });
      try { fs.chmodSync(targetDir, 0o777); } catch { void 0; }
      try { fs.chownSync(targetDir, 1000, 1000); } catch { void 0; }
      extractArchive(tempArchivePath, filename, targetDir);
      applyVersionFolderPermissions(targetDir);
      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return ok(createVersionRecord(projectRoot, {
        name: targetName,
        source: 'upload',
        serverSubPath: hasServerDir ? 'server' : '',
        allowExistingDirectory: true
      }));
    } catch (error) {
      if (name && /^[A-Za-z0-9_-]{1,10}$/.test(name)) {
        const targetDir = path.join(versionsDir, name);
        if (fs.existsSync(targetDir) && !(error instanceof DuplicateVersionError)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      }
      throwVersionHttpError(app, error, 'Extraction failed');
    } finally {
      if (tempArchivePath && fs.existsSync(tempArchivePath)) {
        fs.rmSync(tempArchivePath, { force: true });
      }
    }
  });

  app.delete('/api/versions/:name', async (request) => {
    const name = normalizeVersionName((request.params as { name: string }).name);

    try {
      const registry = ensureVersionRegistry(projectRoot);
      if (registry.activeVersion === name) {
        await assertActiveVersionCanBeDeleted(app);
      }
      deleteVersionRecord(projectRoot, name, { allowActive: registry.activeVersion === name });
      return ok({ message: 'Version deleted successfully' });
    } catch (error) {
      throwVersionHttpError(app, error, 'Cannot delete version');
    }
  });

  app.get('/api/versions/:name/browse', async (request) => {
    const name = normalizeVersionName((request.params as { name: string }).name);
    const query = request.query as { path?: string };
    const relativePath = query.path || '';
    const versionRoot = path.join(versionsDir, name);

    if (!fs.existsSync(versionRoot)) {
      throw app.httpErrors.notFound('Version root not found');
    }

    const targetDir = path.resolve(versionRoot, relativePath);
    if (targetDir !== versionRoot && !targetDir.startsWith(`${versionRoot}${path.sep}`)) {
      throw app.httpErrors.badRequest('Invalid path');
    }

    try {
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const directories = items.filter((item) => item.isDirectory()).map((item) => item.name);
      const parentPath = relativePath ? path.dirname(relativePath) : null;

      return ok({
        currentPath: relativePath,
        parentPath: parentPath === '.' ? '' : parentPath,
        directories
      });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot read directory');
    }
  });
}

async function assertActiveVersionCanBeDeleted(app: FastifyInstance) {
  const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
  if (result.exitCode !== 0) {
    throw new CommandError('Unable to read Docker Compose services');
  }

  const runningServices = parseManagedServiceStatuses(result.stdout)
    .filter((service) => coreGameServices.includes(service.name as (typeof coreGameServices)[number]))
    .filter((service) => service.state === 'running')
    .map((service) => service.name);

  if (runningServices.length > 0) {
    throw new ValidationError(
      `Không thể xóa phiên bản game đang kích hoạt khi các dịch vụ đang chạy: ${runningServices.join(', ')}`
    );
  }
}

function extractArchive(tempArchivePath: string, filename: string, targetDir: string) {
  const ext = path.extname(filename).toLowerCase();
  const isZip = ext === '.zip';
  const isTarGz = filename.endsWith('.tar.gz') || ext === '.tgz';

  if (isZip) {
    runCommand('unzip', ['-o', tempArchivePath, '-d', targetDir]);
    return;
  }
  if (isTarGz) {
    runCommand('tar', ['-xzf', tempArchivePath, '-C', targetDir]);
    return;
  }

  throw new Error('Unsupported archive format. Only zip, tar.gz, and tgz are supported.');
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
}

function applyVersionFolderPermissions(targetDir: string) {
  runCommand('chmod', ['-R', '777', targetDir]);
  runCommand('chown', ['-R', '1000:1000', targetDir]);
}

function throwVersionHttpError(app: FastifyInstance, error: unknown, fallback: string): never {
  if (error instanceof DuplicateVersionError) {
    throw app.httpErrors.conflict(error.message);
  }
  if (error instanceof VersionNotFoundError) {
    throw app.httpErrors.notFound(error.message);
  }
  if (error instanceof InvalidVersionPathError) {
    throw app.httpErrors.badRequest(error.message);
  }
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    throw error;
  }
  throw app.httpErrors.internalServerError(error instanceof Error ? error.message : fallback);
}
