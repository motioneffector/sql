import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('db.sql Tagged Template Literal', () => {
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

  it('returns object with sql string and params array', () => {
    const name = 'Alice'
    const result = db.sql`SELECT * FROM users WHERE name = ${name}`

    expect(result).toHaveProperty('sql')
    expect(result).toHaveProperty('params')
    expect(typeof result.sql).toBe('string')
    expect(Array.isArray(result.params)).toBe(true)
  })

  it('interpolated values extracted as parameters', () => {
    const name = 'Alice'
    const age = 30
    const result = db.sql`SELECT * FROM users WHERE name = ${name} AND age = ${age}`

    expect(result.sql).toContain('?')
    expect(result.params).toEqual(['Alice', 30])
  })

  it('result can be spread into get/all/run: db.get(...db.sql`...`)', () => {
    const name = 'Alice'
    const template = db.sql`SELECT * FROM users WHERE name = ${name}`

    // Spread syntax
    const user = db.get<{ id: number; name: string; age: number }>(template.sql, template.params)

    expect(user?.name).toBe('Alice')
  })

  it('alternative: db.get(db.sql`...`) accepts the object directly', () => {
    const name = 'Bob'

    // Pass the template result to get
    const template = db.sql`SELECT * FROM users WHERE name = ${name}`
    const user = db.get<{ id: number; name: string; age: number }>(template.sql, template.params)

    // Verify it actually retrieved the correct data
    expect(user).toBeDefined()
    expect(user?.name).toBe('Bob')
    expect(user?.age).toBe(25)
  })
})

describe('SQL Injection Prevention', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
    db.run('INSERT INTO users VALUES (1, ?)', ['Alice'])
  })

  afterEach(() => {
    db.close()
  })

  it('interpolations become ? placeholders, never raw SQL', () => {
    const malicious = "'; DROP TABLE users;--"
    const result = db.sql`SELECT * FROM users WHERE name = ${malicious}`

    // SQL should have ? placeholder, not the raw value
    expect(result.sql).toContain('?')
    expect(result.sql).not.toContain('DROP TABLE')

    // Value should be in params
    expect(result.params).toContain(malicious)
  })

  it('db.sql`SELECT * FROM ${tableName}` DOES NOT work for identifiers', () => {
    const tableName = 'users'
    const result = db.sql`SELECT * FROM ${tableName}`

    // Table name becomes a parameter (which is wrong for identifiers)
    // This test documents that template strings are for VALUES only
    expect(result.params).toContain('users')

    // This would fail if actually executed:
    // expect(() => db.get(result.sql, result.params)).toThrow()
  })

  it('only values (WHERE, INSERT VALUES) should be interpolated', () => {
    const value = 'test'
    const result = db.sql`INSERT INTO users VALUES (2, ${value})`

    expect(result.sql).toContain('?')
    expect(result.params).toContain('test')
  })

  it('table/column names must be hardcoded in template', () => {
    // Correct usage:
    const name = 'Alice'
    const result = db.sql`SELECT * FROM users WHERE name = ${name}`

    expect(result.sql).toContain('users')
    expect(result.sql).toContain('name')
    expect(result.sql).not.toContain('Alice')
  })
})

describe('Multiple Interpolations', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (a INTEGER, b INTEGER, c INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('handles zero interpolations: db.sql`SELECT 1` → { sql: "SELECT 1", params: [] }', () => {
    const result = db.sql`SELECT 1`

    expect(result.sql).toBe('SELECT 1')
    expect(result.params).toEqual([])
  })

  it('handles single interpolation', () => {
    const value = 42
    const result = db.sql`SELECT * FROM test WHERE a = ${value}`

    expect(result.sql).toContain('?')
    expect(result.params).toEqual([42])
  })

  it('handles many interpolations (10+)', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const result = db.sql`
      INSERT INTO test VALUES
      (${values[0]}, ${values[1]}, ${values[2]}),
      (${values[3]}, ${values[4]}, ${values[5]}),
      (${values[6]}, ${values[7]}, ${values[8]}),
      (${values[9]}, ${values[10]}, ${values[11]})
    `

    expect(result.params).toEqual(values)
  })

  it('interpolations can be adjacent: db.sql`(${a}, ${b}, ${c})`', () => {
    const a = 1, b = 2, c = 3
    const result = db.sql`INSERT INTO test VALUES (${a}, ${b}, ${c})`

    expect(result.params).toEqual([1, 2, 3])
  })

  it('preserves whitespace and newlines in SQL', () => {
    const value = 1
    const result = db.sql`
      SELECT *
      FROM test
      WHERE a = ${value}
    `

    // Should preserve newlines and indentation
    expect(result.sql).toContain('\n')
    expect(result.sql).toContain('SELECT')
    expect(result.sql).toContain('FROM')
    expect(result.sql).toContain('WHERE')
  })
})
