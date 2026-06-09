import { z } from 'zod';
import { assertServiceName, type ServiceName } from './serviceAllowlist.js';

const publisherSchema = z.object({ PublishedPort: z.union([z.string(), z.number()]).optional() }).passthrough();

const composeRowSchema = z
  .object({
    Service: z.string(),
    Name: z.string().optional(),
    State: z.string().optional(),
    Health: z.string().optional(),
    Image: z.string().optional(),
    Publishers: z.array(publisherSchema).optional(),
    CreatedAt: z.string().optional()
  })
  .passthrough();

export type ServiceStatus = {
  name: ServiceName;
  containerName: string;
  state: string;
  health: string;
  image: string;
  ports: string[];
  startedAt: string | null;
};

export function parseComposePsJson(stdout: string): ServiceStatus[] {
  const rows = z.array(composeRowSchema).parse(JSON.parse(stdout || '[]'));

  return rows.map((row) => ({
    name: assertServiceName(row.Service),
    containerName: row.Name ?? row.Service,
    state: row.State ?? 'unknown',
    health: row.Health ?? 'unknown',
    image: row.Image ?? '',
    ports: (row.Publishers ?? []).flatMap((publisher) =>
      publisher.PublishedPort === undefined ? [] : [String(publisher.PublishedPort)]
    ),
    startedAt: row.CreatedAt ?? null
  }));
}
