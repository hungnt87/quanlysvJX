import { describe, expect, it } from 'vitest';
import { parseComposePsJson } from './serviceStatus.js';

describe('parseComposePsJson', () => {
  it('normalizes compose ps json rows', () => {
    const rows = JSON.stringify([
      {
        Service: 'jxmysql',
        Name: 'jxmysql',
        State: 'running',
        Health: 'healthy',
        Image: 'mysql:5.6',
        Publishers: [{ PublishedPort: 3306 }],
        CreatedAt: '2026-06-09T10:00:00Z'
      }
    ]);

    expect(parseComposePsJson(rows)).toEqual([
      {
        name: 'jxmysql',
        containerName: 'jxmysql',
        state: 'running',
        health: 'healthy',
        image: 'mysql:5.6',
        ports: ['3306'],
        startedAt: '2026-06-09T10:00:00Z'
      }
    ]);
  });
});
