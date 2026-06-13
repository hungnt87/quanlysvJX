import { describe, expect, it } from 'vitest';
import { buildComposeArgs, buildDockerArgs } from './composeRunner.js';
import { assertServiceName, serviceNames } from './serviceAllowlist.js';

describe('service allowlist', () => {
  it('contains the compose services managed by this app', () => {
    expect(serviceNames).toEqual([
      'jxmysql',
      'jxmssql',
      'paysys',
      's3relayserver',
      'goddess',
      'bishop',
      's3relay',
      'jxserver'
    ]);
  });

  it('rejects service names outside the current compose file', () => {
    expect(() => assertServiceName('$(rm -rf /)')).toThrow('Unsupported service');
  });
});

describe('buildComposeArgs', () => {
  it('builds argument arrays without shell interpolation', () => {
    expect(buildComposeArgs(['ps', '--format', 'json'])).toEqual([
      'compose',
      '--env-file',
      '.env',
      '-f',
      'apps/jx-services/docker-compose.yaml',
      'ps',
      '--format',
      'json'
    ]);
  });

  it('uses plain progress output for build-backed start streams', () => {
    expect(buildComposeArgs(['up', '-d', '--build', 'paysys'])).toEqual([
      'compose',
      '--ansi',
      'never',
      '--progress',
      'plain',
      '--env-file',
      '.env',
      '-f',
      'apps/jx-services/docker-compose.yaml',
      'up',
      '-d',
      '--build',
      'paysys'
    ]);
  });

  it('uses plain progress output for explicit compose builds', () => {
    expect(buildComposeArgs(['build', 'paysys'])).toEqual([
      'compose',
      '--ansi',
      'never',
      '--progress',
      'plain',
      '--env-file',
      '.env',
      '-f',
      'apps/jx-services/docker-compose.yaml',
      'build',
      'paysys'
    ]);
  });
});

describe('buildDockerArgs', () => {
  it('passes docker subcommands without shell interpolation', () => {
    expect(buildDockerArgs(['image', 'inspect', 'paysys'])).toEqual(['image', 'inspect', 'paysys']);
  });
});
