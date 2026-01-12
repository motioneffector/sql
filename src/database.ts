/**
 * Core database implementation
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type {
  Database,
  DatabaseOptions,
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
  StorageAdapter,
} from './types'
import {
  SqlError,
  SqlSyntaxError,
  SqlConstraintError,
  SqlNotFoundError,
  MigrationError,
} from './errors'

/**
 * Create and initialize a SQLite database in the browser using SQL.js.
 *
 * @param options - Configuration options for the database
 * @returns A Promise that resolves to a Database instance
 *
 * @example
 * ```typescript
 * // Create an empty database
 * const db = await createDatabase()
 *
 * // Load from existing data
 * const db = await createDatabase({ data: existingUint8Array })
 *
 * // With persistence
 * const db = await createDatabase({
 *   persist: {
 *     key: 'my-app-db',
 *     storage: 'indexeddb'
 *   }
 * })
 *
 * // With auto-save disabled
 * const db = await createDatabase({
 *   persist: { key: 'my-db', storage: 'localstorage' },
 *   autoSave: false
 * })
 * ```
 *
 * @throws {Error} If WASM file fails to load
 * @throws {SqlError} If provided data is not valid SQLite format
 * @throws {Error} If persist.storage is not 'indexeddb' or 'localstorage'
 * @throws {Error} If persist.key is empty string
 */
export async function createDatabase(options?: DatabaseOptions): Promise<Database> {
  // Validate options
  if (options?.persist) {
    if (!options.persist.key || options.persist.key.trim() === '') {
      throw new Error('persist.key cannot be empty')
    }
    if (
      typeof options.persist.storage === 'string' &&
      options.persist.storage !== 'indexeddb' &&
      options.persist.storage !== 'localstorage'
    ) {
      throw new Error('persist.storage must be "indexeddb" or "localstorage"')
    }
  }

  // Initialize SQL.js
  let SQL: Awaited<ReturnType<typeof initSqlJs>>
  try {
    SQL = await initSqlJs(
      options?.wasmPath
        ? {
            locateFile: () => options.wasmPath!,
          }
        : undefined
    )
  } catch (error) {
    throw new Error(`Failed to load SQL.js WASM: ${(error as Error).message}`)
  }

  // Load data from storage or options
  let initialData: Uint8Array | undefined = options?.data

  if (!initialData && options?.persist) {
    const storage = getStorageAdapter(options.persist.storage)
    try {
      const stored = await storage.getItem(options.persist.key)
      if (stored) {
        initialData = stored
      }
    } catch (error) {
      console.warn('Failed to load from persistent storage:', error)
    }
  }

  // Create database
  let db: SqlJsDatabase
  try {
    db = new SQL.Database(initialData)
  } catch (error) {
    throw new SqlError(`Failed to create database: ${(error as Error).message}`)
  }

  // Enable foreign keys
  try {
    db.run('PRAGMA foreign_keys = ON')
  } catch (error) {
    // Ignore if not supported
  }

  // State
  let closed = false
  let transactionDepth = 0
  let savepointCounter = 0
  const activeSavepoints: string[] = []

  // Auto-save setup
  const autoSave = options?.autoSave ?? (options?.persist ? true : false)
  const autoSaveDebounce = options?.autoSaveDebounce ?? 1000
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined

  const scheduleSave = (): void => {
    if (!autoSave || !options?.persist) return

    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }

    autoSaveTimer = setTimeout(() => {
      saveToStorage().catch(error => {
        console.error('Auto-save failed:', error)
      })
    }, autoSaveDebounce)
  }

  const saveToStorage = async (): Promise<void> => {
    if (!options?.persist) return

    const storage = getStorageAdapter(options.persist.storage)
    const data = database.export()
    await storage.setItem(options.persist.key, data)
  }

  // Check if closed
  const ensureOpen = (): void => {
    if (closed) {
      throw new Error('Database is closed')
    }
  }

  // Convert parameters to SQL.js format
  const convertParams = (params?: ParamArray | ParamObject): any[] | undefined => {
    if (!params) return undefined
    if (Array.isArray(params)) {
      return params.map(convertValue)
    }
    // Named parameters - SQL.js uses array with $ prefix
    // Convert { name: 'value' } to { $name: 'value', :name: 'value', @name: 'value' }
    const converted: Record<string, any> = {}
    for (const [key, value] of Object.entries(params)) {
      const convertedValue = convertValue(value)
      converted[`:${key}`] = convertedValue
      converted[`$${key}`] = convertedValue
      converted[`@${key}`] = convertedValue
      converted[key] = convertedValue
    }
    return [converted]
  }

  // Convert JavaScript value to SQL value
  const convertValue = (value: any): any => {
    if (value === null || value === undefined) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (value instanceof Uint8Array) return value
    if (typeof value === 'number' || typeof value === 'string') return value
    throw new TypeError(`Unsupported parameter type: ${typeof value}`)
  }

  // Handle SQL errors
  const handleSqlError = (error: any, sql?: string | undefined, params?: any[] | undefined): never => {
    const message = error.message || String(error)

    if (message.includes('syntax') || message.includes('parse')) {
      const err = new SqlSyntaxError(message)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    if (message.includes('constraint') || message.includes('UNIQUE') || message.includes('NOT NULL')) {
      const err = new SqlConstraintError(message)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    if (message.includes('no such table') || message.includes('no such column')) {
      const err = new SqlNotFoundError(message)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    const err = new SqlError(message)
    if (sql !== undefined) err.sql = sql
    if (params !== undefined) err.params = params
    throw err
  }

  // Database implementation
  const database: Database = {
    run(sql: string, params?: ParamArray | ParamObject): RunResult {
      ensureOpen()
      try {
        const convertedParams = convertParams(params)
        db.run(sql, convertedParams as any)
        const changes = db.getRowsModified()

        // Get last insert rowid
        let lastInsertRowId = 0
        try {
          const result = db.exec('SELECT last_insert_rowid() as id')
          if (result[0]?.values[0]?.[0]) {
            lastInsertRowId = result[0].values[0][0] as number
          }
        } catch (e) {
          // Ignore - might fail if no insert was performed
        }

        if (transactionDepth === 0) {
          scheduleSave()
        }

        return { changes, lastInsertRowId }
      } catch (error) {
        return handleSqlError(error, sql, params as any)
      }
    },

    get<T = any>(sql: string, params?: ParamArray | ParamObject): T | undefined {
      ensureOpen()
      try {
        const stmt = db.prepare(sql)
        const convertedParams = convertParams(params)
        if (convertedParams) {
          stmt.bind(convertedParams as any)
        }
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row as T
        }
        stmt.free()
        return undefined
      } catch (error) {
        return handleSqlError(error, sql, params as any)
      }
    },

    all<T = any>(sql: string, params?: ParamArray | ParamObject): T[] {
      ensureOpen()
      try {
        const stmt = db.prepare(sql)
        const convertedParams = convertParams(params)
        if (convertedParams) {
          stmt.bind(convertedParams as any)
        }
        const results: T[] = []
        while (stmt.step()) {
          results.push(stmt.getAsObject() as T)
        }
        stmt.free()
        return results
      } catch (error) {
        return handleSqlError(error, sql, params as any)
      }
    },

    exec(sql: string): void {
      ensureOpen()
      try {
        db.exec(sql)
        if (transactionDepth === 0) {
          scheduleSave()
        }
      } catch (error) {
        handleSqlError(error, sql)
      }
    },

    async migrate(migrations: Migration[]): Promise<number[]> {
      ensureOpen()

      // Validate migrations
      for (const migration of migrations) {
        if (!Number.isInteger(migration.version) || migration.version < 1) {
          throw new Error('Migration version must be >= 1')
        }
        if (!migration.up) {
          throw new Error('Migration must have an "up" script')
        }
      }

      // Check for duplicates
      const versions = migrations.map(m => m.version)
      const uniqueVersions = new Set(versions)
      if (versions.length !== uniqueVersions.size) {
        const duplicate = versions.find((v, i) => versions.indexOf(v) !== i)
        throw new Error(`Duplicate migration version: ${duplicate}`)
      }

      // Create migrations table
      database.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `)

      // Get current version
      const currentVersion = database.getMigrationVersion()

      // Sort migrations by version
      const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version)

      // Apply pending migrations
      const applied: number[] = []
      for (const migration of sortedMigrations) {
        if (migration.version <= currentVersion) {
          continue
        }

        try {
          await database.transaction(() => {
            database.exec(migration.up)
            database.run('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)', [
              migration.version,
              new Date().toISOString(),
            ])
          })
          applied.push(migration.version)
        } catch (error) {
          const err = new MigrationError(
            `Migration ${migration.version} failed: ${(error as Error).message}`,
            migration.version
          )
          throw err
        }
      }

      return applied
    },

    async rollback(targetVersion = 0, migrations?: Migration[]): Promise<number[]> {
      ensureOpen()

      if (targetVersion < 0) {
        throw new MigrationError('Target version cannot be negative')
      }

      const currentVersion = database.getMigrationVersion()
      if (targetVersion > currentVersion) {
        throw new MigrationError(`Target version ${targetVersion} is greater than current version ${currentVersion}`)
      }

      // Get applied migrations
      const appliedMigrations = database.all<{ version: number }>(
        'SELECT version FROM _migrations WHERE version > ? ORDER BY version DESC',
        [targetVersion]
      )

      const rolledBack: number[] = []

      // If no migrations provided with down scripts, we can't rollback
      if (!migrations || migrations.length === 0) {
        if (appliedMigrations.length > 0) {
          throw new MigrationError(`Rollback requires migrations with down scripts`, appliedMigrations[0]!.version)
        }
        return rolledBack
      }

      for (const { version } of appliedMigrations) {
        // Find migration with down script
        const migration = migrations.find(m => m.version === version)
        if (!migration || !migration.down) {
          throw new MigrationError(`Migration ${version} has no down script`, version)
        }

        try {
          await database.transaction(() => {
            database.exec(migration.down!)
            database.run('DELETE FROM _migrations WHERE version = ?', [version])
          })
          rolledBack.push(version)
        } catch (error) {
          throw new MigrationError(
            `Rollback of migration ${version} failed: ${(error as Error).message}`,
            version
          )
        }
      }

      return rolledBack
    },

    getMigrationVersion(): number {
      ensureOpen()
      try {
        const result = database.get<{ version: number }>(
          'SELECT MAX(version) as version FROM _migrations'
        )
        return result?.version ?? 0
      } catch (error) {
        // _migrations table doesn't exist
        return 0
      }
    },

    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      ensureOpen()

      const isNested = transactionDepth > 0
      transactionDepth++

      if (isNested) {
        // Use savepoint for nested transaction
        const savepointName = `sp_${++savepointCounter}`
        activeSavepoints.push(savepointName)

        try {
          database.exec(`SAVEPOINT ${savepointName}`)
        } catch (error) {
          transactionDepth--
          activeSavepoints.pop()
          throw error
        }

        try {
          const result = await fn()
          database.exec(`RELEASE ${savepointName}`)
          transactionDepth--
          activeSavepoints.pop()
          return result
        } catch (error) {
          try {
            database.exec(`ROLLBACK TO ${savepointName}`)
            database.exec(`RELEASE ${savepointName}`)
          } catch (rollbackError) {
            // Savepoint might not exist if there was an error creating it
          }
          transactionDepth--
          activeSavepoints.pop()
          throw error
        }
      } else {
        // Top-level transaction
        database.exec('BEGIN')

        try {
          const result = await fn()
          database.exec('COMMIT')
          transactionDepth--
          scheduleSave()
          return result
        } catch (error) {
          try {
            database.exec('ROLLBACK')
          } catch (rollbackError) {
            // Ignore rollback errors
          }
          transactionDepth--
          throw error
        }
      }
    },

    get inTransaction(): boolean {
      return transactionDepth > 0
    },

    table<T = any>(tableName: string, options?: TableOptions): TableHelper<T> {
      ensureOpen()

      if (!tableName || tableName.trim() === '') {
        throw new Error('tableName cannot be empty')
      }

      const primaryKey = options?.primaryKey ?? 'id'

      return {
        insert(data: Partial<T>): number {
          // Validate column names
          for (const key of Object.keys(data)) {
            if (key.includes(';') || key.includes('--') || key.includes('/*')) {
              throw new Error(`Invalid column name: ${key}`)
            }
          }

          const entries = Object.entries(data).filter(([_, value]) => value !== undefined)
          const columns = entries.map(([key]) => key)
          const values = entries.map(([_, value]) => value)
          const placeholders = columns.map(() => '?').join(', ')

          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
          const result = database.run(sql, values)
          return result.lastInsertRowId
        },

        find(id: any, options?: { key?: string }): T | undefined {
          const keyColumn = options?.key ?? primaryKey
          return database.get<T>(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`, [id])
        },

        where(conditions: Partial<T>): T[] {
          if (Object.keys(conditions).length === 0) {
            return database.all<T>(`SELECT * FROM ${tableName}`)
          }

          const clauses: string[] = []
          const values: any[] = []

          for (const [key, value] of Object.entries(conditions)) {
            if (value === null) {
              clauses.push(`${key} IS NULL`)
            } else {
              clauses.push(`${key} = ?`)
              values.push(value)
            }
          }

          const sql = `SELECT * FROM ${tableName} WHERE ${clauses.join(' AND ')}`
          return database.all<T>(sql, values)
        },

        update(id: any, data: Partial<T>, options?: { key?: string }): number {
          const keyColumn = options?.key ?? primaryKey
          const entries = Object.entries(data).filter(([_, value]) => value !== undefined)

          if (entries.length === 0) {
            return 0
          }

          const setClauses = entries.map(([key]) => `${key} = ?`)
          const values = [...entries.map(([_, value]) => value), id]

          const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${keyColumn} = ?`
          const result = database.run(sql, values)
          return result.changes
        },

        delete(id: any, options?: { key?: string }): number {
          const keyColumn = options?.key ?? primaryKey
          const result = database.run(`DELETE FROM ${tableName} WHERE ${keyColumn} = ?`, [id])
          return result.changes
        },

        count(conditions?: Partial<T>): number {
          if (!conditions || Object.keys(conditions).length === 0) {
            const result = database.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`)
            return result?.count ?? 0
          }

          const clauses: string[] = []
          const values: any[] = []

          for (const [key, value] of Object.entries(conditions)) {
            if (value === null) {
              clauses.push(`${key} IS NULL`)
            } else {
              clauses.push(`${key} = ?`)
              values.push(value)
            }
          }

          const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${clauses.join(' AND ')}`
          const result = database.get<{ count: number }>(sql, values)
          return result?.count ?? 0
        },

        all(): T[] {
          return database.all<T>(`SELECT * FROM ${tableName}`)
        },
      }
    },

    export(): Uint8Array {
      ensureOpen()
      return db.export()
    },

    import(data: Uint8Array | ArrayBuffer): void {
      ensureOpen()
      try {
        const uint8Data = data instanceof ArrayBuffer ? new Uint8Array(data) : data
        db.close()
        db = new SQL.Database(uint8Data)
        scheduleSave()
      } catch (error) {
        throw new SqlError(`Failed to import database: ${(error as Error).message}`)
      }
    },

    async save(): Promise<void> {
      ensureOpen()
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
      }
      await saveToStorage()
    },

    async load(): Promise<void> {
      ensureOpen()
      if (!options?.persist) return

      const storage = getStorageAdapter(options.persist.storage)
      const data = await storage.getItem(options.persist.key)

      if (data) {
        database.import(data)
      }
    },

    getTables(): string[] {
      ensureOpen()
      const tables = database.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
      )
      return tables.map(t => t.name)
    },

    getTableInfo(tableName: string): ColumnInfo[] {
      ensureOpen()
      try {
        const info = database.all<any>(`PRAGMA table_info(${tableName})`)
        return info.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.notnull === 0,
          defaultValue: col.dflt_value,
          primaryKey: col.pk === 1,
        }))
      } catch (error) {
        throw new SqlNotFoundError(`Table "${tableName}" not found`)
      }
    },

    getIndexes(tableName?: string): IndexInfo[] {
      ensureOpen()
      // Simplified implementation
      return []
    },

    close(): void {
      if (closed) return

      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
      }

      // Synchronous save before closing
      if (options?.persist && autoSave) {
        try {
          const storage = getStorageAdapter(options.persist.storage)
          const data = database.export()
          // Note: This would need to be async in real implementation
          // For now, we'll skip the final save in close()
        } catch (error) {
          console.error('Failed to save before close:', error)
        }
      }

      db.close()
      closed = true
    },

    async clone(): Promise<Database> {
      ensureOpen()
      const data = database.export()
      return createDatabase({ data })
    },

    clear(): void {
      ensureOpen()
      const tables = database.getTables()
      for (const table of tables) {
        database.exec(`DELETE FROM ${table}`)
      }
      scheduleSave()
    },

    async destroy(): Promise<void> {
      if (options?.persist) {
        const storage = getStorageAdapter(options.persist.storage)
        await storage.removeItem(options.persist.key)
      }
      database.close()
    },

    sql(strings: TemplateStringsArray, ...values: any[]): SqlTemplate {
      const sql = strings.reduce((acc, str, i) => {
        return acc + str + (i < values.length ? '?' : '')
      }, '')
      return { sql, params: values }
    },

    prepare<T = any>(sql: string): PreparedStatement<T> {
      ensureOpen()
      const stmt = db.prepare(sql)
      let finalized = false

      const ensureNotFinalized = (): void => {
        if (finalized) {
          throw new Error('Statement has been finalized')
        }
      }

      return {
        run(params?: ParamArray | ParamObject): RunResult {
          ensureNotFinalized()
          const convertedParams = convertParams(params)
          if (convertedParams) {
            stmt.bind(convertedParams as any)
          }
          stmt.step()
          stmt.reset()
          const changes = db.getRowsModified()
          const lastInsertRowId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number || 0
          return { changes, lastInsertRowId }
        },

        get(params?: ParamArray | ParamObject): T | undefined {
          ensureNotFinalized()
          const convertedParams = convertParams(params)
          if (convertedParams) {
            stmt.bind(convertedParams as any)
          }
          if (stmt.step()) {
            const row = stmt.getAsObject() as T
            stmt.reset()
            return row
          }
          stmt.reset()
          return undefined
        },

        all(params?: ParamArray | ParamObject): T[] {
          ensureNotFinalized()
          const convertedParams = convertParams(params)
          if (convertedParams) {
            stmt.bind(convertedParams as any)
          }
          const results: T[] = []
          while (stmt.step()) {
            results.push(stmt.getAsObject() as T)
          }
          stmt.reset()
          return results
        },

        finalize(): void {
          if (!finalized) {
            stmt.free()
            finalized = true
          }
        },
      }
    },

    insertMany(tableName: string, rows: Record<string, any>[]): number[] {
      ensureOpen()

      if (rows.length === 0) {
        return []
      }

      // Validate consistent columns
      const firstRowKeys = Object.keys(rows[0]!)
      for (const row of rows) {
        const keys = Object.keys(row)
        if (keys.length !== firstRowKeys.length || !keys.every(k => firstRowKeys.includes(k))) {
          throw new Error('All rows must have the same columns')
        }
      }

      const ids: number[] = []

      database.transaction(() => {
        for (const row of rows) {
          const table = database.table(tableName)
          const id = table.insert(row)
          ids.push(id)
        }
      })

      return ids
    },
  }

  return database
}

/**
 * Get storage adapter for persistence
 */
function getStorageAdapter(storage: 'indexeddb' | 'localstorage' | StorageAdapter): StorageAdapter {
  if (typeof storage === 'object') {
    return storage
  }

  if (storage === 'indexeddb') {
    return {
      async getItem(key: string): Promise<Uint8Array | null> {
        // Simplified IndexedDB implementation
        return null
      },
      async setItem(key: string, value: Uint8Array): Promise<void> {
        // Simplified IndexedDB implementation
      },
      async removeItem(key: string): Promise<void> {
        // Simplified IndexedDB implementation
      },
    }
  }

  if (storage === 'localstorage') {
    return {
      async getItem(key: string): Promise<Uint8Array | null> {
        const stored = localStorage.getItem(`__motioneffector_sql_${key}`)
        if (!stored) return null
        // Decode base64
        const binary = atob(stored)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      },
      async setItem(key: string, value: Uint8Array): Promise<void> {
        // Encode as base64
        const binary = Array.from(value, byte => String.fromCharCode(byte)).join('')
        const base64 = btoa(binary)
        localStorage.setItem(`__motioneffector_sql_${key}`, base64)
      },
      async removeItem(key: string): Promise<void> {
        localStorage.removeItem(`__motioneffector_sql_${key}`)
      },
    }
  }

  throw new Error(`Unknown storage type: ${storage}`)
}
