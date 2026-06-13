import { ConflictError, NotFoundError } from '../utils/errors.js';
import type { CreateGameAccountRequest, GameAccountListResponse, GameAccountView, ListGameAccountsQuery, UpdateGameAccountRequest } from './accountSchemas.js';
import { hashGamePassword } from './passwordHash.js';

export type CreateGameAccountRecord = {
  accountName: string;
  passwordHash: string;
  secondaryPasswordHash: string;
  expiresAt: string;
  leftSeconds: number;
};

export type UpdateGameAccountRecord = {
  passwordHash?: string;
  secondaryPasswordHash?: string;
  expiresAt: string;
  leftSeconds: number;
};

export type GameAccountRepository = {
  list: (query: ListGameAccountsQuery) => Promise<{ items: GameAccountView[]; total: number }>;
  existsInPrimaryOrSecondary: (accountName: string) => Promise<boolean>;
  findByName: (accountName: string) => Promise<GameAccountView | null>;
  create: (record: CreateGameAccountRecord) => Promise<void>;
  update: (accountName: string, record: UpdateGameAccountRecord) => Promise<void>;
  ban: (accountName: string) => Promise<void>;
  unban: (accountName: string) => Promise<void>;
  delete: (accountName: string) => Promise<void>;
};

export function createGameAccountService(repository: GameAccountRepository) {
  return {
    async list(query: ListGameAccountsQuery): Promise<GameAccountListResponse> {
      const result = await repository.list(query);
      return {
        items: result.items,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / query.pageSize))
        }
      };
    },

    async create(input: CreateGameAccountRequest): Promise<GameAccountView> {
      if (await repository.existsInPrimaryOrSecondary(input.accountName)) {
        throw new ConflictError('Account already exists');
      }

      await repository.create({
        accountName: input.accountName,
        passwordHash: hashGamePassword(input.password),
        secondaryPasswordHash: hashGamePassword(input.secondaryPassword),
        expiresAt: input.expiresAt,
        leftSeconds: input.leftSeconds
      });

      const created = await repository.findByName(input.accountName);
      if (!created) {
        throw new NotFoundError('Created account was not found');
      }
      return created;
    },

    async update(accountName: string, input: UpdateGameAccountRequest): Promise<GameAccountView> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }

      const record: UpdateGameAccountRecord = {
        expiresAt: input.expiresAt,
        leftSeconds: input.leftSeconds
      };
      if (input.password) record.passwordHash = hashGamePassword(input.password);
      if (input.secondaryPassword) record.secondaryPasswordHash = hashGamePassword(input.secondaryPassword);

      await repository.update(accountName, record);
      const updated = await repository.findByName(accountName);
      if (!updated) {
        throw new NotFoundError('Account not found');
      }
      return updated;
    },

    async ban(accountName: string): Promise<GameAccountView> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }
      await repository.ban(accountName);
      const updated = await repository.findByName(accountName);
      return updated ?? { ...current, status: 'banned' };
    },

    async unban(accountName: string): Promise<GameAccountView> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }
      await repository.unban(accountName);
      const updated = await repository.findByName(accountName);
      return updated ?? { ...current, status: 'active' };
    },

    async delete(accountName: string): Promise<void> {
      const current = await repository.findByName(accountName);
      if (!current) {
        throw new NotFoundError('Account not found');
      }
      await repository.delete(accountName);
    }
  };
}

export type GameAccountService = ReturnType<typeof createGameAccountService>;
