/**
 * Core database implementation
 */

import initSqlJs, { type Database as SqlJsDatabase, type Statement } from 'sql.js'
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
      options.persist.storage !== 'indexeddb'
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
            locateFile: (_file: string) => {
              // If custom path is provided, validate it's accessible
              // SQL.js will throw if the path doesn't work
              return options.wasmPath ?? ''
            },
          }
        : undefined
    )
  } catch (error) {
    const message = (error as Error).message
    // Check if it's a network/loading error
    if (
      message.includes('fetch') ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('404') ||
      message.includes('ENOTFOUND')
    ) {
      throw new Error(`Failed to load SQL.js WASM: ${message}`)
    }
    throw new Error(`Failed to load SQL.js WASM: ${message}`)
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

  // Validate data if provided
  if (initialData && initialData.length > 0) {
    // SQLite files must start with "SQLite format 3\0"
    const header = Array.from(initialData.slice(0, 16))
    const expectedHeader = [83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0]
    const isValidSqlite = expectedHeader.every((byte, i) => header[i] === byte)

    if (!isValidSqlite) {
      throw new SqlError('Invalid SQLite database format')
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
  } catch {
    // Ignore if not supported
  }

  // State
  let closed = false
  let transactionDepth = 0
  let savepointCounter = 0
  const activeSavepoints: string[] = []

  // Transaction queue for concurrent transaction management
  interface TransactionQueueItem {
    id: string
    fn: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
    enqueuedAt: number
  }
  let transactionQueue: TransactionQueueItem[] = []
  let isProcessingQueue = false

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
      void saveToStorage().catch((error: unknown) => {
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

  // Process queued transactions serially
  async function processQueue(): Promise<void> {
    // Guard: Only one processor runs at a time
    if (isProcessingQueue) return
    if (transactionQueue.length === 0) return

    isProcessingQueue = true

    while (transactionQueue.length > 0) {
      const item = transactionQueue.shift()
      if (!item) break

      const { fn, resolve, reject } = item

      try {
        db.exec('BEGIN')

        // Increment depth to track that we're in a transaction context
        // Nested calls will see depth > 0 and use savepoints
        transactionDepth++

        const result = await fn()

        db.exec('COMMIT')
        scheduleSave()

        resolve(result)
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // Ignore rollback errors
        }

        reject(error)
      } finally {
        transactionDepth--
      }
    }

    isProcessingQueue = false
  }

  // Count positional placeholders (?) in SQL
  const countPositionalPlaceholders = (sql: string): number => {
    // Simple count - count ? that are not in string literals
    // This is a simplified version - doesn't handle all edge cases
    let count = 0
    let inString = false
    let stringChar = ''

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i]

      if (inString) {
        if (char === stringChar && sql[i - 1] !== '\\') {
          inString = false
        }
      } else {
        if (char === "'" || char === '"') {
          inString = true
          stringChar = char
        } else if (char === '?') {
          count++
        }
      }
    }

    return count
  }

  // Extract named parameter names from SQL (without prefixes)
  const extractNamedParameters = (sql: string): Set<string> => {
    const names = new Set<string>()
    let inString = false
    let stringChar = ''

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i]

      if (inString) {
        if (char === stringChar && sql[i - 1] !== '\\') {
          inString = false
        }
        continue
      }

      if (char === "'" || char === '"') {
        inString = true
        stringChar = char
        continue
      }

      // Check for named parameters: :name, $name, @name
      if (char === ':' || char === '$' || char === '@') {
        let paramName = ''
        let j = i + 1
        // Extract parameter name (alphanumeric and underscore)
        while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j] ?? '')) {
          paramName += sql[j]
          j++
        }
        if (paramName.length > 0) {
          names.add(paramName)
        }
      }
    }

    return names
  }

  // Validate parameters match SQL placeholders
  const validateParams = (sql: string, params?: ParamArray | ParamObject): void => {
    if (!params) {
      // No params provided - check if SQL expects any
      const positionalCount = countPositionalPlaceholders(sql)
      const namedParams = extractNamedParameters(sql)

      if (positionalCount > 0 || namedParams.size > 0) {
        throw new SqlError('SQL requires parameters but none provided')
      }
      return
    }

    if (Array.isArray(params)) {
      // Validate positional parameters
      const expected = countPositionalPlaceholders(sql)
      if (params.length !== expected) {
        throw new SqlError(
          `Parameter count mismatch: SQL expects ${String(expected)} parameters but ${String(params.length)} provided`
        )
      }
    } else {
      // Validate named parameters
      const requiredParams = extractNamedParameters(sql)
      const providedParams = new Set(Object.keys(params))

      for (const required of requiredParams) {
        if (!providedParams.has(required)) {
          throw new SqlError(`Missing required parameter: ${required}`)
        }
      }
    }
  }

  // Convert parameters to SQL.js format
  const convertParams = (params?: ParamArray | ParamObject): unknown[] | Record<string, unknown> | undefined => {
    if (!params) return undefined
    if (Array.isArray(params)) {
      return params.map(convertValue)
    }
    // Named parameters - SQL.js needs keys with prefix included
    // Convert { name: 'value' } to { ':name': 'value', '$name': 'value', '@name': 'value' }
    const converted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) {
      const convertedValue = convertValue(value)
      // Add all three prefix variants so any style works
      converted[`:${key}`] = convertedValue
      converted[`$${key}`] = convertedValue
      converted[`@${key}`] = convertedValue
      // Also add without prefix for flexibility
      converted[key] = convertedValue
    }
    return converted
  }

  // Convert JavaScript value to SQL value
  const convertValue = (value: unknown): unknown => {
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
  const handleSqlError = (error: unknown, sql?: string, params?: unknown[]): never => {
    const message = (error as Error).message || String(error)

    // Extract SQLite error code if present (format: "SQLITE_XXX: message")
    const codeMatch = message.match(/^(SQLITE_\w+)/)
    const code: string = codeMatch?.[1] ?? 'SQLITE_ERROR'

    // Check for syntax errors
    if (
      code === 'SQLITE_ERROR' &&
      (message.includes('syntax error') ||
       message.includes('unrecognized token') ||
       message.includes('incomplete') ||
       message.includes('near ') ||
       message.includes('parse') ||
       message.includes('unexpected'))
    ) {
      const err = new SqlSyntaxError(message, code)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    // Check for constraint errors
    if (
      code.includes('CONSTRAINT') ||
      message.includes('CONSTRAINT') ||
      message.includes('UNIQUE constraint') ||
      message.includes('NOT NULL constraint') ||
      message.includes('FOREIGN KEY constraint') ||
      message.includes('CHECK constraint') ||
      message.includes('PRIMARY KEY') ||
      message.includes('must be unique')
    ) {
      // SQL.js often returns SQLITE_ERROR for constraint violations
      // Set more specific code based on error message
      let specificCode = code
      if (code === 'SQLITE_ERROR') {
        if (message.includes('UNIQUE constraint')) {
          specificCode = 'SQLITE_CONSTRAINT_UNIQUE'
        } else if (message.includes('NOT NULL constraint')) {
          specificCode = 'SQLITE_CONSTRAINT_NOTNULL'
        } else if (message.includes('FOREIGN KEY constraint')) {
          specificCode = 'SQLITE_CONSTRAINT_FOREIGNKEY'
        } else if (message.includes('CHECK constraint')) {
          specificCode = 'SQLITE_CONSTRAINT_CHECK'
        } else if (message.includes('PRIMARY KEY')) {
          specificCode = 'SQLITE_CONSTRAINT_PRIMARYKEY'
        } else {
          specificCode = 'SQLITE_CONSTRAINT'
        }
      }
      const err = new SqlConstraintError(message, specificCode)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    // Check for not found errors
    if (
      message.includes('no such table') ||
      message.includes('no such column') ||
      message.includes('not found')
    ) {
      const err = new SqlNotFoundError(message, code)
      if (sql !== undefined) err.sql = sql
      if (params !== undefined) err.params = params
      throw err
    }

    // Generic SQL error
    const err = new SqlError(message, code)
    if (sql !== undefined) err.sql = sql
    if (params !== undefined) err.params = params
    throw err
  }

  // Database implementation
  const database: Database = {
    run(sql: string | SqlTemplate, params?: ParamArray | ParamObject): RunResult {
      ensureOpen()

      // Support SqlTemplate objects
      let actualSql: string
      let actualParams: ParamArray | ParamObject | undefined
      if (typeof sql === 'object' && sql !== null && 'sql' in sql && 'params' in sql) {
        actualSql = sql.sql
        actualParams = sql.params
      } else {
        actualSql = sql as string
        actualParams = params
      }

      try {
        // Validate parameters match SQL placeholders
        validateParams(actualSql, actualParams)

        const convertedParams = convertParams(actualParams)

        if (convertedParams) {
          // Use prepared statement for parameterized queries
          const stmt = db.prepare(actualSql)
          stmt.bind(convertedParams as never)
          stmt.step()
          stmt.free()
        } else {
          // No parameters, use direct execution
          db.run(actualSql)
        }

        const changes = db.getRowsModified()

        // Get last insert rowid - check if it's actually from an INSERT
        let lastInsertRowId = 0

        // Only get lastInsertRowId if we actually had changes (INSERT happened)
        if (changes > 0 && (actualSql.trim().toUpperCase().startsWith('INSERT'))) {
          try {
            const result = db.exec('SELECT last_insert_rowid() as id')
            if (result[0]?.values[0]?.[0]) {
              lastInsertRowId = result[0].values[0][0] as number
            }
          } catch {
            // Ignore - might fail
          }
        }

        if (transactionDepth === 0) {
          scheduleSave()
        }

        return { changes, lastInsertRowId }
      } catch (error) {
        // Re-throw TypeError as-is (parameter validation errors)
        if (error instanceof TypeError) {
          throw error
        }
        return handleSqlError(error, actualSql, actualParams as unknown[])
      }
    },

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    get<T extends Record<string, unknown> = Record<string, unknown>>(sql: string | SqlTemplate, params?: ParamArray | ParamObject): T | undefined {
      ensureOpen()

      // Support SqlTemplate objects
      let actualSql: string
      let actualParams: ParamArray | ParamObject | undefined
      if (typeof sql === 'object' && sql !== null && 'sql' in sql && 'params' in sql) {
        actualSql = sql.sql
        actualParams = sql.params
      } else {
        actualSql = sql as string
        actualParams = params
      }

      try {
        // Validate parameters match SQL placeholders
        validateParams(actualSql, actualParams)

        const stmt = db.prepare(actualSql)
        const convertedParams = convertParams(actualParams)
        if (convertedParams) {
          stmt.bind(convertedParams as never)
        }
        if (stmt.step()) {
          const row = stmt.getAsObject() as T
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      } catch (error) {
        if (error instanceof TypeError) {
          throw error
        }
        return handleSqlError(error, actualSql, actualParams as unknown[])
      }
    },

    all<T extends Record<string, unknown> = Record<string, unknown>>(sql: string | SqlTemplate, params?: ParamArray | ParamObject): T[] {
      ensureOpen()

      // Support SqlTemplate objects
      let actualSql: string
      let actualParams: ParamArray | ParamObject | undefined
      if (typeof sql === 'object' && sql !== null && 'sql' in sql && 'params' in sql) {
        actualSql = sql.sql
        actualParams = sql.params
      } else {
        actualSql = sql as string
        actualParams = params
      }

      try {
        // Validate parameters match SQL placeholders
        validateParams(actualSql, actualParams)

        const stmt = db.prepare(actualSql)
        const convertedParams = convertParams(actualParams)
        if (convertedParams) {
          stmt.bind(convertedParams as never)
        }
        const results: T[] = []
        while (stmt.step()) {
          results.push(stmt.getAsObject() as T)
        }
        stmt.free()
        return results
      } catch (error) {
        if (error instanceof TypeError) {
          throw error
        }
        return handleSqlError(error, actualSql, actualParams as unknown[])
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
        throw new Error(`Duplicate migration version: ${String(duplicate)}`)
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
            `Migration ${String(migration.version)} failed: ${(error as Error).message}`,
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
        throw new MigrationError(`Target version ${String(targetVersion)} is greater than current version ${String(currentVersion)}`)
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
          const firstMigration = appliedMigrations[0]
          if (firstMigration) {
            throw new MigrationError(`Rollback requires migrations with down scripts`, firstMigration.version)
          }
        }
        return rolledBack
      }

      for (const { version } of appliedMigrations) {
        // Find migration with down script
        const migration = migrations.find(m => m.version === version)
        if (!migration?.down) {
          throw new MigrationError(`Migration ${String(version)} has no down script`, version)
        }

        try {
          await database.transaction(() => {
            if (!migration.down) {
              throw new Error('Missing down migration')
            }
            database.exec(migration.down)
            database.run('DELETE FROM _migrations WHERE version = ?', [version])
          })
          rolledBack.push(version)
        } catch (error) {
          throw new MigrationError(
            `Rollback of migration ${String(version)} failed: ${(error as Error).message}`,
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
      } catch {
        // _migrations table doesn't exist
        return 0
      }
    },

    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      ensureOpen()

      // Check if we're nested inside another transaction
      // If depth > 0, we're in a transaction context and should use savepoints
      const isNested = transactionDepth > 0

      if (isNested) {
        // NESTED: Use savepoint for nested transaction
        const savepointName = `sp_${String(++savepointCounter)}`
        activeSavepoints.push(savepointName)
        transactionDepth++

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
          } catch {
            // Savepoint might not exist if there was an error creating it
          }
          transactionDepth--
          activeSavepoints.pop()
          throw error
        }
      } else {
        // TOP-LEVEL: Add to queue and process
        return new Promise<T>((resolve, reject) => {
          const id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          transactionQueue.push({
            id,
            fn: fn as () => Promise<unknown>,
            resolve: resolve as (value: unknown) => void,
            reject,
            enqueuedAt: Date.now()
          })

          // Schedule queue processing as a microtask (not synchronous)
          // This ensures concurrent transaction() calls can complete before processing starts
          void Promise.resolve().then(() => processQueue())
        })
      }
    },

    get inTransaction(): boolean {
      return transactionDepth > 0
    },

    table<T extends Record<string, unknown>>(tableName: string, options?: TableOptions): TableHelper<T> {
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

          const entries = Object.entries(data).filter(([_, value]) => value !== undefined) as Array<[string, unknown]>
          const columns = entries.map(([key]) => key)
          const values = entries.map(([_, value]) => value)
          const placeholders = columns.map(() => '?').join(', ')

          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
          const result = database.run(sql, values as ParamArray)
          return result.lastInsertRowId
        },

        find(id: unknown, options?: { key?: string }): T | undefined {
          const keyColumn = options?.key ?? primaryKey
          return database.get<T>(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`, [id])
        },

        where(conditions: Partial<T>): T[] {
          if (Object.keys(conditions).length === 0) {
            return database.all<T>(`SELECT * FROM ${tableName}`)
          }

          const clauses: string[] = []
          const values: unknown[] = []

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

        update(id: unknown, data: Partial<T>, options?: { key?: string }): number {
          const keyColumn = options?.key ?? primaryKey
          const entries = Object.entries(data).filter(([_, value]) => value !== undefined) as Array<[string, unknown]>

          if (entries.length === 0) {
            return 0
          }

          const setClauses = entries.map(([key]) => `${key} = ?`)
          const values = [...entries.map(([_, value]) => value), id]

          const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${keyColumn} = ?`
          const result = database.run(sql, values as ParamArray)
          return result.changes
        },

        delete(id: unknown, options?: { key?: string }): number {
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
          const values: unknown[] = []

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

        // Validate SQLite format: files must start with "SQLite format 3\0"
        const sqliteHeader = 'SQLite format 3\0'
        if (uint8Data.length < 16) {
          throw new SqlError('Invalid SQLite file: file too small')
        }

        for (let i = 0; i < sqliteHeader.length; i++) {
          if (uint8Data[i] !== sqliteHeader.charCodeAt(i)) {
            throw new SqlError('Invalid SQLite file: not a valid SQLite database format')
          }
        }

        db.close()
        db = new SQL.Database(uint8Data)
        scheduleSave()
      } catch (error) {
        if (error instanceof SqlError) {
          throw error
        }
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

      // Check if table exists
      const tableExists = database.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
        [tableName]
      )

      if (!tableExists || tableExists.count === 0) {
        throw new SqlNotFoundError(`Table "${tableName}" not found`)
      }

      try {
        const info = database.all<{
          name: string
          type: string
          notnull: number
          dflt_value: unknown
          pk: number
        }>(`PRAGMA table_info(${tableName})`)
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

      try {
        // Query sqlite_master for indexes
        const sql = tableName
          ? `SELECT name, tbl_name, sql
             FROM sqlite_master
             WHERE type = 'index'
             AND tbl_name = ?
             AND name NOT LIKE 'sqlite_autoindex_%'`
          : `SELECT name, tbl_name, sql
             FROM sqlite_master
             WHERE type = 'index'
             AND name NOT LIKE 'sqlite_autoindex_%'`

        const params = tableName ? [tableName] : undefined
        const rows = database.all<{ name: string; tbl_name: string; sql: string | null }>(sql, params)

        return rows.map(row => {
          // Parse if index is UNIQUE from the CREATE INDEX statement
          const unique = row.sql ? row.sql.includes('UNIQUE INDEX') : false

          // Get columns using PRAGMA index_info
          const columns: string[] = []
          try {
            const info = db.exec(`PRAGMA index_info("${row.name}")`)
            if (info[0]?.values) {
              for (const value of info[0].values) {
                const colName = value[2] as string // Column name is at index 2
                if (colName) {
                  columns.push(colName)
                }
              }
            }
          } catch {
            // If PRAGMA fails, try to parse from SQL
            if (row.sql) {
              const match = row.sql.match(/\((.*?)\)/)
              if (match && match[1]) {
                columns.push(...match[1].split(',').map(c => c.trim()))
              }
            }
          }

          return {
            name: row.name,
            table: row.tbl_name,
            unique,
            columns,
          }
        })
      } catch (error) {
        return handleSqlError(error)
      }
    },

    close(): void {
      if (closed) return

      // Reject all pending transactions
      while (transactionQueue.length > 0) {
        const item = transactionQueue.shift()
        if (item) {
          item.reject(new Error('Database closed with pending transactions'))
        }
      }

      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
      }

      // Trigger final save if persistence is configured
      if (options?.persist) {
        // Fire and forget - save happens asynchronously
        void saveToStorage()
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
      // Reset AUTOINCREMENT counters (only if table exists)
      try {
        database.exec('DELETE FROM sqlite_sequence')
      } catch {
        // sqlite_sequence doesn't exist if no AUTOINCREMENT columns have been used
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

    sql(strings: TemplateStringsArray, ...values: unknown[]): SqlTemplate {
      const sql = strings.reduce((acc, str, i) => {
        return acc + str + (i < values.length ? '?' : '')
      }, '')
      return { sql, params: values }
    },

    prepare<T>(sql: string): PreparedStatement<T> {
      ensureOpen()

      let stmt: Statement
      try {
        stmt = db.prepare(sql)
      } catch (error) {
        return handleSqlError(error, sql)
      }

      let finalized = false

      const ensureNotFinalized = (): void => {
        if (finalized) {
          throw new Error('Statement has been finalized')
        }
      }

      return {
        run(params?: ParamArray | ParamObject): RunResult {
          ensureNotFinalized()
          try {
            const convertedParams = convertParams(params)
            if (convertedParams) {
              stmt.bind(convertedParams as never)
            }
            stmt.step()
            stmt.reset()
            const changes = db.getRowsModified()
            const lastInsertRowId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number || 0
            return { changes, lastInsertRowId }
          } catch (error) {
            return handleSqlError(error, sql, params as unknown[])
          }
        },

        get(params?: ParamArray | ParamObject): T | undefined {
          ensureNotFinalized()
          try {
            const convertedParams = convertParams(params)
            if (convertedParams) {
              stmt.bind(convertedParams as never)
            }
            if (stmt.step()) {
              const row = stmt.getAsObject() as T
              stmt.reset()
              return row
            }
            stmt.reset()
            return undefined
          } catch (error) {
            return handleSqlError(error, sql, params as unknown[])
          }
        },

        all(params?: ParamArray | ParamObject): T[] {
          ensureNotFinalized()
          try {
            const convertedParams = convertParams(params)
            if (convertedParams) {
              stmt.bind(convertedParams as never)
            }
            const results: T[] = []
            while (stmt.step()) {
              results.push(stmt.getAsObject() as T)
            }
            stmt.reset()
            return results
          } catch (error) {
            return handleSqlError(error, sql, params as unknown[])
          }
        },

        finalize(): void {
          if (!finalized) {
            stmt.free()
            finalized = true
          }
        },
      }
    },

    insertMany(tableName: string, rows: Record<string, unknown>[]): number[] {
      ensureOpen()

      if (rows.length === 0) {
        return []
      }

      // Validate consistent columns
      const firstRow = rows[0]
      if (!firstRow) {
        return []
      }
      const firstRowKeys = Object.keys(firstRow)

      // Check if any row has keys that aren't in the first row
      for (const row of rows) {
        const keys = Object.keys(row)
        for (const key of keys) {
          if (!firstRowKeys.includes(key)) {
            throw new Error('All rows must have the same columns')
          }
        }
      }

      const ids: number[] = []

      // Use manual transaction - bypass queue for synchronous operation
      // Only safe because insertMany is synchronous and manages its own transaction
      const wasInTransaction = transactionDepth > 0

      try {
        if (!wasInTransaction) {
          db.exec('BEGIN')
          transactionDepth++
        }

        for (const row of rows) {
          // Fill in missing keys with undefined (will be inserted as NULL)
          const normalizedRow: Record<string, unknown> = {}
          for (const key of firstRowKeys) {
            normalizedRow[key] = row[key]
          }

          const table = database.table(tableName)
          const id = table.insert(normalizedRow)
          ids.push(id)
        }

        if (!wasInTransaction) {
          db.exec('COMMIT')
          transactionDepth--
          scheduleSave()
        }
      } catch (error) {
        if (!wasInTransaction) {
          try {
            db.exec('ROLLBACK')
          } catch {
            // Ignore rollback errors
          }
          transactionDepth--
        }
        throw error
      }

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
      getItem(_key: string): Promise<Uint8Array | null> {
        // Simplified IndexedDB implementation
        return Promise.resolve(null)
      },
      setItem(_key: string, _value: Uint8Array): Promise<void> {
        // Simplified IndexedDB implementation
        return Promise.resolve()
      },
      removeItem(_key: string): Promise<void> {
        // Simplified IndexedDB implementation
        return Promise.resolve()
      },
    }
  }

  return {
    getItem(key: string): Promise<Uint8Array | null> {
      const stored = localStorage.getItem(`__motioneffector_sql_${key}`)
      if (!stored) return Promise.resolve(null)
      // Decode base64
      const binary = atob(stored)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return Promise.resolve(bytes)
    },
    setItem(key: string, value: Uint8Array): Promise<void> {
      // Encode as base64
      const binary = Array.from(value, byte => String.fromCharCode(byte)).join('')
      const base64 = btoa(binary)
      localStorage.setItem(`__motioneffector_sql_${key}`, base64)
      return Promise.resolve()
    },
    removeItem(key: string): Promise<void> {
      localStorage.removeItem(`__motioneffector_sql_${key}`)
      return Promise.resolve()
    },
  }
}
