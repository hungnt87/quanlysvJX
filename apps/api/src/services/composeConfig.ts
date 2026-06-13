export type ComposeServiceConfig = {
  serviceName: string;
  imageName: string;
  hasBuild: boolean;
  hasHealthcheck: boolean;
  readinessTimeoutMs: number;
};

export type ComposeConfigDocument = {
  services?: Record<string, ComposeServiceDefinition>;
};

export type ComposeServiceDefinition = {
  image?: unknown;
  build?: unknown;
  healthcheck?: {
    interval?: unknown;
    timeout?: unknown;
    retries?: unknown;
    start_period?: unknown;
    start_interval?: unknown;
  } | null;
};

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 30;
const DEFAULT_START_PERIOD_MS = 0;
const HEALTH_BUFFER_MS = 15_000;
const NO_HEALTHCHECK_TIMEOUT_MS = 60_000;

export function resolveComposeServiceConfig(
  document: ComposeConfigDocument,
  serviceName: string
): ComposeServiceConfig {
  const service = document.services?.[serviceName];
  if (!service) {
    throw new Error(`Compose service not found: ${serviceName}`);
  }

  const imageName =
    typeof service.image === 'string' && service.image.trim() ? service.image : serviceName;
  const hasBuild = service.build !== undefined && service.build !== null;
  const hasHealthcheck = service.healthcheck !== undefined && service.healthcheck !== null;

  return {
    serviceName,
    imageName,
    hasBuild,
    hasHealthcheck,
    readinessTimeoutMs: hasHealthcheck
      ? calculateHealthcheckTimeoutMs(service.healthcheck)
      : NO_HEALTHCHECK_TIMEOUT_MS
  };
}

function calculateHealthcheckTimeoutMs(healthcheck: ComposeServiceDefinition['healthcheck']) {
  const intervalMs = parseComposeDurationMs(healthcheck?.interval, DEFAULT_INTERVAL_MS);
  const timeoutMs = parseComposeDurationMs(healthcheck?.timeout, DEFAULT_TIMEOUT_MS);
  const startPeriodMs = parseComposeDurationMs(healthcheck?.start_period, DEFAULT_START_PERIOD_MS);
  const retries = typeof healthcheck?.retries === 'number' ? healthcheck.retries : DEFAULT_RETRIES;
  return startPeriodMs + (intervalMs + timeoutMs) * retries + HEALTH_BUFFER_MS;
}

export function parseComposeDurationMs(value: unknown, fallbackMs: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value / 1_000_000));
  }

  if (typeof value !== 'string') {
    return fallbackMs;
  }

  const input = value.trim();
  if (!input) {
    return fallbackMs;
  }

  const pattern = /(\d+(?:\.\d+)?)(ns|us|ms|s|m|h)/g;
  let totalMs = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || unit === undefined) {
      return fallbackMs;
    }
    totalMs += amount * unitToMs(unit);
  }

  return matched ? Math.round(totalMs) : fallbackMs;
}

function unitToMs(unit: string) {
  switch (unit) {
    case 'ns':
      return 0.000001;
    case 'us':
      return 0.001;
    case 'ms':
      return 1;
    case 's':
      return 1_000;
    case 'm':
      return 60_000;
    case 'h':
      return 3_600_000;
    default:
      return 0;
  }
}
