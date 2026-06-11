import os, { type NetworkInterfaceInfo } from 'node:os';
import { z } from 'zod';
import { readEnvMap, updateEnvKeys } from '../env/envFile.js';

export const gameNetworkPayloadSchema = z.object({
  jxIp: z.string(),
  mysqlIp: z.string(),
  paysysIp: z.string(),
  mssqlIp: z.string()
});

export type GameNetworkConfig = z.infer<typeof gameNetworkPayloadSchema>;

export type CoreServiceState = {
  name: string;
  state: string;
};

export type SystemInfo = {
  serverTime: string;
  timezone: string;
  ipChoices: string[];
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
};

const coreServiceNames = new Set(['jxserver', 's3relay', 'bishop', 'goddess']);
const loopbackIp = '127.0.0.1';
const virtualInterfacePattern = /^(docker\d*|br-.+|veth.+|virbr\d*|lo)$/;
const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function getServerIpChoices(interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>) {
  const ips = new Set<string>();
  const detectedInterfaces = interfaces ?? safeNetworkInterfaces();
  for (const [name, entries] of Object.entries(detectedInterfaces)) {
    if (isVirtualInterface(name)) {
      continue;
    }
    for (const entry of entries ?? []) {
      if (isIpv4Interface(entry)) {
        ips.add(entry.address);
      }
    }
  }
  return [...ips].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function safeNetworkInterfaces() {
  try {
    return os.networkInterfaces();
  } catch {
    return {};
  }
}

export function normalizeGameNetworkConfig(
  env: Record<string, string | undefined>,
  ipChoices: string[]
): GameNetworkConfig {
  return {
    jxIp: normalizeHostIp(env.JX_IP, ipChoices),
    mysqlIp: normalizeIpv4(env.JX_MYSQL_IP),
    paysysIp: normalizeIpv4(env.JX_PAYSYS_IP),
    mssqlIp: normalizeIpv4(env.JX_MSSQL_IP)
  };
}

export function validateGameNetworkPayload(payload: unknown, ipChoices: string[]) {
  const parsed = gameNetworkPayloadSchema.parse(payload);
  if (!ipChoices.includes(parsed.jxIp)) {
    throw new Error('IP không hợp lệ. Vui lòng chọn IP thật của máy chủ.');
  }
  for (const value of [parsed.mysqlIp, parsed.paysysIp, parsed.mssqlIp]) {
    assertIpv4(value);
  }
  return parsed;
}

export function saveGameNetworkConfig(envFilePath: string, config: GameNetworkConfig) {
  updateEnvKeys(envFilePath, {
    JX_IP: config.jxIp,
    JX_MYSQL_IP: config.mysqlIp,
    JX_PAYSYS_IP: config.paysysIp,
    JX_MSSQL_IP: config.mssqlIp
  });
}

export function buildSystemInfo(options: {
  envFilePath: string;
  ipChoices?: string[];
  coreServices?: CoreServiceState[];
  now?: Date;
  timezone?: string;
}): SystemInfo {
  const ipChoices = options.ipChoices ?? getServerIpChoices();
  const env = readEnvMap(options.envFilePath);
  const gameNetwork = normalizeGameNetworkConfig(env, ipChoices);
  const runningCoreServices = (options.coreServices ?? [])
    .filter((service) => coreServiceNames.has(service.name) && ['running', 'starting'].includes(service.state))
    .map((service) => service.name);

  return {
    serverTime: (options.now ?? new Date()).toISOString(),
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipChoices,
    serverIp: gameNetwork.jxIp,
    mysqlIp: gameNetwork.mysqlIp,
    mssqlIp: gameNetwork.mssqlIp,
    gameNetwork,
    coreServicesRunning: runningCoreServices.length > 0,
    runningCoreServices
  };
}

function normalizeHostIp(value: string | undefined, ipChoices: string[]) {
  if (value && ipChoices.includes(value)) {
    return value;
  }
  return ipChoices[0] ?? '';
}

function normalizeIpv4(value: string | undefined) {
  if (value && isIpv4(value)) {
    return value;
  }
  return loopbackIp;
}

function assertIpv4(value: string) {
  if (!isIpv4(value)) {
    throw new Error('IP không hợp lệ. Vui lòng nhập đúng IPv4.');
  }
}

function isIpv4(value: string) {
  return ipv4Pattern.test(value);
}

function isVirtualInterface(name: string) {
  return virtualInterfacePattern.test(name);
}

function isIpv4Interface(entry: NetworkInterfaceInfo) {
  return entry.family === 'IPv4' && !entry.internal && isIpv4(entry.address);
}
