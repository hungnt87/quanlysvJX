import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig MSSQL settings', () => {
  it('loads MSSQL connection settings from environment variables', () => {
    const config = loadConfig({
      MANAGER_PROJECT_ROOT: '/repo',
      MSSQL_HOST: 'sql.example.local',
      MSSQL_PORT: '1444',
      MSSQL_DATABASE: 'account_tong',
      MSSQL_USER: 'manager_user',
      MSSQL_PASSWORD: 'secret',
      MSSQL_ENCRYPT: 'true',
      MSSQL_TRUST_SERVER_CERTIFICATE: 'false'
    });

    expect(config.mssql).toEqual({
      host: 'sql.example.local',
      port: 1444,
      database: 'account_tong',
      user: 'manager_user',
      password: 'secret',
      encrypt: true,
      trustServerCertificate: false
    });
  });

  it('does not invent MSSQL username or password defaults', () => {
    const config = loadConfig({ MANAGER_PROJECT_ROOT: '/repo' });

    expect(config.mssql.user).toBeNull();
    expect(config.mssql.password).toBeNull();
    expect(config.mssql).toMatchObject({
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      encrypt: false,
      trustServerCertificate: true
    });
  });

  it('uses JX_MSSQL_IP as the manager MSSQL host when MSSQL_HOST is not set', () => {
    const config = loadConfig({ MANAGER_PROJECT_ROOT: '/repo', JX_MSSQL_IP: '10.0.0.8' });

    expect(config.mssql.host).toBe('10.0.0.8');
  });

  it('treats legacy auto MSSQL host values as localhost', () => {
    const config = loadConfig({ MANAGER_PROJECT_ROOT: '/repo', JX_MSSQL_IP: 'auto' });

    expect(config.mssql.host).toBe('localhost');
  });
});
