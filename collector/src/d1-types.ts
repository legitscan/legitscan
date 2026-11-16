// The smallest slice of Cloudflare D1's API the collector uses. D1 (Worker binding or REST) and node:sqlite both fit it.
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta: { changes: number; size_after?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
}
