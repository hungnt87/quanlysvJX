import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { createGameAccountSchema, listGameAccountsQuerySchema, updateGameAccountSchema } from '../gameAccounts/accountSchemas.js';

export async function registerGameAccountRoutes(app: FastifyInstance) {
  app.get('/api/game-accounts', async (request) => {
    const query = listGameAccountsQuerySchema.parse(request.query);
    return ok(await app.deps.gameAccounts.list(query));
  });

  app.post('/api/game-accounts', async (request) => {
    const payload = createGameAccountSchema.parse(request.body);
    return ok(await app.deps.gameAccounts.create(payload));
  });

  app.patch('/api/game-accounts/:accountName', async (request) => {
    const { accountName } = request.params as { accountName: string };
    const payload = updateGameAccountSchema.parse(request.body);
    return ok(await app.deps.gameAccounts.update(accountName, payload));
  });

  app.delete('/api/game-accounts/:accountName', async (request) => {
    const { accountName } = request.params as { accountName: string };
    await app.deps.gameAccounts.delete(accountName);
    return ok({ message: 'Account deleted' });
  });

  app.post('/api/game-accounts/:accountName/ban', async (request) => {
    const { accountName } = request.params as { accountName: string };
    return ok(await app.deps.gameAccounts.ban(accountName));
  });

  app.post('/api/game-accounts/:accountName/unban', async (request) => {
    const { accountName } = request.params as { accountName: string };
    return ok(await app.deps.gameAccounts.unban(accountName));
  });
}
