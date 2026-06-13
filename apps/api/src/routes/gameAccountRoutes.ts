import type { FastifyInstance } from 'fastify';
import { validate } from '../middleware/validate.js';
import {
  createGameAccountSchema,
  listGameAccountsQuerySchema,
  updateGameAccountSchema
} from '../gameAccounts/accountSchemas.js';
import { GameAccountController } from '../controllers/gameAccountController.js';
import { z } from 'zod';

const accountNameParamSchema = z.object({
  accountName: z.string()
});

export async function registerGameAccountRoutes(app: FastifyInstance) {
  const gameAccountController = new GameAccountController(app.deps.gameAccounts);

  app.get(
    '/api/game-accounts',
    {
      preHandler: validate({ query: listGameAccountsQuerySchema })
    },
    (req, reply) => gameAccountController.list(req, reply)
  );

  app.post(
    '/api/game-accounts',
    {
      preHandler: validate({ body: createGameAccountSchema })
    },
    (req, reply) => gameAccountController.create(req, reply)
  );

  app.patch(
    '/api/game-accounts/:accountName',
    {
      preHandler: validate({ params: accountNameParamSchema, body: updateGameAccountSchema })
    },
    (req, reply) => gameAccountController.update(req as any, reply)
  );

  app.delete(
    '/api/game-accounts/:accountName',
    {
      preHandler: validate({ params: accountNameParamSchema })
    },
    (req, reply) => gameAccountController.delete(req as any, reply)
  );

  app.post(
    '/api/game-accounts/:accountName/ban',
    {
      preHandler: validate({ params: accountNameParamSchema })
    },
    (req, reply) => gameAccountController.ban(req as any, reply)
  );

  app.post(
    '/api/game-accounts/:accountName/unban',
    {
      preHandler: validate({ params: accountNameParamSchema })
    },
    (req, reply) => gameAccountController.unban(req as any, reply)
  );
}
