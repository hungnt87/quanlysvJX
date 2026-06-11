import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnvMap, updateEnvKeys } from './envFile.js';

let root: string;
let envPath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'env-file-'));
  envPath = path.join(root, '.env');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('envFile helpers', () => {
  it('reads simple env key values', () => {
    writeFileSync(envPath, 'JX_IP=192.168.1.20\nMSSQL_HOST=host.docker.internal\n', 'utf8');

    expect(readEnvMap(envPath)).toMatchObject({
      JX_IP: '192.168.1.20',
      MSSQL_HOST: 'host.docker.internal'
    });
  });

  it('updates existing keys and appends missing keys', () => {
    writeFileSync(envPath, 'SERVER_PATH=./apps/jx-services/versions/mel/server/\nJX_IP=auto\n', 'utf8');

    updateEnvKeys(envPath, {
      JX_IP: '127.0.0.1',
      JX_MYSQL_IP: '192.168.1.20'
    });

    expect(readFileSync(envPath, 'utf8')).toBe(
      'SERVER_PATH=./apps/jx-services/versions/mel/server/\n' +
        'JX_IP=127.0.0.1\n' +
        'JX_MYSQL_IP=192.168.1.20\n'
    );
  });

  it('reactivates a commented key when updating env values', () => {
    writeFileSync(envPath, '# JX_IP=auto\n', 'utf8');

    updateEnvKeys(envPath, { JX_IP: '127.0.0.1' });

    expect(readFileSync(envPath, 'utf8')).toBe('JX_IP=127.0.0.1\n');
  });
});
