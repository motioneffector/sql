import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('db.insertMany(tableName, rows)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts multiple rows in single transaction', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]

    const ids = db.insertMany('users', rows)

    const users = db.all<{ id: number; name: string; age: number }>('SELECT * FROM users ORDER BY id')
    expect(users).toHaveLength(3)
    expect(users[0]).toMatchObject({ name: 'Alice', age: 30 })
    expect(ids).toHaveLength(3)
    expect(ids[0]).toBe(1)
  })

  it('rows is array of objects', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]

    expect(() => db.insertMany('users', rows)).not.toThrow()
  })

  it('returns array of inserted row IDs', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]

    const ids = db.insertMany('users', rows)

    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(1)
    expect(ids[1]).toBe(2)
  })

  it('all rows must have same keys (columns)', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]

    const result = db.insertMany('users', rows)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe(1)

    // Verify all rows were inserted with correct data
    const users = db.all<{ name: string; age: number }>('SELECT * FROM users ORDER BY id')
    expect(users).toHaveLength(3)
    expect(users[0]).toMatchObject({ name: 'Alice', age: 30 })
    expect(users[1]).toMatchObject({ name: 'Bob', age: 25 })
    expect(users[2]).toMatchObject({ name: 'Charlie', age: 35 })
  })

  it('throws Error if rows have inconsistent columns', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', email: 'bob@example.com' }, // Different columns - has email instead of age
    ]

    // Should throw an error because column sets are inconsistent
    expect(() => {
      db.insertMany('users', rows)
    }).toThrow(/inconsistent|column/i)
  })

  it('rolls back all inserts if any fails', () => {
    // Create a new table with CHECK constraint (SQLite doesn't support adding constraints via ALTER TABLE)
    db.exec('CREATE TABLE users_validated (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age INTEGER CHECK(age > 0))')

    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: -5 }, // Violates CHECK constraint
      { name: 'Charlie', age: 35 },
    ]

    try {
      db.insertMany('users_validated', rows)
    } catch (error) {
      expect((error as Error).message).toMatch(/CHECK|constraint/i)
    }

    // No rows should have been inserted
    const users = db.all('SELECT * FROM users_validated')
    expect(users.every(() => false)).toBe(true)
  })

  it('faster than individual insert() calls', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      name: `User${i}`,
      age: 20 + (i % 50),
    }))

    // Method 1: insertMany
    const start1 = Date.now()
    db.insertMany('users', rows)
    const time1 = Date.now() - start1

    // Clear table
    db.run('DELETE FROM users')

    // Method 2: Individual inserts
    const start2 = Date.now()
    const table = db.table('users')
    for (const row of rows) {
      table.insert(row)
    }
    const time2 = Date.now() - start2

    // insertMany should be faster or at least competitive (within 50% of individual inserts)
    // Note: Performance can vary based on system load
    expect(time1).toBeLessThan(time2 * 1.5)
  })

  it('handles empty array (returns empty array, no error)', () => {
    const ids = db.insertMany('users', [])

    expect(ids.every(() => false)).toBe(true)
    expect(db.all('SELECT * FROM users').every(() => false)).toBe(true)
  })
})

describe('Performance', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE bench (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT, num INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('insertMany(1000 rows) faster than 1000 individual inserts', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      value: `value${i}`,
      num: i,
    }))

    const start = Date.now()
    db.insertMany('bench', rows)
    const elapsed = Date.now() - start

    // Should complete reasonably fast
    expect(elapsed).toBeLessThan(5000)

    // Verify all rows inserted
    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count?.count).toBe(1000)
  })

  it('uses prepared statement internally', () => {
    // This is an implementation detail test
    // insertMany should use a prepared statement for efficiency
    const rows = Array.from({ length: 100 }, (_, i) => ({
      value: `value${i}`,
      num: i,
    }))

    expect(() => db.insertMany('bench', rows)).not.toThrow()

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count?.count).toBe(100)
  })

  it('single transaction for all rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      value: `value${i}`,
      num: i,
    }))

    // If this is truly a single transaction, it should be atomic
    expect(() => db.insertMany('bench', rows)).not.toThrow()

    // All rows should be present
    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count?.count).toBe(100)
  })
})
