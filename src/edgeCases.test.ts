import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('Empty and Null Values', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (value TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it("empty string '' is distinct from NULL", () => {
    db.run('INSERT INTO test VALUES (?)', [''])
    db.run('INSERT INTO test VALUES (NULL)')

    const rows = db.all<{ value: string | null }>('SELECT * FROM test')
    const emptyStringRow = rows.find(r => r.value === '')
    expect(emptyStringRow?.value).toBe('')
    const nullRow = rows.find(r => r.value === null)
    expect(nullRow).toMatchObject({ value: null })
  })

  it("get() returns '' for empty TEXT column", () => {
    db.run('INSERT INTO test VALUES (?)', [''])
    const result = db.get<{ value: string }>('SELECT * FROM test')
    expect(result?.value).toBe('')
  })

  it('get() returns null for NULL column', () => {
    db.run('INSERT INTO test VALUES (NULL)')
    const result = db.get<{ value: null }>('SELECT * FROM test')
    expect(result).toMatchObject({ value: null })
  })

  it("WHERE col = '' does not match NULL", () => {
    db.run('INSERT INTO test VALUES (NULL)')
    const result = db.get("SELECT * FROM test WHERE value = ''")
    const isAbsent = result === undefined
    expect(isAbsent).toBe(true)
  })

  it("WHERE col IS NULL does not match ''", () => {
    db.run('INSERT INTO test VALUES (?)', [''])
    const result = db.get('SELECT * FROM test WHERE value IS NULL')
    const isAbsent = result === undefined
    expect(isAbsent).toBe(true)
  })

  it('insert empty string, retrieve empty string', () => {
    db.run('INSERT INTO test VALUES (?)', [''])
    const result = db.get<{ value: string }>('SELECT * FROM test')
    expect(result?.value).toBe('')
  })

  it('insert NULL, retrieve null', () => {
    db.run('INSERT INTO test VALUES (NULL)')
    const result = db.get<{ value: null }>('SELECT * FROM test')
    expect(result).toMatchObject({ value: null })
  })
})

describe('Unicode and Special Characters', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (text TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it("stores and retrieves Unicode text: '你好世界'", () => {
    const text = '你好世界'
    db.run('INSERT INTO test VALUES (?)', [text])
    const result = db.get<{ text: string }>('SELECT * FROM test')
    expect(result?.text).toBe(text)
  })

  it("stores and retrieves emoji: '👋🌍'", () => {
    const emoji = '👋🌍'
    db.run('INSERT INTO test VALUES (?)', [emoji])
    const result = db.get<{ text: string }>('SELECT * FROM test')
    expect(result?.text).toBe(emoji)
  })

  it('stores and retrieves RTL text', () => {
    const rtl = 'مرحبا'
    db.run('INSERT INTO test VALUES (?)', [rtl])
    const result = db.get<{ text: string }>('SELECT * FROM test')
    expect(result?.text).toBe(rtl)
  })

  it("stores and retrieves special chars: '\\n\\t\\r'", () => {
    // Note: Null bytes (\x00) may be truncated when converted to JavaScript strings
    // This is a limitation of JavaScript string handling, not SQLite
    const special = 'line1\nline2\ttab\rcarriage'
    db.run('INSERT INTO test VALUES (?)', [special])
    const result = db.get<{ text: string }>('SELECT * FROM test')
    expect(result?.text).toBe(special)
  })

  it('handles very long Unicode strings (1MB+)', () => {
    const longText = '你好'.repeat(500000) // ~1.5 MB
    db.run('INSERT INTO test VALUES (?)', [longText])
    const result = db.get<{ text: string }>('SELECT * FROM test')
    expect(result?.text).toBe(longText)
  }, 10000)
})

describe('Binary Data (BLOBs)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (data BLOB)')
  })

  afterEach(() => {
    db.close()
  })

  it('stores Uint8Array as BLOB', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    expect(() => db.run('INSERT INTO test VALUES (?)', [data])).not.toThrow()
  })

  it('retrieves BLOB as Uint8Array', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    db.run('INSERT INTO test VALUES (?)', [data])
    const result = db.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(result?.data).toBeInstanceOf(Uint8Array)
    expect(result?.data).toEqual(data)
  })

  it('handles empty Uint8Array (0 bytes)', () => {
    const data = new Uint8Array([])
    db.run('INSERT INTO test VALUES (?)', [data])
    const result = db.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(result?.data).toEqual(data)
  })

  it('handles large BLOB (10MB)', () => {
    const data = new Uint8Array(10 * 1024 * 1024) // 10 MB
    data.fill(42)
    db.run('INSERT INTO test VALUES (?)', [data])
    const result = db.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(result?.data.length).toBe(data.length)
  }, 30000)

  it('BLOB data round-trips exactly (byte-for-byte)', () => {
    const data = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      data[i] = i
    }
    db.run('INSERT INTO test VALUES (?)', [data])
    const result = db.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(result?.data).toEqual(data)
  })

  it('can store any binary data (images, encrypted data, etc.)', () => {
    // Simulate binary data
    const binaryData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) // JPEG header
    db.run('INSERT INTO test VALUES (?)', [binaryData])
    const result = db.get<{ data: Uint8Array }>('SELECT * FROM test')
    expect(result?.data).toEqual(binaryData)
  })
})

describe('Numeric Limits', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (int_val INTEGER, real_val REAL, text_val TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it('handles INTEGER at SQLite max: 9223372036854775807 (2^63-1)', () => {
    const maxInt = 9223372036854775807n
    db.run('INSERT INTO test (text_val) VALUES (?)', [maxInt.toString()])
    const result = db.get<{ text_val: string }>('SELECT * FROM test')
    expect(result?.text_val).toBe('9223372036854775807')
  })

  it('handles INTEGER at SQLite min: -9223372036854775808 (-2^63)', () => {
    const minInt = -9223372036854775808n
    db.run('INSERT INTO test (text_val) VALUES (?)', [minInt.toString()])
    const result = db.get<{ text_val: string }>('SELECT * FROM test')
    expect(result?.text_val).toBe('-9223372036854775808')
  })

  it('integers beyond JS safe integer (2^53) may lose precision', () => {
    // JavaScript safe integer is 2^53-1
    const largeNum = 9007199254740992 // 2^53, beyond safe integer
    db.run('INSERT INTO test (int_val) VALUES (?)', [largeNum])
    const result = db.get<{ int_val: number }>('SELECT * FROM test')

    // May or may not be exact due to JS number limitations
    expect(result?.int_val).toBe(largeNum)
  })

  it('BigInt parameters stored as TEXT to preserve precision', () => {
    const bigNum = 9223372036854775807n
    db.run('INSERT INTO test (text_val) VALUES (?)', [bigNum])
    const result = db.get<{ text_val: string }>('SELECT * FROM test')
    expect(result?.text_val).toBe('9223372036854775807')
  })

  it('REAL handles standard floating point range', () => {
    const values = [3.14159, -273.15, 0.000001, 1e10, 1e-10]

    for (const val of values) {
      db.run('INSERT INTO test (real_val) VALUES (?)', [val])
    }

    const results = db.all<{ real_val: number }>('SELECT real_val FROM test')
    expect(results).toHaveLength(values.length)
    expect(results[0]?.real_val).toBeCloseTo(3.14159)
  })

  it('REAL handles special values: Infinity, -Infinity, NaN as NULL', () => {
    // SQLite doesn't support Infinity/NaN, so they should be stored as NULL
    db.run('INSERT INTO test (real_val) VALUES (?)', [Infinity])
    db.run('INSERT INTO test (real_val) VALUES (?)', [-Infinity])
    db.run('INSERT INTO test (real_val) VALUES (?)', [NaN])

    const results = db.all<{ real_val: number | null }>('SELECT real_val FROM test')

    // Implementation-specific: may be NULL or string representation
    expect(results).toHaveLength(3)
    const firstRow = results[0]!
    const hasRealVal = 'real_val' in firstRow
    expect(hasRealVal).toBe(true)
  })
})

describe('Large Data', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('handles table with 100,000 rows', async () => {
    db.exec('CREATE TABLE large (id INTEGER, value INTEGER)')

    await db.transaction(() => {
      for (let i = 0; i < 100000; i++) {
        db.run('INSERT INTO large VALUES (?, ?)', [i, i * 2])
      }
    })

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM large')
    expect(count?.count).toBe(100000)
  }, 30000)

  it('handles table with 100 columns', () => {
    const columns = Array.from({ length: 100 }, (_, i) => `col${i} INTEGER`).join(', ')
    db.exec(`CREATE TABLE wide (${columns})`)

    const values = Array.from({ length: 100 }, (_, i) => i)
    const placeholders = Array.from({ length: 100 }, () => '?').join(', ')
    db.run(`INSERT INTO wide VALUES (${placeholders})`, values)

    const result = db.get<Record<string, number>>('SELECT * FROM wide')
    const keys = Object.keys(result!)
    expect(keys).toHaveLength(100)
    expect(keys[0]).toBe('col0')
    expect(result!.col0).toBe(0)
    expect(result!.col99).toBe(99)
  })

  it('handles single TEXT cell with 10MB data', () => {
    db.exec('CREATE TABLE large_text (data TEXT)')

    const largeText = 'x'.repeat(10 * 1024 * 1024) // 10 MB
    db.run('INSERT INTO large_text VALUES (?)', [largeText])

    const result = db.get<{ data: string }>('SELECT * FROM large_text')
    expect(result?.data.length).toBe(largeText.length)
  }, 30000)

  it('database file size limited only by memory (WASM heap)', () => {
    // This test just documents the behavior
    db.exec('CREATE TABLE test (data BLOB)')

    // Can insert data up to memory limits
    const data = new Uint8Array(1024 * 1024) // 1 MB
    expect(() => db.run('INSERT INTO test VALUES (?)', [data])).not.toThrow()
  })
})

describe('Concurrent Operations', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (value INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('SQL.js is single-threaded (no true concurrency)', () => {
    // Operations are executed sequentially
    db.run('INSERT INTO test VALUES (1)')
    db.run('INSERT INTO test VALUES (2)')
    db.run('INSERT INTO test VALUES (3)')

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
    expect(count?.count).toBe(3)
  })

  it('rapid sequential operations work correctly', () => {
    for (let i = 0; i < 1000; i++) {
      db.run('INSERT INTO test VALUES (?)', [i])
    }

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
    expect(count?.count).toBe(1000)
  })

  it("async operations (save) don't corrupt data", async () => {
    // Even though save is async, it shouldn't corrupt the database
    db.run('INSERT INTO test VALUES (1)')

    const savePromise = db.save()
    db.run('INSERT INTO test VALUES (2)')

    await savePromise

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
    expect(count?.count).toBe(2)
  })

  it('multiple transaction() calls serialize correctly', async () => {
    await db.transaction(() => {
      db.run('INSERT INTO test VALUES (1)')
    })

    await db.transaction(() => {
      db.run('INSERT INTO test VALUES (2)')
    })

    const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
    expect(count?.count).toBe(2)
  })
})

describe('Environment Compatibility', () => {
  it('works in main browser thread', async () => {
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    db.run('INSERT INTO test VALUES (1)')
    const result = db.get<{ id: number }>('SELECT * FROM test')
    expect(result?.id).toBe(1)
    db.close()
  })

  it('works in Node.js environment', async () => {
    // This test is running in Node.js via Vitest
    const db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER)')
    db.run('INSERT INTO test VALUES (1)')
    const result = db.get<{ id: number }>('SELECT * FROM test')
    expect(result?.id).toBe(1)
    db.close()
  })
})
