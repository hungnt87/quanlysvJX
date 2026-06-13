import type { AppDeps } from '../app.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import type { ComposeConfigDocument } from '../services/composeConfig.js';

export class ServiceRepository {
  private cachedComposeConfig: ComposeConfigDocument | null = null;

  constructor(
    private readonly deps: {
      runCompose: AppDeps['runCompose'];
      runDocker: AppDeps['runDocker'];
    }
  ) {}

  /**
   * Lấy cấu hình Docker Compose
   */
  async getComposeConfig(): Promise<ComposeConfigDocument | null> {
    if (this.cachedComposeConfig) {
      return this.cachedComposeConfig;
    }
    const configResult = await this.deps.runCompose(['config', '--format', 'json']);
    if (configResult.exitCode === 0) {
      try {
        this.cachedComposeConfig = JSON.parse(configResult.stdout) as ComposeConfigDocument;
      } catch {
        // Bỏ qua lỗi parse JSON
      }
    }
    return this.cachedComposeConfig;
  }

  /**
   * Chạy lệnh hành động trên docker compose
   */
  async runAction(args: readonly string[]) {
    return this.deps.runCompose(args);
  }

  /**
   * Kiểm tra xem Docker image có tồn tại cục bộ không
   */
  async checkDockerImageExists(imageName: string): Promise<boolean> {
    const inspectResult = await this.deps.runDocker(['image', 'inspect', imageName]);
    return inspectResult.exitCode === 0;
  }

  /**
   * Lấy trạng thái của các dịch vụ được quản lý
   */
  async getManagedServiceStatuses() {
    const result = await this.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      throw new Error('Unable to read Docker Compose services');
    }
    return parseManagedServiceStatuses(result.stdout);
  }
}
