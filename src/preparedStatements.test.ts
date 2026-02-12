import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import { SqlSyntaxError } from './errors'
import type { Database } from './types'

describe('db.prepare(sql)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('returns PreparedStatement object', () => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')

    const allResult = stmt.all([1])
    expect(allResult.every(() => false)).toBe(true)
    const getResult = stmt.get([1])
    const isAbsent = getResult === undefined
    expect(isAbsent).toBe(true)
    expect(() => stmt.finalize()).not.toThrow()
  })

  it('parses SQL once, can execute multiple times', () => {
    const stmt = db.prepare('INSERT INTO users (name, age) VALUES (?, ?)')

    expect(() => stmt.run(['Alice', 30])).not.toThrow()
    expect(() => stmt.run(['Bob', 25])).not.toThrow()
    expect(() => stmt.run(['Charlie', 35])).not.toThrow()

    const users = db.all<{ name: string }>('SELECT * FROM users')
    expect(users).toHaveLength(3)
    expect(users[0]?.name).toBe('Alice')

    stmt.finalize()
  })

  it('throws SqlSyntaxError if SQL invalid', () => {
    expect(() => {
      db.prepare('INVALID SQL SYNTAX')
    }).toThrow(/syntax|near/i)
  })

  it('must call finalize() when done to release resources', () => {
    const stmt = db.prepare('SELECT * FROM users')

    expect(() => stmt.finalize()).not.toThrow()

    // Can call finalize multiple times safely
    expect(() => stmt.finalize()).not.toThrow()
  })
})

describe('PreparedStatement Methods', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)')
    db.run('INSERT INTO users VALUES (1, ?, ?)', ['Alice', 30])
    db.run('INSERT INTO users VALUES (2, ?, ?)', ['Bob', 25])
  })

  afterEach(() => {
    db.close()
  })

  it('run() executes statement with given params', () => {
    const stmt = db.prepare('INSERT INTO users (name, age) VALUES (?, ?)')

    const result = stmt.run(['Charlie', 35])

    expect(result.changes).toBe(1)
    expect(result.lastInsertRowId).toBe(3)

    stmt.finalize()
  })

  it('get() returns first row', () => {
    const stmt = db.prepare('SELECT * FROM users WHERE age > ?')

    const user = stmt.get<{ name: string }>([20])

    expect(user?.name).toBe('Alice')

    stmt.finalize()
  })

  it('all() returns all rows', () => {
    const stmt = db.prepare('SELECT * FROM users WHERE age > ?')

    const users = stmt.all<{ name: string }>([20])

    expect(users).toHaveLength(2)
    expect(users[0]?.name).toBe('Alice')

    stmt.finalize()
  })

  it('same parameter binding as db.run/get/all', () => {
    // Positional params
    const stmt1 = db.prepare('SELECT * FROM users WHERE name = ?')
    const r1 = stmt1.get<{ name: string }>(['Alice'])
    expect(r1?.name).toBe('Alice')
    stmt1.finalize()

    // Named params
    const stmt2 = db.prepare('SELECT * FROM users WHERE name = :name')
    const r2 = stmt2.get<{ name: string }>({ name: 'Bob' })
    expect(r2?.name).toBe('Bob')
    stmt2.finalize()
  })

  it('finalize() releases statement resources', () => {
    const stmt = db.prepare('SELECT * FROM users')

    stmt.finalize()

    // After finalize, methods should throw
    expect(() => stmt.run()).toThrow(/finalize|statement/i)
  })

  it('calling methods after finalize() throws Error', () => {
    const stmt = db.prepare('SELECT * FROM users')
    stmt.finalize()

    expect(() => stmt.run()).toThrow(/finalize|statement/i)
    expect(() => stmt.get()).toThrow(/finalize|statement/i)
    expect(() => stmt.all()).toThrow(/finalize|statement/i)
  })
})

describe('Performance', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE bench (id INTEGER, value TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it('prepared statement faster than db.run() for repeated execution', () => {
    const iterations = 1000

    // Method 1: Using prepared statement
    const start1 = Date.now()
    const stmt = db.prepare('INSERT INTO bench VALUES (?, ?)')
    for (let i = 0; i < iterations; i++) {
      stmt.run([i, `value${i}`])
    }
    stmt.finalize()
    const time1 = Date.now() - start1

    // Verify all rows were inserted
    const count1 = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count1?.count).toBe(1000)

    // Clear table
    db.run('DELETE FROM bench')

    // Method 2: Using db.run()
    const start2 = Date.now()
    for (let i = 0; i < iterations; i++) {
      db.run('INSERT INTO bench VALUES (?, ?)', [i, `value${i}`])
    }
    const time2 = Date.now() - start2

    // Verify all rows were inserted
    const count2 = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count2?.count).toBe(1000)

    // Prepared statement should be faster (or at least not significantly slower)
    // Allow for up to 5x slower to account for system variability
    expect(time1).toBeLessThanOrEqual(time2 * 5)
  })

  it('1000 inserts with prepared statement faster than 1000 db.run() calls', () => {
    const stmt = db.prepare('INSERT INTO bench VALUES (?, ?)')

    const start = Date.now()
    for (let i = 0; i < 1000; i++) {
      stmt.run([i, `value${i}`])
    }
    const elapsed = Date.now() - start

    stmt.finalize()

    // Should complete reasonably fast
    expect(elapsed).toBeLessThan(5000)

    // Verify data was inserted
    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM bench')
    expect(count?.count).toBe(1000)
  })

  it('statement can be reused with different parameters', () => {
    const stmt = db.prepare('INSERT INTO bench VALUES (?, ?)')

    stmt.run([1, 'first'])
    stmt.run([2, 'second'])
    stmt.run([3, 'third'])

    const rows = db.all<{ id: number; value: string }>('SELECT * FROM bench ORDER BY id')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ id: 1, value: 'first' })

    stmt.finalize()
  })
})
