import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ensureVersionRegistry,
  createVersionRecord,
  selectVersion,
  renameVersion,
  deleteVersionRecord,
  getVersionsDir
} from '../versions/versionRegistry.js';

export class VersionRepository {
  constructor(private readonly projectRoot: string) {}

  getVersionsDir() {
    return getVersionsDir(this.projectRoot);
  }

  getRegistry() {
    return ensureVersionRegistry(this.projectRoot);
  }

  select(name: string, subPath?: string) {
    return selectVersion(this.projectRoot, name, subPath);
  }

  rename(currentName: string, options: { name?: string }) {
    return renameVersion(this.projectRoot, currentName, options);
  }

  create(options: {
    name: string;
    source: 'upload' | 'clone' | 'scan';
    serverSubPath?: string;
    allowExistingDirectory?: boolean;
  }) {
    return createVersionRecord(this.projectRoot, options);
  }

  delete(name: string, options?: { allowActive?: boolean }) {
    deleteVersionRecord(this.projectRoot, name, options);
  }

  runCommand(command: string, args: string[]) {
    const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
    }
  }

  applyFolderPermissions(targetDir: string) {
    this.runCommand('chmod', ['-R', '777', targetDir]);
    this.runCommand('chown', ['-R', '1000:1000', targetDir]);
  }

  extractArchive(tempArchivePath: string, filename: string, targetDir: string) {
    const ext = path.extname(filename).toLowerCase();
    const isZip = ext === '.zip';
    const isTarGz = filename.endsWith('.tar.gz') || ext === '.tgz';

    if (isZip) {
      this.runCommand('unzip', ['-o', tempArchivePath, '-d', targetDir]);
      return;
    }
    if (isTarGz) {
      this.runCommand('tar', ['-xzf', tempArchivePath, '-C', targetDir]);
      return;
    }

    throw new Error('Unsupported archive format. Only zip, tar.gz, and tgz are supported.');
  }
}
