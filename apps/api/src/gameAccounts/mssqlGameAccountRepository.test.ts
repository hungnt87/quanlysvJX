import { describe, expect, it } from 'vitest';
import { ServiceUnavailableError } from '../api/errors.js';
import { createMssqlGameAccountRepository } from './mssqlGameAccountRepository.js';

describe('createMssqlGameAccountRepository', () => {
  it('requires MSSQL username and password before opening a connection', async () => {
    const repository = createMssqlGameAccountRepository({
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      user: null,
      password: null,
      encrypt: false,
      trustServerCertificate: true
    });

    await expect(repository.list({ search: '', page: 1, pageSize: 10 })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
