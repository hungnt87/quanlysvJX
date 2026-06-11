import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSystemInfo,
  getServerIpChoices,
  normalizeGameNetworkConfig,
  validateGameNetworkPayload
} from './systemInfo.js';

let root: string;
let envPath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'system-info-'));
  envPath = path.join(root, '.env');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('systemInfo domain', () => {
  it('prefers IPv4 addresses read from the host network namespace', () => {
    const choices = getServerIpChoices({
      commandRunner: () => ({
        stdout:
          '2: eth0    inet 192.168.1.20/24 brd 192.168.1.255 scope global eth0\n' +
          '3: docker0 inet 172.18.0.1/16 brd 172.18.255.255 scope global docker0\n' +
          '4: wlan0   inet 10.10.10.5/24 brd 10.10.10.255 scope global wlan0\n',
        exitCode: 0
      }),
      interfaces: {
        eth0: [{ address: '172.30.0.2', family: 'IPv4', internal: false } as any]
      }
    });

    expect(choices).toEqual(['10.10.10.5', '192.168.1.20']);
  });

  it('builds host IPv4 choices and filters loopback, docker, and bridge interfaces', () => {
    const choices = getServerIpChoices({
      commandRunner: () => ({ stdout: '', exitCode: 1 }),
      interfaces: {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any],
        eth0: [{ address: '192.168.1.20', family: 'IPv4', internal: false } as any],
        wlan0: [{ address: '10.10.10.5', family: 'IPv4', internal: false } as any],
        docker0: [{ address: '172.18.0.1', family: 'IPv4', internal: false } as any],
        'br-123': [{ address: '172.19.0.1', family: 'IPv4', internal: false } as any],
        vethabc: [{ address: '169.254.10.2', family: 'IPv4', internal: false } as any]
      }
    });

    expect(choices).toEqual(['10.10.10.5', '192.168.1.20']);
  });

  it('replaces missing and legacy auto env values with safe defaults for the form', () => {
    expect(
      normalizeGameNetworkConfig({ JX_IP: 'auto', JX_MYSQL_IP: '', JX_PAYSYS_IP: '192.168.1.20' }, [
        '192.168.1.20'
      ])
    ).toEqual({
      jxIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      paysysIp: '192.168.1.20',
      mssqlIp: '127.0.0.1'
    });
  });

  it('requires JX IP to be a host choice and allows other valid IPv4 addresses', () => {
    expect(() =>
      validateGameNetworkPayload(
        { jxIp: 'auto', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '127.0.0.1' },
        ['192.168.1.20']
      )
    ).toThrow('IP không hợp lệ');

    expect(() =>
      validateGameNetworkPayload(
        { jxIp: '127.0.0.1', mysqlIp: '10.0.0.8', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' },
        ['192.168.1.20']
      )
    ).toThrow('IP không hợp lệ');

    expect(
      validateGameNetworkPayload(
        { jxIp: '192.168.1.20', mysqlIp: '10.0.0.8', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' },
        ['192.168.1.20']
      )
    ).toEqual({
      jxIp: '192.168.1.20',
      mysqlIp: '10.0.0.8',
      paysysIp: '172.18.0.1',
      mssqlIp: '8.8.8.8'
    });

    expect(() =>
      validateGameNetworkPayload(
        { jxIp: '192.168.1.20', mysqlIp: '999.1.1.1', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' },
        ['192.168.1.20']
      )
    ).toThrow('IP không hợp lệ');
  });

  it('builds header display data from env and running services', () => {
    writeFileSync(
      envPath,
      'JX_IP=192.168.1.20\nJX_MYSQL_IP=127.0.0.1\nJX_PAYSYS_IP=127.0.0.1\nJX_MSSQL_IP=192.168.1.20\n',
      'utf8'
    );

    const info = buildSystemInfo({
      envFilePath: envPath,
      ipChoices: ['192.168.1.20'],
      coreServices: [
        { name: 'jxserver', state: 'running' },
        { name: 'goddess', state: 'exited' }
      ],
      now: new Date('2026-06-11T08:00:00.000Z'),
      timezone: 'Asia/Ho_Chi_Minh'
    });

    expect(info).toMatchObject({
      timezone: 'Asia/Ho_Chi_Minh',
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      coreServicesRunning: true,
      runningCoreServices: ['jxserver']
    });
  });
});
