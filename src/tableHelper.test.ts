import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import { SqlConstraintError, SqlNotFoundError } from './errors'
import type { Database } from './types'

describe('db.table<T>(tableName, options?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('returns TableHelper<T> object', () => {
    const table = db.table('users')
    expect(table).toBeDefined()
    expect(table).toHaveProperty('insert')
    expect(table).toHaveProperty('find')
    expect(table).toHaveProperty('where')
    expect(table).toHaveProperty('update')
    expect(table).toHaveProperty('delete')
    expect(table).toHaveProperty('count')
    expect(table).toHaveProperty('all')
  })

  it('tableName is required, throws Error if empty', () => {
    expect(() => db.table('')).toThrow()
  })

  it('options.primaryKey sets default primary key column (default "id")', () => {
    const table = db.table('users', { primaryKey: 'email' })
    expect(table).toBeDefined()
  })

  it('helper methods operate on specified table', () => {
    const users = db.table('users')
    users.insert({ name: 'Alice', email: 'alice@example.com' })
    expect(users.all()).toHaveLength(1)
  })

  it('does not validate table exists (errors occur on query)', () => {
    // Should not throw when creating helper for non-existent table
    expect(() => db.table('nonexistent')).not.toThrow()
  })
})

describe('table.insert(data)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('inserts row from object properties', () => {
    const users = db.table('users')
    const id = users.insert({ name: 'Alice', email: 'alice@example.com', age: 30 })
    expect(id).toBe(1)
    const user = users.find(1)
    expect(user).toMatchObject({ name: 'Alice', email: 'alice@example.com', age: 30 })
  })

  it("returns inserted row's primary key value (number)", () => {
    const users = db.table('users')
    const id = users.insert({ name: 'Alice' })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('object keys become column names', () => {
    const users = db.table('users')
    users.insert({ name: 'Alice', age: 30 })
    const user = users.find(1)
    expect(user).toHaveProperty('name')
    expect(user).toHaveProperty('age')
  })

  it('object values become column values', () => {
    const users = db.table('users')
    users.insert({ name: 'Bob', age: 25 })
    const user = db.get<{ name: string; age: number }>('SELECT * FROM users WHERE name = "Bob"')
    expect(user?.name).toBe('Bob')
    expect(user?.age).toBe(25)
  })

  it('handles partial data (omits columns with DEFAULT constraints)', () => {
    const users = db.table('users')
    users.insert({ name: 'Charlie' })
    const user = users.find(1)
    expect(user).toMatchObject({ name: 'Charlie' })
  })

  it('null values insert NULL', () => {
    const users = db.table('users')
    users.insert({ name: 'Alice', email: null })
    const user = users.find(1)
    expect(user?.email).toBeNull()
  })

  it('undefined values are omitted from INSERT (use column default)', () => {
    const users = db.table('users')
    users.insert({ name: 'Alice', email: undefined })
    const user = users.find(1)
    // email should be NULL (default value)
    expect(user?.email).toBeNull()
  })

  it('throws SqlConstraintError on NOT NULL violation', () => {
    const users = db.table('users')
    expect(() => users.insert({ email: 'test@example.com' })).toThrow(SqlConstraintError)
  })

  it('throws SqlConstraintError on UNIQUE violation', () => {
    const users = db.table('users')
    users.insert({ name: 'Alice', email: 'alice@example.com' })
    expect(() => users.insert({ name: 'Bob', email: 'alice@example.com' })).toThrow(
      SqlConstraintError
    )
  })

  it('throws SqlConstraintError on FOREIGN KEY violation', () => {
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT
      )
    `)
    const posts = db.table('posts')
    expect(() => posts.insert({ user_id: 999, title: 'Test' })).toThrow(SqlConstraintError)
  })

  it("throws SqlNotFoundError if table doesn't exist", () => {
    const table = db.table('nonexistent')
    expect(() => table.insert({ name: 'Test' })).toThrow(SqlNotFoundError)
  })

  it('SQL injection prevented in column names (throws on suspicious characters)', () => {
    const users = db.table('users')
    expect(() => users.insert({ 'name; DROP TABLE users;--': 'Test' })).toThrow()
  })
})

describe('table.find(id, options?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice', email: 'alice@example.com' })
    users.insert({ name: 'Bob', email: 'bob@example.com' })
  })

  afterEach(() => {
    db.close()
  })

  it('finds row by primary key value', () => {
    const users = db.table('users')
    const user = users.find(1)
    expect(user).toMatchObject({ id: 1, name: 'Alice' })
  })

  it('uses "id" column by default', () => {
    const users = db.table('users')
    const user = users.find(2)
    expect(user?.id).toBe(2)
  })

  it('uses options.primaryKey from table() constructor if set', () => {
    db.exec('CREATE TABLE items (code TEXT PRIMARY KEY, name TEXT)')
    const items = db.table('items', { primaryKey: 'code' })
    items.insert({ code: 'ABC', name: 'Item A' })
    const item = items.find('ABC')
    expect(item).toMatchObject({ code: 'ABC', name: 'Item A' })
  })

  it('options.key overrides primary key for this call only', () => {
    const users = db.table('users')
    const user = users.find('alice@example.com', { key: 'email' })
    expect(user?.name).toBe('Alice')
  })

  it('returns row object or undefined', () => {
    const users = db.table('users')
    const user1 = users.find(1)
    expect(user1).toBeTypeOf('object')
    const user2 = users.find(999)
    expect(user2).toBeUndefined()
  })

  it('returns undefined if row not found', () => {
    const users = db.table('users')
    expect(users.find(999)).toBeUndefined()
  })

  it('returns undefined if table empty', () => {
    db.exec('CREATE TABLE empty_table (id INTEGER PRIMARY KEY)')
    const table = db.table('empty_table')
    expect(table.find(1)).toBeUndefined()
  })

  it('handles numeric primary key', () => {
    const users = db.table('users')
    const user = users.find(1)
    expect(typeof user?.id).toBe('number')
  })

  it('handles string primary key (UUID)', () => {
    db.exec('CREATE TABLE items (uuid TEXT PRIMARY KEY, name TEXT)')
    const items = db.table('items', { primaryKey: 'uuid' })
    items.insert({ uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Test' })
    const item = items.find('123e4567-e89b-12d3-a456-426614174000')
    expect(item?.name).toBe('Test')
  })
})

describe('table.where(conditions)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        active INTEGER DEFAULT 1
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice', age: 30, active: 1 })
    users.insert({ name: 'Bob', age: 25, active: 1 })
    users.insert({ name: 'Charlie', age: 30, active: 0 })
  })

  afterEach(() => {
    db.close()
  })

  it('finds rows matching all conditions (AND logic)', () => {
    const users = db.table('users')
    const result = users.where({ age: 30, active: 1 })
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Alice')
  })

  it('{ name: "Alice" } generates WHERE name = ?', () => {
    const users = db.table('users')
    const result = users.where({ name: 'Alice' })
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Alice')
  })

  it('{ name: "Alice", age: 25 } generates WHERE name = ? AND age = ?', () => {
    const users = db.table('users')
    const result = users.where({ name: 'Alice', age: 25 })
    expect(result).toHaveLength(0)
  })

  it('returns array of matching rows', () => {
    const users = db.table('users')
    const result = users.where({ age: 30 })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('returns empty array if no matches', () => {
    const users = db.table('users')
    const result = users.where({ name: 'Nonexistent' })
    expect(result).toEqual([])
  })

  it('null condition matches NULL: { deleted_at: null } → WHERE deleted_at IS NULL', () => {
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, deleted_at TEXT)')
    const items = db.table('items')
    items.insert({ deleted_at: null })
    items.insert({ deleted_at: '2024-01-01' })
    const result = items.where({ deleted_at: null })
    expect(result).toHaveLength(1)
  })

  it('empty conditions {} returns all rows (equivalent to table.all())', () => {
    const users = db.table('users')
    const result = users.where({})
    expect(result).toHaveLength(3)
  })

  it('conditions are parameterized (SQL injection prevented)', () => {
    const users = db.table('users')
    const result = users.where({ name: "'; DROP TABLE users;--" })
    expect(result).toEqual([])
    expect(db.getTables()).toContain('users')
  })

  it("throws SqlNotFoundError if table doesn't exist", () => {
    const table = db.table('nonexistent')
    expect(() => table.where({ name: 'Test' })).toThrow(SqlNotFoundError)
  })

  it("throws SqlNotFoundError if column in conditions doesn't exist", () => {
    const users = db.table('users')
    expect(() => users.where({ nonexistent_column: 'value' })).toThrow(SqlNotFoundError)
  })
})

describe('table.update(id, data, options?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice', email: 'alice@example.com' })
  })

  afterEach(() => {
    db.close()
  })

  it('updates row identified by primary key', () => {
    const users = db.table('users')
    users.update(1, { name: 'Alicia' })
    const user = users.find(1)
    expect(user?.name).toBe('Alicia')
  })

  it('uses configured primary key column', () => {
    const users = db.table('users', { primaryKey: 'id' })
    users.update(1, { email: 'newemail@example.com' })
    const user = users.find(1)
    expect(user?.email).toBe('newemail@example.com')
  })

  it('options.key overrides primary key for this call', () => {
    const users = db.table('users')
    users.update('alice@example.com', { name: 'Alice Updated' }, { key: 'email' })
    const user = users.find(1)
    expect(user?.name).toBe('Alice Updated')
  })

  it('updates only columns present in data object', () => {
    const users = db.table('users')
    users.update(1, { name: 'New Name' })
    const user = users.find(1)
    expect(user?.name).toBe('New Name')
    expect(user?.email).toBe('alice@example.com') // Unchanged
  })

  it('returns number of rows changed (0 or 1)', () => {
    const users = db.table('users')
    const changes1 = users.update(1, { name: 'Updated' })
    expect(changes1).toBe(1)
    const changes2 = users.update(999, { name: 'Not Found' })
    expect(changes2).toBe(0)
  })

  it('returns 0 if row not found', () => {
    const users = db.table('users')
    const changes = users.update(999, { name: 'Test' })
    expect(changes).toBe(0)
  })

  it('undefined values in data are ignored (column not updated)', () => {
    const users = db.table('users')
    users.update(1, { name: 'Updated', email: undefined })
    const user = users.find(1)
    expect(user?.name).toBe('Updated')
    expect(user?.email).toBe('alice@example.com') // Not changed
  })

  it('null values in data set column to NULL', () => {
    const users = db.table('users')
    users.update(1, { email: null })
    const user = users.find(1)
    expect(user?.email).toBeNull()
  })

  it('throws SqlConstraintError on constraint violations', () => {
    const users = db.table('users')
    users.insert({ name: 'Bob', email: 'bob@example.com' })
    expect(() => users.update(2, { email: 'alice@example.com' })).toThrow(SqlConstraintError)
  })
})

describe('table.delete(id, options?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice' })
    users.insert({ name: 'Bob' })
  })

  afterEach(() => {
    db.close()
  })

  it('deletes row identified by primary key', () => {
    const users = db.table('users')
    users.delete(1)
    expect(users.find(1)).toBeUndefined()
    expect(users.find(2)).toBeDefined()
  })

  it('uses configured primary key column', () => {
    const users = db.table('users', { primaryKey: 'id' })
    users.delete(1)
    expect(users.find(1)).toBeUndefined()
  })

  it('options.key overrides primary key for this call', () => {
    const users = db.table('users')
    users.delete('Alice', { key: 'name' })
    expect(users.where({ name: 'Alice' })).toHaveLength(0)
  })

  it('returns number of rows deleted (0 or 1)', () => {
    const users = db.table('users')
    const deleted1 = users.delete(1)
    expect(deleted1).toBe(1)
    const deleted2 = users.delete(999)
    expect(deleted2).toBe(0)
  })

  it('returns 0 if row not found', () => {
    const users = db.table('users')
    const deleted = users.delete(999)
    expect(deleted).toBe(0)
  })

  it('throws SqlConstraintError if foreign key prevents deletion', () => {
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id)
      )
    `)
    const posts = db.table('posts')
    posts.insert({ user_id: 1 })

    const users = db.table('users')
    expect(() => users.delete(1)).toThrow(SqlConstraintError)
  })
})

describe('table.count(conditions?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER DEFAULT 1
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice', active: 1 })
    users.insert({ name: 'Bob', active: 1 })
    users.insert({ name: 'Charlie', active: 0 })
  })

  afterEach(() => {
    db.close()
  })

  it('counts all rows if no conditions', () => {
    const users = db.table('users')
    expect(users.count()).toBe(3)
  })

  it('counts matching rows if conditions provided', () => {
    const users = db.table('users')
    expect(users.count({ active: 1 })).toBe(2)
  })

  it('returns number (not object)', () => {
    const users = db.table('users')
    const count = users.count()
    expect(typeof count).toBe('number')
  })

  it('returns 0 for empty table', () => {
    db.exec('CREATE TABLE empty (id INTEGER PRIMARY KEY)')
    const table = db.table('empty')
    expect(table.count()).toBe(0)
  })

  it('same condition syntax as where()', () => {
    const users = db.table('users')
    expect(users.count({ name: 'Alice', active: 1 })).toBe(1)
  })
})

describe('table.all()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `)
    const users = db.table('users')
    users.insert({ name: 'Alice' })
    users.insert({ name: 'Bob' })
    users.insert({ name: 'Charlie' })
  })

  afterEach(() => {
    db.close()
  })

  it('returns all rows in table', () => {
    const users = db.table('users')
    const all = users.all()
    expect(all).toHaveLength(3)
  })

  it('returns empty array if table empty', () => {
    db.exec('CREATE TABLE empty (id INTEGER PRIMARY KEY)')
    const table = db.table('empty')
    expect(table.all()).toEqual([])
  })

  it('no ORDER BY guarantee (returns in undefined order)', () => {
    const users = db.table('users')
    const all = users.all()
    expect(all).toHaveLength(3)
    // Order is not guaranteed - just verify all rows are present
  })
})
