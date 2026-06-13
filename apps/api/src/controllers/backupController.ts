import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Multipart, MultipartValue } from '@fastify/multipart';
import type { BackupService } from '../services/backupService.js';
import { success } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';

export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  async getBackups(_request: FastifyRequest, reply: FastifyReply) {
    const list = this.backupService.listBackups();
    return reply.send(success(list));
  }

  async downloadBackup(
    request: FastifyRequest<{ Params: { kind: 'mysql' | 'mssql'; filename: string } }>,
    reply: FastifyReply
  ) {
    const { kind, filename } = request.params;
    const dir = (this.backupService as any).backupRepository.getBackupDirectory(kind);
    (this.backupService as any).backupRepository.assertBackupFile(dir, filename);
    const filePath = path.join(dir, filename);

    const fileStream = fs.createReadStream(filePath);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(fileStream);
  }

  async getJobs(_request: FastifyRequest, reply: FastifyReply) {
    const list = this.backupService.listJobs();
    return reply.send(success(list));
  }

  async backupMysql(_request: FastifyRequest, reply: FastifyReply) {
    const run = this.backupService.createManualBackup('mysql');
    return reply.send(success(run));
  }

  async backupMssql(_request: FastifyRequest, reply: FastifyReply) {
    const run = this.backupService.createManualBackup('mssql');
    return reply.send(success(run));
  }

  async backupAll(_request: FastifyRequest, reply: FastifyReply) {
    const result = this.backupService.createAllManualBackups();
    return reply.send(success(result));
  }

  async uploadBackup(
    request: FastifyRequest<{ Params: { kind: 'mysql' | 'mssql' } }>,
    reply: FastifyReply
  ) {
    const { kind } = request.params;
    const part = await request.file();
    if (!part) {
      throw new ValidationError('Backup file is required');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(Buffer.from(chunk));
    }

    const filename = this.normalizeUploadFilename(
      this.readMultipartTextField(part.fields.filename),
      part.filename
    );
    const note = this.normalizeOptionalNote(this.readMultipartTextField(part.fields.note));
    const data = Buffer.concat(chunks);

    const result = this.backupService.uploadBackup(kind, filename, note, data);
    return reply.send(success(result));
  }

  async updateBackup(
    request: FastifyRequest<{
      Params: { kind: 'mysql' | 'mssql'; filename: string };
      Body: { filename: string; note: string | null };
    }>,
    reply: FastifyReply
  ) {
    const { kind, filename } = request.params;
    const { filename: nextFilename, note } = request.body;
    const result = this.backupService.updateBackup(kind, filename, nextFilename, note);
    return reply.send(success(result));
  }

  async deleteBackup(
    request: FastifyRequest<{ Params: { kind: 'mysql' | 'mssql'; filename: string } }>,
    reply: FastifyReply
  ) {
    const { kind, filename } = request.params;
    const result = this.backupService.deleteBackup(kind, filename);
    return reply.send(success(result));
  }

  async restoreMysql(request: FastifyRequest<{ Body: { filename: string } }>, reply: FastifyReply) {
    const { filename } = request.body;
    const result = await this.backupService.restoreMysql(filename);
    return reply.send(success(result));
  }

  async restoreMssql(request: FastifyRequest<{ Body: { filename: string } }>, reply: FastifyReply) {
    const { filename } = request.body;
    const result = await this.backupService.restoreMssql(filename);
    return reply.send(success(result));
  }

  // Scheduled Backups endpoints
  async listScheduledJobs(_request: FastifyRequest, reply: FastifyReply) {
    const jobs = this.backupService.getScheduledJobs();
    return reply.send(success(jobs));
  }

  async createScheduledJob(request: FastifyRequest, reply: FastifyReply) {
    const job = this.backupService.createScheduledJob(request.body);
    return reply.send(success(job));
  }

  async updateScheduledJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = request.params;
    const job = this.backupService.updateScheduledJob(id, request.body);
    return reply.send(success(job));
  }

  async deleteScheduledJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = request.params;
    const job = this.backupService.deleteScheduledJob(id);
    return reply.send(success(job));
  }

  async runScheduledJobNow(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = request.params;
    const run = this.backupService.runScheduledJobNow(id);
    return reply.send(success(run));
  }

  async getScheduledJobRuns(
    request: FastifyRequest<{
      Querystring: { database?: string; status?: string; trigger?: string; jobId?: string };
    }>,
    reply: FastifyReply
  ) {
    const runs = this.backupService.listScheduledRuns(request.query);
    return reply.send(success(runs));
  }

  async retryScheduledRun(request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) {
    const { runId } = request.params;
    const run = this.backupService.retryScheduledRun(runId);
    return reply.send(success(run));
  }

  async getBackupSettings(request: FastifyRequest, reply: FastifyReply) {
    const config = request.server.deps.config;
    const settings = this.backupService.getBackupSettings(config);
    return reply.send(success(settings));
  }

  async saveBackupSettings(request: FastifyRequest, reply: FastifyReply) {
    this.backupService.saveBackupSettings(request.body);
    return reply.send(success(request.body));
  }

  // Helpers
  private readMultipartTextField(field: Multipart | Multipart[] | undefined) {
    const value = Array.isArray(field) ? field[0] : field;
    if (!value || value.type !== 'field') {
      return null;
    }
    const fieldValue = (value as MultipartValue).value;
    return typeof fieldValue === 'string' ? fieldValue.trim() : null;
  }

  private normalizeOptionalNote(value: string | null) {
    return value && value.length > 0 ? value : null;
  }

  private normalizeUploadFilename(value: string | null, fallback: string) {
    return value && value.length > 0 ? value : fallback;
  }
}
