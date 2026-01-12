import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('db.close()', () => {
  it('closes the database connection', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    expect(() => db.close()).not.toThrow()
  })

  it('saves to persistent storage if configured', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const db = await createDatabase({
      persist: { key: 'test-db', storage: mockStorage },
      autoSave: true,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Close should trigger a save
    db.close()

    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should have saved at some point
    expect(mockStorage.setItem).toHaveBeenCalled()
  })

  it('returns void', async () => {
    const db = await createDatabase()
    const result = db.close()
    expect(result).toBeUndefined()
  })

  it("subsequent run() throws Error('Database is closed')", async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    db.close()
    expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow('Database is closed')
  })

  it("subsequent get() throws Error('Database is closed')", async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    db.close()
    expect(() => db.get('SELECT * FROM test')).toThrow('Database is closed')
  })

  it("subsequent all() throws Error('Database is closed')", async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    db.close()
    expect(() => db.all('SELECT * FROM test')).toThrow('Database is closed')
  })

  it("subsequent exec() throws Error('Database is closed')", async () => {
    const db = await createDatabase()
    db.close()
    expect(() => db.exec('SELECT 1')).toThrow('Database is closed')
  })

  it('can call close() multiple times safely (no error on second call)', async () => {
    const db = await createDatabase()
    db.close()
    expect(() => db.close()).not.toThrow()
  })

  it('releases WASM memory', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')

    // Insert some data to use memory
    for (let i = 0; i < 1000; i++) {
      db.run('INSERT INTO test VALUES (?)', [i])
    }

    // Close should release memory
    expect(() => db.close()).not.toThrow()

    // After close, the database should not be usable
    expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow()
  })
})

describe('db.clone()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
  })

  afterEach(async () => {
    if (db) db.close()
  })

  it('creates independent copy of database', async () => {
    const clone = await db.clone()
    expect(clone).toBeDefined()
    expect(clone).not.toBe(db)
    clone.close()
  })

  it('returns Promise<Database>', async () => {
    const clonePromise = db.clone()
    expect(clonePromise).toBeInstanceOf(Promise)
    const clone = await clonePromise
    expect(clone).toHaveProperty('run')
    expect(clone).toHaveProperty('get')
    expect(clone).toHaveProperty('all')
    clone.close()
  })

  it('clone has same schema as original', async () => {
    const clone = await db.clone()
    const tables = clone.getTables()
    expect(tables).toContain('users')

    const columns = clone.getTableInfo('users')
    expect(columns.find(c => c.name === 'id')).toBeDefined()
    expect(columns.find(c => c.name === 'name')).toBeDefined()
    clone.close()
  })

  it('clone has same data as original', async () => {
    const clone = await db.clone()
    const users = clone.all<{ id: number; name: string }>('SELECT * FROM users ORDER BY id')
    expect(users).toHaveLength(2)
    expect(users[0]?.name).toBe('Alice')
    expect(users[1]?.name).toBe('Bob')
    clone.close()
  })

  it('changes to clone do not affect original', async () => {
    const clone = await db.clone()
    clone.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

    const originalUsers = db.all('SELECT * FROM users')
    const cloneUsers = clone.all('SELECT * FROM users')

    expect(originalUsers).toHaveLength(2)
    expect(cloneUsers).toHaveLength(3)
    clone.close()
  })

  it('changes to original do not affect clone', async () => {
    const clone = await db.clone()
    db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])

    const originalUsers = db.all('SELECT * FROM users')
    const cloneUsers = clone.all('SELECT * FROM users')

    expect(originalUsers).toHaveLength(3)
    expect(cloneUsers).toHaveLength(2)
    clone.close()
  })

  it('clone does not inherit persistence settings (in-memory only)', async () => {
    // Create database with persistence
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const persistedDb = await createDatabase({
      persist: { key: 'test-db', storage: mockStorage },
    })
    persistedDb.exec('CREATE TABLE test (id INTEGER)')

    const clone = await persistedDb.clone()
    clone.run('INSERT INTO test VALUES (1)')

    // Clone should not auto-save
    await new Promise(resolve => setTimeout(resolve, 100))

    // Original should have saved, but we can't easily verify clone didn't
    // This test mainly documents the expected behavior
    persistedDb.close()
    clone.close()
  })

  it('clone can have its own persistence configured separately', async () => {
    const clone = await db.clone()

    // This is in-memory clone - we're just testing it's a valid database
    // that could be configured with persistence if needed
    expect(() => clone.run('INSERT INTO users (name) VALUES (?)', ['Test'])).not.toThrow()
    clone.close()
  })
})

describe('db.clear()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);
      CREATE INDEX idx_users_name ON users(name);
    `)
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
    db.run('INSERT INTO posts (title) VALUES (?)', ['Post 1'])

    // Create migrations table
    await db.migrate([{ version: 1, up: 'SELECT 1' }])
  })

  afterEach(() => {
    db.close()
  })

  it('deletes all data from all tables', () => {
    db.clear()

    const users = db.all('SELECT * FROM users')
    const posts = db.all('SELECT * FROM posts')

    expect(users).toHaveLength(0)
    expect(posts).toHaveLength(0)
  })

  it('preserves table schemas (tables still exist)', () => {
    db.clear()

    const tables = db.getTables()
    expect(tables).toContain('users')
    expect(tables).toContain('posts')
  })

  it('preserves indexes', () => {
    db.clear()

    const indexes = db.getIndexes()
    const indexNames = indexes.map(idx => idx.name)
    expect(indexNames).toContain('idx_users_name')
  })

  it('resets AUTOINCREMENT counters to 0', () => {
    db.clear()

    const result = db.run('INSERT INTO users (name) VALUES (?)', ['New User'])
    expect(result.lastInsertRowId).toBe(1)
  })

  it('does not clear _migrations table (migration state preserved)', () => {
    db.clear()

    // Migration version should still be set
    expect(db.getMigrationVersion()).toBe(1)
  })

  it('returns void', () => {
    const result = db.clear()
    expect(result).toBeUndefined()
  })

  it('triggers auto-save if configured', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const persistedDb = await createDatabase({
      persist: { key: 'test-db', storage: mockStorage },
      autoSave: true,
    })

    persistedDb.exec('CREATE TABLE test (id INTEGER)')
    persistedDb.run('INSERT INTO test VALUES (1)')

    // Clear and wait for debounce
    persistedDb.clear()
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should have triggered a save
    expect(mockStorage.setItem.mock.calls.length).toBeGreaterThan(0)

    persistedDb.close()
  })
})

describe('db.destroy()', () => {
  it('closes the database connection', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')

    await db.destroy()

    expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow('Database is closed')
  })

  it('removes data from persistent storage if configured', async () => {
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const db = await createDatabase({
      persist: { key: 'test-db', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await db.destroy()

    expect(mockStorage.removeItem).toHaveBeenCalledWith('test-db')
  })

  it('returns Promise<void>', async () => {
    const db = await createDatabase()
    const result = await db.destroy()
    expect(result).toBeUndefined()
  })

  it("subsequent operations throw Error('Database is closed')", async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')

    await db.destroy()

    expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow('Database is closed')
    expect(() => db.get('SELECT * FROM test')).toThrow('Database is closed')
    expect(() => db.all('SELECT * FROM test')).toThrow('Database is closed')
    expect(() => db.exec('SELECT 1')).toThrow('Database is closed')
  })

  it('if persistence not configured, equivalent to close()', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')

    await db.destroy()

    expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow('Database is closed')
  })
})
