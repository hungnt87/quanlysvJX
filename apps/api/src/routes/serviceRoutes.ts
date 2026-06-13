import type { FastifyInstance } from 'fastify';
import { ServiceRepository } from '../repositories/serviceRepository.js';
import { ServiceService } from '../services/serviceService.js';
import { ServiceController } from '../controllers/serviceController.js';

export async function registerServiceRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;
  const serviceRepository = new ServiceRepository({
    runCompose: app.deps.runCompose,
    runDocker: app.deps.runDocker
  });
  const serviceService = new ServiceService(serviceRepository, projectRoot);
  const serviceController = new ServiceController(serviceService, {
    runCompose: app.deps.runCompose,
    runDocker: app.deps.runDocker,
    streamCompose: app.deps.streamCompose
  });

  app.get('/api/services', (req, reply) => serviceController.listServices(req as any, reply));

  app.get('/api/services/images/prepare/stream', (req, reply) =>
    serviceController.prepareImagesStream(req as any, reply)
  );

  app.post('/api/services/:name/start', (req, reply) => serviceController.startService(req as any, reply));

  app.get('/api/services/:name/start/stream', (req, reply) =>
    serviceController.startServiceStream(req as any, reply)
  );

  app.post('/api/services/:name/stop', (req, reply) => serviceController.stopService(req as any, reply));

  app.post('/api/services/:name/restart', (req, reply) => serviceController.restartService(req as any, reply));
}
