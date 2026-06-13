import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { EnvRepository } from '../repositories/envRepository.js';
import { EnvService } from '../services/envService.js';
import { EnvController } from '../controllers/envController.js';

const saveEnvSchema = z.object({
  content: z.string()
});

export async function registerEnvRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');
  const envRepository = new EnvRepository(envFilePath);
  const envService = new EnvService(envRepository);
  const envController = new EnvController(envService);

  app.get('/api/env', (req, reply) => envController.getEnv(req, reply));

  app.post(
    '/api/env',
    {
      preHandler: validate({ body: saveEnvSchema })
    },
    (req, reply) => envController.saveEnv(req as any, reply)
  );
}
