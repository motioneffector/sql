import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDatabase } from './index'
import { SqlError } from './errors'
import type { Database } from './types'

describe('db.export()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT
      );
      CREATE INDEX idx_users_email ON users(email);
    `)
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com'])
  })

  afterEach(() => {
    db.close()
  })

  it('returns database as Uint8Array', () => {
    const data = db.export()
    expect(data).toBeInstanceOf(Uint8Array)
  })

  it('returned data is valid SQLite database file', async () => {
    const data = db.export()

    // SQLite databases start with "SQLite format 3\0"
    const header = new TextDecoder().decode(data.slice(0, 15))
    expect(header).toContain('SQLite format 3')
  })

  it('includes all tables and data', async () => {
    const data = db.export()
    const newDb = await createDatabase({ data })

    const tables = newDb.getTables()
    expect(tables).toContain('users')

    const users = newDb.all('SELECT * FROM users ORDER BY id')
    expect(users).toHaveLength(2)

    newDb.close()
  })

  it('includes all indexes', async () => {
    const data = db.export()
    const newDb = await createDatabase({ data })

    const indexes = newDb.getIndexes()
    const indexNames = indexes.map(idx => idx.name)
    expect(indexNames).toContain('idx_users_email')

    newDb.close()
  })

  it('includes schema information', async () => {
    const data = db.export()
    const newDb = await createDatabase({ data })

    const columns = newDb.getTableInfo('users')
    expect(columns.find(c => c.name === 'id')).toBeDefined()
    expect(columns.find(c => c.name === 'name')).toBeDefined()
    expect(columns.find(c => c.name === 'email')).toBeDefined()

    newDb.close()
  })

  it('export is a snapshot (changes after export not included)', async () => {
    const data = db.export()

    // Make changes after export
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Charlie', 'charlie@example.com'])

    // Load exported data
    const newDb = await createDatabase({ data })
    const users = newDb.all('SELECT * FROM users')

    // Should only have original 2 users, not the new one
    expect(users).toHaveLength(2)

    newDb.close()
  })

  it('can be saved to file via download', () => {
    const data = db.export()

    // Simulate save to file
    expect(data).toBeInstanceOf(Uint8Array)
    expect(data.byteLength).toBeGreaterThan(0)

    // In a browser, this would be:
    // const blob = new Blob([data], { type: 'application/x-sqlite3' })
    // const url = URL.createObjectURL(blob)
    // etc.
  })

  it('can be used to create new database: createDatabase({ data: exported })', async () => {
    const data = db.export()
    const newDb = await createDatabase({ data })

    expect(newDb).toBeDefined()
    expect(newDb.getTables()).toContain('users')

    newDb.close()
  })
})

describe('db.import(data)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE initial (id INTEGER)')
    db.run('INSERT INTO initial VALUES (1)')
  })

  afterEach(() => {
    db.close()
  })

  it('replaces entire database contents', async () => {
    // Create source database
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE users (name TEXT)')
    sourceDb.run('INSERT INTO users VALUES (?)', ['Alice'])
    const data = sourceDb.export()
    sourceDb.close()

    // Import into existing database
    db.import(data)

    // Old table should be gone
    expect(db.getTables()).not.toContain('initial')
    // New table should exist
    expect(db.getTables()).toContain('users')
  })

  it('accepts Uint8Array', async () => {
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE test (id INTEGER)')
    const data = sourceDb.export()
    sourceDb.close()

    expect(() => db.import(data)).not.toThrow()
    expect(db.getTables()).toContain('test')
  })

  it('accepts ArrayBuffer (converted internally)', async () => {
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE test (id INTEGER)')
    const uint8Data = sourceDb.export()
    sourceDb.close()

    // Convert to ArrayBuffer
    const arrayBuffer = uint8Data.buffer.slice(
      uint8Data.byteOffset,
      uint8Data.byteOffset + uint8Data.byteLength
    )

    expect(() => db.import(arrayBuffer)).not.toThrow()
    expect(db.getTables()).toContain('test')
  })

  it('previous data is completely replaced', async () => {
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE new_table (value TEXT)')
    const data = sourceDb.export()
    sourceDb.close()

    db.import(data)

    // Check old data is gone
    const result = db.get('SELECT * FROM sqlite_master WHERE name = "initial"')
    expect(result).toBeUndefined()
  })

  it('previous tables are dropped', async () => {
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE replacement (id INTEGER)')
    const data = sourceDb.export()
    sourceDb.close()

    db.import(data)

    expect(db.getTables()).not.toContain('initial')
    expect(db.getTables()).toContain('replacement')
  })

  it('validates data is valid SQLite format before replacing', () => {
    const invalidData = new Uint8Array([1, 2, 3, 4, 5])

    expect(() => db.import(invalidData)).toThrow(SqlError)

    // Original database should still work
    expect(db.getTables()).toContain('initial')
  })

  it('throws SqlError if data is not valid SQLite file', () => {
    const invalidData = new Uint8Array(100)
    invalidData.fill(0)

    expect(() => db.import(invalidData)).toThrow(SqlError)
  })

  it('throws SqlError if data is corrupted', async () => {
    // Create valid database and corrupt it
    const sourceDb = await createDatabase()
    const data = sourceDb.export()
    sourceDb.close()

    // Corrupt the data
    data[10] = 255
    data[11] = 255

    expect(() => db.import(data)).toThrow(SqlError)
  })

  it('on error, original database unchanged', () => {
    const invalidData = new Uint8Array([1, 2, 3, 4, 5])

    try {
      db.import(invalidData)
    } catch (e) {
      // Expected
    }

    // Original database should still be intact
    expect(db.getTables()).toContain('initial')
    const result = db.get<{ id: number }>('SELECT * FROM initial')
    expect(result?.id).toBe(1)
  })

  it('triggers save to persistent storage if autoSave enabled', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const persistedDb = await createDatabase({
      persist: { key: 'test-db', storage: mockStorage },
      autoSave: true,
    })

    // Create data to import
    const sourceDb = await createDatabase()
    sourceDb.exec('CREATE TABLE test (id INTEGER)')
    const data = sourceDb.export()
    sourceDb.close()

    // Import should trigger save
    persistedDb.import(data)

    // Wait for debounced save
    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalled()

    persistedDb.close()
  })
})

describe('Round-trip Integrity', () => {
  it('export → createDatabase({ data }) preserves all table data', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
    db.run('INSERT INTO users VALUES (1, ?)', ['Alice'])
    db.run('INSERT INTO users VALUES (2, ?)', ['Bob'])

    const data = db.export()
    db.close()

    const newDb = await createDatabase({ data })
    const users = newDb.all<{ id: number; name: string }>('SELECT * FROM users ORDER BY id')

    expect(users).toHaveLength(2)
    expect(users[0]?.name).toBe('Alice')
    expect(users[1]?.name).toBe('Bob')

    newDb.close()
  })

  it('export → createDatabase({ data }) preserves all table schemas', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')

    const data = db.export()
    db.close()

    const newDb = await createDatabase({ data })
    const columns = newDb.getTableInfo('users')

    expect(columns.find(c => c.name === 'id' && c.primaryKey)).toBeDefined()
    expect(columns.find(c => c.name === 'name' && !c.nullable)).toBeDefined()

    newDb.close()
  })

  it('export → createDatabase({ data }) preserves all indexes', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
    db.exec('CREATE INDEX idx_name ON users(name)')

    const data = db.export()
    db.close()

    const newDb = await createDatabase({ data })
    const indexes = newDb.getIndexes()
    const indexNames = indexes.map(idx => idx.name)

    expect(indexNames).toContain('idx_name')

    newDb.close()
  })

  it('export → createDatabase({ data }) preserves _migrations table', async () => {
    const db = await createDatabase()
    await db.migrate([{ version: 1, up: 'CREATE TABLE test (id INTEGER)' }])

    const data = db.export()
    db.close()

    const newDb = await createDatabase({ data })
    expect(newDb.getMigrationVersion()).toBe(1)

    newDb.close()
  })

  it('export → import preserves all data', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (value TEXT)')
    db.run('INSERT INTO test VALUES (?)', ['data1'])
    db.run('INSERT INTO test VALUES (?)', ['data2'])

    const data = db.export()

    const newDb = await createDatabase()
    newDb.import(data)

    const rows = newDb.all<{ value: string }>('SELECT * FROM test ORDER BY value')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.value).toBe('data1')
    expect(rows[1]?.value).toBe('data2')

    db.close()
    newDb.close()
  })

  it('export → import preserves Unicode text', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (text TEXT)')
    db.run('INSERT INTO test VALUES (?)', ['你好世界'])
    db.run('INSERT INTO test VALUES (?)', ['👋🌍'])

    const data = db.export()

    const newDb = await createDatabase()
    newDb.import(data)

    const rows = newDb.all<{ text: string }>('SELECT * FROM test')
    expect(rows.some(r => r.text === '你好世界')).toBe(true)
    expect(rows.some(r => r.text === '👋🌍')).toBe(true)

    db.close()
    newDb.close()
  })

  it('export → import preserves BLOB data', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (data BLOB)')
    const blobData = new Uint8Array([1, 2, 3, 4, 5])
    db.run('INSERT INTO test VALUES (?)', [blobData])

    const data = db.export()

    const newDb = await createDatabase()
    newDb.import(data)

    const row = newDb.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(row?.data).toEqual(blobData)

    db.close()
    newDb.close()
  })

  it('export → import preserves NULL values', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (value TEXT)')
    db.run('INSERT INTO test VALUES (NULL)')

    const data = db.export()

    const newDb = await createDatabase()
    newDb.import(data)

    const row = newDb.get<{ value: null }>('SELECT * FROM test')
    expect(row?.value).toBeNull()

    db.close()
    newDb.close()
  })

  it('export → import preserves empty strings (distinct from NULL)', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (value TEXT)')
    db.run('INSERT INTO test VALUES (?)', [''])
    db.run('INSERT INTO test VALUES (NULL)')

    const data = db.export()

    const newDb = await createDatabase()
    newDb.import(data)

    const rows = newDb.all<{ value: string | null }>('SELECT * FROM test')
    expect(rows).toHaveLength(2)
    expect(rows.some(r => r.value === '')).toBe(true)
    expect(rows.some(r => r.value === null)).toBe(true)
    // Verify they are distinct
    const emptyString = rows.find(r => r.value === '')
    const nullValue = rows.find(r => r.value === null)
    expect(emptyString).toBeDefined()
    expect(nullValue).toBeDefined()

    db.close()
    newDb.close()
  })
})
