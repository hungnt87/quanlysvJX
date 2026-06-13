import sql from 'mssql';
import { ServiceUnavailableError } from '../utils/errors.js';
import type { MssqlConfig } from '../config.js';
import type { GameAccountView, ListGameAccountsQuery } from './accountSchemas.js';
import type { CreateGameAccountRecord, GameAccountRepository, UpdateGameAccountRecord } from './gameAccountService.js';

type Row = {
  accountName: string;
  expiresAt: Date | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  isBanned: boolean;
};

function toView(row: Row): GameAccountView {
  return {
    accountName: row.accountName,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : null,
    leftSeconds: row.leftSeconds,
    usedSeconds: row.usedSeconds,
    status: row.isBanned ? 'banned' : 'active'
  };
}

export function createMssqlGameAccountRepository(config: MssqlConfig): GameAccountRepository {
  let poolPromise: Promise<sql.ConnectionPool> | null = null;

  function connectPool(user: string, password: string) {
    const connectionPool = new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user,
      password,
      options: {
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate
      }
    });

    return connectionPool.connect().catch((error: unknown) => {
      poolPromise = null;
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      throw new ServiceUnavailableError(`MSSQL database is unavailable at ${config.host}:${config.port}${detail}`);
    });
  }

  async function pool() {
    if (!config.user || !config.password) {
      throw new ServiceUnavailableError('MSSQL account credentials are not configured');
    }

    poolPromise ??= connectPool(config.user, config.password);

    return poolPromise;
  }

  return {
    async list(query: ListGameAccountsQuery) {
      const offset = (query.page - 1) * query.pageSize;
      const request = (await pool()).request()
        .input('search', sql.VarChar(34), `%${query.search}%`)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, query.pageSize);

      const result = await request.query<Row & { totalRows: number }>(`
        SELECT
          ai.cAccName AS accountName,
          ah.dEndDate AS expiresAt,
          ah.iLeftSecond AS leftSeconds,
          ah.iUseSecond AS usedSeconds,
          ai.bIsBanned AS isBanned,
          COUNT(1) OVER() AS totalRows
        FROM dbo.Account_Info ai
        LEFT JOIN dbo.Account_Habitus ah ON ah.cAccName = ai.cAccName
        WHERE (@search = '%%' OR ai.cAccName LIKE @search)
        ORDER BY ai.cAccName
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);

      return {
        items: result.recordset.map(toView),
        total: result.recordset[0]?.totalRows ?? 0
      };
    },

    async existsInPrimaryOrSecondary(accountName: string) {
      const result = await (await pool()).request()
        .input('accountName', sql.VarChar(32), accountName)
        .query<{ countRows: number }>(`
          SELECT COUNT(1) AS countRows
          FROM (
            SELECT cAccName FROM dbo.Account_Info WHERE cAccName = @accountName
            UNION ALL
            SELECT cAccName FROM dbo.Account_Info2 WHERE cAccName = @accountName
          ) accounts
        `);
      return (result.recordset[0]?.countRows ?? 0) > 0;
    },

    async findByName(accountName: string) {
      const result = await (await pool()).request()
        .input('accountName', sql.VarChar(32), accountName)
        .query<Row>(`
          SELECT ai.cAccName AS accountName, ah.dEndDate AS expiresAt, ah.iLeftSecond AS leftSeconds,
                 ah.iUseSecond AS usedSeconds, ai.bIsBanned AS isBanned
          FROM dbo.Account_Info ai
          LEFT JOIN dbo.Account_Habitus ah ON ah.cAccName = ai.cAccName
          WHERE ai.cAccName = @accountName
        `);
      const row = result.recordset[0];
      return row ? toView(row) : null;
    },

    async create(record: CreateGameAccountRecord) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), record.accountName)
          .input('passwordHash', sql.VarChar(32), record.passwordHash)
          .input('secondaryPasswordHash', sql.VarChar(32), record.secondaryPasswordHash)
          .query(`
            INSERT INTO dbo.Account_Info
              (cAccName, cSecPassWord, cPassWord, nExtPoint, nExtPoint1, nExtPoint2, nExtPoint3, nExtPoint4, nExtPoint5, nExtPoint6, nExtPoint7,
               bParentalControl, bIsBanned, bIsUseOTP, iOTPSessionLifeTime, iServiceFlag)
            VALUES
              (@accountName, @secondaryPasswordHash, @passwordHash, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0)
          `);

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), record.accountName)
          .input('leftSeconds', sql.Int, record.leftSeconds)
          .input('expiresAt', sql.DateTime, record.expiresAt)
          .query(`
            INSERT INTO dbo.Account_Habitus (cAccName, iLeftSecond, dEndDate, iUseSecond)
            VALUES (@accountName, @leftSeconds, @expiresAt, 0)
          `);

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async update(accountName: string, record: UpdateGameAccountRecord) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        const passwordAssignments = [
          record.passwordHash ? 'cPassWord = @passwordHash' : null,
          record.secondaryPasswordHash ? 'cSecPassWord = @secondaryPasswordHash' : null
        ].filter(Boolean).join(', ');

        if (passwordAssignments) {
          const request = new sql.Request(transaction).input('accountName', sql.VarChar(32), accountName);
          if (record.passwordHash) request.input('passwordHash', sql.VarChar(32), record.passwordHash);
          if (record.secondaryPasswordHash) request.input('secondaryPasswordHash', sql.VarChar(32), record.secondaryPasswordHash);
          await request.query(`UPDATE dbo.Account_Info SET ${passwordAssignments} WHERE cAccName = @accountName`);
        }

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .input('leftSeconds', sql.Int, record.leftSeconds)
          .input('expiresAt', sql.DateTime, record.expiresAt)
          .query(`UPDATE dbo.Account_Habitus SET iLeftSecond = @leftSeconds, dEndDate = @expiresAt WHERE cAccName = @accountName`);

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async ban(accountName: string) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('UPDATE dbo.Account_Info SET bIsBanned = 1 WHERE cAccName = @accountName');

        const checkResult = await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query<{ countRows: number }>(`
            SELECT COUNT(1) AS countRows FROM dbo.Account_Ban WHERE cAccName = @accountName
          `);

        if ((checkResult.recordset[0]?.countRows ?? 0) === 0) {
          await new sql.Request(transaction)
            .input('accountName', sql.VarChar(32), accountName)
            .query(`
              INSERT INTO dbo.Account_Ban (cAccName, dStartDate, dEndDate, iEndTime, cReason, cOperator, bIsBannedForever)
              VALUES (@accountName, GETDATE(), '2050-10-10 10:10:10', 0, 'Banned from manager', 'manager', 1)
            `);
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async unban(accountName: string) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('UPDATE dbo.Account_Info SET bIsBanned = 0 WHERE cAccName = @accountName');

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('DELETE FROM dbo.Account_Ban WHERE cAccName = @accountName');

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async delete(accountName: string) {
      const transaction = new sql.Transaction(await pool());
      await transaction.begin();
      try {
        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('DELETE FROM dbo.Account_Ban WHERE cAccName = @accountName');

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('DELETE FROM dbo.Account_Habitus WHERE cAccName = @accountName');

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('DELETE FROM dbo.Account_Info WHERE cAccName = @accountName');

        await new sql.Request(transaction)
          .input('accountName', sql.VarChar(32), accountName)
          .query('DELETE FROM dbo.Account_Info2 WHERE cAccName = @accountName');

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }
  };
}
