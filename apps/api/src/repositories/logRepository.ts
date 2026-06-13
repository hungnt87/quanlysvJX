import type { AppDeps } from '../app.js';

export class LogRepository {
  constructor(private readonly runCompose: AppDeps['runCompose']) {}

  /**
   * Gọi Docker Compose logs để lấy logs tĩnh
   */
  async getLogs(args: string[]) {
    return this.runCompose(args);
  }
}
