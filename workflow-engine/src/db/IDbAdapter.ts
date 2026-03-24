/** Minimal async database interface used by WorkflowEngine.
 *  Swap the implementation (SqliteAdapter → PostgresAdapter, etc.)
 *  without touching engine logic. */
export interface IDbAdapter {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number | bigint }>;
}
