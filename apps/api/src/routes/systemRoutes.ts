import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { SystemRepository } from '../repositories/systemRepository.js';
import { SystemService } from '../services/systemService.js';
import { SystemController } from '../controllers/systemController.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');
  const systemRepository = new SystemRepository({ runCompose: app.deps.runCompose });
  const systemService = new SystemService(systemRepository, envFilePath);
  const systemController = new SystemController(systemService);

  app.get('/api/system/info', (req, reply) => systemController.getSystemInfo(req, reply));

  app.put('/api/system/game-network', (req, reply) => systemController.saveGameNetwork(req, reply));
}
