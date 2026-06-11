import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readEnvFile(envFilePath: string) {
  if (!existsSync(envFilePath)) {
    return '';
  }
  return readFileSync(envFilePath, 'utf8');
}

export function readEnvMap(envFilePath: string) {
  const values: Record<string, string> = {};
  for (const line of readEnvFile(envFilePath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    values[key] = line.slice(separatorIndex + 1).trim();
  }
  return values;
}

export function writeEnvFile(envFilePath: string, content: string) {
  mkdirSync(path.dirname(envFilePath), { recursive: true });
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  const tempPath = `${envFilePath}.tmp`;
  writeFileSync(tempPath, normalized, 'utf8');
  renameSync(tempPath, envFilePath);
}

export function updateEnvKey(envFilePath: string, key: string, value: string) {
  updateEnvKeys(envFilePath, { [key]: value });
}

export function updateEnvKeys(envFilePath: string, updates: Record<string, string>) {
  const seen = new Set<string>();
  const lines = readEnvFile(envFilePath).split(/\r?\n/);
  const nextLines = lines
    .filter((line, index) => !(index === lines.length - 1 && line === ''))
    .flatMap((line) => {
      const key = getUpdatableKey(line);
      if (!key) {
        return line;
      }
      if (!(key in updates)) {
        return line;
      }
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return `${key}=${updates[key]}`;
    });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeEnvFile(envFilePath, nextLines.join('\n'));
}

function getUpdatableKey(line: string) {
  const separatorIndex = line.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }
  const rawKey = line.slice(0, separatorIndex).trim();
  if (rawKey.startsWith('#')) {
    return rawKey.replace(/^#\s*/, '').trim();
  }
  return rawKey;
}
