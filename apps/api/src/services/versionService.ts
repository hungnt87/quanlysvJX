import fs from 'node:fs';
import path from 'node:path';
import type { VersionRepository } from '../repositories/versionRepository.js';
import { ValidationError, CommandError } from '../utils/errors.js';
import { normalizeVersionName, DuplicateVersionError } from '../versions/versionRegistry.js';
import { parseManagedServiceStatuses } from './serviceStatus.js';
import type { AppDeps } from '../app.js';

const coreGameServices = ['jxserver', 's3relay', 'bishop', 'goddess'] as const;

export class VersionService {
  constructor(
    private readonly versionRepository: VersionRepository,
    private readonly runCompose: AppDeps['runCompose']
  ) {}

  /**
   * Lấy danh sách các phiên bản game
   */
  getVersions() {
    const registry = this.versionRepository.getRegistry();
    return {
      activeVersion: registry.activeVersion,
      versions: registry.versions.map((version) => ({
        ...version,
        isActive: version.name === registry.activeVersion
      }))
    };
  }

  /**
   * Chọn phiên bản hoạt động
   */
  select(name: string, subPath?: string) {
    return this.versionRepository.select(name, subPath);
  }

  /**
   * Đổi tên phiên bản
   */
  rename(currentName: string, options: { name?: string }) {
    const currentNormalized = normalizeVersionName(currentName);
    return this.versionRepository.rename(currentNormalized, options);
  }

  /**
   * Clone phiên bản từ Git
   */
  clone(name: string, url: string, branch = 'main') {
    const targetName = normalizeVersionName(name);
    const versionsDir = this.versionRepository.getVersionsDir();
    const targetDir = path.join(versionsDir, targetName);

    const registry = this.versionRepository.getRegistry();
    const existing = registry.versions.find((v) => v.name === targetName);
    if (existing || fs.existsSync(targetDir)) {
      throw new DuplicateVersionError(targetName);
    }

    try {
      this.versionRepository.runCommand('git', ['clone', '--depth', '1', '-b', branch, url, targetDir]);
      this.versionRepository.applyFolderPermissions(targetDir);
      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return this.versionRepository.create({
        name: targetName,
        source: 'clone',
        serverSubPath: hasServerDir ? 'server' : '',
        allowExistingDirectory: true
      });
    } catch (error) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Xóa phiên bản
   */
  async delete(name: string) {
    const normalized = normalizeVersionName(name);
    const registry = this.versionRepository.getRegistry();
    if (registry.activeVersion === normalized) {
      await this.assertActiveVersionCanBeDeleted();
    }
    this.versionRepository.delete(normalized, { allowActive: registry.activeVersion === normalized });
  }

  private async assertActiveVersionCanBeDeleted() {
    const result = await this.runCompose(['ps', '--all', '--format', 'json']);
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

  /**
   * Xem cấu trúc thư mục của phiên bản
   */
  browseDirectory(name: string, relativePath = '') {
    const normalized = normalizeVersionName(name);
    const versionsDir = this.versionRepository.getVersionsDir();
    const versionRoot = path.join(versionsDir, normalized);

    if (!fs.existsSync(versionRoot)) {
      throw new ValidationError('Version root not found');
    }

    const targetDir = path.resolve(versionRoot, relativePath);
    if (targetDir !== versionRoot && !targetDir.startsWith(`${versionRoot}${path.sep}`)) {
      throw new ValidationError('Invalid path');
    }

    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    const directories = items.filter((item) => item.isDirectory()).map((item) => item.name);
    const parentPath = relativePath ? path.dirname(relativePath) : null;

    return {
      currentPath: relativePath,
      parentPath: parentPath === '.' ? '' : parentPath,
      directories
    };
  }

  /**
   * Giải nén file lưu trữ tải lên và tạo record phiên bản mới
   */
  async extractUploadedArchive(name: string, tempArchivePath: string, filename: string) {
    const targetName = normalizeVersionName(name);
    const registry = this.versionRepository.getRegistry();
    const versionsDir = this.versionRepository.getVersionsDir();
    const targetDir = path.join(versionsDir, targetName);

    const existing = registry.versions.find((v) => v.name === targetName);
    if (existing || fs.existsSync(targetDir)) {
      throw new DuplicateVersionError(targetName);
    }

    try {
      fs.mkdirSync(targetDir, { recursive: true });
      this.versionRepository.applyFolderPermissions(targetDir);
      this.versionRepository.extractArchive(tempArchivePath, filename, targetDir);
      this.versionRepository.applyFolderPermissions(targetDir);

      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return this.versionRepository.create({
        name: targetName,
        source: 'upload',
        serverSubPath: hasServerDir ? 'server' : '',
        allowExistingDirectory: true
      });
    } catch (error) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throw error;
    }
  }
}
