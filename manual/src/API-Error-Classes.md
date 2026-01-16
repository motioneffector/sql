# Error Classes API

Error types for handling database failures.

---

## `SqlError`

Base class for all SQL-related errors.

**Signature:**

```typescript
class SqlError extends Error {
  code: string
  sql?: string
  params?: unknown[]
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Always `'SqlError'` |
| `message` | `string` | Error description |
| `code` | `string` | SQLite error code (e.g., `'SQLITE_ERROR'`) |
| `sql` | `string` | SQL statement that caused the error (if applicable) |
| `params` | `unknown[]` | Parameters that were bound (if applicable) |

**Example:**

```typescript
import { SqlError } from '@motioneffector/sql'

try {
  db.run('SELECT * FROM nonexistent')
} catch (error) {
  if (error instanceof SqlError) {
    console.log(error.code)    // 'SQLITE_ERROR'
    console.log(error.sql)     // 'SELECT * FROM nonexistent'
    console.log(error.message) // 'no such table: nonexistent'
  }
}
```

---

## `SqlSyntaxError`

Thrown when SQL cannot be parsed.

**Signature:**

```typescript
class SqlSyntaxError extends SqlError {
  // Inherits all SqlError properties
}
```

**Example:**

```typescript
import { SqlSyntaxError } from '@motioneffector/sql'

try {
  db.exec('SELEKT * FORM users') // Typos
} catch (error) {
  if (error instanceof SqlSyntaxError) {
    console.log('Invalid SQL:', error.message)
  }
}
```

**Triggered by:**

- Syntax errors (`near "SELEKT": syntax error`)
- Unrecognized tokens
- Incomplete statements
- Malformed SQL

---

## `SqlConstraintError`

Thrown when a constraint is violated.

**Signature:**

```typescript
class SqlConstraintError extends SqlError {
  // Inherits all SqlError properties
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | Specific constraint code |

Common codes:
- `SQLITE_CONSTRAINT_UNIQUE` — Duplicate value in UNIQUE column
- `SQLITE_CONSTRAINT_NOTNULL` — NULL in NOT NULL column
- `SQLITE_CONSTRAINT_FOREIGNKEY` — Foreign key violation
- `SQLITE_CONSTRAINT_CHECK` — CHECK constraint failed
- `SQLITE_CONSTRAINT_PRIMARYKEY` — Primary key violation

**Example:**

```typescript
import { SqlConstraintError } from '@motioneffector/sql'

try {
  db.run('INSERT INTO users (email) VALUES (?)', ['taken@example.com'])
} catch (error) {
  if (error instanceof SqlConstraintError) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.log('Email already exists')
    }
  }
}
```

---

## `SqlNotFoundError`

Thrown when a referenced object doesn't exist.

**Signature:**

```typescript
class SqlNotFoundError extends SqlError {
  // Inherits all SqlError properties
}
```

**Example:**

```typescript
import { SqlNotFoundError } from '@motioneffector/sql'

try {
  db.run('INSERT INTO nonexistent VALUES (1)')
} catch (error) {
  if (error instanceof SqlNotFoundError) {
    console.log('Table or column not found:', error.message)
  }
}
```

**Triggered by:**

- `no such table: X`
- `no such column: X`
- Table/column not found in helpers

---

## `MigrationError`

Thrown when a migration fails.

**Signature:**

```typescript
class MigrationError extends SqlError {
  version?: number
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `version` | `number` | Migration version that failed |

**Example:**

```typescript
import { MigrationError } from '@motioneffector/sql'

try {
  await db.migrate(migrations)
} catch (error) {
  if (error instanceof MigrationError) {
    console.log(`Migration ${error.version} failed:`, error.message)
  }
}
```

**Triggered by:**

- Invalid migration version (< 1, not integer)
- Duplicate migration versions
- SQL error in up/down script
- Missing down script for rollback
- Target version out of range

---

## Error Hierarchy

```
Error
└── SqlError
    ├── SqlSyntaxError
    ├── SqlConstraintError
    ├── SqlNotFoundError
    └── MigrationError
```

Use `instanceof` to check error types. All SQL errors extend `SqlError`, so you can catch broadly or specifically:

```typescript
try {
  // ... database operations
} catch (error) {
  if (error instanceof SqlConstraintError) {
    // Handle constraint violations specifically
  } else if (error instanceof SqlError) {
    // Handle other SQL errors
  } else {
    // Non-SQL error
    throw error
  }
}
```
