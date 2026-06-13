import type { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/healthController.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  const healthController = new HealthController();

  app.get('/api/health', (req, reply) => healthController.getHealth(req, reply));
}
