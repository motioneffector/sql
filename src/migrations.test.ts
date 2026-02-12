import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import { MigrationError } from './errors'
import type { Database, Migration } from './types'

describe('db.migrate(migrations)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('accepts array of migration objects', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
    ]
    await expect(db.migrate(migrations)).resolves.toEqual([1])
  })

  it('runs migrations not yet applied', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
    ]
    const applied = await db.migrate(migrations)
    expect(applied).toEqual([1, 2])
    expect(db.getTables()).toContain('a')
    expect(db.getTables()).toContain('b')
  })

  it('skips migrations already applied', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
    ]
    await db.migrate(migrations)

    const migrations2: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
    ]
    const applied = await db.migrate(migrations2)
    expect(applied).toEqual([2])
  })

  it('returns array of version numbers that were applied', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
    ]
    const applied = await db.migrate(migrations)
    expect(applied).toEqual([1, 2])
  })

  it('returns empty array if no migrations needed', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
    ]
    await db.migrate(migrations)
    const applied = await db.migrate(migrations)
    expect(applied.every(() => false)).toBe(true)
  })

  it('creates _migrations table automatically if not exists', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
    ]
    await db.migrate(migrations)
    // _migrations table should exist (though not in getTables() as it's internal)
    const result = db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    )
    expect(result?.name).toBe('_migrations')
  })

  it('_migrations table has columns: version (INTEGER PRIMARY KEY), applied_at (TEXT)', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
    ]
    await db.migrate(migrations)
    const columns = db.getTableInfo('_migrations')
    expect(columns.find(c => c.name === 'version')?.primaryKey).toBe(true)
    expect(columns.find(c => c.name === 'applied_at')?.type).toBe('TEXT')
  })

  it('stores applied_at as ISO 8601 timestamp', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
    ]
    await db.migrate(migrations)
    const result = db.get<{ applied_at: string }>(
      'SELECT applied_at FROM _migrations WHERE version = 1'
    )
    expect(result?.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  describe('Migration Object Structure', () => {
    it('version must be positive integer (>= 1)', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
      ]
      await expect(db.migrate(migrations)).resolves.toEqual([1])
    })

    it("version 0 throws Error('Migration version must be >= 1')", async () => {
      const migrations: Migration[] = [
        { version: 0, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow('Migration version must be >= 1')
    })

    it('negative version throws Error', async () => {
      const migrations: Migration[] = [
        { version: -1, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow(/version must be >= 1/i)
    })

    it('non-integer version throws Error', async () => {
      const migrations: Migration[] = [
        { version: 1.5, up: 'CREATE TABLE test (id INTEGER)', down: 'DROP TABLE test' },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow(/integer|version/i)
    })

    it("duplicate versions in array throws Error('Duplicate migration version: N')", async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 1, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow('Duplicate migration version')
    })

    it('up is required, throws Error if missing', async () => {
      const migrations = [
        // @ts-expect-error - Testing runtime validation
        { version: 1, down: 'DROP TABLE test' },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow(/up|required/i)
    })

    it('down is optional (for rollback support)', async () => {
      const migrations: Migration[] = [{ version: 1, up: 'CREATE TABLE test (id INTEGER)' }]
      await expect(db.migrate(migrations)).resolves.toEqual([1])
    })
  })

  describe('Migration Execution Order', () => {
    it('migrations run in ascending version order regardless of array order', async () => {
      const migrations: Migration[] = [
        { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
      ]
      const applied = await db.migrate(migrations)
      expect(applied).toEqual([1, 2, 3])
    })

    it('[{ version: 3, ... }, { version: 1, ... }] runs version 1 first', async () => {
      const order: number[] = []
      const migrations: Migration[] = [
        {
          version: 3,
          up: 'CREATE TABLE c (id INTEGER)',
          down: 'DROP TABLE c',
        },
        {
          version: 1,
          up: 'CREATE TABLE a (id INTEGER)',
          down: 'DROP TABLE a',
        },
      ]
      const applied = await db.migrate(migrations)
      expect(applied[0]).toBe(1)
      expect(applied[1]).toBe(3)
    })

    it('gaps in versions are allowed: [1, 2, 5, 10] is valid', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
        { version: 5, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
        { version: 10, up: 'CREATE TABLE d (id INTEGER)', down: 'DROP TABLE d' },
      ]
      const applied = await db.migrate(migrations)
      expect(applied).toEqual([1, 2, 5, 10])
    })

    it('only versions greater than current are applied', async () => {
      const migrations1: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
        { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
      ]
      await db.migrate(migrations1)

      const migrations2: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
        { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
        { version: 4, up: 'CREATE TABLE d (id INTEGER)', down: 'DROP TABLE d' },
      ]
      const applied = await db.migrate(migrations2)
      expect(applied).toEqual([4])
    })

    it('if current version is 3, only versions 4+ are applied', async () => {
      const migrations1: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
        { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
      ]
      await db.migrate(migrations1)
      expect(db.getMigrationVersion()).toBe(3)

      const migrations2: Migration[] = [
        { version: 4, up: 'CREATE TABLE d (id INTEGER)', down: 'DROP TABLE d' },
        { version: 5, up: 'CREATE TABLE e (id INTEGER)', down: 'DROP TABLE e' },
      ]
      const applied = await db.migrate(migrations2)
      expect(applied).toEqual([4, 5])
    })
  })

  describe('Migration Transactions', () => {
    it('each migration runs in its own transaction', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
      ]
      await db.migrate(migrations)
      expect(db.getTables()).toContain('a')
      expect(db.getTables()).toContain('b')
    })

    it('migration failure rolls back that migration only', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        {
          version: 2,
          up: 'CREATE TABLE b (id INTEGER); INSERT INTO nonexistent VALUES (1)',
          down: 'DROP TABLE b',
        },
      ]
      try {
        await db.migrate(migrations)
      } catch (e) {
        expect((e as Error).message).toMatch(/nonexistent|no such table/i)
      }
      // Migration 1 succeeded
      expect(db.getTables()).toContain('a')
      // Migration 2 was rolled back
      expect(db.getTables()).not.toContain('b')
    })

    it('previously successful migrations are not rolled back on later failure', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
        {
          version: 3,
          up: 'INVALID SQL THAT WILL FAIL',
          down: 'DROP TABLE c',
        },
      ]
      try {
        await db.migrate(migrations)
      } catch (e) {
        expect((e as Error).message).toMatch(/syntax|near|INVALID/i)
      }
      expect(db.getTables()).toContain('a')
      expect(db.getTables()).toContain('b')
    })

    it('failed migration is not recorded in _migrations table', async () => {
      const migrations: Migration[] = [
        { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
        {
          version: 2,
          up: 'INVALID SQL',
          down: 'DROP TABLE b',
        },
      ]
      try {
        await db.migrate(migrations)
      } catch (e) {
        expect((e as Error).message).toMatch(/syntax|near|INVALID/i)
      }
      const result = db.get('SELECT version FROM _migrations WHERE version = 2')
      const isAbsent = result === undefined
      expect(isAbsent).toBe(true)
    })

    it('error includes migration version number', async () => {
      const migrations: Migration[] = [
        {
          version: 5,
          up: 'INVALID SQL',
          down: 'DROP TABLE test',
        },
      ]
      try {
        await db.migrate(migrations)
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as MigrationError).version).toBe(5)
      }
    })

    it('error includes original SQL error message', async () => {
      const migrations: Migration[] = [
        {
          version: 1,
          up: 'SELECT * FROM nonexistent_table',
          down: 'DROP TABLE test',
        },
      ]
      await expect(db.migrate(migrations)).rejects.toThrow(/nonexistent|no such table/i)
    })
  })
})

describe('db.rollback(targetVersion?)', () => {
  let db: Database
  const migrations: Migration[] = [
    { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
    { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
    { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
  ]

  beforeEach(async () => {
    db = await createDatabase()
    await db.migrate(migrations)
  })

  afterEach(() => {
    db.close()
  })

  it('rolls back to specified target version', async () => {
    const rolledBack = await db.rollback(1, migrations)
    expect(rolledBack).toEqual([3, 2])
    const version = db.getMigrationVersion()
    expect(version).toBe(1)
  })

  it('targetVersion 0 rolls back all migrations (empty schema)', async () => {
    const rolledBack = await db.rollback(0, migrations)
    expect(rolledBack).toEqual([3, 2, 1])
    const version = db.getMigrationVersion()
    expect(version).toBe(0)
    const tables = db.getTables()
    expect(tables.every(() => false)).toBe(true)
  })

  it('targetVersion undefined defaults to 0 (roll back everything)', async () => {
    const rolledBack = await db.rollback(undefined, migrations)
    expect(rolledBack).toEqual([3, 2, 1])
    const version = db.getMigrationVersion()
    expect(version).toBe(0)
  })

  it('runs down migrations in descending order (newest first)', async () => {
    const rolledBack = await db.rollback(0, migrations)
    expect(rolledBack).toEqual([3, 2, 1])
  })

  it('removes entries from _migrations table as each rollback completes', async () => {
    await db.rollback(1, migrations)
    const result = db.all<{ version: number }>('SELECT version FROM _migrations ORDER BY version')
    expect(result.map(r => r.version)).toEqual([1])
  })

  it('throws MigrationError if down migration not provided for a version', async () => {
    // Add a migration without down
    const migrations: Migration[] = [{ version: 4, up: 'CREATE TABLE d (id INTEGER)' }]
    await db.migrate(migrations)

    await expect(db.rollback(0)).rejects.toThrow(/down|not provided/i)
  })

  it('throws MigrationError if target version > current version', async () => {
    const rollbackPromise = db.rollback(10)
    await expect(rollbackPromise).rejects.toThrow(/target|version/i)
  })

  it('throws MigrationError if target version is negative', async () => {
    const rollbackPromise = db.rollback(-1)
    await expect(rollbackPromise).rejects.toThrow(/negative|version/i)
  })

  it('returns array of version numbers that were rolled back', async () => {
    const rolledBack = await db.rollback(1, migrations)
    expect(rolledBack).toEqual([3, 2])
  })
})

describe('db.getMigrationVersion()', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('returns current migration version as number', () => {
    const version = db.getMigrationVersion()
    expect(version).toBe(0)
  })

  it('returns 0 if no migrations have been applied', () => {
    expect(db.getMigrationVersion()).toBe(0)
  })

  it('returns highest version number from _migrations table', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 5, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
      { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
    ]
    await db.migrate(migrations)
    expect(db.getMigrationVersion()).toBe(5)
  })

  it('returns correct value after migrate() call', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
    ]
    await db.migrate(migrations)
    expect(db.getMigrationVersion()).toBe(2)
  })

  it('returns correct value after rollback() call', async () => {
    const migrations: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
      { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
      { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' },
    ]
    await db.migrate(migrations)
    await db.rollback(1, migrations)
    expect(db.getMigrationVersion()).toBe(1)
  })
})
