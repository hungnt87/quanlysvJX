import type { AppDeps } from '../app.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';

export class SystemRepository {
  constructor(
    private readonly deps: {
      runCompose: AppDeps['runCompose'];
    }
  ) {}

  /**
   * Lấy danh sách dịch vụ đang chạy của hệ thống
   */
  async getCoreServices() {
    const result = await this.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      return [];
    }
    return parseManagedServiceStatuses(result.stdout).map((service) => ({
      name: service.name,
      state: service.state
    }));
  }
}
