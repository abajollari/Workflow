import Database from 'better-sqlite3';
import type { IDbAdapter } from './IDbAdapter.js';

type SqliteDb = InstanceType<typeof Database>;

/** Wraps better-sqlite3 (synchronous) behind the async IDbAdapter interface.
 *  Replace this class with a real async adapter when migrating to Postgres/MySQL. */
export class SqliteAdapter implements IDbAdapter {
  constructor(private readonly db: SqliteDb) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.db.prepare(sql).get(...(params as any[])) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.db.prepare(sql).all(...(params as any[])) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number | bigint }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.db.prepare(sql).run(...(params as any[]));
  }
}
