import { assertLogServiceName } from '../services/serviceAllowlist.js';
import { normalizeTail } from '../services/logStream.js';
import { CommandError } from '../utils/errors.js';
import type { LogRepository } from '../repositories/logRepository.js';

export class LogService {
  constructor(private readonly logRepository: LogRepository) {}

  /**
   * Lấy nhật ký (logs) tĩnh cho dịch vụ cụ thể hoặc tất cả
   */
  async fetchLogs(name: string, tailParam?: string) {
    const serviceName = assertLogServiceName(name);
    const tail = normalizeTail(tailParam);

    const args = ['logs', '--no-color', '--timestamps', '--tail', String(tail)];
    if (serviceName !== 'all') {
      args.push(serviceName);
    }

    const result = await this.logRepository.getLogs(args);
    if (result.exitCode !== 0) {
      throw new CommandError(`Unable to read logs for ${serviceName}`);
    }

    return { service: serviceName, tail, logs: result.stdout };
  }
}
