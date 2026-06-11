import { describe, expect, it } from 'vitest';
import { parseComposeDurationMs, resolveComposeServiceConfig } from './composeConfig.js';

const config = {
  services: {
    jxmysql: {
      image: 'mysql:5.6',
      healthcheck: {
        test: ['CMD-SHELL', 'mysqladmin ping'],
        interval: '10s',
        timeout: '5s',
        retries: 30,
        start_period: '30s'
      }
    },
    paysys: {
      image: 'paysys',
      build: { context: '.', dockerfile: './dockerfiles/Dockerfile.paysys' },
      healthcheck: {
        test: ['CMD-SHELL', 'bash -ec'],
        interval: '5s',
        timeout: '3s',
        retries: 30,
        start_period: '5s'
      }
    },
    s3relayserver: {
      image: 'paysys',
      healthcheck: {
        test: ['CMD-SHELL', 'bash -ec'],
        interval: 5_000_000_000,
        timeout: 3_000_000_000,
        retries: 30,
        start_period: 5_000_000_000
      }
    },
    nohealth: {
      image: 'busybox:latest'
    }
  }
};

describe('parseComposeDurationMs', () => {
  it('parses compose duration strings and numeric nanoseconds', () => {
    expect(parseComposeDurationMs('1m30s', 0)).toBe(90_000);
    expect(parseComposeDurationMs('500ms', 0)).toBe(500);
    expect(parseComposeDurationMs(5_000_000_000, 0)).toBe(5_000);
    expect(parseComposeDurationMs('bad-value', 12_000)).toBe(12_000);
  });
});

describe('resolveComposeServiceConfig', () => {
  it('resolves external image services', () => {
    expect(resolveComposeServiceConfig(config, 'jxmysql')).toMatchObject({
      serviceName: 'jxmysql',
      imageName: 'mysql:5.6',
      hasBuild: false,
      hasHealthcheck: true,
      readinessTimeoutMs: 495_000
    });
  });

  it('resolves build-backed services', () => {
    expect(resolveComposeServiceConfig(config, 'paysys')).toMatchObject({
      serviceName: 'paysys',
      imageName: 'paysys',
      hasBuild: true,
      hasHealthcheck: true,
      readinessTimeoutMs: 260_000
    });
  });

  it('uses the declared image for services that reuse another service image', () => {
    expect(resolveComposeServiceConfig(config, 's3relayserver')).toMatchObject({
      serviceName: 's3relayserver',
      imageName: 'paysys',
      hasBuild: false,
      hasHealthcheck: true,
      readinessTimeoutMs: 260_000
    });
  });

  it('uses a 60 second readiness timeout when no healthcheck exists', () => {
    expect(resolveComposeServiceConfig(config, 'nohealth')).toMatchObject({
      serviceName: 'nohealth',
      imageName: 'busybox:latest',
      hasBuild: false,
      hasHealthcheck: false,
      readinessTimeoutMs: 60_000
    });
  });
});
