import type { SystemRepository } from '../repositories/systemRepository.js';
import { ValidationError } from '../utils/errors.js';
import {
  buildSystemInfo,
  getServerIpChoiceDetails,
  getServerIpChoices,
  saveGameNetworkConfig,
  validateGameNetworkPayload
} from '../system/systemInfo.js';

export class SystemService {
  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly envFilePath: string
  ) {}

  /**
   * Lấy toàn bộ thông tin hệ thống
   */
  async getSystemInfo() {
    const serverIpChoices = getServerIpChoiceDetails();
    const coreServices = await this.systemRepository.getCoreServices();
    return buildSystemInfo({
      envFilePath: this.envFilePath,
      serverIpChoices,
      coreServices
    });
  }

  /**
   * Lưu cấu hình địa chỉ IP mạng game
   */
  saveGameNetwork(body: unknown) {
    let payload;
    try {
      payload = validateGameNetworkPayload(body, getServerIpChoices());
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'IP không hợp lệ.');
    }

    saveGameNetworkConfig(this.envFilePath, payload);
    return payload;
  }
}
