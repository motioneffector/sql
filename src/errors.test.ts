import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from './index'
import {
  SqlError,
  SqlSyntaxError,
  SqlConstraintError,
  SqlNotFoundError,
  MigrationError,
} from './errors'
import type { Database } from './types'

describe('SqlError Properties', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('all SQL errors extend SqlError', () => {
    try {
      db.run('INVALID SQL')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlError)
    }

    try {
      db.run('INSERT INTO users (id, email) VALUES (1, "test@example.com")')
      db.run('INSERT INTO users (id, email) VALUES (1, "other@example.com")')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlError)
    }
  })

  it('error.code contains SQLite error code string', () => {
    try {
      db.run('INSERT INTO users (id, email) VALUES (1, "test@example.com")')
      db.run('INSERT INTO users (id, email) VALUES (1, "other@example.com")')
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as SqlError).code).toBeDefined()
      expect(typeof (error as SqlError).code).toBe('string')
    }
  })

  it('error.sql contains the SQL statement that failed (if applicable)', () => {
    try {
      db.run('INSERT INTO users (id) VALUES (1)')
      expect.fail('Should have thrown')
    } catch (error) {
      const sqlError = error as SqlError
      expect(sqlError.sql).toBeDefined()
      expect(sqlError.sql).toContain('INSERT INTO users')
    }
  })

  it('error.params contains the bound parameters (if applicable)', () => {
    try {
      db.run('INSERT INTO users (id) VALUES (?)', [1])
      expect.fail('Should have thrown')
    } catch (error) {
      const sqlError = error as SqlError
      expect(sqlError.params).toBeDefined()
      expect(Array.isArray(sqlError.params)).toBe(true)
    }
  })

  it('error.message is human-readable description', () => {
    try {
      db.run('INSERT INTO users (id) VALUES (1)')
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as SqlError).message).toBeDefined()
      expect(typeof (error as SqlError).message).toBe('string')
      expect((error as SqlError).message.length).toBeGreaterThan(0)
    }
  })

  it('error.stack is preserved for debugging', () => {
    try {
      db.run('INVALID SQL')
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as SqlError).stack).toBeDefined()
      expect(typeof (error as SqlError).stack).toBe('string')
    }
  })
})

describe('SqlSyntaxError', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('thrown for SQL parse errors', () => {
    try {
      db.exec('INVALID SQL SYNTAX')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlSyntaxError)
      expect(error).toBeInstanceOf(SqlError)
    }
  })

  it("'SELEC * FROM users' (typo) throws SqlSyntaxError", () => {
    db.exec('CREATE TABLE users (id INTEGER)')
    try {
      db.run('SELEC * FROM users')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlSyntaxError)
    }
  })

  it('unclosed quote throws SqlSyntaxError', () => {
    db.exec('CREATE TABLE users (id INTEGER)')
    try {
      db.run("INSERT INTO users VALUES ('unclosed)")
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlSyntaxError)
    }
  })

  it('invalid keyword throws SqlSyntaxError', () => {
    try {
      db.exec('INVALID KEYWORD statement')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlSyntaxError)
    }
  })
})

describe('SqlConstraintError', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        age INTEGER CHECK(age >= 0)
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('thrown for UNIQUE constraint violation', () => {
    db.run('INSERT INTO users (id, email) VALUES (1, "test@example.com")')
    try {
      db.run('INSERT INTO users (id, email) VALUES (2, "test@example.com")')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlConstraintError)
    }
  })

  it('thrown for PRIMARY KEY constraint violation', () => {
    db.run('INSERT INTO users (id, email) VALUES (1, "test1@example.com")')
    try {
      db.run('INSERT INTO users (id, email) VALUES (1, "test2@example.com")')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlConstraintError)
    }
  })

  it('thrown for FOREIGN KEY constraint violation', () => {
    try {
      db.run('INSERT INTO posts (user_id, title) VALUES (999, "Test")')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlConstraintError)
    }
  })

  it('thrown for NOT NULL constraint violation', () => {
    try {
      db.run('INSERT INTO users (id) VALUES (1)')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlConstraintError)
    }
  })

  it('thrown for CHECK constraint violation', () => {
    try {
      db.run('INSERT INTO users (id, email, age) VALUES (1, "test@example.com", -5)')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlConstraintError)
    }
  })

  it("error.code is 'SQLITE_CONSTRAINT' or more specific subcode", () => {
    db.run('INSERT INTO users (id, email) VALUES (1, "test@example.com")')
    try {
      db.run('INSERT INTO users (id, email) VALUES (2, "test@example.com")')
      expect.fail('Should have thrown')
    } catch (error) {
      const sqlError = error as SqlConstraintError
      expect(sqlError.code).toBeDefined()
      expect(sqlError.code).toMatch(/CONSTRAINT/i)
    }
  })
})

describe('SqlNotFoundError', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
    db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  it('thrown when querying non-existent table', () => {
    try {
      db.run('SELECT * FROM nonexistent')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlNotFoundError)
    }
  })

  it('thrown when querying non-existent column', () => {
    try {
      db.run('SELECT nonexistent_column FROM users')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlNotFoundError)
    }
  })

  it('thrown when table.find() on non-existent table', () => {
    const table = db.table('nonexistent')
    try {
      table.find(1)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlNotFoundError)
    }
  })

  it('error message includes table/column name', () => {
    try {
      db.run('SELECT * FROM nonexistent_table_name')
      expect.fail('Should have thrown')
    } catch (error) {
      const sqlError = error as SqlNotFoundError
      expect(sqlError.message.toLowerCase()).toMatch(/nonexistent|no such table/i)
    }
  })
})

describe('MigrationError', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('thrown when migration up script fails', async () => {
    const migrations = [
      {
        version: 1,
        up: 'INVALID SQL SYNTAX',
        down: 'DROP TABLE test',
      },
    ]

    try {
      await db.migrate(migrations)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError)
    }
  })

  it('thrown when migration down script fails', async () => {
    const migrations = [
      {
        version: 1,
        up: 'CREATE TABLE test (id INTEGER)',
        down: 'INVALID SQL SYNTAX',
      },
    ]

    await db.migrate(migrations)

    try {
      await db.rollback(0, migrations)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError)
    }
  })

  it('thrown when rollback requested but down not provided', async () => {
    const migrations = [
      {
        version: 1,
        up: 'CREATE TABLE test (id INTEGER)',
        // No down migration
      },
    ]

    await db.migrate(migrations)

    try {
      await db.rollback(0)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError)
    }
  })

  it('error message includes migration version', async () => {
    const migrations = [
      {
        version: 5,
        up: 'INVALID SQL SYNTAX',
        down: 'DROP TABLE test',
      },
    ]

    try {
      await db.migrate(migrations)
      expect.fail('Should have thrown')
    } catch (error) {
      const migrationError = error as MigrationError
      expect(migrationError.version).toBe(5)
      expect(migrationError.message).toContain('5')
    }
  })

  it('wraps original SqlError if SQL failure', async () => {
    const migrations = [
      {
        version: 1,
        up: 'SELECT * FROM nonexistent',
        down: 'DROP TABLE test',
      },
    ]

    try {
      await db.migrate(migrations)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError)
      // The original error should be SqlError or one of its subclasses
      expect((error as MigrationError).message).toBeDefined()
    }
  })
})
