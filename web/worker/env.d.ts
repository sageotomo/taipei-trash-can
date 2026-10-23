// Worker 用到的 Cloudflare 型別（只宣告用得到的部分，不另外裝 @cloudflare/workers-types）

declare module "cloudflare:workers" {
  interface SqlCursor<T> {
    toArray(): T[];
    one(): T;
  }
  interface SqlStorage {
    exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T>;
  }
  export interface DurableObjectState {
    storage: { sql: SqlStorage };
  }
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface DurableObjectNamespace<T> {
  getByName(name: string): T;
}
