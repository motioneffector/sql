import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import { SqlError } from './errors'
import type { Database } from './types'
import { USERS_SCHEMA } from './test-utils'

describe('db.run(sql, params?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  describe('Basic Operations', () => {
    it('executes INSERT statement and returns result object', () => {
      db.exec(USERS_SCHEMA)
      const result = db.run('INSERT INTO users (name, email) VALUES (?, ?)', [
        'Alice',
        'alice@example.com',
      ])
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowId).toBe(1)
    })

    it('executes UPDATE statement and returns result object', () => {
      db.exec(USERS_SCHEMA)
      db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
      const result = db.run('UPDATE users SET name = ? WHERE email = ?', [
        'Alicia',
        'alice@example.com',
      ])
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowId).toBe(0)
    })

    it('executes DELETE statement and returns result object', () => {
      db.exec(USERS_SCHEMA)
      db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
      const result = db.run('DELETE FROM users WHERE email = ?', ['alice@example.com'])
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowId).toBe(0)
    })

    it('executes CREATE TABLE statement and returns result object', () => {
      const result = db.run('CREATE TABLE test (id INTEGER PRIMARY KEY)')
      expect(result.changes).toBe(0)
      expect(result.lastInsertRowId).toBe(0)
    })

    it('executes DROP TABLE statement and returns result object', () => {
      db.run('CREATE TABLE test (id INTEGER)')
      const result = db.run('DROP TABLE test')
      expect(result.changes).toBe(0)
      expect(result.lastInsertRowId).toBe(0)
    })

    it('executes ALTER TABLE statement and returns result object', () => {
      db.run('CREATE TABLE test (id INTEGER)')
      const result = db.run('ALTER TABLE test ADD COLUMN name TEXT')
      expect(result.changes).toBe(0)
      expect(result.lastInsertRowId).toBe(0)
    })

    it('executes CREATE INDEX statement and returns result object', () => {
      db.exec(USERS_SCHEMA)
      const result = db.run('CREATE INDEX idx_users_email ON users(email)')
      expect(result.changes).toBe(0)
      expect(result.lastInsertRowId).toBe(0)
    })
  })

  describe('Return Value', () => {
    beforeEach(() => {
      db.exec(USERS_SCHEMA)
    })

    it('returns object with shape { changes: number, lastInsertRowId: number }', () => {
      const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowId).toBe(1)
    })

    it('changes equals number of rows affected by INSERT (1 for single insert)', () => {
      const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(result.changes).toBe(1)
    })

    it('changes equals number of rows affected by UPDATE', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      const result = db.run('UPDATE users SET age = ?', [30])
      expect(result.changes).toBe(2)
    })

    it('changes equals number of rows affected by DELETE', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
      const result = db.run('DELETE FROM users WHERE name LIKE ?', ['%li%'])
      expect(result.changes).toBe(2) // Alice and Charlie
    })

    it('changes equals 0 for DDL statements (CREATE, DROP, ALTER)', () => {
      const result = db.run('CREATE TABLE test (id INTEGER)')
      expect(result.changes).toBe(0)
    })

    it('lastInsertRowId equals rowid of last inserted row', () => {
      const result1 = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result2 = db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      expect(result2.lastInsertRowId).toBeGreaterThan(result1.lastInsertRowId)
    })

    it('lastInsertRowId equals 0 when no insert performed', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result = db.run('UPDATE users SET age = ?', [30])
      expect(result.lastInsertRowId).toBe(0)
    })

    it('lastInsertRowId reflects AUTOINCREMENT value for INTEGER PRIMARY KEY', () => {
      const result = db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      expect(result.lastInsertRowId).toBe(1)
      const result2 = db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      expect(result2.lastInsertRowId).toBe(2)
    })
  })

  describe('Parameterized Queries - Positional', () => {
    beforeEach(() => {
      db.exec(USERS_SCHEMA)
    })

    it('accepts positional parameters as array', () => {
      expect(() => {
        db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
      }).not.toThrow()
    })

    it('"INSERT INTO t (a, b) VALUES (?, ?)" with [1, "hello"] inserts correctly', () => {
      db.run('CREATE TABLE t (a INTEGER, b TEXT)')
      db.run('INSERT INTO t (a, b) VALUES (?, ?)', [1, 'hello'])
      const result = db.get<{ a: number; b: string }>('SELECT * FROM t')
      expect(result).toEqual({ a: 1, b: 'hello' })
    })

    it('"SELECT * FROM t WHERE a = ? AND b = ?" with [1, "hello"] binds correctly', () => {
      db.run('CREATE TABLE t (a INTEGER, b TEXT)')
      db.run('INSERT INTO t (a, b) VALUES (?, ?)', [1, 'hello'])
      db.run('INSERT INTO t (a, b) VALUES (?, ?)', [2, 'world'])
      const result = db.get<{ a: number; b: string }>('SELECT * FROM t WHERE a = ? AND b = ?', [1, 'hello'])
      expect(result).toBeDefined()
      expect(result?.a).toBe(1)
      expect(result?.b).toBe('hello')
    })

    it('parameters bind in order: first ? gets params[0], second ? gets params[1]', () => {
      db.run('CREATE TABLE t (a INTEGER, b INTEGER)')
      db.run('INSERT INTO t VALUES (?, ?)', [10, 20])
      const result = db.get<{ a: number; b: number }>('SELECT * FROM t WHERE a = ? AND b = ?', [
        10, 20,
      ])
      expect(result).toEqual({ a: 10, b: 20 })
    })

    it("throws SqlError if parameter count doesn't match placeholder count", () => {
      expect(() => {
        db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice'])
      }).toThrow(/column|parameter|mismatch/i)
    })

    it('empty array [] is valid for queries with no placeholders', () => {
      expect(() => {
        db.run('CREATE TABLE test (id INTEGER)', [])
      }).not.toThrow()
    })

    it('undefined params argument treated as empty array', () => {
      expect(() => {
        db.run('CREATE TABLE test2 (id INTEGER)')
      }).not.toThrow()
    })
  })

  describe('Parameterized Queries - Named', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE t (a TEXT, b INTEGER)')
    })

    it('accepts named parameters as object', () => {
      expect(() => {
        db.run('INSERT INTO t (a) VALUES (:name)', { name: 'hello' })
      }).not.toThrow()
    })

    it('"INSERT INTO t (a) VALUES (:name)" with { name: "hello" } inserts correctly', () => {
      db.run('INSERT INTO t (a) VALUES (:name)', { name: 'hello' })
      const result = db.get<{ a: string }>('SELECT * FROM t')
      expect(result?.a).toBe('hello')
    })

    it('"INSERT INTO t (a) VALUES ($name)" with { name: "hello" } inserts correctly ($ prefix)', () => {
      db.run('INSERT INTO t (a) VALUES ($name)', { name: 'hello' })
      const result = db.get<{ a: string }>('SELECT * FROM t')
      expect(result?.a).toBe('hello')
    })

    it('"INSERT INTO t (a) VALUES (@name)" with { name: "hello" } inserts correctly (@ prefix)', () => {
      db.run('INSERT INTO t (a) VALUES (@name)', { name: 'hello' })
      const result = db.get<{ a: string }>('SELECT * FROM t')
      expect(result?.a).toBe('hello')
    })

    it('named parameters can be used multiple times: "WHERE a = :x OR b = :x"', () => {
      db.run('INSERT INTO t (a, b) VALUES (?, ?)', ['test', 42])
      const result1 = db.get<{ a: string }>('SELECT * FROM t WHERE a = :x OR b = :x', { x: 'test' })
      expect(result1?.a).toBe('test')
      const result2 = db.get<{ b: number }>('SELECT * FROM t WHERE a = :x OR b = :x', { x: 42 })
      expect(result2?.b).toBe(42)
    })

    it('throws SqlError if named parameter not provided in object', () => {
      expect(() => {
        db.run('INSERT INTO t (a) VALUES (:name)', {})
      }).toThrow(/name|parameter/i)
    })

    it('extra properties in params object are ignored (no error)', () => {
      expect(() => {
        db.run('INSERT INTO t (a) VALUES (:name)', { name: 'hello', extra: 'ignored' })
      }).not.toThrow()
    })
  })

  describe('Parameter Type Handling', () => {
    beforeEach(() => {
      db.run('CREATE TABLE t (value TEXT)')
    })

    it('null parameter binds as SQL NULL', () => {
      db.run('INSERT INTO t VALUES (?)', [null])
      const result = db.get<{ value: null }>('SELECT * FROM t')
      expect(result).toMatchObject({ value: null })
    })

    it('undefined parameter binds as SQL NULL', () => {
      db.run('INSERT INTO t VALUES (?)', [undefined])
      const result = db.get<{ value: null }>('SELECT * FROM t')
      expect(result).toMatchObject({ value: null })
    })

    it('number parameter (integer) binds as INTEGER', () => {
      db.run('CREATE TABLE nums (value INTEGER)')
      db.run('INSERT INTO nums VALUES (?)', [42])
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBe(42)
    })

    it('number parameter (float) binds as REAL', () => {
      db.run('CREATE TABLE nums (value REAL)')
      db.run('INSERT INTO nums VALUES (?)', [3.14])
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBeCloseTo(3.14)
    })

    it('string parameter binds as TEXT', () => {
      db.run('INSERT INTO t VALUES (?)', ['hello world'])
      const result = db.get<{ value: string }>('SELECT * FROM t')
      expect(result?.value).toBe('hello world')
    })

    it('boolean true binds as INTEGER 1', () => {
      db.run('CREATE TABLE bools (value INTEGER)')
      db.run('INSERT INTO bools VALUES (?)', [true])
      const result = db.get<{ value: number }>('SELECT * FROM bools')
      expect(result?.value).toBe(1)
    })

    it('boolean false binds as INTEGER 0', () => {
      db.run('CREATE TABLE bools (value INTEGER)')
      db.run('INSERT INTO bools VALUES (?)', [false])
      const result = db.get<{ value: number }>('SELECT * FROM bools')
      expect(result?.value).toBe(0)
    })

    it("Date parameter binds as TEXT in ISO 8601 format: '2024-01-15T10:30:00.000Z'", () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      db.run('INSERT INTO t VALUES (?)', [date])
      const result = db.get<{ value: string }>('SELECT * FROM t')
      expect(result?.value).toBe('2024-01-15T10:30:00.000Z')
    })

    it('Date uses toISOString() for conversion', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      db.run('INSERT INTO t VALUES (?)', [date])
      const result = db.get<{ value: string }>('SELECT * FROM t')
      expect(result?.value).toBe(date.toISOString())
    })

    it('Uint8Array parameter binds as BLOB', () => {
      db.run('CREATE TABLE blobs (value BLOB)')
      const data = new Uint8Array([1, 2, 3, 4])
      db.run('INSERT INTO blobs VALUES (?)', [data])
      const result = db.get<{ value: Uint8Array }>('SELECT * FROM blobs')
      expect(result?.value).toEqual(data)
    })

    it('ArrayBuffer parameter binds as BLOB (converted to Uint8Array)', () => {
      db.run('CREATE TABLE blobs (value BLOB)')
      const buffer = new ArrayBuffer(4)
      const view = new Uint8Array(buffer)
      view.set([1, 2, 3, 4])
      db.run('INSERT INTO blobs VALUES (?)', [buffer])
      const result = db.get<{ value: Uint8Array }>('SELECT * FROM blobs')
      expect(result?.value).toEqual(new Uint8Array([1, 2, 3, 4]))
    })

    it('BigInt parameter binds as TEXT (SQLite INTEGER max is 2^63-1)', () => {
      const bigNum = BigInt('9223372036854775807')
      db.run('INSERT INTO t VALUES (?)', [bigNum])
      const result = db.get<{ value: string }>('SELECT * FROM t')
      expect(result?.value).toBe('9223372036854775807')
    })

    it('throws TypeError for unsupported parameter types (object, array, function)', () => {
      expect(() => db.run('INSERT INTO t VALUES (?)', [{}])).toThrow(/unsupported|type/i)
      expect(() => db.run('INSERT INTO t VALUES (?)', [[1, 2, 3]])).toThrow(/unsupported|type/i)
      expect(() => db.run('INSERT INTO t VALUES (?)', [() => {}])).toThrow(/unsupported|type/i)
    })
  })

  describe('SQL Injection Prevention', () => {
    beforeEach(() => {
      db.exec(USERS_SCHEMA)
    })

    it('string parameter with single quote: "O\'Brien" is escaped correctly', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ["O'Brien"])
      const result = db.get<{ name: string }>('SELECT name FROM users')
      expect(result?.name).toBe("O'Brien")
    })

    it('string parameter with double quote: \'say "hello"\' is escaped correctly', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['say "hello"'])
      const result = db.get<{ name: string }>('SELECT name FROM users')
      expect(result?.name).toBe('say "hello"')
    })

    it('string parameter with semicolon: "a; DROP TABLE users;--" treated as literal string', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['a; DROP TABLE users;--'])
      const result = db.get<{ name: string }>('SELECT name FROM users')
      expect(result?.name).toBe('a; DROP TABLE users;--')
      expect(db.getTables()).toContain('users')
    })

    it('string parameter with SQL keywords: "SELECT * FROM" treated as literal string', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['SELECT * FROM'])
      const result = db.get<{ name: string }>('SELECT name FROM users')
      expect(result?.name).toBe('SELECT * FROM')
    })

    it('parameters never interpreted as SQL, only as values', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
      db.run('INSERT INTO users (name) VALUES (?)', ["1 OR 1=1; DELETE FROM users WHERE '1'='1"])
      const allUsers = db.all<{ name: string }>('SELECT * FROM users')
      expect(allUsers).toHaveLength(3)
      expect(allUsers[0]?.name).toBe('Alice')
    })
  })
})

describe('db.get<T>(sql, params?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(USERS_SCHEMA)
  })

  afterEach(() => {
    db.close()
  })

  it('returns first row as plain object', () => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
    const result = db.get<{ name: string }>('SELECT * FROM users')
    expect(result?.name).toBe('Alice')
  })

  it('returns undefined if query matches no rows', () => {
    const result = db.get('SELECT * FROM users WHERE id = ?', [999])
    const isAbsent = result === undefined
    expect(isAbsent).toBe(true)
  })

  it('returns undefined for SELECT on empty table', () => {
    const result = db.get('SELECT * FROM users')
    const isAbsent = result === undefined
    expect(isAbsent).toBe(true)
  })

  it('column names become object property keys', () => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
    const result = db.get<{ name: string; email: string }>('SELECT name, email FROM users')
    expect(result?.name).toBe('Alice')
    expect(result?.email).toBe('alice@example.com')
  })

  it('handles single column: { name: "Alice" }', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    const result = db.get<{ name: string }>('SELECT name FROM users')
    expect(result).toEqual({ name: 'Alice' })
  })

  it('handles multiple columns: { id: 1, name: "Alice", email: "a@b.com" }', () => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'a@b.com'])
    const result = db.get<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM users'
    )
    expect(result).toMatchObject({ id: 1, name: 'Alice', email: 'a@b.com' })
  })

  it('column name aliases work: "SELECT name AS userName" returns { userName: "Alice" }', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    const result = db.get<{ userName: string }>('SELECT name AS userName FROM users')
    expect(result).toEqual({ userName: 'Alice' })
  })

  it('only returns first row even if query matches multiple rows', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
    const result = db.get<{ id: number }>('SELECT * FROM users')
    expect(result?.id).toBe(1)
  })

  it('respects ORDER BY when determining first row', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
    const result = db.get<{ name: string }>('SELECT * FROM users ORDER BY name')
    expect(result?.name).toBe('Alice')
  })

  it('accepts same parameter formats as run() (positional and named)', () => {
    db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
    const result1 = db.get<{ name: string }>('SELECT * FROM users WHERE name = ?', ['Alice'])
    expect(result1?.name).toBe('Alice')
    const result2 = db.get<{ name: string }>('SELECT * FROM users WHERE name = :name', { name: 'Alice' })
    expect(result2?.name).toBe('Alice')
  })

  describe('Type Coercion on Read', () => {
    it('INTEGER column returns JavaScript number', () => {
      db.run('CREATE TABLE nums (value INTEGER)')
      db.run('INSERT INTO nums VALUES (42)')
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBe(42)
    })

    it('REAL column returns JavaScript number', () => {
      db.run('CREATE TABLE nums (value REAL)')
      db.run('INSERT INTO nums VALUES (3.14)')
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBeCloseTo(3.14)
    })

    it('TEXT column returns JavaScript string', () => {
      db.run('CREATE TABLE texts (value TEXT)')
      db.run('INSERT INTO texts VALUES ("hello")')
      const result = db.get<{ value: string }>('SELECT * FROM texts')
      expect(result?.value).toBe('hello')
    })

    it('BLOB column returns Uint8Array', () => {
      db.run('CREATE TABLE blobs (value BLOB)')
      const data = new Uint8Array([1, 2, 3])
      db.run('INSERT INTO blobs VALUES (?)', [data])
      const result = db.get<{ value: Uint8Array }>('SELECT * FROM blobs')
      expect(result?.value).toBeInstanceOf(Uint8Array)
    })

    it('NULL value returns JavaScript null', () => {
      db.run('CREATE TABLE nulls (value TEXT)')
      db.run('INSERT INTO nulls VALUES (NULL)')
      const result = db.get<{ value: null }>('SELECT * FROM nulls')
      expect(result).toMatchObject({ value: null })
    })

    it('INTEGER 0 returns number 0, not false', () => {
      db.run('CREATE TABLE nums (value INTEGER)')
      db.run('INSERT INTO nums VALUES (0)')
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBe(0)
      expect(result?.value).not.toBe(false)
    })

    it('INTEGER 1 returns number 1, not true', () => {
      db.run('CREATE TABLE nums (value INTEGER)')
      db.run('INSERT INTO nums VALUES (1)')
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBe(1)
      expect(result?.value).not.toBe(true)
    })

    it("empty TEXT '' returns empty string, not null", () => {
      db.run('CREATE TABLE texts (value TEXT)')
      db.run('INSERT INTO texts VALUES ("")')
      const result = db.get<{ value: string }>('SELECT * FROM texts')
      expect(result?.value).toBe('')
    })

    it('NUMERIC column returns number if value is numeric', () => {
      db.run('CREATE TABLE nums (value NUMERIC)')
      db.run('INSERT INTO nums VALUES (123.45)')
      const result = db.get<{ value: number }>('SELECT * FROM nums')
      expect(result?.value).toBeCloseTo(123.45)
    })

    it('column with no type affinity returns value based on stored type', () => {
      db.run('CREATE TABLE flexible (value)')
      db.run('INSERT INTO flexible VALUES (42)')
      const result = db.get<{ value: number }>('SELECT * FROM flexible')
      expect(result?.value).toBe(42)
    })
  })

  describe('TypeScript Generic', () => {
    it('return type is T | undefined where T is the generic parameter', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result = db.get<{ name: string }>('SELECT name FROM users')
      expect(result?.name).toBe('Alice')
    })

    it('no runtime validation of T (type assertion only)', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      // Type says it's boolean, but runtime returns string - no validation happens
      const result = db.get<{ wrongType: boolean }>('SELECT name FROM users')
      // Verify the actual data is still a string, proving no runtime type checking occurred
      expect((result as any).name).toBe('Alice')
    })

    it('works with interface types: db.get<User>(...)', () => {
      interface User {
        name: string
        email: string | null
      }
      db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
      const result: User | undefined = db.get<User>('SELECT name, email FROM users')
      expect(result?.name).toBe('Alice')
    })

    it('works with type aliases: db.get<{ id: number }> (...)', () => {
      type IdOnly = { id: number }
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result: IdOnly | undefined = db.get<IdOnly>('SELECT id FROM users')
      expect(result?.id).toBe(1)
    })
  })
})

describe('db.all<T>(sql, params?)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(USERS_SCHEMA)
  })

  afterEach(() => {
    db.close()
  })

  it('returns array of row objects', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
    const result = db.all<{ name: string }>('SELECT * FROM users')
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('Alice')
  })

  it('returns empty array [] if query matches no rows', () => {
    const result = db.all('SELECT * FROM users WHERE id = ?', [999])
    expect(result.every(() => false)).toBe(true)
  })

  it('returns empty array [] for SELECT on empty table', () => {
    const result = db.all('SELECT * FROM users')
    expect(result.every(() => false)).toBe(true)
  })

  it('returns all matching rows, not just first', () => {
    for (let i = 1; i <= 5; i++) {
      db.run('INSERT INTO users (name) VALUES (?)', [`User${i}`])
    }
    const result = db.all<{ name: string }>('SELECT * FROM users')
    expect(result).toHaveLength(5)
    expect(result[0]?.name).toBe('User1')
  })

  it('rows are in order returned by query (respects ORDER BY)', () => {
    db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
    const result = db.all<{ name: string }>('SELECT name FROM users ORDER BY name')
    expect(result.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('each row is a plain object with column names as keys', () => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])
    const result = db.all<{ name: string; email: string }>('SELECT name, email FROM users')
    expect(result[0]?.name).toBe('Alice')
    expect(result[0]?.email).toBe('alice@example.com')
  })

  it('accepts same parameter formats as run() (positional and named)', () => {
    db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
    db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25])
    const result1 = db.all<{ name: string }>('SELECT * FROM users WHERE age > ?', [20])
    expect(result1).toHaveLength(2)
    expect(result1[0]?.name).toBe('Alice')
    const result2 = db.all<{ name: string }>('SELECT * FROM users WHERE age > :minAge', { minAge: 20 })
    expect(result2).toHaveLength(2)
    expect(result2[0]?.name).toBe('Alice')
  })

  it('same type coercion rules as get()', () => {
    db.run('CREATE TABLE mixed (int_val INTEGER, text_val TEXT, null_val TEXT)')
    db.run('INSERT INTO mixed VALUES (42, "hello", NULL)')
    const result = db.all<{ int_val: number; text_val: string; null_val: null }>(
      'SELECT * FROM mixed'
    )
    expect(result[0]?.int_val).toBe(42)
    expect(result[0]?.text_val).toBe('hello')
    expect(result[0]).toMatchObject({ null_val: null })
  })

  describe('Large Result Sets', () => {
    it('handles result set with 1000 rows', () => {
      for (let i = 0; i < 1000; i++) {
        db.run('INSERT INTO users (name) VALUES (?)', [`User${i}`])
      }
      const result = db.all<{ name: string }>('SELECT * FROM users')
      expect(result).toHaveLength(1000)
      expect(result[0]?.name).toBe('User0')
    })

    it('handles result set with 10000 rows', () => {
      for (let i = 0; i < 10000; i++) {
        db.run('INSERT INTO users (name) VALUES (?)', [`User${i}`])
      }
      const result = db.all<{ name: string }>('SELECT * FROM users')
      expect(result).toHaveLength(10000)
      expect(result[0]?.name).toBe('User0')
    })

    it('handles result set with 100000 rows (may be slow, but doesn\'t crash)', () => {
      // This test might be slow, but should not crash
      for (let i = 0; i < 100000; i++) {
        db.run('INSERT INTO users (name) VALUES (?)', [`User${i}`])
      }
      const result = db.all<{ name: string }>('SELECT * FROM users')
      expect(result).toHaveLength(100000)
      expect(result[0]?.name).toBe('User0')
    }, 60000) // 60 second timeout

    it('memory is released after result is returned (no leaks on repeated queries)', () => {
      for (let i = 0; i < 1000; i++) {
        db.run('INSERT INTO users (name) VALUES (?)', [`User${i}`])
      }
      // Run query multiple times
      for (let i = 0; i < 10; i++) {
        const result = db.all<{ name: string }>('SELECT * FROM users')
        expect(result).toHaveLength(1000)
        expect(result[0]?.name).toBe('User0')
      }
      // If there were memory leaks, this would likely crash or hang
    })
  })

  describe('TypeScript Generic', () => {
    it('return type is T[] where T is the generic parameter', () => {
      db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
      const result = db.all<{ name: string }>('SELECT name FROM users')
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Alice')
    })

    it('empty result returns T[] (empty array), not undefined', () => {
      const result = db.all<{ name: string }>('SELECT name FROM users')
      expect(result.every(() => false)).toBe(true)
    })
  })
})

describe('Security: Prototype pollution in named parameters', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER
      )
    `)
    db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30])
  })

  afterEach(() => {
    db.close()
  })

  it('rejects constructor as parameter name in run()', () => {
    expect(() => {
      db.run('INSERT INTO users (name) VALUES (:name)', { name: 'Bob', constructor: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('rejects prototype as parameter name in run()', () => {
    expect(() => {
      db.run('INSERT INTO users (name) VALUES (:name)', { name: 'Bob', prototype: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('rejects constructor as parameter name in get()', () => {
    expect(() => {
      db.get('SELECT * FROM users WHERE name = :name', { name: 'Alice', constructor: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('rejects prototype as parameter name in get()', () => {
    expect(() => {
      db.get('SELECT * FROM users WHERE name = :name', { name: 'Alice', prototype: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('rejects constructor as parameter name in all()', () => {
    expect(() => {
      db.all('SELECT * FROM users WHERE age > :age', { age: 20, constructor: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('rejects prototype as parameter name in all()', () => {
    expect(() => {
      db.all('SELECT * FROM users WHERE age > :age', { age: 20, prototype: 'polluted' } as any)
    }).toThrow(/not allowed/)
  })

  it('does not pollute Object.prototype after query with object params', () => {
    // Execute a query with named parameters
    db.run('INSERT INTO users (name, age) VALUES (:name, :age)', { name: 'Bob', age: 25 })

    // Verify Object.prototype was not polluted
    const hasPolluted = 'polluted' in ({} as any)
    expect(hasPolluted).toBe(false)
    const hasProtoPolluted = 'polluted' in (({} as any).__proto__)
    expect(hasProtoPolluted).toBe(false)
  })

  it('accepts legitimate parameter names that are not dangerous', () => {
    // These should work fine
    db.run('INSERT INTO users (name, age) VALUES (:name, :age)', { name: 'Bob', age: 25 })
    const user = db.get('SELECT * FROM users WHERE name = :name', { name: 'Bob' })
    expect(user).toMatchObject({ name: 'Bob', age: 25 })
  })
})
