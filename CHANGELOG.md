# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-11

### Added
- Initial public release
- Full SQLite database in the browser via SQL.js/WebAssembly
- Query execution methods: `run()`, `get()`, `all()`, `exec()`
- Support for parameterized queries (positional and named parameters)
- Schema migrations with version tracking (`migrate()`, `rollback()`, `getMigrationVersion()`)
- Transaction support with automatic rollback on error
- Table helper API for CRUD operations (`insert`, `find`, `where`, `update`, `delete`, `count`, `all`)
- Database export/import as Uint8Array for file serialization
- Auto-persistence to IndexedDB or localStorage with configurable debounce
- Manual persistence methods (`save()`, `load()`)
- Prepared statements for efficient repeated queries (`prepare()`)
- Batch insert operations (`insertMany()`)
- Foreign key constraint enforcement
- Database management methods (`close()`, `clone()`, `clear()`, `destroy()`)
- Database introspection (`getTables()`, `getTableInfo()`, `getIndexes()`)
- SQL template tag for query building
- Custom error hierarchy (SqlError, SqlSyntaxError, SqlConstraintError, SqlNotFoundError, MigrationError)
- Full TypeScript type definitions with declaration files
- Comprehensive test suite (461 tests, 100% passing)
- Complete API documentation
- Tree-shakeable ESM build
