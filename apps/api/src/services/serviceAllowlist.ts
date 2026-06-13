import { ValidationError } from '../utils/errors.js';

export const serviceNames = [
  'jxmysql',
  'jxmssql',
  'paysys',
  's3relayserver',
  'goddess',
  'bishop',
  's3relay',
  'jxserver'
] as const;

export type ServiceName = (typeof serviceNames)[number];

export function assertServiceName(value: string): ServiceName {
  if ((serviceNames as readonly string[]).includes(value)) {
    return value as ServiceName;
  }

  throw new ValidationError(`Unsupported service: ${value}`);
}

export function assertLogServiceName(value: string): ServiceName | 'all' {
  if (value === 'all' || (serviceNames as readonly string[]).includes(value)) {
    return value as ServiceName | 'all';
  }

  throw new ValidationError(`Unsupported service: ${value}`);
}
