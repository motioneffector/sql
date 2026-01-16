# Database Info API

Methods for schema introspection.

---

## `getTables()`

Returns a list of table names in the database.

**Signature:**

```typescript
getTables(): string[]
```

**Returns:** `string[]` — Array of table names

**Example:**

```typescript
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY)')

const tables = db.getTables()
console.log(tables) // ['users', 'posts']
```

**Notes:**

- Excludes SQLite system tables (sqlite_*)
- Excludes the internal `_migrations` table
- Order is not guaranteed

---

## `getTableInfo()`

Returns column information for a table.

**Signature:**

```typescript
getTableInfo(tableName: string): ColumnInfo[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableName` | `string` | Yes | Name of the table |

**Returns:** `ColumnInfo[]` — Array of column definitions

**Example:**

```typescript
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER DEFAULT 0
  )
`)

const columns = db.getTableInfo('users')
console.log(columns)
// [
//   { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKey: true },
//   { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, primaryKey: false },
//   { name: 'email', type: 'TEXT', nullable: true, defaultValue: null, primaryKey: false },
//   { name: 'age', type: 'INTEGER', nullable: true, defaultValue: '0', primaryKey: false }
// ]
```

**Throws:**

- `SqlNotFoundError` — If table doesn't exist

---

## `getIndexes()`

Returns index information for tables.

**Signature:**

```typescript
getIndexes(tableName?: string): IndexInfo[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableName` | `string` | No | Filter to specific table |

**Returns:** `IndexInfo[]` — Array of index definitions

**Example:**

```typescript
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE);
  CREATE INDEX idx_email ON users(email);
`)

// All indexes
const allIndexes = db.getIndexes()

// Indexes for specific table
const userIndexes = db.getIndexes('users')
console.log(userIndexes)
// [
//   { name: 'idx_email', table: 'users', unique: false, columns: ['email'] }
// ]
```

**Notes:**

- Excludes SQLite auto-generated indexes (sqlite_autoindex_*)
- UNIQUE constraints may appear as indexes

---

## Types

### `ColumnInfo`

```typescript
interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: unknown
  primaryKey: boolean
}
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Column name |
| `type` | `string` | Declared type (e.g., 'INTEGER', 'TEXT', 'BLOB') |
| `nullable` | `boolean` | Whether NULL values are allowed |
| `defaultValue` | `unknown` | Default value or null |
| `primaryKey` | `boolean` | Whether this is a primary key column |

### `IndexInfo`

```typescript
interface IndexInfo {
  name: string
  table: string
  unique: boolean
  columns: string[]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Index name |
| `table` | `string` | Table the index is on |
| `unique` | `boolean` | Whether this is a UNIQUE index |
| `columns` | `string[]` | Column names in the index |
