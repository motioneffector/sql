/**
 * Comprehensive Transaction Queue Tests
 *
 * Tests automatic queuing of concurrent transactions to prevent
 * savepoint conflicts in SQL.js
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase } from './database'
import type { Database } from './types'

// Helper to create delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Transaction Queue - Basic Functionality', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  it('queues 3 concurrent transactions and executes all', async () => {
    const results = await Promise.all([
      db.transaction(async () => 1),
      db.transaction(async () => 2),
      db.transaction(async () => 3)
    ])
    expect(results).toEqual([1, 2, 3])
  })

  it('executes queued transactions in FIFO order', async () => {
    const order: number[] = []
    await Promise.all([
      db.transaction(async () => {
        await delay(50)
        order.push(1)
      }),
      db.transaction(async () => { order.push(2) }),
      db.transaction(async () => { order.push(3) }),
    ])
    expect(order).toEqual([1, 2, 3]) // FIFO despite delays
  })

  it('handles 100 concurrent transactions', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      db.transaction(async () => i)
    )
    const results = await Promise.all(promises)
    expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i))
  })

  it('single transaction executes immediately without queueing', async () => {
    const start = Date.now()
    await db.transaction(async () => {
      // Should execute immediately, not wait for queue
    })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50) // Should be nearly instant
  })

  it('sequential awaited transactions do not queue', async () => {
    const order: number[] = []
    await db.transaction(async () => { order.push(1) })
    await db.transaction(async () => { order.push(2) })
    await db.transaction(async () => { order.push(3) })
    expect(order).toEqual([1, 2, 3])
  })

  it('returns correct values from each queued transaction', async () => {
    const [a, b, c] = await Promise.all([
      db.transaction(async () => 'alpha'),
      db.transaction(async () => 42),
      db.transaction(async () => ({ key: 'value' }))
    ])
    expect(a).toBe('alpha')
    expect(b).toBe(42)
    expect(c).toEqual({ key: 'value' })
  })
})

describe('Transaction Queue - Database Mutations', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
  })

  it('each queued transaction sees previous committed changes', async () => {
    await Promise.all([
      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "first")')
      }),
      db.transaction(async () => {
        const result = db.get('SELECT value FROM test WHERE id = 1')
        expect(result).toBeDefined()
        expect(result?.value).toBe('first')
      })
    ])
  })

  it('concurrent inserts all succeed without conflicts', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        db.transaction(async () => {
          db.run('INSERT INTO test (id, value) VALUES (?, ?)', [i, `value${i}`])
        })
      )
    )

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(50)
  })

  it('unique constraints enforced across queued transactions', async () => {
    db.exec('CREATE TABLE unique_test (id INTEGER PRIMARY KEY, email TEXT UNIQUE)')

    const results = await Promise.allSettled([
      db.transaction(async () => {
        db.run('INSERT INTO unique_test (email) VALUES (?)', ['test@example.com'])
      }),
      db.transaction(async () => {
        db.run('INSERT INTO unique_test (email) VALUES (?)', ['test@example.com'])
      })
    ])

    expect(results[0]!.status).toBe('fulfilled')
    expect(results[1]!.status).toBe('rejected')
  })

  it('transactions maintain ACID properties', async () => {
    // Atomicity: all-or-nothing
    try {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "first")')
        db.run('INSERT INTO test (id, value) VALUES (2, "second")')
        throw new Error('Rollback!')
      })
    } catch {
      // Expected
    }

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0) // Both inserts rolled back

    // Durability: committed changes persist
    await db.transaction(async () => {
      db.run('INSERT INTO test (id, value) VALUES (1, "durable")')
    })

    const result = db.get('SELECT value FROM test WHERE id = 1') as { value: string }
    expect(result.value).toBe('durable')
  })

  it('large transaction data survives queueing', async () => {
    const largeData = 'x'.repeat(1024 * 1024) // 1MB string

    await Promise.all([
      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, ?)', [largeData])
      }),
      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (2, "small")')
      })
    ])

    const result = db.get('SELECT value FROM test WHERE id = 1') as { value: string }
    expect(result.value.length).toBe(1024 * 1024)
  })
})

describe('Transaction Queue - Error Handling', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
  })

  it('error in one queued transaction does not affect others', async () => {
    const results = await Promise.allSettled([
      db.transaction(async () => { throw new Error('fail') }),
      db.transaction(async () => 'success1'),
      db.transaction(async () => { throw new Error('fail2') }),
      db.transaction(async () => 'success2')
    ])

    expect(results[0]!.status).toBe('rejected')
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: 'success1' })
    expect(results[2]!.status).toBe('rejected')
    expect(results[3]).toMatchObject({ status: 'fulfilled', value: 'success2' })
  })

  it('transaction error triggers rollback, no data persisted', async () => {
    await expect(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "rollback me")')
        throw new Error('Intentional failure')
      })
    }).rejects.toThrow('Intentional failure')

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0)
  })

  it('SQL error in queued transaction triggers rollback', async () => {
    await expect(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "first")')
        db.run('INSERT INTO test (id, value) VALUES (1, "duplicate")') // PK violation
      })
    }).rejects.toThrow()

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0) // Nothing persisted
  })

  it('queue continues processing after failed transaction', async () => {
    const results = await Promise.allSettled([
      db.transaction(async () => {
        db.run('INVALID SQL SYNTAX')
      }),
      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "after error")')
        return 'success'
      })
    ])

    expect(results[0]!.status).toBe('rejected')
    expect(results[1]!.status).toBe('fulfilled')

    const row = db.get('SELECT value FROM test WHERE id = 1') as { value: string }
    expect(row.value).toBe('after error')
  })

  it('async error in transaction is caught and rolled back', async () => {
    await expect(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "test")')
        await delay(10)
        throw new Error('Async error')
      })
    }).rejects.toThrow('Async error')

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0)
  })

  it('promise rejection in transaction triggers rollback', async () => {
    await expect(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "test")')
        return Promise.reject(new Error('Rejected'))
      })
    }).rejects.toThrow('Rejected')

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0)
  })

  it('multiple errors in queue do not corrupt state', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        db.transaction(async () => {
          if (i % 2 === 0) throw new Error(`Error ${i}`)
          db.run('INSERT INTO test (id, value) VALUES (?, ?)', [i, `value${i}`])
        })
      )
    )

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')

    expect(fulfilled.length).toBe(5)
    expect(rejected.length).toBe(5)

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(5) // Only successful ones persisted
  })

  it('preserves original error message and stack trace', async () => {
    const originalError = new Error('Original message')

    try {
      await db.transaction(async () => {
        throw originalError
      })
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBe(originalError)
      expect((error as Error).message).toBe('Original message')
      expect((error as Error).stack).toBeDefined()
    }
  })
})

describe('Transaction Queue - Nested Transactions', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
  })

  it('nested transaction uses savepoint, not queue', async () => {
    await db.transaction(async () => {
      db.run('INSERT INTO test (id, value) VALUES (1, "outer")')

      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (2, "inner")')
      })

      db.run('INSERT INTO test (id, value) VALUES (3, "outer2")')
    })

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(3)
  })

  it('deeply nested transactions (5 levels)', async () => {
    const depth = 5

    async function nest(level: number): Promise<void> {
      if (level === 0) return

      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (?, ?)', [level, `level${level}`])
        await nest(level - 1)
      })
    }

    await nest(depth)

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(depth)
  })

  it('nested transaction rollback does not affect outer', async () => {
    await db.transaction(async () => {
      db.run('INSERT INTO test (id, value) VALUES (1, "outer")')

      try {
        await db.transaction(async () => {
          db.run('INSERT INTO test (id, value) VALUES (2, "inner")')
          throw new Error('Inner fails')
        })
      } catch {
        // Expected
      }

      db.run('INSERT INTO test (id, value) VALUES (3, "outer2")')
    })

    const rows = db.all('SELECT id FROM test ORDER BY id') as Array<{ id: number }>
    expect(rows.map(r => r.id)).toEqual([1, 3])
  })

  it('outer transaction rollback includes nested changes', async () => {
    await expect(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "outer")')

        await db.transaction(async () => {
          db.run('INSERT INTO test (id, value) VALUES (2, "inner")')
        })

        throw new Error('Outer fails')
      })
    }).rejects.toThrow()

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(0) // Everything rolled back
  })

  it('multiple nested transactions in sequence', async () => {
    await db.transaction(async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "nested1")')
      })

      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (2, "nested2")')
      })

      await db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (3, "nested3")')
      })
    })

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(3)
  })

  it('queued transaction with nested transactions', async () => {
    await Promise.all([
      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (1, "outer1")')

        await db.transaction(async () => {
          db.run('INSERT INTO test (id, value) VALUES (2, "inner1")')
        })
      }),

      db.transaction(async () => {
        db.run('INSERT INTO test (id, value) VALUES (3, "outer2")')

        await db.transaction(async () => {
          db.run('INSERT INTO test (id, value) VALUES (4, "inner2")')
        })
      })
    ])

    const count = db.get('SELECT COUNT(*) as cnt FROM test') as { cnt: number }
    expect(count.cnt).toBe(4)
  })
})

describe('Transaction Queue - Database Lifecycle', () => {
  it('rejects pending transactions when database closed', async () => {
    const db = await createDatabase()

    const slowTransaction = db.transaction(async () => {
      await delay(100)
    })

    // Start another transaction that gets queued
    const queuedTransaction = db.transaction(async () => {
      return 'should never execute'
    })

    db.close()

    await expect(queuedTransaction).rejects.toThrow(/Database (is )?closed/)
  })

  it('cannot start transaction on closed database', async () => {
    const db = await createDatabase()
    db.close()

    await expect(async () => {
      await db.transaction(async () => {
        // Should not execute
      })
    }).rejects.toThrow()
  })
})

describe('Transaction Queue - Performance', () => {
  it('1000 concurrent transactions complete in reasonable time', async () => {
    const db = await createDatabase()
    const start = Date.now()

    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        db.transaction(async () => i)
      )
    )

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(10000) // 10 seconds max
  })

  it('handles rapid fire transaction creation', async () => {
    const db = await createDatabase()
    const promises: Promise<number>[] = []

    // Create all promises immediately
    for (let i = 0; i < 500; i++) {
      promises.push(
        db.transaction(async () => i)
      )
    }

    const results = await Promise.all(promises)
    expect(results.length).toBe(500)
  })
})

describe('Transaction Queue - Edge Cases', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  it('handles transaction that returns undefined', async () => {
    const result = await db.transaction(async () => {
      // Returns undefined
    })

    expect(result).toBeUndefined()
  })

  it('handles transaction that returns null', async () => {
    const result = await db.transaction(async () => null)
    expect(result).toBeNull()
  })

  it('handles transaction that returns Promise<void>', async () => {
    await expect(db.transaction(async () => {
      await delay(10)
    })).resolves.not.toThrow()
  })

  it('handles empty transaction', async () => {
    await db.transaction(async () => {
      // Does nothing
    })

    expect(true).toBe(true)
  })

  it('handles Promise.allSettled with mixed results', async () => {
    const results = await Promise.allSettled([
      db.transaction(async () => 'success'),
      db.transaction(async () => { throw new Error('fail') }),
      db.transaction(async () => 42)
    ])

    expect(results[0]).toMatchObject({ status: 'fulfilled', value: 'success' })
    expect(results[1]).toMatchObject({ status: 'rejected' })
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: 42 })
  })

  it('handles sync error thrown immediately in transaction callback', async () => {
    await expect(async () => {
      await db.transaction(() => {
        throw new Error('Sync error')
      })
    }).rejects.toThrow('Sync error')
  })
})
