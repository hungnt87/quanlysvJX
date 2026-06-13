import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { CommandError } from '../utils/errors.js';

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type ComposeStream = EventEmitter & {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: (signal?: NodeJS.Signals) => boolean;
};

export function buildComposeArgs(args: readonly string[]) {
  return ['compose', '--env-file', '.env', '-f', 'apps/jx-services/docker-compose.yaml', ...args];
}

export function buildDockerArgs(args: readonly string[]) {
  return [...args];
}

export async function runDockerCompose(
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return runCommand('docker', buildComposeArgs(args), cwd, options);
}

export async function runDocker(
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return runCommand('docker', buildDockerArgs(args), cwd, options);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    if (options?.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new CommandError(error.message));
    });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

export function runDockerComposeStream(args: readonly string[], cwd: string): ComposeStream {
  return spawn('docker', buildComposeArgs(args), { cwd, shell: false });
}

export function runDockerStream(args: readonly string[], cwd: string): ComposeStream {
  return spawn('docker', buildDockerArgs(args), { cwd, shell: false });
}
