/**
 * Custom error classes for @motioneffector/sql
 */

/**
 * Base error class for all SQL-related errors
 */
export class SqlError extends Error {
  /**
   * SQLite error code (e.g., 'SQLITE_CONSTRAINT')
   */
  code: string

  /**
   * SQL statement that caused the error (if applicable)
   */
  sql?: string

  /**
   * Parameters that were bound (if applicable)
   */
  params?: any[]

  constructor(message: string, code = 'SQLITE_ERROR') {
    super(message)
    this.name = 'SqlError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * SQL syntax or parse error
 */
export class SqlSyntaxError extends SqlError {
  constructor(message: string, code = 'SQLITE_ERROR') {
    super(message, code)
    this.name = 'SqlSyntaxError'
  }
}

/**
 * SQL constraint violation (UNIQUE, FK, NOT NULL, CHECK)
 */
export class SqlConstraintError extends SqlError {
  constructor(message: string, code = 'SQLITE_CONSTRAINT') {
    super(message, code)
    this.name = 'SqlConstraintError'
  }
}

/**
 * Table or column not found error
 */
export class SqlNotFoundError extends SqlError {
  constructor(message: string, code = 'SQLITE_ERROR') {
    super(message, code)
    this.name = 'SqlNotFoundError'
  }
}

/**
 * Migration-specific errors
 */
export class MigrationError extends SqlError {
  /**
   * Migration version that caused the error
   */
  version?: number

  constructor(message: string, version?: number) {
    super(message, 'MIGRATION_ERROR')
    this.name = 'MigrationError'
    this.version = version
  }
}
