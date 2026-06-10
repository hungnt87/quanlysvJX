import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';

const selectVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  subPath: z.string().optional()
});

const cloneVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  url: z.string().url(),
  branch: z.string().trim().min(1).default('main')
});

function updateEnvKey(filePath: string, key: string, value: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${key}=${value}\n`, 'utf8');
    return;
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let found = false;
  const updatedLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`# ${key}=`) || trimmed.startsWith(`#${key}=`)) {
      if (!found) {
        updatedLines.push(`${key}=${value}`);
        found = true;
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
}

export async function registerVersionRoutes(app: FastifyInstance) {
  const versionsDir = path.join(app.deps.config.projectRoot, 'apps', 'jx-services', 'versions');
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');

  // Ensure versions directory exists
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true });
  }

  // Get active version from .env
  function getActiveVersionName(): string | null {
    if (!fs.existsSync(envFilePath)) return null;
    const lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.trim().startsWith('SERVER_PATH='));
    if (!line) return null;
    const value = line.split('=')[1]?.trim();
    if (!value) return null;
    // Extract version name from format: ./apps/jx-services/versions/<name>/server/
    const match = value.match(/\.\/apps\/jx-services\/versions\/([A-Za-z0-9_-]+)/);
    return match ? (match[1] ?? null) : null;
  }

  app.get('/api/versions', async () => {
    try {
      const activeVersion = getActiveVersionName();
      const files = fs.readdirSync(versionsDir, { withFileTypes: true });
      const versions = files
        .filter((file) => file.isDirectory())
        .map((dir) => {
          const fullPath = path.join(versionsDir, dir.name);
          const hasServerDir = fs.existsSync(path.join(fullPath, 'server'));
          return {
            name: dir.name,
            isActive: dir.name === activeVersion,
            path: `./apps/jx-services/versions/${dir.name}/${hasServerDir ? 'server/' : ''}`
          };
        });
      return ok({ activeVersion, versions });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot list versions');
    }
  });

  app.post('/api/versions/select', async (request) => {
    const { name, subPath } = selectVersionSchema.parse(request.body);
    const targetDir = path.join(versionsDir, name);
    if (!fs.existsSync(targetDir)) {
      throw app.httpErrors.notFound('Version folder not found');
    }

    if (subPath) {
      const resolvedSub = path.resolve(targetDir, subPath);
      if (!resolvedSub.startsWith(targetDir) || !fs.existsSync(resolvedSub)) {
        throw app.httpErrors.badRequest('Invalid subPath');
      }
    }

    const finalSubPath = subPath
      ? (subPath.endsWith('/') ? subPath : `${subPath}/`)
      : (fs.existsSync(path.join(targetDir, 'server')) ? 'server/' : '');

    const serverPathValue = `./apps/jx-services/versions/${name}/${finalSubPath}`;

    try {
      updateEnvKey(envFilePath, 'SERVER_PATH', serverPathValue);
      return ok({ activeVersion: name, serverPath: serverPathValue });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot update active version');
    }
  });

  app.post('/api/versions/clone', async (request) => {
    const { name, url, branch } = cloneVersionSchema.parse(request.body);
    const targetDir = path.join(versionsDir, name);

    if (fs.existsSync(targetDir)) {
      throw app.httpErrors.conflict('Version name already exists');
    }

    try {
      execSync(`git clone --depth 1 -b ${branch} ${url} ${targetDir}`, { stdio: 'ignore' });
      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return ok({
        name,
        isActive: false,
        path: `./versions/${name}/${hasServerDir ? 'server/' : ''}`
      });
    } catch (error) {
      // Clean up target directory if clone failed
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Git clone failed');
    }
  });

  app.post('/api/versions/upload', async (request) => {
    const part = await request.file();
    if (!part) {
      throw app.httpErrors.badRequest('File is required');
    }

    const filename = part.filename;
    const ext = path.extname(filename).toLowerCase();
    const isZip = ext === '.zip';
    const isTarGz = filename.endsWith('.tar.gz') || ext === '.tgz';

    if (!isZip && !isTarGz) {
      throw app.httpErrors.badRequest('Unsupported archive format. Only zip, tar.gz, and tgz are supported.');
    }

    // Determine version name from filename (strip extension)
    let name = filename.replace(/\.(zip|tar\.gz|tgz)$/i, '');
    name = name.replace(/[^A-Za-z0-9_-]/g, '_'); // sanitize name
    const targetDir = path.join(versionsDir, name);

    if (fs.existsSync(targetDir)) {
      throw app.httpErrors.conflict(`Version ${name} already exists`);
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // Write temp archive file
    const tempArchivePath = path.join(versionsDir, `temp_${filename}`);
    const writeStream = fs.createWriteStream(tempArchivePath);

    try {
      for await (const chunk of part.file) {
        writeStream.write(chunk);
      }
      writeStream.end();

      // Wait for write stream to finish
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Extract
      if (isZip) {
        execSync(`unzip -o ${tempArchivePath} -d ${targetDir}`, { stdio: 'ignore' });
      } else {
        execSync(`tar -xzf ${tempArchivePath} -C ${targetDir}`, { stdio: 'ignore' });
      }

      const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
      return ok({
        name,
        isActive: false,
        path: `./versions/${name}/${hasServerDir ? 'server/' : ''}`
      });
    } catch (error) {
      // Clean up target directory if failed
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      // Clean up temp archive file
      if (fs.existsSync(tempArchivePath)) {
        fs.rmSync(tempArchivePath, { force: true });
      }
    }
  });

  app.delete('/api/versions/:name', async (request) => {
    const { name } = request.params as { name: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw app.httpErrors.badRequest('Invalid version name');
    }

    const targetDir = path.join(versionsDir, name);
    if (!fs.existsSync(targetDir)) {
      throw app.httpErrors.notFound('Version not found');
    }

    const activeVersion = getActiveVersionName();
    if (name === activeVersion) {
      throw app.httpErrors.badRequest('Cannot delete active game version');
    }

    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return ok({ message: 'Version deleted successfully' });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot delete version');
    }
  });

  app.get('/api/versions/:name/browse', async (request) => {
    const { name } = request.params as { name: string };
    const query = request.query as { path?: string };
    const relativePath = query.path || '';

    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw app.httpErrors.badRequest('Invalid version name');
    }

    const versionRoot = path.join(versionsDir, name);
    if (!fs.existsSync(versionRoot)) {
      throw app.httpErrors.notFound('Version root not found');
    }

    const targetDir = path.resolve(versionRoot, relativePath);
    if (!targetDir.startsWith(versionRoot)) {
      throw app.httpErrors.badRequest('Invalid path');
    }

    try {
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const directories = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      const parentPath = relativePath ? path.dirname(relativePath) : null;
      const normalizedParent = parentPath === '.' ? '' : parentPath;

      return ok({
        currentPath: relativePath,
        parentPath: normalizedParent,
        directories
      });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot read directory');
    }
  });
}
