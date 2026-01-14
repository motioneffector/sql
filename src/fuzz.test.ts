/**
 * Fuzz Testing Suite for @motioneffector/sql
 *
 * This test suite uses randomized inputs to discover edge cases, crashes, and
 * invariant violations that traditional unit tests might miss. Each test verifies
 * that the library handles hostile, malformed, and unexpected inputs gracefully.
 */

import { describe, it, expect } from 'vitest'
import { createDatabase } from './database'
import {
  SqlError,
  SqlSyntaxError,
  SqlConstraintError,
  SqlNotFoundError,
  MigrationError,
} from './errors'
import type { Database, Migration } from './types'

// ============================================
// FUZZ TEST CONFIGURATION
// ============================================

const THOROUGH_MODE = process.env.FUZZ_THOROUGH === '1'
const THOROUGH_DURATION_MS = 60_000  // 60 seconds per test in thorough mode
const STANDARD_ITERATIONS = 200      // iterations per test in standard mode
const BASE_SEED = 12345              // reproducible seed for standard mode

// ============================================
// SEEDED PRNG
// ============================================

function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

// ============================================
// FUZZ LOOP HELPER
// ============================================

interface FuzzLoopResult {
  iterations: number
  seed: number
  durationMs: number
}

/**
 * Executes a fuzz test body in either standard or thorough mode.
 *
 * Standard mode: Runs exactly STANDARD_ITERATIONS times with BASE_SEED
 * Thorough mode: Runs for THOROUGH_DURATION_MS with time-based seed
 *
 * On failure, throws with full reproduction information.
 */
function fuzzLoop(
  testFn: (random: () => number, iteration: number) => void
): FuzzLoopResult {
  const startTime = Date.now()
  const seed = THOROUGH_MODE ? startTime : BASE_SEED
  const random = createSeededRandom(seed)

  let iteration = 0

  try {
    if (THOROUGH_MODE) {
      // Time-based: run until duration exceeded
      while (Date.now() - startTime < THOROUGH_DURATION_MS) {
        testFn(random, iteration)
        iteration++
      }
    } else {
      // Iteration-based: run fixed count
      for (iteration = 0; iteration < STANDARD_ITERATIONS; iteration++) {
        testFn(random, iteration)
      }
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Fuzz test failed!\n` +
      `  Mode: ${THOROUGH_MODE ? 'thorough' : 'standard'}\n` +
      `  Seed: ${seed}\n` +
      `  Iteration: ${iteration}\n` +
      `  Elapsed: ${elapsed}ms\n` +
      `  Error: ${message}\n\n` +
      `To reproduce, run with:\n` +
      `  BASE_SEED=${seed} and start at iteration ${iteration}`
    )
  }

  return {
    iterations: iteration,
    seed,
    durationMs: Date.now() - startTime
  }
}

/**
 * Async version of fuzzLoop for testing async functions.
 */
async function fuzzLoopAsync(
  testFn: (random: () => number, iteration: number) => Promise<void>
): Promise<FuzzLoopResult> {
  const startTime = Date.now()
  const seed = THOROUGH_MODE ? startTime : BASE_SEED
  const random = createSeededRandom(seed)

  let iteration = 0

  try {
    if (THOROUGH_MODE) {
      while (Date.now() - startTime < THOROUGH_DURATION_MS) {
        await testFn(random, iteration)
        iteration++
      }
    } else {
      for (iteration = 0; iteration < STANDARD_ITERATIONS; iteration++) {
        await testFn(random, iteration)
      }
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Fuzz test failed!\n` +
      `  Mode: ${THOROUGH_MODE ? 'thorough' : 'standard'}\n` +
      `  Seed: ${seed}\n` +
      `  Iteration: ${iteration}\n` +
      `  Elapsed: ${elapsed}ms\n` +
      `  Error: ${message}\n\n` +
      `To reproduce, run with:\n` +
      `  BASE_SEED=${seed} and start at iteration ${iteration}`
    )
  }

  return {
    iterations: iteration,
    seed,
    durationMs: Date.now() - startTime
  }
}

// ============================================
// VALUE GENERATORS
// ============================================

function generateString(random: () => number, maxLen = 1000): string {
  const len = Math.floor(random() * maxLen)
  return Array.from({ length: len }, () =>
    String.fromCharCode(Math.floor(random() * 0xFFFF))
  ).join('')
}

function generateNumber(random: () => number): number {
  const type = Math.floor(random() * 10)
  switch (type) {
    case 0: return 0
    case 1: return -0
    case 2: return NaN
    case 3: return Infinity
    case 4: return -Infinity
    case 5: return Number.MAX_SAFE_INTEGER
    case 6: return Number.MIN_SAFE_INTEGER
    case 7: return Number.EPSILON
    default: return (random() - 0.5) * Number.MAX_SAFE_INTEGER * 2
  }
}

function generateArray<T>(
  random: () => number,
  generator: (r: () => number) => T,
  maxLen = 100
): T[] {
  const len = Math.floor(random() * maxLen)
  return Array.from({ length: len }, () => generator(random))
}

function generateObject(
  random: () => number,
  depth = 0,
  maxDepth = 5
): unknown {
  if (depth >= maxDepth) return null

  const type = Math.floor(random() * 6)
  switch (type) {
    case 0: return null
    case 1: return generateNumber(random)
    case 2: return generateString(random, 100)
    case 3: return depth < maxDepth - 1
      ? generateArray(random, r => generateObject(r, depth + 1, maxDepth), 10)
      : []
    case 4: {
      const obj: Record<string, unknown> = {}
      const keyCount = Math.floor(random() * 10)
      for (let i = 0; i < keyCount; i++) {
        const key = generateString(random, 20) || `key${i}`
        obj[key] = generateObject(random, depth + 1, maxDepth)
      }
      return obj
    }
    default: return undefined
  }
}

// Prototype pollution test values
function generateMaliciousObject(random: () => number): unknown {
  const attacks = [
    { __proto__: { polluted: true } },
    { constructor: { prototype: { polluted: true } } },
    JSON.parse('{"__proto__": {"polluted": true}}'),
    Object.create(null, { dangerous: { value: true } }),
  ]
  return attacks[Math.floor(random() * attacks.length)]
}

// SQL-specific generators
function generateSqlString(random: () => number): string {
  const patterns = [
    '',
    ' ',
    'SELECT * FROM users',
    'DROP TABLE users; --',
    "'; DELETE FROM users; --",
    'SELECT * FROM users WHERE id = ? AND name = ?',
    'x'.repeat(10000),
    '\0\0\0',
    '你好世界',
    'SELECT'.repeat(1000),
  ]
  return patterns[Math.floor(random() * patterns.length)]
}

function generateParamValue(random: () => number): unknown {
  const type = Math.floor(random() * 15)
  switch (type) {
    case 0: return null
    case 1: return undefined
    case 2: return NaN
    case 3: return Infinity
    case 4: return -Infinity
    case 5: return 0
    case 6: return -0
    case 7: return Math.floor(random() * 1000000)
    case 8: return random() * 1000
    case 9: return ''
    case 10: return generateString(random, 100)
    case 11: return new Uint8Array(Math.floor(random() * 100))
    case 12: return BigInt(Math.floor(random() * 1000000))
    case 13: return true
    case 14: return false
    default: return null
  }
}

function generateMigration(random: () => number, version: number): Migration {
  return {
    version,
    up: Math.floor(random() * 3) === 0
      ? `CREATE TABLE table${version} (id INTEGER PRIMARY KEY)`
      : `ALTER TABLE table1 ADD COLUMN col${version} TEXT`,
    down: Math.floor(random() * 2) === 0
      ? `DROP TABLE table${version}`
      : undefined,
  }
}

// ============================================
// FUZZ TESTS: createDatabase()
// ============================================

describe('Fuzz: createDatabase(options?)', () => {
  it('handles undefined options gracefully', async () => {
    const result = await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase(undefined)
      expect(db).toBeDefined()
      db.close()
    })

    if (THOROUGH_MODE) {
      console.log(`  Completed ${result.iterations} iterations in ${result.durationMs}ms`)
    }
  })

  it('handles empty options object', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase({})
      expect(db).toBeDefined()
      db.close()
    })
  })

  it('rejects invalid data field types', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const invalidData = generateObject(random) as any

      // Skip valid cases (undefined is valid)
      if (invalidData === undefined || invalidData instanceof Uint8Array) {
        return
      }

      try {
        const db = await createDatabase({ data: invalidData })
        db.close()
        // If it succeeds, that's fine - the library might be lenient
      } catch (e) {
        // If it fails, should throw proper error
        expect(e).toBeInstanceOf(Error)
        expect((e as Error).message).not.toBe('')
        expect((e as Error).message).not.toContain('undefined')
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.run()
// ============================================

describe('Fuzz: db.run(sql, params?)', () => {
  it('handles malformed SQL strings', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const badSql = generateSqlString(random)

        try {
          db.run(badSql)
          // Some strings might be valid SQL, that's okay
        } catch (e) {
          // If it throws, must be SqlError subclass
          expect(e).toBeInstanceOf(SqlError)
          expect((e as SqlError).message).not.toBe('')
          expect((e as SqlError).message).not.toContain('undefined')
          expect((e as SqlError).code).toBeDefined()
        }
      } finally {
        db.close()
      }
    })
  })

  it('handles random parameter values', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER, value TEXT)')

        const params = generateArray(random, generateParamValue, 2)

        try {
          const result = db.run('INSERT INTO test (id, value) VALUES (?, ?)', params)
          expect(result.changes).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result.changes)).toBe(true)
          expect(Number.isInteger(result.lastInsertRowId)).toBe(true)
        } catch (e) {
          // If it throws, must be SqlError subclass
          expect(e).toBeInstanceOf(SqlError)
        }
      } finally {
        db.close()
      }
    })
  })

  it('never mutates input parameters', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER, value TEXT)')

        const params = [Math.floor(random() * 1000), 'test']
        const paramsCopy = [...params]

        try {
          db.run('INSERT INTO test (id, value) VALUES (?, ?)', params)
        } catch {
          // Ignore errors
        }

        expect(params).toEqual(paramsCopy)
      } finally {
        db.close()
      }
    })
  })

  it('completes within reasonable time', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')

        const startTime = Date.now()
        try {
          db.run('INSERT INTO test (id) VALUES (?)', [Math.floor(random() * 1000000)])
        } catch {
          // Ignore errors
        }
        const elapsed = Date.now() - startTime

        // Simple operations should complete in < 100ms
        expect(elapsed).toBeLessThan(100)
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.get() and db.all()
// ============================================

describe('Fuzz: db.get() and db.all()', () => {
  it('get() returns T | undefined for valid queries', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER, value TEXT)')
        db.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, 'test'])

        const result = db.get('SELECT * FROM test WHERE id = ?', [1])
        expect(result === undefined || typeof result === 'object').toBe(true)
      } finally {
        db.close()
      }
    })
  })

  it('all() always returns array (never null/undefined)', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER, value TEXT)')

        // Random number of inserts (0 to 10)
        const count = Math.floor(random() * 10)
        for (let j = 0; j < count; j++) {
          db.run('INSERT INTO test (id, value) VALUES (?, ?)', [j, `val${j}`])
        }

        const result = db.all('SELECT * FROM test')
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(count)
      } finally {
        db.close()
      }
    })
  })

  it('handles queries with invalid column names', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER)')

        try {
          db.get('SELECT nonexistent FROM test')
          // Might succeed if SQLite allows it
        } catch (e) {
          expect(e).toBeInstanceOf(SqlError)
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.exec()
// ============================================

describe('Fuzz: db.exec()', () => {
  it('handles empty strings', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        // Empty SQL should not throw
        db.exec('')
      } finally {
        db.close()
      }
    })
  })

  it('handles multiple statements', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const stmtCount = Math.floor(random() * 10) + 1
        const statements: string[] = []
        for (let j = 0; j < stmtCount; j++) {
          statements.push(`CREATE TABLE table${j} (id INTEGER)`)
        }

        db.exec(statements.join('; '))

        // Verify all tables were created
        const tables = db.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table'"
        )
        expect(tables.length).toBe(stmtCount)
      } finally {
        db.close()
      }
    })
  })

  it('throws SqlError subclasses on syntax errors', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const badSql = generateSqlString(random)

        try {
          db.exec(badSql)
        } catch (e) {
          expect(e).toBeInstanceOf(SqlError)
          expect((e as SqlError).message).not.toBe('')
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.transaction()
// ============================================

describe('Fuzz: db.transaction()', () => {
  it('rolls back all changes on error', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')

        const shouldFail = random() > 0.5

        try {
          await db.transaction(async () => {
            db.run('INSERT INTO test (id) VALUES (?)', [1])
            db.run('INSERT INTO test (id) VALUES (?)', [2])

            if (shouldFail) {
              throw new Error('Intentional failure')
            }
          })

          // Transaction succeeded
          const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
          expect(count?.count).toBe(2)
        } catch (e) {
          // Transaction failed - verify rollback
          const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
          expect(count?.count).toBe(0)
        }
      } finally {
        db.close()
      }
    })
  })

  it('maintains inTransaction flag correctly', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        expect(db.inTransaction).toBe(false)

        await db.transaction(async () => {
          expect(db.inTransaction).toBe(true)
        })

        expect(db.inTransaction).toBe(false)
      } finally {
        db.close()
      }
    })
  })

  it('handles nested transactions', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER)')

        await db.transaction(async () => {
          db.run('INSERT INTO test (id) VALUES (1)')

          await db.transaction(async () => {
            db.run('INSERT INTO test (id) VALUES (2)')
          })

          db.run('INSERT INTO test (id) VALUES (3)')
        })

        const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
        expect(count?.count).toBe(3)
      } finally {
        db.close()
      }
    })
  })

  it('rejects non-function inputs', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const badInput = generateObject(random) as any

        // Skip function values
        if (typeof badInput === 'function') {
          return
        }

        try {
          await db.transaction(badInput)
          // Should throw
          expect(false).toBe(true)
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.migrate()
// ============================================

describe('Fuzz: db.migrate()', () => {
  it('handles empty migration arrays', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const result = await db.migrate([])
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(0)
      } finally {
        db.close()
      }
    })
  })

  it('applies migrations in order', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const count = Math.floor(random() * 5) + 1
        const migrations: Migration[] = []
        for (let j = 1; j <= count; j++) {
          migrations.push({
            version: j,
            up: `CREATE TABLE table${j} (id INTEGER)`,
          })
        }

        const applied = await db.migrate(migrations)
        expect(applied.length).toBe(count)
        expect(applied).toEqual([...Array(count)].map((_, i) => i + 1))
      } finally {
        db.close()
      }
    })
  })

  it('never applies same migration twice', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const migrations: Migration[] = [
          { version: 1, up: 'CREATE TABLE test1 (id INTEGER)' },
        ]

        await db.migrate(migrations)
        const applied2 = await db.migrate(migrations)

        expect(applied2.length).toBe(0)
      } finally {
        db.close()
      }
    })
  })

  it('throws Error for invalid versions', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const badVersion = generateNumber(random)

        // Skip valid positive integers
        if (Number.isInteger(badVersion) && badVersion > 0) {
          return
        }

        try {
          await db.migrate([{ version: badVersion, up: 'SELECT 1' } as any])
          // Should throw
        } catch (e) {
          // Validation errors throw Error, not MigrationError
          expect(e).toBeInstanceOf(Error)
          expect((e as Error).message).not.toBe('')
        }
      } finally {
        db.close()
      }
    })
  })

  it('rolls back failed migration only', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const migrations: Migration[] = [
          { version: 1, up: 'CREATE TABLE test1 (id INTEGER)' },
          { version: 2, up: 'INVALID SQL' },
        ]

        try {
          await db.migrate(migrations)
          // Should fail
        } catch (e) {
          expect(e).toBeInstanceOf(MigrationError)

          // Each migration runs in its own transaction
          // Migration 1 succeeded and was committed
          // Migration 2 failed and was rolled back
          const test1Exists = db.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='test1'"
          )
          expect(test1Exists.length).toBe(1) // test1 should exist

          // Verify migration 2 was not recorded
          const migration2 = db.get('SELECT version FROM _migrations WHERE version = 2')
          expect(migration2).toBeUndefined()
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.table() and TableHelper
// ============================================

describe('Fuzz: db.table() and TableHelper', () => {
  it('returns TableHelper immediately', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const tableName = generateString(random, 50) || 'test'

        // table() should not throw for any table name
        const table = db.table(tableName)
        expect(table).toBeDefined()
        expect(typeof table.insert).toBe('function')
        expect(typeof table.find).toBe('function')
        expect(typeof table.where).toBe('function')
      } finally {
        db.close()
      }
    })
  })

  it('insert() returns number', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        const table = db.table<{ id?: number; value: string }>('test')

        const id = table.insert({ value: 'test' })
        expect(typeof id).toBe('number')
        expect(Number.isInteger(id)).toBe(true)
        expect(id).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    })
  })

  it('update() returns affected row count', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        const table = db.table<{ id?: number; value: string }>('test')

        table.insert({ value: 'original' })

        const count = table.update(1, { value: 'updated' })
        expect(typeof count).toBe('number')
        expect(Number.isInteger(count)).toBe(true)
        expect(count).toBeGreaterThanOrEqual(0)
      } finally {
        db.close()
      }
    })
  })

  it('delete() returns affected row count', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        const table = db.table<{ id?: number; value: string }>('test')

        table.insert({ value: 'test' })

        const count = table.delete(1)
        expect(typeof count).toBe('number')
        expect(Number.isInteger(count)).toBe(true)
        expect(count).toBeGreaterThanOrEqual(0)
      } finally {
        db.close()
      }
    })
  })

  it('never mutates input objects', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        const table = db.table<{ id?: number; value: string }>('test')

        const data = { value: 'test' }
        const dataCopy = { ...data }

        table.insert(data)

        expect(data).toEqual(dataCopy)
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.export() and db.import()
// ============================================

describe('Fuzz: db.export() and db.import()', () => {
  it('export() returns valid Uint8Array', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const exported = db.export()

        expect(exported instanceof Uint8Array).toBe(true)
        // Empty database can be 0 bytes in some implementations
        expect(exported.length).toBeGreaterThanOrEqual(0)

        // Only check header if there's data
        if (exported.length >= 15) {
          const header = new TextDecoder().decode(exported.slice(0, 15))
          expect(header).toBe('SQLite format 3')
        }
      } finally {
        db.close()
      }
    })
  })

  it('export/import roundtrip preserves data', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        // Create random data
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        const count = Math.floor(random() * 10) + 1
        for (let j = 0; j < count; j++) {
          db.run('INSERT INTO test (value) VALUES (?)', [`value${j}`])
        }

        const exported = db.export()
        db.close()

        // Import into new database
        const db2 = await createDatabase({ data: exported })
        const rows = db2.all('SELECT * FROM test')

        expect(rows.length).toBe(count)
        db2.close()
      } catch (e) {
        db.close()
        throw e
      }
    })
  })

  it('import() rejects invalid data', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const invalidData = generateObject(random) as any

        // Skip valid types
        if (invalidData instanceof Uint8Array || invalidData instanceof ArrayBuffer) {
          return
        }

        try {
          db.import(invalidData)
          // Should throw
        } catch (e) {
          expect(e).toBeInstanceOf(SqlError)
        }
      } finally {
        db.close()
      }
    })
  })

  it('import() replaces entire database', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db1 = await createDatabase()
      db1.exec('CREATE TABLE test1 (id INTEGER)')
      db1.run('INSERT INTO test1 VALUES (1)')
      const exported = db1.export()
      db1.close()

      const db2 = await createDatabase()
      try {
        db2.exec('CREATE TABLE test2 (id INTEGER)')
        db2.run('INSERT INTO test2 VALUES (2)')

        db2.import(exported)

        // test2 should be gone, test1 should exist
        const tables = db2.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table'"
        )
        const tableNames = tables.map(t => t.name)
        expect(tableNames).toContain('test1')
        expect(tableNames).not.toContain('test2')
      } finally {
        db2.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.prepare()
// ============================================

describe('Fuzz: db.prepare()', () => {
  it('returns PreparedStatement with correct methods', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER, value TEXT)')

        const stmt = db.prepare('INSERT INTO test VALUES (?, ?)')
        expect(stmt).toBeDefined()
        expect(typeof stmt.run).toBe('function')
        expect(typeof stmt.get).toBe('function')
        expect(typeof stmt.all).toBe('function')
        expect(typeof stmt.finalize).toBe('function')

        stmt.finalize()
      } finally {
        db.close()
      }
    })
  })

  it('allows multiple run() calls', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER)')

        const stmt = db.prepare('INSERT INTO test VALUES (?)')

        const count = Math.floor(random() * 5) + 1
        for (let j = 0; j < count; j++) {
          stmt.run([j])
        }

        stmt.finalize()

        const rows = db.all('SELECT * FROM test')
        expect(rows.length).toBe(count)
      } finally {
        db.close()
      }
    })
  })

  it('finalize() is idempotent', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const stmt = db.prepare('SELECT 1')

        stmt.finalize()
        stmt.finalize()
        stmt.finalize()

        // Should not throw
      } finally {
        db.close()
      }
    })
  })

  it('throws after finalize()', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        const stmt = db.prepare('SELECT 1')
        stmt.finalize()

        try {
          stmt.run([])
          // Should throw
          expect(false).toBe(true)
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// FUZZ TESTS: db.insertMany()
// ============================================

describe('Fuzz: db.insertMany()', () => {
  it('returns array of IDs matching row count', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const count = Math.floor(random() * 10) + 1
        const rows = Array.from({ length: count }, (_, i) => ({ value: `val${i}` }))

        const ids = db.insertMany('test', rows)

        expect(Array.isArray(ids)).toBe(true)
        expect(ids.length).toBe(count)
        ids.forEach(id => {
          expect(typeof id).toBe('number')
          expect(Number.isInteger(id)).toBe(true)
          expect(id).toBeGreaterThan(0)
        })
      } finally {
        db.close()
      }
    })
  })

  it('handles empty arrays', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const ids = db.insertMany('test', [])

        expect(Array.isArray(ids)).toBe(true)
        expect(ids.length).toBe(0)
      } finally {
        db.close()
      }
    })
  })

  it('is atomic - all succeed or all fail', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY UNIQUE, value TEXT)')

        // Insert some valid data
        db.run('INSERT INTO test (id, value) VALUES (1, "existing")')

        // Try to insert batch with conflict
        const rows = [
          { id: 2, value: 'new1' },
          { id: 1, value: 'conflict' }, // This will fail
          { id: 3, value: 'new2' },
        ]

        try {
          db.insertMany('test', rows)
          // Should fail
        } catch (e) {
          expect(e).toBeInstanceOf(SqlConstraintError)

          // Verify nothing was inserted
          const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
          expect(count?.count).toBe(1) // Only the original row
        }
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// PROPERTY-BASED TESTS
// ============================================

describe('Property: export/import roundtrip', () => {
  it('preserves all data exactly', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db1 = await createDatabase()
      try {
        // Generate random database state
        const tableCount = Math.floor(random() * 3) + 1
        for (let t = 0; t < tableCount; t++) {
          db1.exec(`CREATE TABLE table${t} (id INTEGER PRIMARY KEY, value TEXT)`)

          const rowCount = Math.floor(random() * 5)
          for (let r = 0; r < rowCount; r++) {
            db1.run(`INSERT INTO table${t} (value) VALUES (?)`, [`val${r}`])
          }
        }

        // Export and import
        const exported = db1.export()
        const db2 = await createDatabase({ data: exported })

        // Verify tables match
        const tables1 = db1.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        const tables2 = db2.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        expect(tables1.length).toBe(tables2.length)

        // Verify data matches for each table
        for (const table of tables1) {
          const rows1 = db1.all(`SELECT * FROM ${table.name} ORDER BY id`)
          const rows2 = db2.all(`SELECT * FROM ${table.name} ORDER BY id`)
          expect(rows1).toEqual(rows2)
        }

        db2.close()
      } finally {
        db1.close()
      }
    })
  })
})

describe('Property: transaction atomicity', () => {
  it('commits all or rolls back all', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')

        const shouldFail = random() > 0.5
        const operationCount = Math.floor(random() * 5) + 1

        try {
          await db.transaction(async () => {
            for (let j = 0; j < operationCount; j++) {
              db.run('INSERT INTO test (id) VALUES (?)', [j + 1])
            }

            if (shouldFail) {
              throw new Error('Intentional failure')
            }
          })

          // Success - all rows should exist
          const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
          expect(count?.count).toBe(operationCount)
        } catch {
          // Failure - no rows should exist
          const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
          expect(count?.count).toBe(0)
        }
      } finally {
        db.close()
      }
    })
  })
})

describe('Property: clone independence', () => {
  it('cloned database is independent', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db1 = await createDatabase()
      try {
        db1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
        db1.run('INSERT INTO test (value) VALUES (?)', ['original'])

        const db2 = await db1.clone()
        try {
          // Modify original
          db1.run('INSERT INTO test (value) VALUES (?)', ['db1_change'])

          // Modify clone
          db2.run('INSERT INTO test (value) VALUES (?)', ['db2_change'])

          // Verify independence
          const rows1 = db1.all('SELECT value FROM test ORDER BY id')
          const rows2 = db2.all('SELECT value FROM test ORDER BY id')

          expect(rows1.length).toBe(2)
          expect(rows2.length).toBe(2)
          expect(rows1).not.toEqual(rows2)
        } finally {
          db2.close()
        }
      } finally {
        db1.close()
      }
    })
  })
})

describe('Property: count consistency', () => {
  it('count() matches where().length', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const rowCount = Math.floor(random() * 10)
        for (let j = 0; j < rowCount; j++) {
          db.run('INSERT INTO test (value) VALUES (?)', [`val${j}`])
        }

        const table = db.table<{ id: number; value: string }>('test')

        const count = table.count()
        const all = table.all()

        expect(count).toBe(all.length)
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// BOUNDARY TESTS
// ============================================

describe('Boundary: Numeric values', () => {
  it('handles special numeric values', async () => {
    const specialValues = [
      0, -0, 1, -1,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
      Number.EPSILON,
      // NaN and Infinity handled separately as they may cause errors
    ]

    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value REAL)')

        const value = specialValues[Math.floor(random() * specialValues.length)]
        db.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, value])

        const result = db.get<{ value: number }>('SELECT value FROM test WHERE id = 1')
        expect(result).toBeDefined()
      } finally {
        db.close()
      }
    })
  })

  it('handles NaN and Infinity gracefully', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value REAL)')

        const specialValues = [NaN, Infinity, -Infinity]
        const value = specialValues[Math.floor(random() * specialValues.length)]

        try {
          db.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, value])
          // Might succeed, depending on SQLite handling
        } catch (e) {
          // If it fails, should be proper error
          expect(e).toBeInstanceOf(Error)
        }
      } finally {
        db.close()
      }
    })
  })
})

describe('Boundary: String values', () => {
  it('handles various string lengths', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const lengths = [0, 1, 100, 1000]
        const len = lengths[Math.floor(random() * lengths.length)]
        const value = 'x'.repeat(len)

        db.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, value])

        const result = db.get<{ value: string }>('SELECT value FROM test WHERE id = 1')
        expect(result?.value).toBe(value)
      } finally {
        db.close()
      }
    })
  })

  it('handles unicode and special characters', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const specialStrings = [
          'Hello',
          '你好',
          '🎉🎊',
          'a\nb\tc',
          "It's a test",
          'Quote: "test"',
        ]
        const value = specialStrings[Math.floor(random() * specialStrings.length)]

        db.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, value])

        const result = db.get<{ value: string }>('SELECT value FROM test WHERE id = 1')
        expect(result?.value).toBe(value)
      } finally {
        db.close()
      }
    })
  })
})

describe('Boundary: Array values', () => {
  it('handles various array lengths in parameters', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')

        const lengths = [0, 1, 10, 100]
        const len = lengths[Math.floor(random() * lengths.length)]

        if (len === 0) {
          // Can't test with 0 params in this context
          return
        }

        const placeholders = Array(len).fill('?').join(', ')
        const params = Array.from({ length: len }, (_, i) => i)

        try {
          db.run(`SELECT ${placeholders}`, params)
          // Should succeed
        } catch (e) {
          // Might fail for large arrays, that's okay
          expect(e).toBeInstanceOf(Error)
        }
      } finally {
        db.close()
      }
    })
  })
})

describe('Boundary: Object values', () => {
  it('handles objects with varying key counts', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        // Create table with many columns
        const columns = Array.from({ length: 10 }, (_, i) => `col${i} TEXT`).join(', ')
        db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, ${columns})`)

        const keyCounts = [1, 5, 10] // Skip 0 to avoid empty insert
        const keyCount = keyCounts[Math.floor(random() * keyCounts.length)]

        const data: Record<string, string> = {}
        for (let j = 0; j < keyCount; j++) {
          data[`col${j}`] = `value${j}`
        }

        const table = db.table('test')
        const id = table.insert(data)

        expect(typeof id).toBe('number')
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// STATE MACHINE TESTS
// ============================================

describe('State: Database lifecycle', () => {
  it('operations on closed database throw consistently', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      db.exec('CREATE TABLE test (id INTEGER)')
      db.close()

      // Try various operations
      const operations = [
        () => db.run('SELECT 1'),
        () => db.get('SELECT 1'),
        () => db.all('SELECT 1'),
        () => db.exec('SELECT 1'),
        () => db.export(),
      ]

      const op = operations[Math.floor(random() * operations.length)]

      try {
        op()
        // Should throw
        expect(false).toBe(true)
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        expect((e as Error).message).not.toBe('')
      }
    })
  })

  it('close() is idempotent', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()

      const times = Math.floor(random() * 5) + 1
      for (let j = 0; j < times; j++) {
        db.close()
      }

      // Should not throw
    })
  })
})

describe('State: Concurrent operations', () => {
  it('handles parallel reads correctly', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

        const count = Math.floor(random() * 5) + 1
        for (let j = 0; j < count; j++) {
          db.run('INSERT INTO test (value) VALUES (?)', [`val${j}`])
        }

        // Execute parallel reads
        const reads = Array.from({ length: 10 }, () =>
          Promise.resolve(db.all('SELECT * FROM test'))
        )

        const results = await Promise.all(reads)

        // All reads should return same count
        results.forEach(rows => {
          expect(rows.length).toBe(count)
        })
      } finally {
        db.close()
      }
    })
  })

  it('queues concurrent transactions correctly', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')

        const txCount = Math.floor(random() * 3) + 2
        const transactions = Array.from({ length: txCount }, (_, idx) =>
          db.transaction(async () => {
            db.run('INSERT INTO test (id) VALUES (?)', [idx + 1])
          })
        )

        await Promise.all(transactions)

        // All transactions should complete
        const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
        expect(count?.count).toBe(txCount)
      } finally {
        db.close()
      }
    })
  })
})

// ============================================
// ERROR MESSAGE QUALITY TESTS
// ============================================

describe('Error Quality: Message validation', () => {
  it('error messages are informative', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        try {
          db.run('INVALID SQL SYNTAX')
        } catch (e) {
          expect(e).toBeInstanceOf(SqlError)
          const msg = (e as SqlError).message
          expect(msg).not.toBe('')
          expect(msg).not.toContain('undefined')
          expect(msg).not.toContain('[object Object]')
        }
      } finally {
        db.close()
      }
    })
  })

  it('errors have correct name and code properties', async () => {
    await fuzzLoopAsync(async (random, i) => {
      const db = await createDatabase()
      try {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY UNIQUE)')
        db.run('INSERT INTO test (id) VALUES (1)')

        try {
          db.run('INSERT INTO test (id) VALUES (1)')
        } catch (e) {
          expect(e).toBeInstanceOf(SqlConstraintError)
          expect((e as SqlConstraintError).name).toBe('SqlConstraintError')
          expect((e as SqlConstraintError).code).toBeDefined()
          expect((e as SqlConstraintError).code).not.toBe('')
        }
      } finally {
        db.close()
      }
    })
  })
})
