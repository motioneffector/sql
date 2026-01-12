/**
 * Public type definitions for @motioneffector/sql
 */

/**
 * Database instance returned by createDatabase()
 */
export interface Database {
  // Query methods
  run(sql: string, params?: ParamArray | ParamObject): RunResult
  get<T = any>(sql: string, params?: ParamArray | ParamObject): T | undefined
  all<T = any>(sql: string, params?: ParamArray | ParamObject): T[]
  exec(sql: string): void

  // Migrations
  migrate(migrations: Migration[]): Promise<number[]>
  rollback(targetVersion?: number, migrations?: Migration[]): Promise<number[]>
  getMigrationVersion(): number

  // Transactions
  transaction<T>(fn: () => T | Promise<T>): Promise<T>
  readonly inTransaction: boolean

  // Table helper
  table<T = any>(tableName: string, options?: TableOptions): TableHelper<T>

  // Export/Import
  export(): Uint8Array
  import(data: Uint8Array | ArrayBuffer): void

  // Persistence
  save(): Promise<void>
  load(): Promise<void>

  // Database info
  getTables(): string[]
  getTableInfo(tableName: string): ColumnInfo[]
  getIndexes(tableName?: string): IndexInfo[]

  // Management
  close(): void
  clone(): Promise<Database>
  clear(): void
  destroy(): Promise<void>

  // Query building
  sql(strings: TemplateStringsArray, ...values: any[]): SqlTemplate

  // Prepared statements
  prepare<T = any>(sql: string): PreparedStatement<T>

  // Batch operations
  insertMany(tableName: string, rows: Record<string, any>[]): number[]
}

/**
 * Options for createDatabase()
 */
export interface DatabaseOptions {
  /**
   * Existing database data as Uint8Array
   */
  data?: Uint8Array

  /**
   * Path to SQL.js WASM file
   * @default CDN path
   */
  wasmPath?: string

  /**
   * Persistence configuration
   */
  persist?: PersistConfig

  /**
   * Enable automatic saves after mutations
   * @default true when persist is set
   */
  autoSave?: boolean

  /**
   * Debounce delay for auto-save in milliseconds
   * @default 1000
   */
  autoSaveDebounce?: number
}

/**
 * Persistence configuration
 */
export interface PersistConfig {
  /**
   * Storage key for saving/loading
   */
  key: string

  /**
   * Storage backend
   */
  storage: 'indexeddb' | 'localstorage' | StorageAdapter
}

/**
 * Custom storage adapter interface
 */
export interface StorageAdapter {
  getItem(key: string): Promise<Uint8Array | null>
  setItem(key: string, value: Uint8Array): Promise<void>
  removeItem(key: string): Promise<void>
}

/**
 * Result of run() operation
 */
export interface RunResult {
  /**
   * Number of rows affected
   */
  changes: number

  /**
   * Last inserted row ID (for INSERT operations)
   */
  lastInsertRowId: number
}

/**
 * Positional parameters (array)
 */
export type ParamArray = any[]

/**
 * Named parameters (object with : $ or @ prefixed keys)
 */
export type ParamObject = Record<string, any>

/**
 * Migration definition
 */
export interface Migration {
  /**
   * Migration version number (must be >= 1)
   */
  version: number

  /**
   * SQL to apply migration
   */
  up: string

  /**
   * SQL to reverse migration (optional)
   */
  down?: string
}

/**
 * Options for table() helper
 */
export interface TableOptions {
  /**
   * Primary key column name
   * @default 'id'
   */
  primaryKey?: string
}

/**
 * Table helper for CRUD operations
 */
export interface TableHelper<T> {
  insert(data: Partial<T>): number
  find(id: any, options?: { key?: string }): T | undefined
  where(conditions: Partial<T>): T[]
  update(id: any, data: Partial<T>, options?: { key?: string }): number
  delete(id: any, options?: { key?: string }): number
  count(conditions?: Partial<T>): number
  all(): T[]
}

/**
 * Column information
 */
export interface ColumnInfo {
  /**
   * Column name
   */
  name: string

  /**
   * Declared type (e.g., 'INTEGER', 'TEXT', 'BLOB')
   */
  type: string

  /**
   * Whether NULL values are allowed
   */
  nullable: boolean

  /**
   * Default value or null
   */
  defaultValue: any

  /**
   * Whether this is a primary key column
   */
  primaryKey: boolean
}

/**
 * Index information
 */
export interface IndexInfo {
  /**
   * Index name
   */
  name: string

  /**
   * Table the index is on
   */
  table: string

  /**
   * Whether this is a UNIQUE index
   */
  unique: boolean

  /**
   * Column names in the index
   */
  columns: string[]
}

/**
 * SQL template result from db.sql tagged template
 */
export interface SqlTemplate {
  /**
   * SQL string with ? placeholders
   */
  sql: string

  /**
   * Parameters to bind
   */
  params: any[]
}

/**
 * Prepared statement interface
 */
export interface PreparedStatement<T = any> {
  run(params?: ParamArray | ParamObject): RunResult
  get(params?: ParamArray | ParamObject): T | undefined
  all(params?: ParamArray | ParamObject): T[]
  finalize(): void
}
