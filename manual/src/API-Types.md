# Types API

TypeScript type definitions exported by the library.

---

## `Database`

The main database interface returned by `createDatabase()`.

```typescript
interface Database {
  // Query methods
  run(sql: string | SqlTemplate, params?: ParamArray | ParamObject): RunResult
  get<T extends Record<string, unknown>>(sql: string | SqlTemplate, params?: ParamArray | ParamObject): T | undefined
  all<T extends Record<string, unknown>>(sql: string | SqlTemplate, params?: ParamArray | ParamObject): T[]
  exec(sql: string): void

  // Migrations
  migrate(migrations: Migration[]): Promise<number[]>
  rollback(targetVersion?: number, migrations?: Migration[]): Promise<number[]>
  getMigrationVersion(): number

  // Transactions
  transaction<T>(fn: () => T | Promise<T>): Promise<T>
  readonly inTransaction: boolean

  // Table helper
  table<T extends Record<string, unknown>>(tableName: string, options?: TableOptions): TableHelper<T>

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
  sql(strings: TemplateStringsArray, ...values: unknown[]): SqlTemplate

  // Prepared statements
  prepare<T>(sql: string): PreparedStatement<T>

  // Batch operations
  insertMany(tableName: string, rows: Record<string, unknown>[]): number[]
}
```

---

## `DatabaseOptions`

Configuration for `createDatabase()`.

```typescript
interface DatabaseOptions {
  data?: Uint8Array
  wasmPath?: string
  persist?: PersistConfig
  autoSave?: boolean
  autoSaveDebounce?: number
}
```

---

## `PersistConfig`

Persistence configuration.

```typescript
interface PersistConfig {
  key: string
  storage: 'indexeddb' | 'localstorage' | StorageAdapter
}
```

---

## `StorageAdapter`

Interface for custom storage backends.

```typescript
interface StorageAdapter {
  getItem(key: string): Promise<Uint8Array | null>
  setItem(key: string, value: Uint8Array): Promise<void>
  removeItem(key: string): Promise<void>
}
```

---

## `RunResult`

Result from mutation operations.

```typescript
interface RunResult {
  changes: number
  lastInsertRowId: number
}
```

---

## `ParamArray`

Positional query parameters.

```typescript
type ParamArray = unknown[]
```

---

## `ParamObject`

Named query parameters.

```typescript
type ParamObject = Record<string, unknown>
```

---

## `Migration`

Schema migration definition.

```typescript
interface Migration {
  version: number
  up: string
  down?: string
}
```

---

## `TableOptions`

Configuration for table helpers.

```typescript
interface TableOptions {
  primaryKey?: string
}
```

---

## `TableHelper<T>`

High-level CRUD interface.

```typescript
interface TableHelper<T extends Record<string, unknown>> {
  insert(data: Partial<T>): number
  find(id: unknown, options?: { key?: string }): T | undefined
  where(conditions: Partial<T>): T[]
  update(id: unknown, data: Partial<T>, options?: { key?: string }): number
  delete(id: unknown, options?: { key?: string }): number
  count(conditions?: Partial<T>): number
  all(): T[]
}
```

---

## `ColumnInfo`

Column metadata from schema introspection.

```typescript
interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: unknown
  primaryKey: boolean
}
```

---

## `IndexInfo`

Index metadata from schema introspection.

```typescript
interface IndexInfo {
  name: string
  table: string
  unique: boolean
  columns: string[]
}
```

---

## `SqlTemplate`

Result of the `db.sql` tagged template.

```typescript
interface SqlTemplate {
  sql: string
  params: unknown[]
}
```

---

## `PreparedStatement<T>`

Reusable compiled query.

```typescript
interface PreparedStatement<T> {
  run(params?: ParamArray | ParamObject): RunResult
  get(params?: ParamArray | ParamObject): T | undefined
  all(params?: ParamArray | ParamObject): T[]
  finalize(): void
}
```

---

## Importing Types

All types are exported from the main module:

```typescript
import type {
  Database,
  DatabaseOptions,
  PersistConfig,
  StorageAdapter,
  RunResult,
  ParamArray,
  ParamObject,
  Migration,
  TableOptions,
  TableHelper,
  ColumnInfo,
  IndexInfo,
  SqlTemplate,
  PreparedStatement,
} from '@motioneffector/sql'
```
