import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('Closed Database Behavior', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
    db.run('INSERT INTO test (id, value) VALUES (1, "test")')
    // Close the database
    db.close()
  })

  it("run() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.run('INSERT INTO test VALUES (2, "test2")')
    }).toThrow('Database is closed')
  })

  it("get() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.get('SELECT * FROM test WHERE id = 1')
    }).toThrow('Database is closed')
  })

  it("all() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.all('SELECT * FROM test')
    }).toThrow('Database is closed')
  })

  it("exec() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.exec('SELECT 1')
    }).toThrow('Database is closed')
  })

  it("transaction() on closed database throws Error('Database is closed')", async () => {
    await expect(async () => {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (2, "test2")')
      })
    }).rejects.toThrow('Database is closed')
  })

  it("migrate() on closed database throws Error('Database is closed')", async () => {
    await expect(async () => {
      await db.migrate([{ version: 1, up: 'CREATE TABLE test2 (id INTEGER)' }])
    }).rejects.toThrow('Database is closed')
  })

  it("export() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.export()
    }).toThrow('Database is closed')
  })

  it("import() on closed database throws Error('Database is closed')", () => {
    const data = new Uint8Array(100)
    expect(() => {
      db.import(data)
    }).toThrow('Database is closed')
  })

  it("table() on closed database throws Error('Database is closed')", () => {
    expect(() => {
      db.table('test')
    }).toThrow('Database is closed')
  })

  it("save() on closed database throws Error('Database is closed')", async () => {
    await expect(async () => {
      await db.save()
    }).rejects.toThrow('Database is closed')
  })

  it('close() on closed database is no-op (no error)', () => {
    // Database is already closed in beforeEach
    expect(() => {
      db.close()
    }).not.toThrow()

    // Can call multiple times
    expect(() => {
      db.close()
    }).not.toThrow()
  })

  it('error is thrown synchronously, not via rejection', () => {
    // Synchronous methods should throw immediately
    expect(() => db.run('SELECT 1')).toThrow('Database is closed')
    expect(() => db.get('SELECT 1')).toThrow('Database is closed')
    expect(() => db.all('SELECT 1')).toThrow('Database is closed')
    expect(() => db.exec('SELECT 1')).toThrow('Database is closed')
    expect(() => db.export()).toThrow('Database is closed')
    expect(() => db.table('test')).toThrow('Database is closed')

    // Not wrapped in a promise rejection
    try {
      db.run('SELECT 1')
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as Error).message).toBe('Database is closed')
    }
  })
})
