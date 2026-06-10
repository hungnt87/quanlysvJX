import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateVersionError,
  createVersionRecord,
  ensureVersionRegistry,
  getVersionsDir,
  readVersionRegistry,
  renameVersion,
  selectVersion
} from './versionRegistry.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'version-registry-'));
  mkdirSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true });
  writeFileSync(path.join(root, '.env'), 'SERVER_PATH=./apps/jx-services/versions/mel/server/\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('version registry', () => {
  it('bootstraps versions.json from existing version folders', () => {
    const registry = ensureVersionRegistry(root);

    expect(registry.activeVersion).toBe('mel');
    expect(registry.versions).toHaveLength(1);
    expect(registry.versions[0]).toMatchObject({
      name: 'mel',
      displayName: 'mel',
      rootPath: 'apps/jx-services/versions/mel',
      serverPath: 'apps/jx-services/versions/mel/server',
      enabled: true
    });
    expect(Date.parse(registry.versions[0]?.uploadedAt ?? '')).not.toBeNaN();

    const saved = JSON.parse(readFileSync(path.join(getVersionsDir(root), 'versions.json'), 'utf8'));
    expect(saved.activeVersion).toBe('mel');
  });

  it('preserves the active SERVER_PATH even when the subfolder is not present yet', () => {
    rmSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true, force: true });

    const registry = ensureVersionRegistry(root);

    expect(registry.versions[0]?.serverPath).toBe('apps/jx-services/versions/mel/server');
  });

  it('rejects duplicate names from registry or folders', () => {
    ensureVersionRegistry(root);
    expect(() => createVersionRecord(root, { name: 'mel', source: 'upload' })).toThrow(DuplicateVersionError);

    mkdirSync(path.join(getVersionsDir(root), 'new_version'), { recursive: true });
    expect(() => createVersionRecord(root, { name: 'new_version', source: 'upload' })).toThrow(DuplicateVersionError);
  });

  it('adds a new version record with uploadedAt and default server folder', () => {
    ensureVersionRegistry(root);
    const record = createVersionRecord(root, { name: 'new_version', displayName: 'New Version', source: 'upload' });
    const registry = readVersionRegistry(root);

    expect(record).toMatchObject({
      name: 'new_version',
      displayName: 'New Version',
      rootPath: 'apps/jx-services/versions/new_version',
      serverPath: 'apps/jx-services/versions/new_version/server',
      enabled: true
    });
    expect(Date.parse(record.uploadedAt)).not.toBeNaN();
    expect(registry.versions.map((version) => version.name)).toEqual(['mel', 'new_version']);
  });

  it('selects a version and synchronizes SERVER_PATH', () => {
    ensureVersionRegistry(root);
    createVersionRecord(root, { name: 'new_version', source: 'upload' });
    mkdirSync(path.join(getVersionsDir(root), 'new_version/server'), { recursive: true });

    const result = selectVersion(root, 'new_version');

    expect(result.activeVersion).toBe('new_version');
    expect(result.serverPath).toBe(path.resolve(root, 'apps/jx-services/versions/new_version/server') + '/');
    expect(readVersionRegistry(root).activeVersion).toBe('new_version');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('SERVER_PATH=' + path.resolve(root, 'apps/jx-services/versions/new_version/server') + '/');
  });

  it('renames an active version folder and keeps SERVER_PATH synchronized', () => {
    ensureVersionRegistry(root);
    const oldStat = statSync(path.join(getVersionsDir(root), 'mel'));

    const renamed = renameVersion(root, 'mel', { name: 'mel_2026', displayName: 'MEL 2026' });

    expect(renamed).toMatchObject({
      name: 'mel_2026',
      displayName: 'MEL 2026',
      rootPath: 'apps/jx-services/versions/mel_2026',
      serverPath: 'apps/jx-services/versions/mel_2026/server'
    });
    expect(statSync(path.join(getVersionsDir(root), 'mel_2026')).mtimeMs).toBeGreaterThanOrEqual(oldStat.mtimeMs);
    expect(readVersionRegistry(root).activeVersion).toBe('mel_2026');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('SERVER_PATH=' + path.resolve(root, 'apps/jx-services/versions/mel_2026/server') + '/');
  });
});
