import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import { SqlNotFoundError } from './errors'
import type { Database } from './types'

describe('db.getTables()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('returns array of table names as strings', () => {
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY)')
    const tables = db.getTables()
    expect(Array.isArray(tables)).toBe(true)
    expect(tables.every(t => typeof t === 'string')).toBe(true)
  })

  it('excludes sqlite_* internal tables', () => {
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
    const tables = db.getTables()
    expect(tables.every(t => !t.startsWith('sqlite_'))).toBe(true)
  })

  it('excludes _migrations table (implementation detail)', async () => {
    // Create a migration to ensure _migrations table exists
    await db.migrate([{ version: 1, up: 'CREATE TABLE test (id INTEGER)' }])
    const tables = db.getTables()
    expect(tables).not.toContain('_migrations')
  })

  it('returns empty array for empty database', () => {
    const tables = db.getTables()
    expect(tables).toEqual([])
  })

  it('includes tables created by migrations', async () => {
    await db.migrate([
      { version: 1, up: 'CREATE TABLE users (id INTEGER)' },
      { version: 2, up: 'CREATE TABLE posts (id INTEGER)' },
    ])
    const tables = db.getTables()
    expect(tables).toContain('users')
    expect(tables).toContain('posts')
  })

  it('reflects current state (newly created tables appear)', () => {
    expect(db.getTables()).toEqual([])
    db.exec('CREATE TABLE test1 (id INTEGER)')
    expect(db.getTables()).toContain('test1')
    db.exec('CREATE TABLE test2 (id INTEGER)')
    expect(db.getTables()).toContain('test2')
  })
})

describe('db.getTableInfo(tableName)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER,
        active INTEGER DEFAULT 1
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('returns array of column info objects', () => {
    const columns = db.getTableInfo('users')
    expect(Array.isArray(columns)).toBe(true)
    expect(columns.length).toBeGreaterThan(0)
    expect(columns[0]).toHaveProperty('name')
    expect(columns[0]).toHaveProperty('type')
    expect(columns[0]).toHaveProperty('nullable')
    expect(columns[0]).toHaveProperty('defaultValue')
    expect(columns[0]).toHaveProperty('primaryKey')
  })

  it("throws SqlNotFoundError if table doesn't exist", () => {
    expect(() => db.getTableInfo('nonexistent')).toThrow(SqlNotFoundError)
  })

  it('name is the column name as declared', () => {
    const columns = db.getTableInfo('users')
    const names = columns.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('name')
    expect(names).toContain('email')
    expect(names).toContain('age')
  })

  it('type is the declared type (may be empty string if none)', () => {
    const columns = db.getTableInfo('users')
    const idCol = columns.find(c => c.name === 'id')
    const nameCol = columns.find(c => c.name === 'name')
    expect(idCol?.type).toBe('INTEGER')
    expect(nameCol?.type).toBe('TEXT')
  })

  it('nullable is false if NOT NULL constraint present', () => {
    const columns = db.getTableInfo('users')
    const nameCol = columns.find(c => c.name === 'name')
    const ageCol = columns.find(c => c.name === 'age')
    expect(nameCol?.nullable).toBe(false)
    expect(ageCol?.nullable).toBe(true)
  })

  it('defaultValue is the DEFAULT value or null if none', () => {
    const columns = db.getTableInfo('users')
    const activeCol = columns.find(c => c.name === 'active')
    const nameCol = columns.find(c => c.name === 'name')
    expect(activeCol?.defaultValue).toBe('1')
    expect(nameCol?.defaultValue).toBeNull()
  })

  it('primaryKey is true for PRIMARY KEY column(s)', () => {
    const columns = db.getTableInfo('users')
    const idCol = columns.find(c => c.name === 'id')
    const nameCol = columns.find(c => c.name === 'name')
    expect(idCol?.primaryKey).toBe(true)
    expect(nameCol?.primaryKey).toBe(false)
  })

  it('returns columns in declaration order', () => {
    const columns = db.getTableInfo('users')
    const names = columns.map(c => c.name)
    expect(names[0]).toBe('id')
    expect(names[1]).toBe('name')
    expect(names[2]).toBe('email')
    expect(names[3]).toBe('age')
    expect(names[4]).toBe('active')
  })
})

describe('db.getIndexes(tableName?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `)
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL
      )
    `)
    db.exec('CREATE INDEX idx_users_name ON users(name)')
    db.exec('CREATE UNIQUE INDEX idx_posts_title ON posts(title)')
  })

  afterEach(() => {
    db.close()
  })

  it('returns array of index info objects', () => {
    const indexes = db.getIndexes()
    expect(Array.isArray(indexes)).toBe(true)
    if (indexes.length > 0) {
      expect(indexes[0]).toHaveProperty('name')
      expect(indexes[0]).toHaveProperty('table')
      expect(indexes[0]).toHaveProperty('unique')
      expect(indexes[0]).toHaveProperty('columns')
    }
  })

  it('if tableName provided, returns indexes for that table only', () => {
    const userIndexes = db.getIndexes('users')
    expect(userIndexes.every(idx => idx.table === 'users')).toBe(true)
  })

  it('if tableName omitted, returns all indexes in database', () => {
    const allIndexes = db.getIndexes()
    const tables = allIndexes.map(idx => idx.table)
    // Should have indexes from multiple tables
    expect(tables.includes('users') || tables.includes('posts')).toBe(true)
  })

  it('excludes sqlite_autoindex_* automatic indexes', () => {
    const indexes = db.getIndexes()
    expect(indexes.every(idx => !idx.name.startsWith('sqlite_autoindex'))).toBe(true)
  })

  it('includes manually created indexes', () => {
    const indexes = db.getIndexes()
    const indexNames = indexes.map(idx => idx.name)
    expect(indexNames).toContain('idx_users_name')
    expect(indexNames).toContain('idx_posts_title')
  })

  it('unique is true for UNIQUE indexes', () => {
    const indexes = db.getIndexes()
    const titleIndex = indexes.find(idx => idx.name === 'idx_posts_title')
    expect(titleIndex?.unique).toBe(true)
  })

  it('columns array reflects index column order', () => {
    const indexes = db.getIndexes()
    const nameIndex = indexes.find(idx => idx.name === 'idx_users_name')
    expect(nameIndex?.columns).toEqual(['name'])

    // Test multi-column index
    db.exec('CREATE INDEX idx_multi ON users(name, email)')
    const multiIndex = db.getIndexes().find(idx => idx.name === 'idx_multi')
    expect(multiIndex?.columns).toEqual(['name', 'email'])
  })
})
