# Migrations

Migrations are versioned SQL scripts that evolve your database schema over time. As your application grows, you'll need to add tables, columns, and indexes. Migrations track which changes have been applied and apply only the new ones.

## How It Works

Each migration has a version number and an `up` script (SQL to apply the change). Optionally, include a `down` script to reverse the change.

```typescript
const migrations = [
  { version: 1, up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' },
  { version: 2, up: 'ALTER TABLE users ADD COLUMN email TEXT' },
  { version: 3, up: 'CREATE INDEX idx_users_email ON users(email)' }
]

await db.migrate(migrations)
```

The library:
1. Creates a `_migrations` table to track applied versions
2. Runs each unapplied migration in version order
3. Records each successful migration with a timestamp
4. Returns the list of newly applied version numbers

Each migration runs in its own transaction. If migration 3 fails, migrations 1 and 2 remain applied.

## Basic Usage

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

const migrations = [
  {
    version: 1,
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `,
    down: 'DROP TABLE users'
  }
]

const applied = await db.migrate(migrations)
console.log(applied) // [1] on first run, [] on subsequent runs
```

## Key Points

- **Version order matters** - Migrations run in ascending version order, not array order
- **Idempotent by design** - Calling `migrate()` multiple times only applies new migrations
- **Individual transactions** - Each migration is atomic; failures don't affect earlier migrations
- **Rollback requires `down`** - The `down` script is optional but needed for `db.rollback()`
- **Gaps are fine** - Versions don't need to be sequential (1, 2, 5, 10 is valid)

## Examples

### Checking Current Version

See which migrations have been applied:

```typescript
const version = db.getMigrationVersion()
console.log(`Database is at version ${version}`)
```

### Rolling Back

Undo migrations back to a target version:

```typescript
const migrations = [
  { version: 1, up: 'CREATE TABLE a (id INTEGER)', down: 'DROP TABLE a' },
  { version: 2, up: 'CREATE TABLE b (id INTEGER)', down: 'DROP TABLE b' },
  { version: 3, up: 'CREATE TABLE c (id INTEGER)', down: 'DROP TABLE c' }
]

await db.migrate(migrations) // At version 3

await db.rollback(1, migrations) // Back to version 1
// Tables b and c are dropped, only a remains
```

### Data Migrations

Move or transform data as part of a schema change:

```typescript
const migrations = [
  {
    version: 1,
    up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, fullname TEXT)'
  },
  {
    version: 2,
    up: `
      ALTER TABLE users ADD COLUMN first_name TEXT;
      ALTER TABLE users ADD COLUMN last_name TEXT;
      UPDATE users SET
        first_name = substr(fullname, 1, instr(fullname, ' ') - 1),
        last_name = substr(fullname, instr(fullname, ' ') + 1);
    `
  }
]
```

### Handling Migration Errors

Failed migrations throw `MigrationError` with the version number:

```typescript
import { MigrationError } from '@motioneffector/sql'

try {
  await db.migrate(migrations)
} catch (error) {
  if (error instanceof MigrationError) {
    console.error(`Migration ${error.version} failed:`, error.message)
  }
}
```

## Related

- **[Schema Migrations Guide](Guide-Schema-Migrations)** - Step-by-step migration patterns
- **[Migration Methods API](API-Migration-Methods)** - Complete method signatures
- **[Transactions](Concept-Transactions)** - How migrations use transactions internally
