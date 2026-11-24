import sql, { migrationRunner } from '@forge/sql';
import { SCHEMA_MIGRATIONS } from './schema';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface SqlExecutor {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<QueryResult<T>>;
  runMigrations(): Promise<string[]>;
}

class ForgeSqlExecutor implements SqlExecutor {
  private migrated = false;

  async query<T = Record<string, unknown>>(
    statement: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const prepared = sql.prepare<T>(statement);
    const bound = params.length > 0 ? prepared.bindParams(...params) : prepared;
    const res = await bound.execute();
    return { rows: (res.rows ?? []) as T[] };
  }

  async runMigrations(): Promise<string[]> {
    if (this.migrated) return [];
    let runner = migrationRunner;
    for (const step of SCHEMA_MIGRATIONS) {
      runner = runner.enqueue(step.name, step.query.trim());
    }
    const applied = await runner.run();
    this.migrated = true;
    return applied;
  }
}

let activeExecutor: SqlExecutor = new ForgeSqlExecutor();

export function getDb(): SqlExecutor {
  return activeExecutor;
}

export function setDbForTesting(executor: SqlExecutor): void {
  activeExecutor = executor;
}

export function resetDbToDefault(): void {
  activeExecutor = new ForgeSqlExecutor();
}
