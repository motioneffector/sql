/**
 * @motioneffector/sql
 * SQL.js wrapper for browser-based SQLite databases
 */

// Core functions
export { createDatabase } from './database'

// Errors
export {
  SqlError,
  SqlSyntaxError,
  SqlConstraintError,
  SqlNotFoundError,
  MigrationError,
} from './errors'

// Types
export type {
  Database,
  DatabaseOptions,
  PersistConfig,
  StorageAdapter,
  RunResult,
  ParamArray,
  ParamObject,
  Migration,
  TableOptions,
  TableHelper,
  ColumnInfo,
  IndexInfo,
  SqlTemplate,
  PreparedStatement,
} from './types'
