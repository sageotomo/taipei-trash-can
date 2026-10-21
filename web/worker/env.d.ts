// Worker 用到的 Cloudflare 型別（只宣告用得到的部分，不另外裝 @cloudflare/workers-types）

interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<unknown>;
}

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}
