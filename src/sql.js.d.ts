/**
 * Type declarations for sql.js
 */

declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): void
    exec(sql: string): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  export interface Statement {
    bind(params?: any[]): boolean
    step(): boolean
    get(): any[]
    getAsObject(): any
    getColumnNames(): string[]
    reset(): void
    free(): void
  }

  export interface QueryExecResult {
    columns: string[]
    values: any[][]
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => Database
  }

  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>
}
