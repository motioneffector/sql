# Changelog

## [0.0.1] - 2026-01-11

### Added
- Initial implementation of SQL.js wrapper for browser-based SQLite databases
- `createDatabase()` function for database initialization with WASM loading
- Query execution methods: `run()`, `get()`, `all()`, `exec()`
- Support for parameterized queries (positional and named parameters)
- Schema migrations with version tracking (`migrate()`, `rollback()`, `getMigrationVersion()`)
- Transaction support with nested transactions via SQLite savepoints
- Table helper methods for CRUD operations (insert, find, where, update, delete, count, all)
- Database export/import as Uint8Array for file serialization
- Persistence support with IndexedDB and localStorage adapters
- Auto-save with configurable debounce
- Prepared statements for efficient repeated queries
- Batch insert operations
- Foreign key constraint enforcement
- Database management methods (close, clone, clear, destroy)
- Database introspection (getTables, getTableInfo, getIndexes)
- SQL template tag for query building
- Custom error hierarchy (SqlError, SqlSyntaxError, SqlConstraintError, SqlNotFoundError, MigrationError)
- Full TypeScript type definitions
- Comprehensive test suite (94% passing)
