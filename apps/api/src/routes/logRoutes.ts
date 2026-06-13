import type { FastifyInstance } from 'fastify';
import { LogRepository } from '../repositories/logRepository.js';
import { LogService } from '../services/logService.js';
import { LogController } from '../controllers/logController.js';

export async function registerLogRoutes(app: FastifyInstance) {
  const logRepository = new LogRepository(app.deps.runCompose);
  const logService = new LogService(logRepository);
  const logController = new LogController(logService, app.deps.streamCompose);

  app.get('/api/services/:name/logs', (req, reply) => logController.getLogs(req as any, reply));

  app.get('/api/services/:name/logs/stream', (req, reply) => logController.streamLogs(req as any, reply));
}
