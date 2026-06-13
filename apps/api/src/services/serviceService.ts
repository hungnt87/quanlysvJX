import { readVersionRegistry } from '../versions/versionRegistry.js';
import { ValidationError, CommandError } from '../utils/errors.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { resolveComposeServiceConfig } from '../services/composeConfig.js';
import { getServiceBuildReadiness } from '../services/serviceImageBuildState.js';
import type { ServiceRepository } from '../repositories/serviceRepository.js';

export class ServiceService {
  constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly projectRoot: string
  ) {}

  /**
   * Đảm bảo đã kích hoạt phiên bản game
   */
  assertActiveVersion() {
    const registry = readVersionRegistry(this.projectRoot);
    if (!registry.activeVersion) {
      throw new ValidationError('Chưa có phiên bản game nào được kích hoạt. Vui lòng kích hoạt một phiên bản trước.');
    }
  }

  /**
   * Lấy danh sách chi tiết các dịch vụ cùng trạng thái image
   */
  async getServicesList() {
    const services = await this.serviceRepository.getManagedServiceStatuses();
    const cachedConfig = await this.serviceRepository.getComposeConfig();

    return Promise.all(
      services.map(async (service) => {
        let hasBuild = false;
        let imageName: string = service.name;
        if (cachedConfig) {
          try {
            const resolved = resolveComposeServiceConfig(cachedConfig, service.name);
            hasBuild = resolved.hasBuild;
            imageName = resolved.imageName;
          } catch {
            // Bỏ qua
          }
        }

        let imageExists = false;
        if (imageName) {
          imageExists = await this.serviceRepository.checkDockerImageExists(imageName);
        }

        const buildReadiness =
          cachedConfig && hasBuild
            ? getServiceBuildReadiness(this.projectRoot, cachedConfig, service.name, imageExists)
            : { needsRebuild: false, buildReason: null };

        return {
          ...service,
          imageName,
          hasBuild,
          imageExists,
          needsRebuild: buildReadiness.needsRebuild,
          buildReason: buildReadiness.buildReason
        };
      })
    );
  }

  /**
   * Thực hiện hành động khởi chạy/tắt/restart dịch vụ
   */
  async executeServiceAction(name: string, action: 'start' | 'stop' | 'restart') {
    const serviceName = assertServiceName(name);
    if (action === 'start' || action === 'restart') {
      this.assertActiveVersion();
    }

    if (action === 'stop' || action === 'restart') {
      await this.preHandleStopDependency(serviceName);
    }

    let args: readonly string[];
    let successMessage: string;
    if (action === 'start') {
      args = ['up', '-d', '--no-build', serviceName];
      successMessage = `Started ${serviceName}`;
    } else if (action === 'stop') {
      args = ['rm', '-f', '-s', serviceName];
      successMessage = `Stopped ${serviceName}`;
    } else {
      args = ['restart', serviceName];
      successMessage = `Restarted ${serviceName}`;
    }

    const result = await this.serviceRepository.runAction(args);
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(0, 1000);
      throw new CommandError(detail ? `${successMessage} failed: ${detail}` : `${successMessage} failed`);
    }

    return { message: successMessage, stdout: result.stdout, stderr: result.stderr };
  }

  private async preHandleStopDependency(serviceName: string) {
    const services = await this.serviceRepository.getManagedServiceStatuses();

    if (serviceName === 'jxserver') {
      const isS3RelayRunning = services.some(
        (s) => s.name === 's3relay' && (s.state === 'running' || s.state === 'starting')
      );
      if (isS3RelayRunning) {
        await this.executeServiceAction('s3relay', 'stop');
      }
    }

    if (serviceName === 'jxmysql' || serviceName === 'jxmssql') {
      const areOtherServicesRunning = services.some(
        (s) => s.name !== 'jxmysql' && s.name !== 'jxmssql' && (s.state === 'running' || s.state === 'starting')
      );
      if (areOtherServicesRunning) {
        throw new ValidationError('Cần tắt toàn bộ các dịch vụ JX khác trước khi dừng hoặc khởi động lại Database');
      }
    }
  }
}
