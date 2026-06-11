import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { ValidationError } from '../api/errors.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import {
  buildSystemInfo,
  getServerIpChoiceDetails,
  getServerIpChoices,
  saveGameNetworkConfig,
  validateGameNetworkPayload
} from '../system/systemInfo.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');

  app.get('/api/system/info', async () => {
    const serverIpChoices = getServerIpChoiceDetails();
    return ok(
      buildSystemInfo({
        envFilePath,
        serverIpChoices,
        coreServices: await readCoreServices(app)
      })
    );
  });

  app.put('/api/system/game-network', async (request) => {
    let payload;
    try {
      payload = validateGameNetworkPayload(request.body, getServerIpChoices());
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'IP không hợp lệ.');
    }

    saveGameNetworkConfig(envFilePath, payload);
    return ok({
      gameNetwork: payload,
      message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
    });
  });
}

async function readCoreServices(app: FastifyInstance) {
  const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
  if (result.exitCode !== 0) {
    return [];
  }
  return parseManagedServiceStatuses(result.stdout).map((service) => ({
    name: service.name,
    state: service.state
  }));
}
