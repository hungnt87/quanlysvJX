import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { createGameAccountService, type GameAccountRepository } from './gameAccountService.js';

function fakeRepository(overrides: Partial<GameAccountRepository> = {}): GameAccountRepository {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    existsInPrimaryOrSecondary: vi.fn().mockResolvedValue(false),
    findByName: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    ban: vi.fn().mockResolvedValue(undefined),
    unban: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('game account service', () => {
  it('hashes passwords before creating accounts', async () => {
    const repository = fakeRepository();
    const service = createGameAccountService(repository);

    await service.create({
      accountName: 'jxuser',
      password: 'a',
      secondaryPassword: 'b',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });

    expect(repository.create).toHaveBeenCalledWith({
      accountName: 'jxuser',
      passwordHash: '0CC175B9C0F1B6A831C399E269772661',
      secondaryPasswordHash: '92EB5FFEE6AE2FEC3AD71C777531578F',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });
  });

  it('rejects duplicate accounts', async () => {
    const service = createGameAccountService(fakeRepository({ existsInPrimaryOrSecondary: vi.fn().mockResolvedValue(true) }));

    await expect(service.create({
      accountName: 'jxuser',
      password: 'a',
      secondaryPassword: 'b',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('omits blank password updates', async () => {
    const repository = fakeRepository();
    const service = createGameAccountService(repository);

    await service.update('jxuser', { password: '', secondaryPassword: undefined, expiresAt: '2027-06-10', leftSeconds: 5 });

    expect(repository.update).toHaveBeenCalledWith('jxuser', { expiresAt: '2027-06-10', leftSeconds: 5 });
  });

  it('returns not found when updating a missing account', async () => {
    const service = createGameAccountService(fakeRepository({ findByName: vi.fn().mockResolvedValue(null) }));

    await expect(service.update('missing', { expiresAt: '2027-06-10', leftSeconds: 0 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
