import type { EnvRepository } from '../repositories/envRepository.js';

export class EnvService {
  constructor(private readonly envRepository: EnvRepository) {}

  /**
   * Lấy nội dung cấu hình môi trường
   */
  getEnvContent(): string {
    if (!this.envRepository.exists()) {
      return '';
    }
    return this.envRepository.read();
  }

  /**
   * Lưu nội dung cấu hình môi trường mới
   */
  saveEnvContent(content: string): void {
    this.envRepository.write(content);
  }
}
