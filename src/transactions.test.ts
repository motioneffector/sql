import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import type { Database } from './types'

describe('db.transaction(fn)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE test (value INTEGER)')
  })

  afterEach(() => {
    db.close()
  })

  it('executes synchronous function within BEGIN/COMMIT', async () => {
    await db.transaction(() => {
      db.run('INSERT INTO test VALUES (1)')
    })
    const result = db.all('SELECT * FROM test')
    expect(result).toHaveLength(1)
  })

  it('executes async function within BEGIN/COMMIT', async () => {
    await db.transaction(async () => {
      db.run('INSERT INTO test VALUES (1)')
      await Promise.resolve()
      db.run('INSERT INTO test VALUES (2)')
    })
    const result = db.all('SELECT * FROM test')
    expect(result).toHaveLength(2)
  })

  it("returns the function's return value", async () => {
    const result = await db.transaction(() => {
      return 42
    })
    expect(result).toBe(42)
  })

  it('function can return any type (T)', async () => {
    const result = await db.transaction(() => {
      return { success: true, value: 123 }
    })
    expect(result).toEqual({ success: true, value: 123 })
  })

  it('function can return Promise<T>', async () => {
    const result = await db.transaction(async () => {
      return Promise.resolve('async result')
    })
    expect(result).toBe('async result')
  })

  it('commits if function completes successfully', async () => {
    await db.transaction(() => {
      db.run('INSERT INTO test VALUES (1)')
      db.run('INSERT INTO test VALUES (2)')
    })
    const result = db.all('SELECT * FROM test')
    expect(result).toHaveLength(2)
  })

  it('rolls back if function throws error', async () => {
    db.run('INSERT INTO test VALUES (0)')

    try {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (1)')
        throw new Error('Simulated failure')
      })
    } catch (e) {
      // Expected
    }

    const result = db.all('SELECT * FROM test')
    expect(result).toHaveLength(1) // Only pre-existing data
  })

  it('rolls back if function returns rejected promise', async () => {
    db.run('INSERT INTO test VALUES (0)')

    try {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')
        throw new Error('Async failure')
      })
    } catch (e) {
      // Expected
    }

    const result = db.all('SELECT * FROM test')
    expect(result).toHaveLength(1)
  })

  it('re-throws the original error after rollback', async () => {
    const customError = new Error('Custom error message')
    try {
      await db.transaction(() => {
        throw customError
      })
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e).toBe(customError)
    }
  })

  it('error stack trace preserved through rollback', async () => {
    try {
      await db.transaction(() => {
        throw new Error('Test error')
      })
      expect.fail('Should have thrown')
    } catch (e) {
      expect((e as Error).stack).toBeDefined()
      expect((e as Error).stack).toContain('Test error')
    }
  })

  describe('Transaction Isolation', () => {
    it('changes visible within transaction via subsequent queries', async () => {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (1)')
        const result = db.get<{ value: number }>('SELECT * FROM test WHERE value = 1')
        expect(result?.value).toBe(1)
      })
    })

    it('changes committed after successful transaction', async () => {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (1)')
      })
      const result = db.get<{ value: number }>('SELECT * FROM test WHERE value = 1')
      expect(result?.value).toBe(1)
    })

    it('changes discarded after rollback', async () => {
      try {
        await db.transaction(() => {
          db.run('INSERT INTO test VALUES (1)')
          throw new Error('Rollback')
        })
      } catch (e) {
        // Expected
      }
      const result = db.all('SELECT * FROM test')
      expect(result).toHaveLength(0)
    })

    it('INSERT within transaction visible to SELECT within same transaction', async () => {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (42)')
        const result = db.get<{ value: number }>('SELECT value FROM test WHERE value = 42')
        expect(result?.value).toBe(42)
      })
    })

    it('UPDATE within transaction visible to SELECT within same transaction', async () => {
      db.run('INSERT INTO test VALUES (1)')
      await db.transaction(() => {
        db.run('UPDATE test SET value = 100 WHERE value = 1')
        const result = db.get<{ value: number }>('SELECT value FROM test WHERE value = 100')
        expect(result?.value).toBe(100)
      })
    })
  })

  describe('Nested Transactions (Savepoints)', () => {
    it('nested transaction() calls use SQLite SAVEPOINTs', async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')
        await db.transaction(() => {
          db.run('INSERT INTO test VALUES (2)')
        })
      })
      // If savepoints work, both inserts succeed
      expect(db.all('SELECT * FROM test')).toHaveLength(2)
    })

    it('outer transaction can contain inner transaction', async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')
        await db.transaction(() => {
          db.run('INSERT INTO test VALUES (2)')
        })
        db.run('INSERT INTO test VALUES (3)')
      })
      expect(db.all('SELECT * FROM test')).toHaveLength(3)
    })

    it('inner transaction failure rolls back to savepoint, not entire transaction', async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')

        try {
          await db.transaction(() => {
            db.run('INSERT INTO test VALUES (2)')
            throw new Error('Inner failure')
          })
        } catch (e) {
          // Inner transaction rolled back
        }

        db.run('INSERT INTO test VALUES (3)')
      })

      const values = db.all<{ value: number }>('SELECT value FROM test ORDER BY value')
      expect(values.map(r => r.value)).toEqual([1, 3])
    })

    it('outer transaction can continue after inner transaction failure (if caught)', async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')

        try {
          await db.transaction(() => {
            db.run('INSERT INTO test VALUES (2)')
            throw new Error('Inner error')
          })
        } catch (e) {
          // Caught and handled
        }

        db.run('INSERT INTO test VALUES (3)')
      })

      const result = db.all('SELECT * FROM test')
      expect(result).toHaveLength(2) // 1 and 3, not 2
    })

    it('outer transaction failure rolls back everything including inner changes', async () => {
      try {
        await db.transaction(async () => {
          db.run('INSERT INTO test VALUES (1)')

          await db.transaction(() => {
            db.run('INSERT INTO test VALUES (2)')
          })

          throw new Error('Outer failure')
        })
      } catch (e) {
        // Expected
      }

      const result = db.all('SELECT * FROM test')
      expect(result).toHaveLength(0)
    })

    it('savepoint names are unique (e.g., sp_1, sp_2, sp_3)', async () => {
      // This is more of an implementation detail, but we can test that multiple
      // nested transactions work without conflicts
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')
        await db.transaction(async () => {
          db.run('INSERT INTO test VALUES (2)')
          await db.transaction(() => {
            db.run('INSERT INTO test VALUES (3)')
          })
        })
      })
      expect(db.all('SELECT * FROM test')).toHaveLength(3)
    })

    it('deeply nested transactions work (3+ levels)', async () => {
      await db.transaction(async () => {
        db.run('INSERT INTO test VALUES (1)')
        await db.transaction(async () => {
          db.run('INSERT INTO test VALUES (2)')
          await db.transaction(async () => {
            db.run('INSERT INTO test VALUES (3)')
            await db.transaction(() => {
              db.run('INSERT INTO test VALUES (4)')
            })
          })
        })
      })
      expect(db.all('SELECT * FROM test')).toHaveLength(4)
    })
  })

  describe('db.inTransaction', () => {
    it('returns false when not in a transaction', () => {
      expect(db.inTransaction).toBe(false)
    })

    it('returns true when inside transaction() callback', async () => {
      await db.transaction(() => {
        expect(db.inTransaction).toBe(true)
      })
    })

    it('returns true in nested transaction', async () => {
      await db.transaction(() => {
        expect(db.inTransaction).toBe(true)
        db.transaction(() => {
          expect(db.inTransaction).toBe(true)
        })
      })
    })

    it('returns false after transaction completes', async () => {
      await db.transaction(() => {
        db.run('INSERT INTO test VALUES (1)')
      })
      expect(db.inTransaction).toBe(false)
    })

    it('returns false after transaction rolls back', async () => {
      try {
        await db.transaction(() => {
          throw new Error('Rollback')
        })
      } catch (e) {
        // Expected
      }
      expect(db.inTransaction).toBe(false)
    })

    it('read-only property (cannot be assigned)', () => {
      expect(() => {
        // @ts-expect-error - Testing readonly
        db.inTransaction = true
      }).toThrow()
    })
  })
})
