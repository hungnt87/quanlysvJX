import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../utils/errors.js';
import { createMssqlGameAccountRepository } from './mssqlGameAccountRepository.js';

const sqlMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  request: vi.fn()
}));

vi.mock('mssql', () => {
  class ConnectionPool {
    connect = sqlMocks.connect;
  }

  return {
    default: {
      ConnectionPool,
      VarChar: vi.fn(),
      Int: vi.fn(),
      DateTime: vi.fn(),
      Transaction: vi.fn(),
      Request: vi.fn()
    }
  };
});

beforeEach(() => {
  sqlMocks.connect.mockReset();
  sqlMocks.query.mockReset();
  sqlMocks.request.mockReset();

  sqlMocks.query.mockResolvedValue({ recordset: [{ countRows: 0 }] });
  sqlMocks.request.mockImplementation(() => {
    const request = {
      input: vi.fn(() => request),
      query: sqlMocks.query
    };
    return request;
  });
});

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

  it('does not cache failed MSSQL connection attempts', async () => {
    const repository = createMssqlGameAccountRepository({
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      user: 'sa',
      password: 'secret',
      encrypt: false,
      trustServerCertificate: true
    });
    const connectedPool = { request: sqlMocks.request };
    sqlMocks.connect.mockRejectedValueOnce(new Error('connection refused'));
    sqlMocks.connect.mockResolvedValueOnce(connectedPool);

    await expect(repository.existsInPrimaryOrSecondary('jxuser')).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(repository.existsInPrimaryOrSecondary('jxuser')).resolves.toBe(false);
    expect(sqlMocks.connect).toHaveBeenCalledTimes(2);
  });
});
