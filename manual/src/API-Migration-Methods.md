# Migration Methods API

Methods for schema versioning and migrations.

---

## `migrate()`

Applies pending migrations to the database.

**Signature:**

```typescript
migrate(migrations: Migration[]): Promise<number[]>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `migrations` | `Migration[]` | Yes | Array of migration definitions |

**Returns:** `Promise<number[]>` — Array of version numbers that were applied

**Example:**

```typescript
const migrations: Migration[] = [
  {
    version: 1,
    up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
    down: 'DROP TABLE users'
  },
  {
    version: 2,
    up: 'ALTER TABLE users ADD COLUMN email TEXT',
    down: 'ALTER TABLE users DROP COLUMN email'
  }
]

const applied = await db.migrate(migrations)
console.log(applied) // [1, 2] first time, [] subsequently
```

**Behavior:**

- Creates `_migrations` table if it doesn't exist
- Runs migrations in ascending version order
- Skips already-applied migrations
- Each migration runs in its own transaction
- Records each successful migration with timestamp

**Throws:**

- `Error` — If version is not a positive integer
- `Error` — If duplicate versions exist
- `Error` — If migration is missing `up` script
- `MigrationError` — If migration SQL fails (includes version number)

---

## `rollback()`

Reverts migrations back to a target version.

**Signature:**

```typescript
rollback(targetVersion?: number, migrations?: Migration[]): Promise<number[]>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `targetVersion` | `number` | No | Version to roll back to. Default: `0` (all) |
| `migrations` | `Migration[]` | No | Migrations with `down` scripts |

**Returns:** `Promise<number[]>` — Array of version numbers that were rolled back

**Example:**

```typescript
// Roll back to version 1
const rolledBack = await db.rollback(1, migrations)
console.log(rolledBack) // [3, 2] (rolled back in descending order)

// Roll back everything
await db.rollback(0, migrations)

// Roll back without target (same as 0)
await db.rollback(undefined, migrations)
```

**Behavior:**

- Runs `down` scripts in descending version order
- Removes entries from `_migrations` table
- Each rollback runs in its own transaction

**Throws:**

- `MigrationError` — If target version is negative
- `MigrationError` — If target version > current version
- `MigrationError` — If migration has no `down` script
- `MigrationError` — If rollback SQL fails

---

## `getMigrationVersion()`

Returns the current migration version.

**Signature:**

```typescript
getMigrationVersion(): number
```

**Returns:** `number` — Highest applied migration version, or `0` if none applied

**Example:**

```typescript
const version = db.getMigrationVersion()
console.log(`Database at version ${version}`)

if (version < 5) {
  console.log('Database needs update')
}
```

---

## Types

### `Migration`

```typescript
interface Migration {
  version: number
  up: string
  down?: string
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | `number` | Yes | Version number (must be >= 1) |
| `up` | `string` | Yes | SQL to apply the migration |
| `down` | `string` | No | SQL to reverse the migration |
