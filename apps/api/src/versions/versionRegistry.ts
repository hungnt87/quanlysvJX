import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { updateEnvKey } from '../env/envFile.js';

const versionNamePattern = /^[A-Za-z0-9_-]{1,10}$/;

const versionRecordSchema = z.object({
  name: z.string().regex(versionNamePattern),
  path: z.string().trim().min(1),
  uploadedAt: z.string().datetime()
});

const versionRegistrySchema = z.object({
  activeVersion: z.string().regex(versionNamePattern).nullable(),
  versions: z.array(versionRecordSchema)
});

export type GameVersionRecord = z.infer<typeof versionRecordSchema>;
export type VersionRegistry = z.infer<typeof versionRegistrySchema>;

export class DuplicateVersionError extends Error {
  constructor(name: string) {
    super(`Tên phiên bản đã tồn tại: ${name}`);
    this.name = 'DuplicateVersionError';
  }
}

export class VersionNotFoundError extends Error {
  constructor(name: string) {
    super(`Không tìm thấy phiên bản: ${name}`);
    this.name = 'VersionNotFoundError';
  }
}

export class InvalidVersionPathError extends Error {
  constructor() {
    super('Đường dẫn phiên bản không hợp lệ');
    this.name = 'InvalidVersionPathError';
  }
}

export type CreateVersionOptions = {
  name: string;
  source: 'upload' | 'clone' | 'scan';
  serverSubPath?: string;
  allowExistingDirectory?: boolean;
  uploadedAt?: Date;
};

export type RenameVersionOptions = {
  name?: string;
};

export type DeleteVersionOptions = {
  allowActive?: boolean;
};

export function getVersionsDir(projectRoot: string) {
  return path.join(projectRoot, 'apps', 'jx-services', 'versions');
}

export function getRegistryPath(projectRoot: string) {
  return path.join(getVersionsDir(projectRoot), 'versions.json');
}

export function ensureVersionRegistry(projectRoot: string): VersionRegistry {
  const versionsDir = getVersionsDir(projectRoot);
  const registryPath = getRegistryPath(projectRoot);
  mkdirSync(versionsDir, { recursive: true });
  try { chmodSync(versionsDir, 0o777); } catch { void 0; }
  try { chownSync(versionsDir, 1000, 1000); } catch { void 0; }

  if (existsSync(registryPath)) {
    const raw = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (raw && Array.isArray(raw.versions)) {
      raw.versions = raw.versions.map((ver: any) => {
        if (ver && !ver.path) {
          const serverPath = ver.serverPath || (ver.rootPath ? `${ver.rootPath}/server` : '');
          ver.path = serverPath ? path.resolve(projectRoot, serverPath) : path.resolve(versionsDir, ver.name);
        }
        return ver;
      });
    }
    const parsed = versionRegistrySchema.parse(raw);
    writeVersionRegistry(projectRoot, parsed);
    return parsed;
  }

  const activeServerPath = getActiveServerPathFromEnv(projectRoot);
  const activeVersion = activeServerPath?.versionName ?? null;
  const versions = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && versionNamePattern.test(entry.name))
    .map((entry) => buildRecordFromFolder(
      projectRoot,
      entry.name,
      activeServerPath?.versionName === entry.name ? activeServerPath.serverPath : undefined
    ));

  const registry: VersionRegistry = {
    activeVersion: versions.some((version) => version.name === activeVersion) ? activeVersion : null,
    versions
  };
  writeVersionRegistry(projectRoot, registry);
  return registry;
}

export function readVersionRegistry(projectRoot: string): VersionRegistry {
  return ensureVersionRegistry(projectRoot);
}

export function writeVersionRegistry(projectRoot: string, registry: VersionRegistry) {
  const parsed = versionRegistrySchema.parse(registry);
  const registryPath = getRegistryPath(projectRoot);
  mkdirSync(path.dirname(registryPath), { recursive: true });
  try { chmodSync(path.dirname(registryPath), 0o777); } catch { void 0; }
  try { chownSync(path.dirname(registryPath), 1000, 1000); } catch { void 0; }
  const tempPath = `${registryPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  try { chmodSync(tempPath, 0o777); } catch { void 0; }
  try { chownSync(tempPath, 1000, 1000); } catch { void 0; }
  renameSync(tempPath, registryPath);
  try { chmodSync(registryPath, 0o777); } catch { void 0; }
  try { chownSync(registryPath, 1000, 1000); } catch { void 0; }
}

export function createVersionRecord(projectRoot: string, options: CreateVersionOptions): GameVersionRecord {
  const name = normalizeVersionName(options.name);
  const registry = ensureVersionRegistry(projectRoot);
  assertVersionNameAvailable(projectRoot, registry, name, { allowExistingDirectory: options.allowExistingDirectory === true });

  const record = buildRecord(projectRoot, {
    name,
    serverSubPath: options.serverSubPath,
    uploadedAt: options.uploadedAt ?? new Date()
  });
  writeVersionRegistry(projectRoot, { ...registry, versions: [...registry.versions, record] });
  return record;
}

export function selectVersion(projectRoot: string, name: string, subPath?: string) {
  const versionName = normalizeVersionName(name);
  const registry = ensureVersionRegistry(projectRoot);
  const version = registry.versions.find((item) => item.name === versionName);
  if (!version) {
    throw new VersionNotFoundError(versionName);
  }

  const nextPath = subPath !== undefined
    ? path.resolve(getVersionsDir(projectRoot), versionName, subPath)
    : version.path;
  const nextVersion = { ...version, path: nextPath };
  const nextRegistry: VersionRegistry = {
    activeVersion: versionName,
    versions: registry.versions.map((item) => (item.name === versionName ? nextVersion : item))
  };

  writeVersionRegistry(projectRoot, nextRegistry);
  const envServerPath = toEnvServerPath(nextVersion.path);
  updateEnvKey(path.join(projectRoot, '.env'), 'SERVER_PATH', envServerPath);
  return { activeVersion: versionName, serverPath: envServerPath };
}

export function renameVersion(projectRoot: string, currentName: string, options: RenameVersionOptions): GameVersionRecord {
  const oldName = normalizeVersionName(currentName);
  const registry = ensureVersionRegistry(projectRoot);
  const existing = registry.versions.find((item) => item.name === oldName);
  if (!existing) {
    throw new VersionNotFoundError(oldName);
  }

  const nextName = options.name ? normalizeVersionName(options.name) : oldName;
  if (nextName !== oldName) {
    assertVersionNameAvailable(projectRoot, registry, nextName);
    renameSync(path.join(getVersionsDir(projectRoot), oldName), path.join(getVersionsDir(projectRoot), nextName));
  }

  const nextPath = existing.path.replace(
    path.join(getVersionsDir(projectRoot), oldName),
    path.join(getVersionsDir(projectRoot), nextName)
  );

  const renamed: GameVersionRecord = {
    ...existing,
    name: nextName,
    path: nextPath
  };
  const nextRegistry: VersionRegistry = {
    activeVersion: registry.activeVersion === oldName ? nextName : registry.activeVersion,
    versions: registry.versions.map((item) => (item.name === oldName ? renamed : item))
  };
  writeVersionRegistry(projectRoot, nextRegistry);

  if (registry.activeVersion === oldName) {
    updateEnvKey(path.join(projectRoot, '.env'), 'SERVER_PATH', toEnvServerPath(renamed.path));
  }

  return renamed;
}

export function deleteVersionRecord(projectRoot: string, name: string, options: DeleteVersionOptions = {}) {
  const versionName = normalizeVersionName(name);
  const registry = ensureVersionRegistry(projectRoot);
  if (!registry.versions.some((item) => item.name === versionName)) {
    throw new VersionNotFoundError(versionName);
  }
  const isActive = registry.activeVersion === versionName;
  if (isActive && !options.allowActive) {
    throw new Error('Cannot delete active game version');
  }
  rmSync(path.join(getVersionsDir(projectRoot), versionName), { recursive: true, force: true });
  writeVersionRegistry(projectRoot, {
    ...registry,
    activeVersion: isActive ? null : registry.activeVersion,
    versions: registry.versions.filter((item) => item.name !== versionName)
  });
  if (isActive) {
    updateEnvKey(path.join(projectRoot, '.env'), 'SERVER_PATH', '');
  }
}

export function normalizeVersionName(name: string) {
  const normalized = name.trim();
  if (!versionNamePattern.test(normalized)) {
    throw new Error('Tên phiên bản chỉ được chứa chữ, số, dấu gạch ngang, gạch dưới và tối đa 10 ký tự');
  }
  return normalized;
}

export function assertVersionNameAvailable(
  projectRoot: string,
  registry: VersionRegistry,
  name: string,
  options: { allowExistingDirectory?: boolean } = {}
) {
  if (registry.versions.some((version) => version.name === name)) {
    throw new DuplicateVersionError(name);
  }
  if (!options.allowExistingDirectory && existsSync(path.join(getVersionsDir(projectRoot), name))) {
    throw new DuplicateVersionError(name);
  }
}

export function resolveServerPath(projectRoot: string, name: string, subPath = '') {
  const versionName = normalizeVersionName(name);
  const versionRoot = path.join(getVersionsDir(projectRoot), versionName);
  const absolute = path.resolve(versionRoot, subPath);
  if (absolute !== versionRoot && !absolute.startsWith(`${versionRoot}${path.sep}`)) {
    throw new InvalidVersionPathError();
  }
  return absolute;
}

function buildRecordFromFolder(projectRoot: string, name: string, envServerPath?: string): GameVersionRecord {
  const versionRoot = path.join(getVersionsDir(projectRoot), name);
  const hasServerDir = existsSync(path.join(versionRoot, 'server'));
  const record = buildRecord(projectRoot, {
    name,
    serverSubPath: hasServerDir ? 'server' : '',
    uploadedAt: statSync(versionRoot).mtime
  });
  return envServerPath ? { ...record, path: path.resolve(projectRoot, envServerPath) } : record;
}

function buildRecord(
  projectRoot: string,
  options: { name: string; serverSubPath?: string; uploadedAt: Date }
): GameVersionRecord {
  return {
    name: options.name,
    path: resolveServerPath(projectRoot, options.name, options.serverSubPath ?? ''),
    uploadedAt: options.uploadedAt.toISOString()
  };
}

function getActiveServerPathFromEnv(projectRoot: string) {
  const envFilePath = path.join(projectRoot, '.env');
  if (!existsSync(envFilePath)) return null;
  const line = readFileSync(envFilePath, 'utf8').split(/\r?\n/).find((item) => item.trim().startsWith('SERVER_PATH='));
  const value = line?.split('=')[1]?.trim().replace(/^\.\//, '').replace(/\/$/, '');
  const match = value?.match(/(?:^|\/)apps\/jx-services\/versions\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
  if (!value || !match?.[1]) return null;
  return { versionName: match[1], serverPath: value };
}

function toEnvServerPath(serverPath: string) {
  return path.resolve(serverPath) + '/';
}
