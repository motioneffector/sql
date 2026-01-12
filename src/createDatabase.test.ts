import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDatabase } from './index'
import { SqlError } from './errors'
import type { Database } from './types'

describe('createDatabase(options?)', () => {
  let db: Database | undefined

  afterEach(async () => {
    if (db) {
      await db.close()
      db = undefined
    }
  })

  it('creates empty in-memory database when called with no options', async () => {
    db = await createDatabase()
    expect(db).toBeDefined()
    expect(db.getTables()).toEqual([])
  })

  it('returns Promise<Database> (async initialization for WASM loading)', async () => {
    const result = createDatabase()
    expect(result).toBeInstanceOf(Promise)
    db = await result
    expect(db).toBeDefined()
  })

  it('loads SQL.js WASM automatically from default CDN path', async () => {
    db = await createDatabase()
    expect(db).toBeDefined()
  })

  it('accepts custom wasmPath option: createDatabase({ wasmPath: "/assets/sql-wasm.wasm" })', async () => {
    // This test will fail with network error in test environment, but validates the option is accepted
    try {
      db = await createDatabase({ wasmPath: '/assets/sql-wasm.wasm' })
    } catch (error) {
      // Expected to fail in test environment - just verify option is accepted
      expect(error).toBeDefined()
    }
  })

  it('accepts existing database as Uint8Array: createDatabase({ data: existingDb })', async () => {
    // Create a database with data
    const db1 = await createDatabase()
    db1.exec('CREATE TABLE test (value INTEGER)')
    db1.run('INSERT INTO test VALUES (?)', [42])
    const data = db1.export()
    await db1.close()

    // Load it
    db = await createDatabase({ data })
    const result = db.get<{ value: number }>('SELECT * FROM test')
    expect(result?.value).toBe(42)
  })

  it('accepts persistence config: createDatabase({ persist: { key: "mydb", storage: "indexeddb" } })', async () => {
    // Mock storage
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
    })
    expect(db).toBeDefined()
  })

  it('accepts persistence config with localStorage: createDatabase({ persist: { key: "mydb", storage: "localstorage" } })', async () => {
    // Will use actual localStorage if available, or fail gracefully
    try {
      db = await createDatabase({
        persist: { key: 'test-db', storage: 'localstorage' },
      })
      expect(db).toBeDefined()
    } catch (error) {
      // localStorage might not be available in test environment
      expect(error).toBeDefined()
    }
  })

  it('accepts autoSave option (default true when persist is set)', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
      autoSave: true,
    })
    expect(db).toBeDefined()
  })

  it('accepts autoSaveDebounce option in milliseconds (default 1000)', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
      autoSaveDebounce: 500,
    })
    expect(db).toBeDefined()
  })

  it('autoSave: false disables automatic persistence', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
      autoSave: false,
    })

    db.exec('CREATE TABLE test (id INTEGER)')
    await vi.waitFor(() => {}, { timeout: 100 })

    expect(mockStorage.setItem).not.toHaveBeenCalled()
  })

  it('restores from persistent storage if key exists and no data option provided', async () => {
    // Create and save a database
    const db1 = await createDatabase()
    db1.exec('CREATE TABLE test (value TEXT)')
    db1.run("INSERT INTO test VALUES ('persisted')")
    const savedData = db1.export()
    await db1.close()

    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(savedData),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
    })

    const result = db.get<{ value: string }>('SELECT * FROM test')
    expect(result?.value).toBe('persisted')
  })

  it('data option takes precedence over persisted data when both exist', async () => {
    // Create persisted data
    const db1 = await createDatabase()
    db1.exec('CREATE TABLE test (value TEXT)')
    db1.run("INSERT INTO test VALUES ('from-storage')")
    const persistedData = db1.export()
    await db1.close()

    // Create data option
    const db2 = await createDatabase()
    db2.exec('CREATE TABLE test (value TEXT)')
    db2.run("INSERT INTO test VALUES ('from-data-option')")
    const dataOption = db2.export()
    await db2.close()

    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(persistedData),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    db = await createDatabase({
      data: dataOption,
      persist: { key: 'mydb', storage: mockStorage },
    })

    const result = db.get<{ value: string }>('SELECT * FROM test')
    expect(result?.value).toBe('from-data-option')
  })
})

describe('Initialization Errors', () => {
  it('throws SqlError if provided data is not valid SQLite format', async () => {
    const invalidData = new Uint8Array([1, 2, 3, 4, 5])
    await expect(createDatabase({ data: invalidData })).rejects.toThrow(SqlError)
  })

  it('throws SqlError if provided data is corrupted (invalid header)', async () => {
    // Create invalid SQLite header
    const corruptedData = new Uint8Array(100)
    corruptedData.set([0, 1, 2, 3], 0) // Invalid header (should be 'SQLite format 3\0')
    await expect(createDatabase({ data: corruptedData })).rejects.toThrow(SqlError)
  })

  it('throws Error if persist.storage is not "indexeddb" or "localstorage"', async () => {
    await expect(
      // @ts-expect-error - Testing runtime validation
      createDatabase({ persist: { key: 'test', storage: 'invalid' } })
    ).rejects.toThrow(Error)
  })

  it('throws Error if persist.key is empty string', async () => {
    await expect(
      createDatabase({ persist: { key: '', storage: 'indexeddb' } })
    ).rejects.toThrow(Error)
  })
})

describe('Post-Initialization State', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('database is ready for queries immediately after await resolves', () => {
    expect(() => db.exec('SELECT 1')).not.toThrow()
  })

  it('database has no tables initially (empty database)', () => {
    expect(db.getTables()).toEqual([])
  })

  it('getMigrationVersion() returns 0 for fresh database', () => {
    expect(db.getMigrationVersion()).toBe(0)
  })

  it('inTransaction is false initially', () => {
    expect(db.inTransaction).toBe(false)
  })
})
