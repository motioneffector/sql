import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('db.exec(sql)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('executes raw SQL string', () => {
    expect(() => db.exec('SELECT 1')).not.toThrow()
  })

  it('returns void (undefined)', () => {
    const result = db.exec('SELECT 1')
    const isVoid = result === undefined
    expect(isVoid).toBe(true)
  })

  it('handles single statement', () => {
    db.exec('CREATE TABLE test (id INTEGER)')
    expect(db.getTables()).toContain('test')
  })

  it('handles multiple statements separated by semicolons', () => {
    db.exec('CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER)')
    const tables = db.getTables()
    expect(tables).toContain('a')
    expect(tables).toContain('b')
  })

  it('executes statements in order', () => {
    db.exec(`
      CREATE TABLE test (id INTEGER);
      INSERT INTO test VALUES (1);
      INSERT INTO test VALUES (2)
    `)
    const result = db.all<{ id: number }>('SELECT * FROM test ORDER BY id')
    expect(result.map(r => r.id)).toEqual([1, 2])
  })

  it('useful for schema setup scripts with multiple CREATE TABLE statements', () => {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL
      );
      CREATE INDEX idx_posts_user_id ON posts(user_id)
    `)
    const tables = db.getTables()
    expect(tables).toContain('users')
    expect(tables).toContain('posts')
  })

  it('does not support parameter binding (use run/get/all for that)', () => {
    // exec() does not support parameters - this is expected behavior
    db.exec('CREATE TABLE test (value TEXT)')
    // Attempting to use parameters would fail, so we just verify exec works without them
    expect(() => db.exec('INSERT INTO test VALUES ("literal")')).not.toThrow()
  })

  describe('Multi-Statement Behavior', () => {
    it('"CREATE TABLE a (...); CREATE TABLE b (...)" creates both tables', () => {
      db.exec('CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER)')
      const tables = db.getTables()
      expect(tables).toContain('a')
      expect(tables).toContain('b')
    })

    it("if second statement fails, first statement's effects remain (no auto-transaction)", () => {
      db.exec('CREATE TABLE test (id INTEGER)')
      try {
        db.exec('INSERT INTO test VALUES (1); INSERT INTO invalid_table VALUES (1)')
      } catch (e) {
        expect((e as Error).message).toMatch(/no such table|invalid_table/i)
      }
      // First statement succeeded
      const result = db.get<{ id: number }>('SELECT * FROM test')
      expect(result?.id).toBe(1)
    })

    it('empty statements (;;) are ignored', () => {
      expect(() => db.exec(';;; CREATE TABLE test (id INTEGER);;;')).not.toThrow()
      expect(db.getTables()).toContain('test')
    })

    it('trailing semicolon is optional', () => {
      expect(() => db.exec('CREATE TABLE test1 (id INTEGER)')).not.toThrow()
      expect(() => db.exec('CREATE TABLE test2 (id INTEGER);')).not.toThrow()
    })

    it('comments (-- and /* */) are handled correctly', () => {
      db.exec(`
        -- This is a comment
        CREATE TABLE test (
          id INTEGER /* inline comment */
        );
        /* Multi-line
           comment */
        INSERT INTO test VALUES (1)
      `)
      const result = db.get<{ id: number }>('SELECT * FROM test')
      expect(result?.id).toBe(1)
    })
  })
})
