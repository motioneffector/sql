# @motioneffector/sql - Test Specification

Test-driven development specification for the SQL.js wrapper library.

**Design Decisions Reference:** See QUESTIONS.md for rationale behind design choices.

---

## 1. Database Creation

### `createDatabase(options?)`

```
✓ creates empty in-memory database when called with no options
✓ returns Promise<Database> (async initialization for WASM loading)
✓ loads SQL.js WASM automatically from default CDN path
✓ accepts custom wasmPath option: createDatabase({ wasmPath: '/assets/sql-wasm.wasm' })
✓ accepts existing database as Uint8Array: createDatabase({ data: existingDb })
✓ accepts persistence config: createDatabase({ persist: { key: 'mydb', storage: 'indexeddb' } })
✓ accepts persistence config with localStorage: createDatabase({ persist: { key: 'mydb', storage: 'localstorage' } })
✓ accepts autoSave option (default true when persist is set)
✓ accepts autoSaveDebounce option in milliseconds (default 1000)
✓ autoSave: false disables automatic persistence
✓ restores from persistent storage if key exists and no data option provided
✓ data option takes precedence over persisted data when both exist
```

### Initialization Errors

```
✓ throws Error if WASM file fails to load (network error, 404)
✓ throws SqlError if provided data is not valid SQLite format
✓ throws SqlError if provided data is corrupted (invalid header)
✓ throws Error if persist.storage is not 'indexeddb' or 'localstorage'
✓ throws Error if persist.key is empty string
```

### Post-Initialization State

```
✓ database is ready for queries immediately after await resolves
✓ database has no tables initially (empty database)
✓ getMigrationVersion() returns 0 for fresh database
✓ inTransaction is false initially
```

---

## 2. Basic Queries - run()

### `db.run(sql, params?)`

```
✓ executes INSERT statement and returns result object
✓ executes UPDATE statement and returns result object
✓ executes DELETE statement and returns result object
✓ executes CREATE TABLE statement and returns result object
✓ executes DROP TABLE statement and returns result object
✓ executes ALTER TABLE statement and returns result object
✓ executes CREATE INDEX statement and returns result object
```

### Return Value

```
✓ returns object with shape { changes: number, lastInsertRowId: number }
✓ changes equals number of rows affected by INSERT (1 for single insert)
✓ changes equals number of rows affected by UPDATE
✓ changes equals number of rows affected by DELETE
✓ changes equals 0 for DDL statements (CREATE, DROP, ALTER)
✓ lastInsertRowId equals rowid of last inserted row
✓ lastInsertRowId equals 0 when no insert performed
✓ lastInsertRowId reflects AUTOINCREMENT value for INTEGER PRIMARY KEY
```

### Parameterized Queries - Positional

```
✓ accepts positional parameters as array
✓ 'INSERT INTO t (a, b) VALUES (?, ?)' with [1, 'hello'] inserts correctly
✓ 'SELECT * FROM t WHERE a = ? AND b = ?' with [1, 'hello'] binds correctly
✓ parameters bind in order: first ? gets params[0], second ? gets params[1]
✓ throws SqlError if parameter count doesn't match placeholder count
✓ empty array [] is valid for queries with no placeholders
✓ undefined params argument treated as empty array
```

### Parameterized Queries - Named

```
✓ accepts named parameters as object
✓ 'INSERT INTO t (a) VALUES (:name)' with { name: 'hello' } inserts correctly
✓ 'INSERT INTO t (a) VALUES ($name)' with { name: 'hello' } inserts correctly ($ prefix)
✓ 'INSERT INTO t (a) VALUES (@name)' with { name: 'hello' } inserts correctly (@ prefix)
✓ named parameters can be used multiple times: 'WHERE a = :x OR b = :x'
✓ throws SqlError if named parameter not provided in object
✓ extra properties in params object are ignored (no error)
```

### Parameter Type Handling

```
✓ null parameter binds as SQL NULL
✓ undefined parameter binds as SQL NULL
✓ number parameter (integer) binds as INTEGER
✓ number parameter (float) binds as REAL
✓ string parameter binds as TEXT
✓ boolean true binds as INTEGER 1
✓ boolean false binds as INTEGER 0
✓ Date parameter binds as TEXT in ISO 8601 format: '2024-01-15T10:30:00.000Z'
✓ Date uses toISOString() for conversion
✓ Uint8Array parameter binds as BLOB
✓ ArrayBuffer parameter binds as BLOB (converted to Uint8Array)
✓ BigInt parameter binds as TEXT (SQLite INTEGER max is 2^63-1)
✓ throws TypeError for unsupported parameter types (object, array, function)
```

### SQL Injection Prevention

```
✓ string parameter with single quote: "O'Brien" is escaped correctly
✓ string parameter with double quote: 'say "hello"' is escaped correctly
✓ string parameter with semicolon: 'a; DROP TABLE users;--' treated as literal string
✓ string parameter with SQL keywords: 'SELECT * FROM' treated as literal string
✓ parameters never interpreted as SQL, only as values
```

---

## 3. Basic Queries - get()

### `db.get<T>(sql, params?)`

```
✓ returns first row as plain object
✓ returns undefined if query matches no rows
✓ returns undefined for SELECT on empty table
✓ column names become object property keys
✓ handles single column: { name: 'Alice' }
✓ handles multiple columns: { id: 1, name: 'Alice', email: 'a@b.com' }
✓ column name aliases work: 'SELECT name AS userName' returns { userName: 'Alice' }
✓ only returns first row even if query matches multiple rows
✓ respects ORDER BY when determining first row
✓ accepts same parameter formats as run() (positional and named)
```

### Type Coercion on Read

```
✓ INTEGER column returns JavaScript number
✓ REAL column returns JavaScript number
✓ TEXT column returns JavaScript string
✓ BLOB column returns Uint8Array
✓ NULL value returns JavaScript null
✓ INTEGER 0 returns number 0, not false
✓ INTEGER 1 returns number 1, not true
✓ empty TEXT '' returns empty string, not null
✓ NUMERIC column returns number if value is numeric
✓ column with no type affinity returns value based on stored type
```

### TypeScript Generic

```
✓ return type is T | undefined where T is the generic parameter
✓ no runtime validation of T (type assertion only)
✓ works with interface types: db.get<User>(...)
✓ works with type aliases: db.get<{ id: number }>(...)
```

---

## 4. Basic Queries - all()

### `db.all<T>(sql, params?)`

```
✓ returns array of row objects
✓ returns empty array [] if query matches no rows
✓ returns empty array [] for SELECT on empty table
✓ returns all matching rows, not just first
✓ rows are in order returned by query (respects ORDER BY)
✓ each row is a plain object with column names as keys
✓ accepts same parameter formats as run() (positional and named)
✓ same type coercion rules as get()
```

### Large Result Sets

```
✓ handles result set with 1000 rows
✓ handles result set with 10000 rows
✓ handles result set with 100000 rows (may be slow, but doesn't crash)
✓ memory is released after result is returned (no leaks on repeated queries)
```

### TypeScript Generic

```
✓ return type is T[] where T is the generic parameter
✓ empty result returns T[] (empty array), not undefined
```

---

## 5. Raw Execution - exec()

### `db.exec(sql)`

```
✓ executes raw SQL string
✓ returns void (undefined)
✓ handles single statement
✓ handles multiple statements separated by semicolons
✓ executes statements in order
✓ useful for schema setup scripts with multiple CREATE TABLE statements
✓ does not support parameter binding (use run/get/all for that)
```

### Multi-Statement Behavior

```
✓ 'CREATE TABLE a (...); CREATE TABLE b (...)' creates both tables
✓ if second statement fails, first statement's effects remain (no auto-transaction)
✓ empty statements (;;) are ignored
✓ trailing semicolon is optional
✓ comments (-- and /* */) are handled correctly
```

---

## 6. Schema Migrations

### `db.migrate(migrations)`

```
✓ accepts array of migration objects
✓ runs migrations not yet applied
✓ skips migrations already applied
✓ returns array of version numbers that were applied
✓ returns empty array if no migrations needed
✓ creates _migrations table automatically if not exists
✓ _migrations table has columns: version (INTEGER PRIMARY KEY), applied_at (TEXT)
✓ stores applied_at as ISO 8601 timestamp
```

### Migration Object Structure

```typescript
interface Migration {
  version: number      // positive integer, unique
  up: string          // SQL to apply migration (required)
  down?: string       // SQL to reverse migration (optional)
}
```

```
✓ version must be positive integer (>= 1)
✓ version 0 throws Error('Migration version must be >= 1')
✓ negative version throws Error
✓ non-integer version throws Error
✓ duplicate versions in array throws Error('Duplicate migration version: N')
✓ up is required, throws Error if missing
✓ down is optional (for rollback support)
```

### Migration Execution Order

```
✓ migrations run in ascending version order regardless of array order
✓ [{ version: 3, ... }, { version: 1, ... }] runs version 1 first
✓ gaps in versions are allowed: [1, 2, 5, 10] is valid
✓ only versions greater than current are applied
✓ if current version is 3, only versions 4+ are applied
```

### Migration Transactions

```
✓ each migration runs in its own transaction
✓ migration failure rolls back that migration only
✓ previously successful migrations are not rolled back on later failure
✓ failed migration is not recorded in _migrations table
✓ error includes migration version number
✓ error includes original SQL error message
```

### `db.rollback(targetVersion?)`

```
✓ rolls back to specified target version
✓ targetVersion 0 rolls back all migrations (empty schema)
✓ targetVersion undefined defaults to 0 (roll back everything)
✓ runs down migrations in descending order (newest first)
✓ removes entries from _migrations table as each rollback completes
✓ throws MigrationError if down migration not provided for a version
✓ throws MigrationError if target version > current version
✓ throws MigrationError if target version is negative
✓ returns array of version numbers that were rolled back
```

### `db.getMigrationVersion()`

```
✓ returns current migration version as number
✓ returns 0 if no migrations have been applied
✓ returns highest version number from _migrations table
✓ returns correct value after migrate() call
✓ returns correct value after rollback() call
```

---

## 7. Transactions

### `db.transaction(fn)`

```
✓ executes synchronous function within BEGIN/COMMIT
✓ executes async function within BEGIN/COMMIT
✓ returns the function's return value
✓ function can return any type (T)
✓ function can return Promise<T>
✓ commits if function completes successfully
✓ rolls back if function throws error
✓ rolls back if function returns rejected promise
✓ re-throws the original error after rollback
✓ error stack trace preserved through rollback
```

### Transaction Isolation

```
✓ changes visible within transaction via subsequent queries
✓ changes committed after successful transaction
✓ changes discarded after rollback
✓ INSERT within transaction visible to SELECT within same transaction
✓ UPDATE within transaction visible to SELECT within same transaction
```

### Nested Transactions (Savepoints)

```
✓ nested transaction() calls use SQLite SAVEPOINTs
✓ outer transaction can contain inner transaction
✓ inner transaction failure rolls back to savepoint, not entire transaction
✓ outer transaction can continue after inner transaction failure (if caught)
✓ outer transaction failure rolls back everything including inner changes
✓ savepoint names are unique (e.g., sp_1, sp_2, sp_3)
✓ deeply nested transactions work (3+ levels)
```

### `db.inTransaction`

```
✓ returns false when not in a transaction
✓ returns true when inside transaction() callback
✓ returns true in nested transaction
✓ returns false after transaction completes
✓ returns false after transaction rolls back
✓ read-only property (cannot be assigned)
```

---

## 8. Table Helper

### `db.table<T>(tableName, options?)`

```
✓ returns TableHelper<T> object
✓ tableName is required, throws Error if empty
✓ options.primaryKey sets default primary key column (default 'id')
✓ helper methods operate on specified table
✓ does not validate table exists (errors occur on query)
```

### `table.insert(data)`

```
✓ inserts row from object properties
✓ returns inserted row's primary key value (number)
✓ object keys become column names
✓ object values become column values
✓ handles partial data (omits columns with DEFAULT constraints)
✓ null values insert NULL
✓ undefined values are omitted from INSERT (use column default)
✓ throws SqlConstraintError on NOT NULL violation
✓ throws SqlConstraintError on UNIQUE violation
✓ throws SqlConstraintError on FOREIGN KEY violation
✓ throws SqlNotFoundError if table doesn't exist
✓ SQL injection prevented in column names (throws on suspicious characters)
```

### `table.find(id, options?)`

```
✓ finds row by primary key value
✓ uses 'id' column by default
✓ uses options.primaryKey from table() constructor if set
✓ options.key overrides primary key for this call only
✓ returns row object or undefined
✓ returns undefined if row not found
✓ returns undefined if table empty
✓ handles numeric primary key
✓ handles string primary key (UUID)
```

### `table.where(conditions)`

```
✓ finds rows matching all conditions (AND logic)
✓ { name: 'Alice' } generates WHERE name = ?
✓ { name: 'Alice', age: 25 } generates WHERE name = ? AND age = ?
✓ returns array of matching rows
✓ returns empty array if no matches
✓ null condition matches NULL: { deleted_at: null } → WHERE deleted_at IS NULL
✓ empty conditions {} returns all rows (equivalent to table.all())
✓ conditions are parameterized (SQL injection prevented)
✓ throws SqlNotFoundError if table doesn't exist
✓ throws SqlNotFoundError if column in conditions doesn't exist
```

### `table.update(id, data, options?)`

```
✓ updates row identified by primary key
✓ uses configured primary key column
✓ options.key overrides primary key for this call
✓ updates only columns present in data object
✓ returns number of rows changed (0 or 1)
✓ returns 0 if row not found
✓ undefined values in data are ignored (column not updated)
✓ null values in data set column to NULL
✓ throws SqlConstraintError on constraint violations
```

### `table.delete(id, options?)`

```
✓ deletes row identified by primary key
✓ uses configured primary key column
✓ options.key overrides primary key for this call
✓ returns number of rows deleted (0 or 1)
✓ returns 0 if row not found
✓ throws SqlConstraintError if foreign key prevents deletion
```

### `table.count(conditions?)`

```
✓ counts all rows if no conditions
✓ counts matching rows if conditions provided
✓ returns number (not object)
✓ returns 0 for empty table
✓ same condition syntax as where()
```

### `table.all()`

```
✓ returns all rows in table
✓ returns empty array if table empty
✓ no ORDER BY guarantee (returns in undefined order)
```

---

## 9. Export/Import

### `db.export()`

```
✓ returns database as Uint8Array
✓ returned data is valid SQLite database file
✓ includes all tables and data
✓ includes all indexes
✓ includes schema information
✓ export is a snapshot (changes after export not included)
✓ can be saved to file via download
✓ can be used to create new database: createDatabase({ data: exported })
```

### `db.import(data)`

```
✓ replaces entire database contents
✓ accepts Uint8Array
✓ accepts ArrayBuffer (converted internally)
✓ previous data is completely replaced
✓ previous tables are dropped
✓ validates data is valid SQLite format before replacing
✓ throws SqlError if data is not valid SQLite file
✓ throws SqlError if data is corrupted
✓ on error, original database unchanged
✓ triggers save to persistent storage if autoSave enabled
```

### Round-trip Integrity

```
✓ export → createDatabase({ data }) preserves all table data
✓ export → createDatabase({ data }) preserves all table schemas
✓ export → createDatabase({ data }) preserves all indexes
✓ export → createDatabase({ data }) preserves _migrations table
✓ export → import preserves all data
✓ export → import preserves Unicode text
✓ export → import preserves BLOB data
✓ export → import preserves NULL values
✓ export → import preserves empty strings (distinct from NULL)
```

---

## 10. Persistence

### IndexedDB Persistence

```
✓ persist: { storage: 'indexeddb', key: 'mydb' } enables IndexedDB storage
✓ database stored in IndexedDB database named '__motioneffector_sql'
✓ key becomes object store key
✓ saves database as Uint8Array blob
✓ auto-saves after mutation (run, exec, transaction, import) when autoSave true
✓ auto-save is debounced (default 1000ms)
✓ consecutive rapid mutations result in single save
✓ restores from IndexedDB on createDatabase if key exists
✓ handles IndexedDB unavailable (private browsing): warns and continues without persistence
✓ handles storage quota exceeded: throws Error with clear message
✓ multiple databases with different keys work independently
```

### localStorage Persistence

```
✓ persist: { storage: 'localstorage', key: 'mydb' } enables localStorage
✓ key becomes localStorage key (prefixed: '__motioneffector_sql_mydb')
✓ encodes database as base64 string
✓ auto-saves after mutation when autoSave true
✓ auto-save is debounced
✓ restores from localStorage on createDatabase if key exists
✓ handles localStorage unavailable: warns and continues without persistence
✓ handles localStorage quota exceeded (typically 5-10MB): throws Error
✓ base64 encoding increases storage size ~33%
```

### `db.save()`

```
✓ manually triggers save to persistent storage
✓ returns Promise<void>
✓ no-op if persistence not configured (resolves immediately)
✓ saves current database state immediately (ignores debounce)
✓ can be called during debounce window to force immediate save
```

### `db.load()`

```
✓ manually loads from persistent storage
✓ replaces current database contents with stored version
✓ returns Promise<void>
✓ no-op if persistence not configured (resolves immediately)
✓ no-op if nothing saved yet (database unchanged)
✓ useful for discarding in-memory changes
```

### Auto-save Configuration

```
✓ autoSave defaults to true when persist option is set
✓ autoSave defaults to false when persist option is not set
✓ autoSave: false disables automatic saves (manual save() required)
✓ autoSaveDebounce defaults to 1000 milliseconds
✓ autoSaveDebounce: 0 saves immediately (no debounce)
✓ autoSaveDebounce: 5000 waits 5 seconds after last mutation
✓ debounce timer resets on each mutation
```

---

## 11. Database Info

### `db.getTables()`

```
✓ returns array of table names as strings
✓ excludes sqlite_* internal tables
✓ excludes _migrations table (implementation detail)
✓ returns empty array for empty database
✓ includes tables created by migrations
✓ reflects current state (newly created tables appear)
```

### `db.getTableInfo(tableName)`

```
✓ returns array of column info objects
✓ throws SqlNotFoundError if table doesn't exist
```

Column info object structure:
```typescript
interface ColumnInfo {
  name: string           // column name
  type: string           // declared type (e.g., 'INTEGER', 'TEXT', 'BLOB')
  nullable: boolean      // true if NULL allowed (no NOT NULL constraint)
  defaultValue: any      // default value or null
  primaryKey: boolean    // true if part of PRIMARY KEY
}
```

```
✓ name is the column name as declared
✓ type is the declared type (may be empty string if none)
✓ nullable is false if NOT NULL constraint present
✓ defaultValue is the DEFAULT value or null if none
✓ primaryKey is true for PRIMARY KEY column(s)
✓ returns columns in declaration order
```

### `db.getIndexes(tableName?)`

```
✓ returns array of index info objects
✓ if tableName provided, returns indexes for that table only
✓ if tableName omitted, returns all indexes in database
✓ excludes sqlite_autoindex_* automatic indexes
```

Index info object structure:
```typescript
interface IndexInfo {
  name: string           // index name
  table: string          // table the index is on
  unique: boolean        // true if UNIQUE index
  columns: string[]      // column names in index
}
```

```
✓ includes manually created indexes
✓ unique is true for UNIQUE indexes
✓ columns array reflects index column order
```

---

## 12. Database Management

### `db.close()`

```
✓ closes the database connection
✓ saves to persistent storage if persistence configured and autoSave true
✓ returns void
✓ subsequent run() throws Error('Database is closed')
✓ subsequent get() throws Error('Database is closed')
✓ subsequent all() throws Error('Database is closed')
✓ subsequent exec() throws Error('Database is closed')
✓ subsequent transaction() throws Error('Database is closed')
✓ can call close() multiple times safely (no error on second call)
✓ releases WASM memory
```

### `db.clone()`

```
✓ creates independent copy of database
✓ returns Promise<Database>
✓ clone has same schema as original
✓ clone has same data as original
✓ changes to clone do not affect original
✓ changes to original do not affect clone
✓ clone does not inherit persistence settings (in-memory only)
✓ clone can have its own persistence configured separately
```

### `db.clear()`

```
✓ deletes all data from all tables
✓ preserves table schemas (tables still exist)
✓ preserves indexes
✓ resets AUTOINCREMENT counters to 0
✓ does not clear _migrations table (migration state preserved)
✓ returns void
✓ triggers auto-save if configured
```

### `db.destroy()`

```
✓ closes the database connection
✓ removes data from persistent storage if configured
✓ returns Promise<void>
✓ subsequent operations throw Error('Database is closed')
✓ IndexedDB: removes the key from object store
✓ localStorage: removes the key from localStorage
✓ if persistence not configured, equivalent to close()
```

---

## 13. Query Building Helpers

### `db.sql` Tagged Template Literal

```typescript
const name = 'Alice'
const age = 25
db.get(db.sql`SELECT * FROM users WHERE name = ${name} AND age = ${age}`)
```

```
✓ returns object with sql string and params array
✓ interpolated values extracted as parameters
✓ result can be spread into get/all/run: db.get(...db.sql`...`)
✓ alternative: db.get(db.sql`...`) accepts the object directly
```

Return type:
```typescript
interface SqlTemplate {
  sql: string      // 'SELECT * FROM users WHERE name = ? AND age = ?'
  params: any[]    // ['Alice', 25]
}
```

### SQL Injection Prevention

```
✓ interpolations become ? placeholders, never raw SQL
✓ db.sql`SELECT * FROM ${tableName}` DOES NOT work for identifiers
✓ only values (WHERE, INSERT VALUES) should be interpolated
✓ table/column names must be hardcoded in template
```

### Multiple Interpolations

```
✓ handles zero interpolations: db.sql`SELECT 1` → { sql: 'SELECT 1', params: [] }
✓ handles single interpolation
✓ handles many interpolations (10+)
✓ interpolations can be adjacent: db.sql`(${a}, ${b}, ${c})`
✓ preserves whitespace and newlines in SQL
```

---

## 14. Prepared Statements

### `db.prepare(sql)`

```
✓ returns PreparedStatement object
✓ parses SQL once, can execute multiple times
✓ throws SqlSyntaxError if SQL invalid
✓ must call finalize() when done to release resources
```

### PreparedStatement Methods

```typescript
interface PreparedStatement<T = any> {
  run(params?: any[] | object): { changes: number, lastInsertRowId: number }
  get(params?: any[] | object): T | undefined
  all(params?: any[] | object): T[]
  finalize(): void
}
```

```
✓ run() executes statement with given params
✓ get() returns first row
✓ all() returns all rows
✓ same parameter binding as db.run/get/all
✓ finalize() releases statement resources
✓ calling methods after finalize() throws Error
```

### Performance

```
✓ prepared statement faster than db.run() for repeated execution
✓ 1000 inserts with prepared statement faster than 1000 db.run() calls
✓ statement can be reused with different parameters
```

---

## 15. Batch Operations

### `db.insertMany(tableName, rows)`

```
✓ inserts multiple rows in single transaction
✓ rows is array of objects
✓ returns array of inserted row IDs
✓ all rows must have same keys (columns)
✓ throws Error if rows have inconsistent columns
✓ rolls back all inserts if any fails
✓ faster than individual insert() calls
✓ handles empty array (returns empty array, no error)
```

### Performance

```
✓ insertMany(1000 rows) faster than 1000 individual inserts
✓ uses prepared statement internally
✓ single transaction for all rows
```

---

## 16. Error Handling

### Error Hierarchy

```typescript
class SqlError extends Error {
  code: string           // SQLite error code (e.g., 'SQLITE_CONSTRAINT')
  sql?: string           // SQL that caused error
  params?: any[]         // Parameters that were bound
}

class SqlSyntaxError extends SqlError {}      // Parse/syntax errors
class SqlConstraintError extends SqlError {}  // UNIQUE, FK, CHECK violations
class SqlNotFoundError extends SqlError {}    // Table/column doesn't exist
class MigrationError extends SqlError {}      // Migration-specific failures
```

### SqlError Properties

```
✓ all SQL errors extend SqlError
✓ error.code contains SQLite error code string
✓ error.sql contains the SQL statement that failed (if applicable)
✓ error.params contains the bound parameters (if applicable)
✓ error.message is human-readable description
✓ error.stack is preserved for debugging
```

### SqlSyntaxError

```
✓ thrown for SQL parse errors
✓ 'SELEC * FROM users' (typo) throws SqlSyntaxError
✓ unclosed quote throws SqlSyntaxError
✓ invalid keyword throws SqlSyntaxError
```

### SqlConstraintError

```
✓ thrown for UNIQUE constraint violation
✓ thrown for PRIMARY KEY constraint violation
✓ thrown for FOREIGN KEY constraint violation
✓ thrown for NOT NULL constraint violation
✓ thrown for CHECK constraint violation
✓ error.code is 'SQLITE_CONSTRAINT' or more specific subcode
```

### SqlNotFoundError

```
✓ thrown when querying non-existent table
✓ thrown when querying non-existent column
✓ thrown when table.find() on non-existent table
✓ error message includes table/column name
```

### MigrationError

```
✓ thrown when migration up script fails
✓ thrown when migration down script fails
✓ thrown when rollback requested but down not provided
✓ error message includes migration version
✓ wraps original SqlError if SQL failure
```

---

## 17. Edge Cases

### Empty and Null Values

```
✓ empty string '' is distinct from NULL
✓ get() returns '' for empty TEXT column
✓ get() returns null for NULL column
✓ WHERE col = '' does not match NULL
✓ WHERE col IS NULL does not match ''
✓ insert empty string, retrieve empty string
✓ insert NULL, retrieve null
```

### Unicode and Special Characters

```
✓ stores and retrieves Unicode text: '你好世界'
✓ stores and retrieves emoji: '👋🌍'
✓ stores and retrieves RTL text: 'مرحبا'
✓ stores and retrieves special chars: '\n\t\r\0'
✓ handles very long Unicode strings (1MB+)
```

### Binary Data (BLOBs)

```
✓ stores Uint8Array as BLOB
✓ retrieves BLOB as Uint8Array
✓ handles empty Uint8Array (0 bytes)
✓ handles large BLOB (10MB)
✓ BLOB data round-trips exactly (byte-for-byte)
✓ can store any binary data (images, encrypted data, etc.)
```

### Numeric Limits

```
✓ handles INTEGER at SQLite max: 9223372036854775807 (2^63-1)
✓ handles INTEGER at SQLite min: -9223372036854775808 (-2^63)
✓ integers beyond JS safe integer (2^53) may lose precision
✓ BigInt parameters stored as TEXT to preserve precision
✓ REAL handles standard floating point range
✓ REAL handles special values: Infinity, -Infinity, NaN as NULL
```

### Large Data

```
✓ handles table with 100,000 rows
✓ handles table with 100 columns
✓ handles single TEXT cell with 10MB data
✓ database file size limited only by memory (WASM heap)
```

### Concurrent Operations

```
✓ SQL.js is single-threaded (no true concurrency)
✓ rapid sequential operations work correctly
✓ async operations (save) don't corrupt data
✓ multiple transaction() calls serialize correctly
```

### Environment Compatibility

```
✓ works in main browser thread
✓ works in Web Worker
✓ works in Node.js environment (if applicable)
✓ works in Electron renderer process
```

---

## 18. Closed Database Behavior

```
✓ run() on closed database throws Error('Database is closed')
✓ get() on closed database throws Error('Database is closed')
✓ all() on closed database throws Error('Database is closed')
✓ exec() on closed database throws Error('Database is closed')
✓ transaction() on closed database throws Error('Database is closed')
✓ migrate() on closed database throws Error('Database is closed')
✓ export() on closed database throws Error('Database is closed')
✓ import() on closed database throws Error('Database is closed')
✓ table() on closed database throws Error('Database is closed')
✓ save() on closed database throws Error('Database is closed')
✓ close() on closed database is no-op (no error)
✓ error is thrown synchronously, not via rejection
```

---

## Test Utilities

### Setup Helpers

```typescript
// Create test database with common schema
async function createTestDb(): Promise<Database>

// Create database with specific tables
async function createTestDbWithSchema(sql: string): Promise<Database>

// Seed test data
function seedUsers(db: Database, count: number): void
```

### Assertions

```typescript
// Compare two databases have same content
function assertDatabasesEqual(db1: Database, db2: Database): void

// Assert table has expected row count
function assertRowCount(db: Database, table: string, expected: number): void

// Assert table exists
function assertTableExists(db: Database, table: string): void
```

### Mocks

```typescript
// Mock IndexedDB for persistence tests
function mockIndexedDB(): MockIndexedDB

// Mock localStorage for persistence tests
function mockLocalStorage(): MockStorage

// Mock fetch for WASM loading tests
function mockWasmFetch(options?: { fail?: boolean }): void
```

### Test Schema Fixtures

```sql
-- users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  age INTEGER,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- posts table (with foreign key)
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  published INTEGER DEFAULT 0
);

-- tags table (many-to-many)
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE post_tags (
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
```

---

## Test Organization

Tests should be organized by feature area:

```
tests/
  createDatabase.test.ts
  run.test.ts
  get.test.ts
  all.test.ts
  exec.test.ts
  migrations.test.ts
  transactions.test.ts
  tableHelper.test.ts
  exportImport.test.ts
  persistence.test.ts
  databaseInfo.test.ts
  management.test.ts
  sqlTemplate.test.ts
  preparedStatements.test.ts
  batchOperations.test.ts
  errors.test.ts
  edgeCases.test.ts
```

Each test file should:
1. Set up fresh database in beforeEach
2. Clean up in afterEach (close database)
3. Group related tests with describe blocks
4. Use clear, specific test names
