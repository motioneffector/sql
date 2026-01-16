# Schema Migrations

Migrations let you evolve your database schema over time without losing data. Define schema changes as versioned scripts, and the library applies only the ones that haven't run yet.

## Prerequisites

Before starting, you should:

- [Create a database](Your-First-Database)
- [Understand basic queries](Concept-Query-Methods)

## Overview

We'll set up migrations by:

1. Defining migration objects
2. Running migrations on startup
3. Checking the current version
4. Rolling back when needed

## Step 1: Define Migrations

Each migration needs a version number and an `up` script. The `down` script is optional but needed for rollback.

```typescript
import type { Migration } from '@motioneffector/sql'

const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `,
    down: 'DROP TABLE users'
  },
  {
    version: 2,
    up: `
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT,
        created_at TEXT NOT NULL
      )
    `,
    down: 'DROP TABLE posts'
  },
  {
    version: 3,
    up: 'CREATE INDEX idx_posts_user ON posts(user_id)',
    down: 'DROP INDEX idx_posts_user'
  }
]
```

Versions must be positive integers. They run in ascending order regardless of array order.

## Step 2: Run Migrations on Startup

Call `db.migrate()` when your app starts. It's safe to call every time—only unapplied migrations run.

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

const applied = await db.migrate(migrations)

if (applied.length > 0) {
  console.log(`Applied migrations: ${applied.join(', ')}`)
} else {
  console.log('Database is up to date')
}
```

## Step 3: Check Current Version

Query the migration version to see your schema state:

```typescript
const version = db.getMigrationVersion()
console.log(`Database schema version: ${version}`)

if (version < 3) {
  console.log('Please update the app to apply latest migrations')
}
```

## Step 4: Roll Back When Needed

During development, you might need to undo migrations:

```typescript
// Roll back to version 1 (undoes versions 2 and 3)
const rolledBack = await db.rollback(1, migrations)
console.log(`Rolled back: ${rolledBack.join(', ')}`) // [3, 2]

// Roll back everything
await db.rollback(0, migrations)
```

Rollback requires the migrations array because it needs the `down` scripts.

## Complete Example

A typical startup pattern with error handling:

```typescript
import { createDatabase, MigrationError } from '@motioneffector/sql'
import type { Migration } from '@motioneffector/sql'

const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE
      )
    `,
    down: 'DROP TABLE users'
  },
  {
    version: 2,
    up: 'ALTER TABLE users ADD COLUMN name TEXT',
    down: `
      CREATE TABLE users_backup AS SELECT id, email FROM users;
      DROP TABLE users;
      ALTER TABLE users_backup RENAME TO users;
    `
  }
]

async function initDatabase() {
  const db = await createDatabase({
    persist: { key: 'my-app', storage: 'indexeddb' }
  })

  try {
    const applied = await db.migrate(migrations)
    console.log(`Database ready (version ${db.getMigrationVersion()})`)
    if (applied.length > 0) {
      console.log(`Applied: ${applied.join(', ')}`)
    }
  } catch (error) {
    if (error instanceof MigrationError) {
      console.error(`Migration ${error.version} failed: ${error.message}`)
      // Consider: show user an error, try recovery, etc.
    }
    throw error
  }

  return db
}
```

## Variations

### Adding Columns

SQLite has limited ALTER TABLE support. For simple additions:

```typescript
{
  version: 4,
  up: 'ALTER TABLE users ADD COLUMN avatar_url TEXT',
  down: `
    CREATE TABLE users_new AS SELECT id, email, name FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `
}
```

### Data Migrations

Transform data as part of a schema change:

```typescript
{
  version: 5,
  up: `
    -- Add new column
    ALTER TABLE users ADD COLUMN display_name TEXT;

    -- Populate from existing data
    UPDATE users SET display_name = email WHERE display_name IS NULL;
  `,
  down: `
    CREATE TABLE users_new AS SELECT id, email, name, avatar_url FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `
}
```

### Creating Indexes

Add indexes for query performance:

```typescript
{
  version: 6,
  up: `
    CREATE INDEX idx_posts_created ON posts(created_at DESC);
    CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);
  `,
  down: `
    DROP INDEX idx_posts_created;
    DROP INDEX idx_posts_user_created;
  `
}
```

### Gaps in Version Numbers

Versions don't need to be sequential. This is useful for feature branches:

```typescript
const migrations: Migration[] = [
  { version: 1, up: '...' },
  { version: 2, up: '...' },
  { version: 10, up: '...' },  // Feature A
  { version: 20, up: '...' },  // Feature B
]
```

## Troubleshooting

### Migration Fails with Syntax Error

**Symptom:** `SqlSyntaxError` during migration.

**Cause:** Invalid SQL in the `up` script.

**Solution:** Test your SQL in a SQLite client first. Check for SQLite-specific syntax (it differs from MySQL/PostgreSQL).

### Can't Roll Back

**Symptom:** `MigrationError: Migration X has no down script`.

**Cause:** The migration doesn't have a `down` property.

**Solution:** Add a `down` script, or accept that rollback isn't available for that version.

### Foreign Key Errors

**Symptom:** Migration fails with foreign key constraint error.

**Cause:** Creating tables in wrong order, or referencing non-existent tables.

**Solution:** Order your migrations so referenced tables are created first.

## See Also

- **[Migrations Concept](Concept-Migrations)** - How the migration system works
- **[Migration Methods API](API-Migration-Methods)** - Complete method reference
- **[Transactions](Concept-Transactions)** - Each migration runs in a transaction
