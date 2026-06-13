import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ComposeConfigDocument, ComposeServiceDefinition } from './composeConfig.js';
import { resolveComposeServiceConfig } from './composeConfig.js';

type BuildStateIndex = {
  version: 1;
  services: Record<string, { signature: string; updatedAt: string }>;
};

export type ServiceBuildReadiness = {
  needsRebuild: boolean;
  buildReason: string | null;
  buildSignature: string | null;
};

const STATE_FILE = 'apps/jx-services/.image-build-state.json';

export function getServiceBuildReadiness(
  projectRoot: string,
  composeConfig: ComposeConfigDocument,
  serviceName: string,
  imageExists: boolean
): ServiceBuildReadiness {
  const signature = calculateServiceBuildSignature(projectRoot, composeConfig, serviceName);
  if (!signature) {
    return { needsRebuild: false, buildReason: null, buildSignature: null };
  }

  const state = readBuildState(projectRoot);
  const savedSignature = state.services[serviceName]?.signature ?? null;
  if (!imageExists) {
    return { needsRebuild: false, buildReason: null, buildSignature: signature };
  }

  if (!savedSignature) {
    return {
      needsRebuild: true,
      buildReason: 'Chưa có thông tin lần build gần nhất.',
      buildSignature: signature
    };
  }

  if (savedSignature !== signature) {
    return {
      needsRebuild: true,
      buildReason: 'Dockerfile hoặc entrypoint đã thay đổi sau lần build gần nhất.',
      buildSignature: signature
    };
  }

  return { needsRebuild: false, buildReason: null, buildSignature: signature };
}

export function markServiceImagePrepared(
  projectRoot: string,
  composeConfig: ComposeConfigDocument,
  serviceName: string
) {
  const signature = calculateServiceBuildSignature(projectRoot, composeConfig, serviceName);
  if (!signature) {
    return;
  }

  const state = readBuildState(projectRoot);
  writeBuildState(projectRoot, {
    version: 1,
    services: {
      ...state.services,
      [serviceName]: {
        signature,
        updatedAt: new Date().toISOString()
      }
    }
  });
}

export function calculateServiceBuildSignature(
  projectRoot: string,
  composeConfig: ComposeConfigDocument,
  serviceName: string
) {
  const serviceConfig = resolveComposeServiceConfig(composeConfig, serviceName);
  if (!serviceConfig.hasBuild) {
    return null;
  }

  const service = composeConfig.services?.[serviceName];
  if (!service) {
    return null;
  }

  const buildPaths = resolveBuildInputPaths(projectRoot, service);
  const hash = createHash('sha256');
  hash.update(serviceName);

  for (const filePath of buildPaths) {
    if (!existsSync(filePath)) {
      hash.update(`missing:${path.relative(projectRoot, filePath)}`);
      continue;
    }

    hash.update(path.relative(projectRoot, filePath));
    hash.update(readFileSync(filePath));
  }

  return hash.digest('hex');
}

function resolveBuildInputPaths(projectRoot: string, service: ComposeServiceDefinition) {
  const composeDir = path.join(projectRoot, 'apps/jx-services');
  const build = service.build;
  const context =
    typeof build === 'string'
      ? build
      : isBuildObject(build) && typeof build.context === 'string'
        ? build.context
        : '.';
  const dockerfile =
    isBuildObject(build) && typeof build.dockerfile === 'string' ? build.dockerfile : 'Dockerfile';
  const contextDir = path.resolve(composeDir, context);
  const dockerfilePath = path.resolve(contextDir, dockerfile);
  const dockerfilesDir = path.join(contextDir, 'dockerfiles');

  return [dockerfilePath, ...listShellFiles(dockerfilesDir)].sort();
}

function isBuildObject(value: unknown): value is { context?: unknown; dockerfile?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listShellFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sh'))
    .map((entry) => path.join(dir, entry.name));
}

function readBuildState(projectRoot: string): BuildStateIndex {
  const file = path.join(projectRoot, STATE_FILE);
  if (!existsSync(file)) {
    return { version: 1, services: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as BuildStateIndex;
    return parsed.version === 1 && parsed.services ? parsed : { version: 1, services: {} };
  } catch {
    return { version: 1, services: {} };
  }
}

function writeBuildState(projectRoot: string, state: BuildStateIndex) {
  const file = path.join(projectRoot, STATE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
